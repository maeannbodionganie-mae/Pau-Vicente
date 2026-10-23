/**
 * Pau Vicente: inquiry monitoring and notification.
 *
 * Bound to Pau's private Google Sheet. The website's /api/inquiry function posts a signed record here.
 * Order of work: verify signature → write (or find) the Sheet row → send the email notification →
 * record the notification status on the row. Manual columns are never overwritten by retries.
 *
 * Script properties (Project Settings → Script properties):
 *   WEBHOOK_SECRET         created automatically by setup(). Copy it to Vercel INQUIRY_WEBHOOK_SECRET.
 *   NOTIFY_EMAIL           optional. Defaults to the account that owns this script.
 *   SEND_ACKNOWLEDGMENT    optional. "true" sends the visitor a receipt (never a booking confirmation).
 *
 * See INQUIRY_SETUP.md in the repository for the full setup steps.
 */

// Leave empty when the script is opened from the Sheet (Extensions → Apps Script).
// For a standalone script project, put the spreadsheet ID from its URL here.
var SPREADSHEET_ID = '';
var SHEET_NAME = 'Inquiries';
var TIMEZONE = 'Asia/Manila';
var STATUSES = ['New', 'Contacted', 'In Discussion', 'Confirmed', 'Closed'];
var HEADERS = [
  'Inquiry ID', 'Submitted at', 'Name', 'Email', 'Organization', 'Inquiry type', 'Speaking topic',
  'Event type', 'Preferred date', 'Location or platform', 'Audience', 'Estimated size', 'Message',
  'Follow-up status', 'Email notification status', 'Last follow-up date', 'Internal notes'
];
var COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i + 1; });
var MAX_AGE_MS = 10 * 60 * 1000;

/** Run once from the editor after pasting this file. Creates headers, status dropdown and timezone. */
function setup() {
  var spreadsheet = book_();
  spreadsheet.setSpreadsheetTimeZone(TIMEZONE);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
  sheet.getRange(2, COL['Follow-up status'], sheet.getMaxRows() - 1, 1).setDataValidation(rule);
  sheet.getRange(2, COL['Last follow-up date'], sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  sheet.setColumnWidth(COL['Message'], 380);
  // Create the shared secret once, so nobody has to invent or paste one into the script.
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WEBHOOK_SECRET')) {
    props.setProperty('WEBHOOK_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  console.log('Setup complete. Run showWebhookSecret to copy the value for the Vercel INQUIRY_WEBHOOK_SECRET variable.');
}

/** Prints the shared secret to the execution log so the owner can copy it into Vercel. Never share it elsewhere. */
function showWebhookSecret() {
  console.log(PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET'));
}

function doPost(e) {
  try {
    var envelope = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!secret) return reply_({ ok: false, code: 'not_configured' });
    if (typeof envelope.body !== 'string' || typeof envelope.sig !== 'string' || typeof envelope.ts !== 'string') {
      return reply_({ ok: false, code: 'bad_request' });
    }
    if (Math.abs(Date.now() - Number(envelope.ts)) > MAX_AGE_MS) return reply_({ ok: false, code: 'expired' });
    if (!safeEqual_(hmacHex_(envelope.ts + '.' + envelope.body, secret), envelope.sig)) return reply_({ ok: false, code: 'bad_signature' });

    var record = JSON.parse(envelope.body);
    if (!/^PV-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(record.id || '')) return reply_({ ok: false, code: 'bad_record' });

    var saved = saveRecord_(record);
    var notification = saved.notification;
    if (!saved.duplicate) {
      notification = notify_(record);
      setNotificationStatus_(record.id, notification);
      if (notification === 'Sent') acknowledge_(record);
    } else if (notification === 'Failed') {
      // A retry of an inquiry whose email failed earlier: try the notification again, leave everything else alone.
      notification = notify_(record);
      setNotificationStatus_(record.id, notification);
    }
    // A duplicate still marked Pending is being handled by the first request (or by retryPendingNotifications).
    var label = { Sent: 'sent', Failed: 'failed', Pending: 'pending' }[notification] || 'pending';
    return reply_({ ok: true, id: record.id, duplicate: saved.duplicate, notification: label });
  } catch (error) {
    console.error('doPost failed: ' + (error && error.message));
    return reply_({ ok: false, code: 'server_error' });
  }
}

/** Write the row first so the inquiry is durable even if email later fails. Retries reuse the existing row. */
function saveRecord_(record) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = sheet_();
    var row = findRow_(sheet, record.id);
    if (row) return { duplicate: true, notification: String(sheet.getRange(row, COL['Email notification status']).getValue()).split(' ')[0] };
    var submitted = Utilities.formatDate(new Date(record.submittedAt || Date.now()), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    var values = [
      record.id, submitted, record.name, record.email, record.organization, record.inquiryType, record.topic,
      record.eventType, record.preferredDate, record.location, record.audience, record.audienceSize, record.message,
      'New', 'Pending', '', record.isTest ? 'TEST RECORD - safe to delete' : ''
    ].map(cell_);
    sheet.appendRow(values);
    SpreadsheetApp.flush();
    return { duplicate: false, notification: 'Pending' };
  } finally {
    lock.releaseLock();
  }
}

function notify_(record) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
    var subject = (record.isTest ? '[TEST] ' : '') + 'New speaking inquiry ' + record.id + ' from ' + oneLine_(record.name);
    var rows = [
      ['Inquiry ID', record.id], ['Submitted', (record.submittedLabel || Utilities.formatDate(new Date(record.submittedAt || Date.now()), TIMEZONE, 'yyyy-MM-dd HH:mm')) + ' (Asia/Manila)'],
      ['Name', record.name], ['Email', record.email], ['Organization', record.organization || '-'],
      ['Inquiry type', record.inquiryType], ['Topic', record.topic], ['Event type', record.eventType],
      ['Preferred date', record.preferredDate || '-'], ['Location or platform', record.location],
      ['Audience', record.audience || '-'], ['Estimated size', record.audienceSize]
    ];
    var text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') + '\n\nMessage:\n' + record.message +
      '\n\nReply to this email to respond directly. Track follow-up in the Inquiries sheet.';
    var html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
      rows.map(function (r) {
        return '<tr><td style="padding:4px 14px 4px 0;color:#6b5a4c;vertical-align:top">' + esc_(r[0]) + '</td><td style="padding:4px 0">' + esc_(r[1]) + '</td></tr>';
      }).join('') + '</table><p style="font-family:Arial,sans-serif;font-size:14px;margin-top:16px"><strong>Message</strong></p>' +
      '<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">' + esc_(record.message) + '</p>' +
      '<p style="font-family:Arial,sans-serif;font-size:12px;color:#6b5a4c">Reply to this email to respond directly. Track follow-up in the Inquiries sheet.</p>';
    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, replyTo: record.email, name: 'Pau Vicente website' });
    return 'Sent';
  } catch (error) {
    console.error('notify failed for ' + record.id + ': ' + (error && error.message));
    return 'Failed';
  }
}

function acknowledge_(record) {
  if (PropertiesService.getScriptProperties().getProperty('SEND_ACKNOWLEDGMENT') !== 'true' || record.isTest) return;
  try {
    MailApp.sendEmail({
      to: record.email,
      subject: 'We received your inquiry (' + record.id + ')',
      name: 'Pau Vicente',
      body: 'Hi ' + oneLine_(record.name) + ',\n\nThank you for reaching out. Your inquiry has been received with reference ID ' + record.id +
        '.\n\nThis message confirms receipt only. It does not confirm availability or a booking. Pau will review your inquiry and reply to discuss the details.\n\nPau Vicente'
    });
  } catch (error) {
    console.error('acknowledgment failed for ' + record.id + ': ' + (error && error.message));
  }
}

/**
 * Reconciliation: re-sends notifications whose status is Pending or Failed.
 * Add a time-driven trigger (every 15 minutes) for this function, or run it manually.
 */
function retryPendingNotifications() {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  if (last < 2) return;
  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  values.forEach(function (row) {
    var status = String(row[COL['Email notification status'] - 1]);
    if (!/^(Pending|Failed)/.test(status)) return;
    var record = {
      id: String(row[0]), submittedLabel: row[1] instanceof Date ? Utilities.formatDate(row[1], TIMEZONE, 'yyyy-MM-dd HH:mm') : String(row[1]), name: plain_(row[2]), email: plain_(row[3]), organization: plain_(row[4]),
      inquiryType: plain_(row[5]), topic: plain_(row[6]), eventType: plain_(row[7]), preferredDate: plain_(row[8]),
      location: plain_(row[9]), audience: plain_(row[10]), audienceSize: plain_(row[11]), message: plain_(row[12]),
      isTest: /TEST RECORD/.test(String(row[16]))
    };
    setNotificationStatus_(record.id, notify_(record));
  });
}

function setNotificationStatus_(id, status) {
  var sheet = sheet_();
  var row = findRow_(sheet, id);
  if (!row) return;
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm');
  sheet.getRange(row, COL['Email notification status']).setValue(status + ' (' + stamp + ')');
}

function book_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function findRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var match = sheet.getRange(2, 1, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function sheet_() {
  var sheet = book_().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Run setup() first.');
  return sheet;
}

/** Store visitor text as text: values that a spreadsheet could treat as formulas are prefixed with an apostrophe. */
function cell_(value) {
  var text = value == null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function plain_(value) {
  var text = value == null ? '' : String(value);
  return text.charAt(0) === "'" ? text.slice(1) : text;
}

function oneLine_(text) { return String(text || '').replace(/[\r\n]+/g, ' ').slice(0, 120); }

function esc_(text) {
  return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hmacHex_(value, secret) {
  return Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8).map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function reply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/** Optional: run from the editor to confirm the notification address works. Writes nothing to the sheet. */
function testNotificationEmail() {
  var status = notify_({
    id: 'PV-TEST-TEST', submittedAt: new Date().toISOString(), isTest: true, name: '[TEST] Setup check', email: Session.getEffectiveUser().getEmail(),
    organization: '', inquiryType: 'General inquiry', topic: 'Not sure yet', eventType: 'Not sure yet', preferredDate: '',
    location: 'Not yet decided', audience: '', audienceSize: 'Not sure yet', message: 'This is a setup test from the Apps Script editor.'
  });
  console.log('Notification status: ' + status);
}
