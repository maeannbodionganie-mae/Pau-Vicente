// Inquiry pipeline contract tests. The Vercel handler talks to the real Apps Script code (Code.gs) running
// against an in-memory Sheet and mail stub. No network, credentials, real spreadsheet or real email are used.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handler = require('../dist/api/inquiry.js');

const SECRET = 'test-secret-not-real';
let ip = 0;

function appsScript({ secret = SECRET, mailFails = false } = {}) {
  const rows = [];
  const mail = [];
  let maxRows = 1000;
  const range = (r, c, nr = 1, nc = 1) => ({
    setValues(values) { values.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; }); }); return this; },
    getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')); },
    getValue() { return (rows[r - 1] || [])[c - 1] ?? ''; },
    setValue(v) { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; return this; },
    setFontWeight() { return this; }, setDataValidation() { return this; }, setNumberFormat() { return this; },
    createTextFinder(text) {
      return { matchEntireCell() { return this; }, findNext() {
        for (let i = 0; i < nr; i++) if (String((rows[r - 1 + i] || [])[c - 1]) === text) return { getRow: () => r + i };
        return null; } };
    }
  });
  const sheet = {
    getRange: range, appendRow(values) { rows.push(values.slice()); }, getLastRow: () => rows.length,
    getMaxRows: () => maxRows, setFrozenRows() {}, setColumnWidth() {}
  };
  let exists = false;
  const spreadsheet = { setSpreadsheetTimeZone() {}, getSheetByName: () => (exists ? sheet : null), insertSheet() { exists = true; return sheet; } };
  const context = {
    console: { log() {}, error() {}, warn() {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet, flush() {},
      newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => ({ WEBHOOK_SECRET: secret, NOTIFY_EMAIL: 'pau@example.test' }[k] || null) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.test' }) },
    Utilities: {
      Charset: { UTF_8: 'utf8' },
      formatDate: (date, tz, fmt) => new Date(date).toISOString().replace('T', ' ').slice(0, fmt.length > 16 ? 19 : 16),
      computeHmacSha256Signature: (value, key) => [...crypto.createHmac('sha256', key).update(value, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b))
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (content) => ({ content, setMimeType() { return this; } }) },
    MailApp: { sendEmail(options) { if (mailFails) throw new Error('quota'); mail.push(options); } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../integrations/google-apps-script/Code.gs'), 'utf8'), context);
  context.setup();
  return { context, rows, mail, setMailFails(v) { mailFails = v; } };
}

async function call(body, { method = 'POST', headers = {} } = {}) {
  const req = { method, headers: { host: 'pau.example', origin: 'https://pau.example', 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}`, ...headers }, body };
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler(req, res);
  return res;
}

const valid = (extra = {}) => ({
  submissionKey: crypto.randomUUID(), name: 'Maria Santos', email: 'maria@example.org', organization: 'Sample University',
  inquiryType: 'Speaking invitation', topic: 'Freelance 101', eventType: 'Seminar', preferredDate: 'March 2027',
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
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(url, process.env.INQUIRY_WEBHOOK_URL);
      const output = script.context.doPost({ postData: { contents: options.body } });
      return { ok: true, status: 200, json: async () => JSON.parse(output.content) };
    };

    const honeypot = await call(valid({ website: 'http://spam.example' }));
    assert.equal(honeypot.data.status, 'received');
    assert.equal(calls, 0);
    assert.equal(script.rows.length, 1);
    console.log('PASS: honeypot submissions are not recorded');

    const body = valid({ organization: '=HYPERLINK("http://evil.example","x")', audience: '+cmd', message: '@SUM(1,1) and a real event goal for students.' });
    const first = await call(body);
    assert.equal(first.code, 200);
    assert.equal(first.data.status, 'received');
    assert.equal(first.data.notification, 'sent');
    assert.equal(first.data.id, handler.inquiryId(body.submissionKey));
    assert.equal(script.rows.length, 2);
    const row = script.rows[1];
    assert.equal(row[0], first.data.id);
    assert.equal(row[2], 'Maria Santos');
    assert.equal(row[4], '\'=HYPERLINK("http://evil.example","x")');
    assert.equal(row[10], "'+cmd");
    assert.ok(row[12].startsWith("'@SUM"));
    assert.equal(row[13], 'New');
    assert.match(row[14], /^Sent/);
    assert.equal(script.mail.length, 1);
    assert.equal(script.mail[0].replyTo, 'maria@example.org');
    assert.equal(script.mail[0].to, 'pau@example.test');
    assert.ok(script.mail[0].subject.includes(first.data.id));
    assert.ok(script.mail[0].htmlBody.includes('&quot;'));
    assert.ok(!script.mail[0].htmlBody.includes('<script'));
    console.log('PASS: row written first, formula-like values neutralized, matching ID in sheet and email, reply-to set');

    // A retry of the same inquiry: no duplicate row, no repeat email, manual edits untouched
    script.rows[1][13] = 'Contacted';
    script.rows[1][16] = 'Called on Monday';
    const retry = await call(body);
    assert.equal(retry.data.id, first.data.id);
    assert.equal(retry.data.duplicate, true);
    assert.equal(retry.data.notification, 'sent');
    assert.equal(script.rows.length, 2);
    assert.equal(script.mail.length, 1);
    assert.equal(script.rows[1][13], 'Contacted');
    assert.equal(script.rows[1][16], 'Called on Monday');
    console.log('PASS: retries keep one record and preserve follow-up status and notes');

    // Email failure after a durable record, then a successful retry
    script.setMailFails(true);
    const failing = valid();
    const recorded = await call(failing);
    assert.equal(recorded.code, 200);
    assert.equal(recorded.data.status, 'received');
    assert.equal(recorded.data.notification, 'failed');
    assert.match(script.rows[2][14], /^Failed/);
    script.setMailFails(false);
    const resent = await call(failing);
    assert.equal(resent.data.notification, 'sent');
    assert.match(script.rows[2][14], /^Sent/);
    assert.equal(script.rows.length, 3);
    script.setMailFails(true);
    await call(valid());
    script.setMailFails(false);
    script.context.retryPendingNotifications();
    assert.match(script.rows[3][14], /^Sent/);
    console.log('PASS: notification failure is tracked and reconciled without duplicating the record');

    // Test records are labelled
    await call(valid({ name: '[TEST] Website check' }));
    assert.match(script.rows[4][16], /TEST RECORD/);
    assert.match(script.mail.at(-1).subject, /^\[TEST\]/);
    console.log('PASS: test submissions are clearly labelled');

    // Wrong shared secret: Apps Script refuses, visitor gets a recoverable error
    script = appsScript({ secret: 'different-secret' });
    const refused = await call(valid());
    assert.equal(refused.code, 502);
    assert.equal(refused.data.status, 'not_recorded');
    assert.equal(script.rows.length, 1);
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
    assert.equal(script.rows.length, 2);
    assert.equal(script.mail.length, 1);
    console.log('PASS: a timed-out first attempt does not create a duplicate lead or email');
  } finally {
    global.fetch = originalFetch;
    if (env.url === undefined) delete process.env.INQUIRY_WEBHOOK_URL; else process.env.INQUIRY_WEBHOOK_URL = env.url;
    if (env.secret === undefined) delete process.env.INQUIRY_WEBHOOK_SECRET; else process.env.INQUIRY_WEBHOOK_SECRET = env.secret;
  }
})().catch((error) => { console.error(error); process.exit(1); });
