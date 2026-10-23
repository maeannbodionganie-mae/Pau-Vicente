// Inquiry pipeline contract tests. The Vercel handler talks to the real Apps Script code (Code.gs) running against an
// in-memory spreadsheet, mail, calendar and trigger stub. No network, credentials, real spreadsheet, email or calendar.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handler = require('../dist/api/inquiry.js');

const SECRET = 'test-secret-not-real';
const OFFSET = 8 * 3600 * 1000; // Asia/Manila
let ip = 0;

// ── Minimal Apps Script runtime ─────────────────────────────────────────────
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function formatDate(date, tz, fmt) {
  const d = new Date(new Date(date).getTime() + OFFSET);
  const pad = (n) => String(n).padStart(2, '0');
  const h = d.getUTCHours();
  const tokens = {
    yyyy: d.getUTCFullYear(), MMMM: MONTHS[d.getUTCMonth()], MMM: MONTHS[d.getUTCMonth()].slice(0, 3), MM: pad(d.getUTCMonth() + 1),
    dd: pad(d.getUTCDate()), d: d.getUTCDate(), EEEE: DAYS[d.getUTCDay()], EEE: DAYS[d.getUTCDay()].slice(0, 3),
    HH: pad(h), HHmm: pad(h) + pad(d.getUTCMinutes()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()), h: (h % 12) || 12, a: h < 12 ? 'AM' : 'PM'
  };
  return fmt.replace(/yyyy|MMMM|MMM|MM|dd|EEEE|EEE|HHmm|HH|mm|ss|d|h|a/g, (t) => tokens[t]);
}
function parseDate(text, tz, fmt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(text);
  assert.ok(m && (fmt === 'yyyy-MM-dd' || fmt === 'yyyy-MM-dd HH:mm'), `unsupported parseDate ${text} ${fmt}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - OFFSET);
}
// Formatting calls (fonts, borders, widths…) are accepted and ignored.
const chain = (target) => new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => chain(t)) });
const a1 = (ref) => {
  const cell = (s) => { const m = /^([A-Z]+)(\d+)$/.exec(s); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [+m[2], c]; };
  const [from, to = from] = ref.split(':');
  const [r1, c1] = cell(from), [r2, c2] = cell(to);
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
};

function makeSheet(book, name) {
  const grid = [];
  const formulas = {};
  let maxRows = 1000, maxCols = 26;
  const get = (r, c) => (grid[r - 1] || [])[c - 1] ?? '';
  const put = (r, c, v) => { (grid[r - 1] = grid[r - 1] || [])[c - 1] = v; };
  const sheet = chain({
    name, grid, formulas,
    getName: () => sheet.name, setName(n) { sheet.name = n; return sheet; },
    getLastRow: () => { for (let r = grid.length; r > 0; r--) if ((grid[r - 1] || []).some((v) => v !== '' && v != null)) return r; return 0; },
    getLastColumn: () => grid.reduce((m, row) => Math.max(m, (row || []).reduce((n, v, i) => (v !== '' && v != null ? i + 1 : n), 0)), 0),
    getMaxRows: () => maxRows, getMaxColumns: () => maxCols,
    insertRowsAfter(after, n) { maxRows += n; return sheet; }, insertColumnsAfter(after, n) { maxCols += n; return sheet; },
    appendRow(values) { const r = sheet.getLastRow() + 1; values.forEach((v, j) => put(r, j + 1, v)); return sheet; },
    clear() { grid.length = 0; for (const k of Object.keys(formulas)) delete formulas[k]; return sheet; },
    getProtections: () => [],
    copyTo(target) { const copy = target.insertSheet('copy'); grid.forEach((row, i) => (row || []).forEach((v, j) => copy.grid[i] ? (copy.grid[i][j] = v) : (copy.grid[i] = [], copy.grid[i][j] = v))); return copy; },
    getRange(r, c, nr = 1, nc = 1) {
      if (typeof r === 'string') [r, c, nr, nc] = a1(r);
      const range = chain({
        getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc, getSheet: () => sheet,
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
        getDisplayValues: () => range.getValues().map((row) => row.map((v) => (v instanceof Date ? formatDate(v, '', 'yyyy-MM-dd') : String(v)))),
        getValue: () => get(r, c),
        setValues(values) { values.forEach((row, i) => row.forEach((v, j) => put(r + i, c + j, v))); return range; },
        setValue(v) { put(r, c, v); return range; },
        setFormula(f) { formulas[`${r},${c}`] = f; return range; },
        setFormulas(list) { list.forEach((row, i) => row.forEach((f, j) => { formulas[`${r + i},${c + j}`] = f; })); return range; },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) put(r + i, c + j, ''); return range; },
        createTextFinder(text) {
          return chain({ findNext() { for (let i = 0; i < nr; i++) if (String(get(r + i, c)) === text) return { getRow: () => r + i }; return null; } });
        }
      });
      return range;
    }
  });
  return sheet;
}

function appsScript({ secret = SECRET, mailFails = false, props = {}, seed } = {}) {
  const mail = [];
  const events = new Map();
  const triggers = [];
  const sheets = [];
  const book = chain({
    sheets,
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet(n, index) { const s = makeSheet(book, n); index === 0 ? sheets.unshift(s) : sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet(s) { sheets.splice(sheets.indexOf(s), 1); },
    getUrl: () => 'https://docs.google.test/spreadsheets/d/example'
  });
  book.insertSheet('Sheet1');
  if (seed) seed(book);
  let nextEvent = 0;
  const makeEvent = (title, start, end, options, allDay) => {
    const id = `evt-${++nextEvent}@google.test`;
    const event = chain({
      title, start, end, allDay, options, deleted: false,
      getId: () => id,
      setTitle(t) { event.title = t; return event; }, setDescription(d) { event.options.description = d; return event; },
      setLocation(l) { event.options.location = l; return event; },
      setTime(s, e) { event.start = s; event.end = e; event.allDay = false; return event; },
      setAllDayDate(d) { event.start = d; event.end = null; event.allDay = true; return event; },
      deleteEvent() { event.deleted = true; events.delete(id); }
    });
    events.set(id, event);
    return event;
  };
  const properties = { WEBHOOK_SECRET: secret, NOTIFY_EMAIL: 'pau@example.test', ...props };
  const context = {
    Date, // share the host Date so dates written by tests and by the script compare with instanceof
    console: { log() {}, error() {}, warn() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book, openById: () => book, flush() {},
      BorderStyle: { SOLID: 'solid' }, ProtectionType: { SHEET: 'sheet' },
      newDataValidation: () => chain({}), newConditionalFormatRule: () => chain({})
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties[k] ?? null, setProperty: (k, v) => { properties[k] = v; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.test' }), getScriptTimeZone: () => 'Asia/Manila' },
    Utilities: {
      Charset: { UTF_8: 'utf8' }, formatDate, parseDate, getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (value, key) => [...crypto.createHmac('sha256', key).update(value, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b))
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (content) => ({ content, setMimeType() { return this; } }) },
    MailApp: { sendEmail(options) { if (mailFails) throw new Error('quota'); mail.push(options); } },
    CalendarApp: { getDefaultCalendar: () => ({
      createAllDayEvent: (title, date, options) => makeEvent(title, date, null, options, true),
      createEvent: (title, start, end, options) => makeEvent(title, start, end, options, false),
      getEventById: (id) => events.get(id) || null
    }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t })),
      newTrigger: (fn) => chain({ create() { triggers.push(fn); } })
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../integrations/google-apps-script/Code.gs'), 'utf8'), context);
  context.setup();
  const inquiries = () => book.getSheetByName('Inquiries');
  const COL = context.COL;
  return {
    context, book, mail, events, triggers, COL, props: properties,
    sheet: inquiries,
    rows: () => inquiries().grid.slice(1).filter((row) => row && row.some((v) => v !== '' && v != null)),
    cell: (row, name) => (inquiries().grid[row] || [])[COL[name] - 1] ?? '',
    set: (row, name, value) => { inquiries().getRange(row + 1, COL[name]).setValue(value); },
    edit: (row, name) => context.onSheetEdit({ range: inquiries().getRange(row + 1, COL[name]) }),
    tab: (name) => book.getSheetByName(name),
    setMailFails(v) { mailFails = v; }
  };
}

// ── Vercel handler harness ──────────────────────────────────────────────────
async function call(body, { method = 'POST', headers = {} } = {}) {
  const req = { method, headers: { host: 'pau.example', origin: 'https://pau.example', 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}`, ...headers }, body };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler(req, res);
  return res;
}

const inDays = (n) => formatDate(Date.now() + n * 864e5, '', 'yyyy-MM-dd');
const valid = (extra = {}) => ({
  submissionKey: crypto.randomUUID(), name: 'Maria Santos', email: 'maria@example.org', organization: 'Sample University',
  inquiryType: 'Speaking invitation', topic: 'Freelance 101', eventType: 'Seminar', preferredDate: inDays(60),
  dateStatus: 'Tentative', dateNotes: 'Any Saturday that month works for us.',
  location: 'Onsite', audience: 'Graduating students', audienceSize: '100–300',
  message: 'We would like a session on getting started with freelancing.', website: '', ...extra
});

(async () => {
  const originalFetch = global.fetch;
  const env = { url: process.env.INQUIRY_WEBHOOK_URL, secret: process.env.INQUIRY_WEBHOOK_SECRET };
  try {
    // Pure helpers
    const key = crypto.randomUUID();
    assert.equal(handler.inquiryId(key), handler.inquiryId(key));
    assert.match(handler.inquiryId(key), /^PV-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    assert.notEqual(handler.inquiryId(key), handler.inquiryId(crypto.randomUUID()));

    // Request hygiene, before any configuration
    delete process.env.INQUIRY_WEBHOOK_URL; delete process.env.INQUIRY_WEBHOOK_SECRET;
    assert.deepEqual((await call(null, { method: 'GET' })).data, { status: 'not_configured' });
    assert.equal((await call(null, { method: 'PUT' })).code, 405);
    assert.equal((await call(valid(), { headers: { origin: 'https://evil.example' } })).code, 403);
    assert.equal((await call(valid(), { headers: { origin: undefined } })).code, 403);
    assert.equal((await call(valid(), { headers: { 'content-type': 'text/plain' } })).code, 415);
    assert.equal((await call('{nope')).code, 400);
    assert.equal((await call(valid({ submissionKey: 'short' }))).code, 400);
    assert.equal((await call(valid({ message: 'x'.repeat(13000) }))).code, 413);
    const invalid = await call(valid({ name: '', email: 'not-an-email', inquiryType: 'Free lunch', message: 'too short' }));
    assert.equal(invalid.code, 400);
    assert.deepEqual(Object.keys(invalid.data.fields).sort(), ['email', 'inquiryType', 'message', 'name']);
    const notConfigured = await call(valid());
    assert.equal(notConfigured.code, 503);
    assert.equal(notConfigured.data.code, 'not_configured');
    console.log('PASS: validation, origin, content type, size, and not-configured responses');

    // Date picker rules
    for (const [extra, expected] of [
      [{ preferredDate: 'March 2027' }, /calendar/], [{ preferredDate: '2027-02-30' }, /calendar/],
      [{ preferredDate: inDays(-5) }, /today onward/], [{ preferredDate: inDays(2000) }, /five years/],
      [{ preferredDate: '', dateStatus: 'Final' }, /final date/]
    ]) {
      const res = await call(valid(extra));
      assert.equal(res.code, 400, JSON.stringify(extra));
      assert.match(res.data.fields.preferredDate, expected);
    }
    assert.equal(handler.validate(valid({ dateStatus: 'Not yet decided' })).data.dateStatus, 'Tentative');
    assert.equal(handler.validate(valid({ preferredDate: '', dateStatus: 'Nonsense' })).data.dateStatus, 'Not yet decided');
    assert.equal(handler.validate(valid({ dateNotes: 'x'.repeat(301) })).fields.dateNotes, 'Please keep this under 300 characters.');
    console.log('PASS: preferred date must be a real upcoming calendar day; "Final" needs a date; picking a day defaults to Tentative');

    // Rate limit is per client
    const sameIp = { headers: { 'x-forwarded-for': '203.0.113.9' } };
    for (let i = 0; i < 6; i++) await call(valid(), sameIp);
    assert.equal((await call(valid(), sameIp)).code, 429);
    console.log('PASS: burst protection');

    // Configured: wire the handler to the real Apps Script code
    process.env.INQUIRY_WEBHOOK_URL = 'https://script.google.test/macros/s/example/exec';
    process.env.INQUIRY_WEBHOOK_SECRET = SECRET;
    let script = appsScript();
    let calls = 0;
    const wire = () => {
      global.fetch = async (url, options) => {
        calls++;
        assert.equal(url, process.env.INQUIRY_WEBHOOK_URL);
        const output = script.context.doPost({ postData: { contents: options.body } });
        return { ok: true, status: 200, json: async () => JSON.parse(output.content) };
      };
    };
    wire();

    // Workbook layout
    assert.deepEqual(script.book.sheets.map((s) => s.name), ['Dashboard', 'Inquiries', 'Schedule', 'Activity']);
    assert.deepEqual(script.triggers.sort(), ['onSheetEdit', 'retryPendingNotifications']);
    script.context.setup();
    assert.equal(script.triggers.length, 2);
    const dash = script.tab('Dashboard').formulas;
    const statusCol = script.context.letter_(script.COL['Follow-up status']);
    assert.equal(dash['7,2'], `=COUNTIF('Inquiries'!${statusCol}2:${statusCol},"New")`);
    assert.match(dash['13,2'], new RegExp(`FILTER\\('Inquiries'!A2:Z,'Inquiries'!${statusCol}2:${statusCol}="New"\\)`));
    assert.match(dash['33,2'], /FILTER\('Schedule'!A2:K,'Schedule'!A2:A>=TODAY\(\)/);
    assert.match(dash['55,2'], /FILTER\('Activity'!A2:D/);
    console.log('PASS: setup builds Dashboard, Inquiries, Schedule and Activity, removes the blank Sheet1, installs triggers once');

    const honeypot = await call(valid({ website: 'http://spam.example' }));
    assert.equal(honeypot.data.status, 'received');
    assert.equal(calls, 0);
    assert.equal(script.rows().length, 0);
    console.log('PASS: honeypot submissions are not recorded');

    const body = valid({ organization: '=HYPERLINK("http://evil.example","x")', audience: '+cmd', message: '@SUM(1,1) and a real event goal for students.' });
    const first = await call(body);
    assert.equal(first.code, 200);
    assert.equal(first.data.status, 'received');
    assert.equal(first.data.notification, 'sent');
    assert.equal(first.data.id, handler.inquiryId(body.submissionKey));
    assert.equal(script.rows().length, 1);
    assert.equal(script.cell(1, 'Inquiry ID'), first.data.id);
    assert.equal(script.cell(1, 'Name'), 'Maria Santos');
    assert.equal(script.cell(1, 'Organization'), '\'=HYPERLINK("http://evil.example","x")');
    assert.equal(script.cell(1, 'Audience'), "'+cmd");
    assert.ok(script.cell(1, 'Message').startsWith("'@SUM"));
    assert.equal(script.cell(1, 'Follow-up status'), 'New');
    assert.match(script.cell(1, 'Email notification status'), /^Sent/);
    assert.match(script.cell(1, 'Acknowledgment status'), /^Sent/);
    assert.ok(script.cell(1, 'Submitted at') instanceof Date);
    assert.ok(script.cell(1, 'Preferred date') instanceof Date);
    assert.equal(formatDate(script.cell(1, 'Preferred date'), '', 'yyyy-MM-dd'), body.preferredDate);
    assert.equal(script.cell(1, 'Confirmed date').getTime(), script.cell(1, 'Preferred date').getTime());
    assert.equal(script.cell(1, 'Date status'), 'Tentative');
    assert.equal(script.cell(1, 'Date notes'), 'Any Saturday that month works for us.');
    console.log('PASS: row written first; date stored as a real date with its status and notes; formula-like values neutralized');

    // Two branded emails
    assert.equal(script.mail.length, 2);
    const [notice, ack] = script.mail;
    assert.equal(notice.to, 'pau@example.test');
    assert.equal(notice.replyTo, 'maria@example.org');
    assert.ok(notice.subject.includes(first.data.id));
    for (const text of ['#2B201A', 'PAU VICENTE'.toLowerCase(), first.data.id, 'Tentative date', 'Any Saturday that month', 'Reply to Maria', 'mailto:maria@example.org']) {
      assert.ok(notice.htmlBody.toLowerCase().includes(text.toLowerCase()), `notification should include ${text}`);
    }
    assert.ok(notice.htmlBody.includes('&quot;'));
    assert.ok(!notice.htmlBody.includes('<script'));
    assert.equal(ack.to, 'maria@example.org');
    assert.equal(ack.replyTo, 'pau@example.test');
    assert.equal(ack.name, 'Pau Vicente');
    assert.match(ack.subject, new RegExp(`Thank you for your inquiry · ${first.data.id}$`));
    assert.ok(ack.htmlBody.includes('Thank you, <em') && ack.htmlBody.includes('Maria.'));
    assert.ok(ack.htmlBody.includes('does not yet confirm a date or a booking'));
    for (const freeText of ['HYPERLINK', 'SUM(1,1)', '+cmd', 'Any Saturday']) {
      assert.ok(!ack.htmlBody.includes(freeText) && !ack.body.includes(freeText), `acknowledgment must not echo visitor free text: ${freeText}`);
    }
    console.log('PASS: Pau gets a branded notification with reply-to; the visitor gets a branded acknowledgment that echoes no free text');

    // Activity log
    const activity = script.tab('Activity').grid.slice(1).map((r) => r[3]);
    assert.deepEqual(activity, ['Inquiry received from the website', 'Email notification sent to Pau', 'Acknowledgment emailed to maria@example.org']);
    console.log('PASS: activity log records the inquiry and both emails');

    // A retry of the same inquiry: no duplicate row, no repeat email, manual edits untouched
    script.set(1, 'Follow-up status', 'Contacted');
    script.set(1, 'Internal notes', 'Called on Monday');
    const retry = await call(body);
    assert.equal(retry.data.id, first.data.id);
    assert.equal(retry.data.duplicate, true);
    assert.equal(retry.data.notification, 'sent');
    assert.equal(script.rows().length, 1);
    assert.equal(script.mail.length, 2);
    assert.equal(script.cell(1, 'Follow-up status'), 'Contacted');
    assert.equal(script.cell(1, 'Internal notes'), 'Called on Monday');
    console.log('PASS: retries keep one record and preserve follow-up status and notes');

    // Email failure after a durable record, then a successful retry
    script.setMailFails(true);
    const failing = valid();
    const recorded = await call(failing);
    assert.equal(recorded.code, 200);
    assert.equal(recorded.data.notification, 'failed');
    assert.match(script.cell(2, 'Email notification status'), /^Failed/);
    assert.match(script.cell(2, 'Acknowledgment status'), /^Failed/);
    script.setMailFails(false);
    const resent = await call(failing);
    assert.equal(resent.data.notification, 'sent');
    assert.match(script.cell(2, 'Email notification status'), /^Sent/);
    assert.match(script.cell(2, 'Acknowledgment status'), /^Sent/);
    assert.equal(script.rows().length, 2);
    script.setMailFails(true);
    await call(valid());
    script.setMailFails(false);
    script.set(3, 'Submitted at', new Date(Date.now() - 10 * 60 * 1000));
    script.context.retryPendingNotifications();
    assert.match(script.cell(3, 'Email notification status'), /^Sent/);
    assert.match(script.cell(3, 'Acknowledgment status'), /^Sent/);
    console.log('PASS: email failures are tracked and reconciled without duplicating the record');

    // Test records are labelled
    await call(valid({ name: '[TEST] Website check' }));
    assert.match(script.cell(4, 'Internal notes'), /TEST RECORD/);
    assert.match(script.mail.at(-2).subject, /^\[TEST\]/);
    assert.match(script.mail.at(-1).subject, /^\[TEST\] Thank you/);
    assert.ok(script.mail.at(-1).htmlBody.includes('Website.'));
    console.log('PASS: test submissions are clearly labelled');

    // Status edits in the sheet
    script.set(4, 'Follow-up status', 'In Discussion');
    script.edit(4, 'Follow-up status');
    assert.ok(script.cell(4, 'Last follow-up date') instanceof Date);
    assert.match(script.tab('Activity').grid.at(-1)[3], /Follow-up status set to In Discussion/);
    console.log('PASS: changing Follow-up status stamps the follow-up date and logs it');

    // Calendar: tick → all-day event + Schedule; add a time → timed event; untick → removed
    const CAL = script.context.CAL;
    script.set(1, CAL, true);
    script.edit(1, CAL);
    assert.equal(script.events.size, 1);
    let event = [...script.events.values()][0];
    assert.equal(event.allDay, true);
    assert.equal(formatDate(event.start, '', 'yyyy-MM-dd'), body.preferredDate);
    assert.match(event.title, /^Pau Vicente · Freelance 101 · /);
    assert.ok(event.options.description.includes(first.data.id));
    assert.equal(event.options.location, 'Onsite');
    assert.match(script.cell(1, 'Calendar status'), /^On calendar · .* · all day$/);
    assert.equal(script.cell(1, 'Calendar event ID'), event.getId());
    assert.equal(script.cell(1, 'Follow-up status'), 'Confirmed');
    let schedule = script.tab('Schedule').grid.slice(1).filter((r) => r && r[0]);
    assert.equal(schedule.length, 1);
    assert.equal(schedule[0][1], 'All day');
    assert.equal(schedule[0][9], first.data.id);
    assert.match(script.tab('Activity').grid.at(-1)[3], /^Added to the calendar for /);

    script.set(1, 'Start time', '2:00 PM');
    script.edit(1, 'Start time');
    assert.equal(script.events.size, 1);
    event = [...script.events.values()][0];
    assert.equal(event.allDay, false);
    assert.equal(formatDate(event.start, '', 'yyyy-MM-dd HH:mm'), `${body.preferredDate} 14:00`);
    assert.equal(formatDate(event.end, '', 'HH:mm'), '16:00');
    schedule = script.tab('Schedule').grid.slice(1).filter((r) => r && r[0]);
    assert.equal(schedule[0][1], '2:00 PM–4:00 PM');

    script.set(1, 'Start time', 'later');
    script.edit(1, 'Start time');
    assert.equal(script.cell(1, CAL), false);
    assert.match(script.cell(1, 'Calendar status'), /Check Start time/);
    script.set(1, 'Start time', '');
    script.set(1, CAL, true);
    script.edit(1, CAL);
    assert.equal(script.events.size, 1);
    assert.match(script.cell(1, 'Calendar status'), /all day$/);

    script.set(1, CAL, false);
    script.edit(1, CAL);
    assert.equal(script.events.size, 0);
    assert.equal(script.cell(1, 'Calendar event ID'), '');
    assert.match(script.cell(1, 'Calendar status'), /^Removed from calendar/);
    assert.equal(script.tab('Schedule').grid.slice(1).filter((r) => r && r[0]).length, 0);

    const undated = await call(valid({ preferredDate: '', dateStatus: 'Not yet decided' }));
    const undatedRow = script.rows().findIndex((r) => r[0] === undated.data.id) + 1;
    assert.equal(script.cell(undatedRow, 'Date status'), 'Not yet decided');
    script.set(undatedRow, CAL, true);
    script.edit(undatedRow, CAL);
    assert.equal(script.cell(undatedRow, CAL), false);
    assert.match(script.cell(undatedRow, 'Calendar status'), /Add a Confirmed date first/);
    assert.equal(script.events.size, 0);
    console.log('PASS: ticking the calendar box creates the event and Schedule row; time edits update it; unticking removes it; no date is refused');

    // Acknowledgments can be switched off
    script = appsScript({ props: { SEND_ACKNOWLEDGMENT: 'false' } });
    wire();
    await call(valid());
    assert.equal(script.mail.length, 1);
    assert.equal(script.cell(1, 'Acknowledgment status'), 'Off');
    console.log('PASS: SEND_ACKNOWLEDGMENT=false stops visitor acknowledgments');

    // Older 17-column layout is migrated by header name, with a backup tab
    const OLD = ['Inquiry ID', 'Submitted at', 'Name', 'Email', 'Organization', 'Inquiry type', 'Speaking topic', 'Event type',
      'Preferred date', 'Location or platform', 'Audience', 'Estimated size', 'Message', 'Follow-up status',
      'Email notification status', 'Last follow-up date', 'Internal notes'];
    script = appsScript({ seed: (book) => {
      const old = book.insertSheet('Inquiries');
      old.appendRow(OLD);
      old.appendRow(['PV-ZF4M-T54N', new Date(), '[TEST] Website check', 'a@example.org', '', 'General inquiry', 'Not sure yet', 'Not sure yet',
        'March 2027', 'Online', '', 'Not sure yet', 'Old message', 'Contacted', 'Sent (2026-10-23 10:00)', '', 'TEST RECORD - safe to delete']);
    } });
    assert.ok(script.book.sheets.some((s) => /^Inquiries backup /.test(s.name)));
    assert.deepEqual(script.sheet().grid[0].slice(0, script.context.HEADERS.length), [...script.context.HEADERS]);
    assert.equal(script.cell(1, 'Inquiry ID'), 'PV-ZF4M-T54N');
    assert.equal(script.cell(1, 'Follow-up status'), 'Contacted');
    assert.equal(script.cell(1, 'Preferred date'), 'March 2027');
    assert.equal(script.cell(1, 'Message'), 'Old message');
    assert.match(script.cell(1, 'Internal notes'), /TEST RECORD/);
    assert.equal(script.cell(1, CAL), false);
    wire();
    script.context.retryPendingNotifications();
    assert.equal(script.mail.length, 0);
    console.log('PASS: the earlier sheet layout is moved column by column, backed up first, and old rows send no new email');

    // Wrong shared secret: Apps Script refuses, visitor gets a recoverable error
    script = appsScript({ secret: 'different-secret' });
    wire();
    const refused = await call(valid());
    assert.equal(refused.code, 502);
    assert.equal(refused.data.status, 'not_recorded');
    assert.equal(script.rows().length, 0);
    console.log('PASS: unsigned or mis-signed records are rejected');

    // Network outage: one retry, then a recoverable error
    calls = 0;
    global.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
    const down = await call(valid());
    assert.equal(down.code, 502);
    assert.equal(calls, 2);
    assert.ok(!JSON.stringify(down.data).includes('maria@example.org'));
    console.log('PASS: outages retry once and return a recoverable error without echoing visitor data');

    // Lost response after a successful write: the retry finds the same row
    script = appsScript();
    let attempt = 0;
    global.fetch = async (url, options) => {
      const output = script.context.doPost({ postData: { contents: options.body } });
      if (++attempt === 1) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      return { ok: true, status: 200, json: async () => JSON.parse(output.content) };
    };
    const lost = await call(valid());
    assert.equal(lost.code, 200);
    assert.equal(lost.data.duplicate, true);
    assert.equal(script.rows().length, 1);
    assert.equal(script.mail.length, 2);
    console.log('PASS: a timed-out first attempt does not create a duplicate lead or email');
  } finally {
    global.fetch = originalFetch;
    if (env.url === undefined) delete process.env.INQUIRY_WEBHOOK_URL; else process.env.INQUIRY_WEBHOOK_URL = env.url;
    if (env.secret === undefined) delete process.env.INQUIRY_WEBHOOK_SECRET; else process.env.INQUIRY_WEBHOOK_SECRET = env.secret;
  }
})().catch((error) => { console.error(error); process.exit(1); });
