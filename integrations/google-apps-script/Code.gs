/**
 * Pau Vicente: inquiry monitoring, email, dashboard and schedule.
 *
 * The website's /api/inquiry function posts a signed record here.
 * Order of work: verify signature → write (or find) the Sheet row → email Pau → email the visitor an
 * acknowledgment → record both statuses on the row. Pau's working columns are never overwritten by retries.
 *
 * Tabs this script manages:
 *   Dashboard   live summary: needs a reply, follow-up counts, upcoming schedule, recent activity (formulas only)
 *   Inquiries   one row per website inquiry; Pau edits the caramel-headed columns
 *   Schedule    confirmed events, rebuilt automatically from Inquiries
 *   Activity    log of everything that happened to each inquiry
 *
 * Calendar: in Inquiries, tick "Final & confirmed → Calendar" once the date is final and you have spoken with
 * the client. The event is created in the account's Google Calendar and listed in Schedule. Untick to remove it.
 *
 * Script properties (Project Settings → Script properties):
 *   WEBHOOK_SECRET        created automatically by setup(). Copy it to Vercel INQUIRY_WEBHOOK_SECRET.
 *   NOTIFY_EMAIL          optional. Defaults to the account that owns this script.
 *   SEND_ACKNOWLEDGMENT   optional. Acknowledgments are on by default; set to "false" to stop them.
 *
 * See INQUIRY_SETUP.md in the repository for the full setup steps.
 */

// Leave empty when the script is opened from the Sheet (Extensions → Apps Script).
// For a standalone script project, put the spreadsheet ID from its URL here.
var SPREADSHEET_ID = '';
var SHEET_NAME = 'Inquiries';
var DASHBOARD_NAME = 'Dashboard';
var SCHEDULE_NAME = 'Schedule';
var ACTIVITY_NAME = 'Activity';
var TIMEZONE = 'Asia/Manila';
var SITE_URL = 'https://pau-vicente-speaker.vercel.app';
var STATUSES = ['New', 'Contacted', 'In Discussion', 'Confirmed', 'Closed'];
var DATE_STATUSES = ['Final', 'Tentative', 'Not yet decided'];
var TOPICS = ['Freelance 101', 'Social Media Marketing', 'Inspirational Leadership', 'Not sure yet'];
var CAL = 'Final & confirmed → Calendar';
var HEADERS = [
  'Inquiry ID', 'Submitted at', 'Name', 'Follow-up status', 'Email', 'Organization', 'Inquiry type', 'Speaking topic',
  'Event type', 'Preferred date', 'Date status', 'Date notes', 'Location or platform', 'Audience', 'Estimated size',
  'Message', 'Confirmed date', 'Start time', 'End time', CAL, 'Calendar status', 'Last follow-up date',
  'Internal notes', 'Email notification status', 'Acknowledgment status', 'Calendar event ID'
];
// Columns Pau works in. Their headers are caramel so they stand apart from what the visitor submitted.
var WORKING = ['Follow-up status', 'Confirmed date', 'Start time', 'End time', CAL, 'Last follow-up date', 'Internal notes'];
var SCHEDULE_HEADERS = ['Date', 'Time', 'Client', 'Organization', 'Topic', 'Event type', 'Location or platform',
  'Estimated size', 'Email', 'Inquiry ID', 'Follow-up status'];
var ACTIVITY_HEADERS = ['When', 'Inquiry ID', 'Name', 'Activity'];
var COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i + 1; });
var MAX_AGE_MS = 10 * 60 * 1000;

// Website palette.
var INK = '#2B201A', DEEP = '#231A15', IVORY = '#E8DFD0', CREAM = '#F3EDE4', SAND = '#E8DECE', CARD = '#FBF8F3',
    CARAMEL = '#B08A5F', ACCENT = '#D9BE98', MUTED = '#5F4E40', BROWN = '#7D5B3B', LINE = '#E2D6C4';
var SERIF = 'Cormorant Garamond', SANS = 'DM Sans';

/* ───────────────────────── Setup ───────────────────────── */

/** Run from the editor after pasting this file. Safe to run again: it rebuilds layout, never deletes inquiries. */
function setup() {
  var book = book_();
  book.setSpreadsheetTimeZone(TIMEZONE);
  prepareInquiries_(book);
  prepareSchedule_(book);
  prepareActivity_(book);
  var dashboard = prepareDashboard_(book);
  removeEmptyDefaultSheet_(book);
  installTriggers_(book);
  var props = PropertiesService.getScriptProperties();
  // Create the shared secret once, so nobody has to invent or paste one into the script.
  if (!props.getProperty('WEBHOOK_SECRET')) {
    props.setProperty('WEBHOOK_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  rebuildSchedule_();
  book.setActiveSheet(dashboard);
  book.moveActiveSheet(1);
  if (Session.getScriptTimeZone && Session.getScriptTimeZone() !== TIMEZONE) {
    console.warn('Project time zone is ' + Session.getScriptTimeZone() + '. Set it to ' + TIMEZONE + ' in Project Settings so all-day calendar events land on the right day.');
  }
  console.log('Setup complete.');
}

/** Prints the shared secret to the execution log so the owner can copy it into Vercel. Never share it elsewhere. */
function showWebhookSecret() {
  console.log(PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET'));
}

function prepareInquiries_(book) {
  var sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  migrateColumns_(book, sheet);
  if (sheet.getMaxRows() < 1000) sheet.insertRowsAfter(sheet.getMaxRows(), 1000 - sheet.getMaxRows());
  if (sheet.getMaxColumns() < HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  var rows = sheet.getMaxRows() - 1;
  var all = sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length);
  all.setFontFamily(SANS).setFontSize(10).setVerticalAlignment('top').setFontColor(INK);
  var header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setValues([HEADERS]).setBackground(INK).setFontColor(IVORY).setFontWeight('bold').setWrap(true)
    .setVerticalAlignment('middle');
  WORKING.forEach(function (name) { sheet.getRange(1, COL[name]).setBackground(BROWN).setFontColor(CREAM); });
  sheet.getRange(1, COL[CAL]).setNote('Tick once the date is final AND you have spoken with the client. ' +
    'The event goes straight to Google Calendar and the Schedule tab. Untick to remove it.');
  sheet.getRange(1, COL['Follow-up status']).setNote('New = needs a reply. Change it after you reply; the Dashboard updates automatically.');
  sheet.getRange(1, COL['Date status']).setNote('What the client said on the website form: Final, Tentative or Not yet decided.');
  sheet.getRange(1, COL['Confirmed date']).setNote('Pre-filled with the client\'s preferred date. Change it if you agree on another day.');
  sheet.getRange(1, COL['Start time']).setNote('Optional, e.g. 2:00 PM. Leave empty for an all-day calendar entry.');
  sheet.setRowHeight(1, 42);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  sheet.getRange(2, 1, rows, HEADERS.length).clearDataValidations().setNumberFormat('General');
  var list = function (values) { return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build(); };
  sheet.getRange(2, COL['Follow-up status'], rows, 1).setDataValidation(list(STATUSES));
  sheet.getRange(2, COL[CAL], rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
    .setHorizontalAlignment('center');
  sheet.getRange(2, COL['Confirmed date'], rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Enter a date, e.g. 2027-03-14').build());
  sheet.getRange(2, COL['Submitted at'], rows, 1).setNumberFormat('mmm d, yyyy h:mm am/pm');
  ['Preferred date', 'Confirmed date'].forEach(function (name) { sheet.getRange(2, COL[name], rows, 1).setNumberFormat('ddd, mmm d, yyyy'); });
  ['Start time', 'End time'].forEach(function (name) { sheet.getRange(2, COL[name], rows, 1).setNumberFormat('h:mm am/pm'); });
  sheet.getRange(2, COL['Last follow-up date'], rows, 1).setNumberFormat('mmm d, yyyy');
  sheet.getRange(2, COL['Message'], rows, 1).setWrap(true);
  sheet.getRange(2, COL['Date notes'], rows, 1).setWrap(true);

  var widths = { 'Inquiry ID': 112, 'Submitted at': 150, 'Name': 160, 'Follow-up status': 124, 'Email': 200, 'Organization': 170,
    'Inquiry type': 150, 'Speaking topic': 160, 'Event type': 130, 'Preferred date': 130, 'Date status': 112, 'Date notes': 220,
    'Location or platform': 130, 'Audience': 180, 'Estimated size': 110, 'Message': 360, 'Confirmed date': 130,
    'Start time': 90, 'End time': 90, 'Calendar status': 190, 'Last follow-up date': 120, 'Internal notes': 240,
    'Email notification status': 170, 'Acknowledgment status': 170, 'Calendar event ID': 120 };
  widths[CAL] = 130;
  Object.keys(widths).forEach(function (name) { sheet.setColumnWidth(COL[name], widths[name]); });
  sheet.hideColumns(COL['Calendar event ID']);

  var body = sheet.getRange(2, 1, rows, HEADERS.length);
  var status = letter_(COL['Follow-up status']);
  var rule = function (formula) { return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setRanges([body]); };
  sheet.setConditionalFormatRules([
    rule('=$' + status + '2="New"').setBackground('#F5E8D6').build(),
    rule('=$' + status + '2="Confirmed"').setBackground('#ECEADF').build(),
    rule('=$' + status + '2="Closed"').setFontColor('#9C8E80').build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Final').setFontColor(BROWN).setBold(true)
      .setRanges([sheet.getRange(2, COL['Date status'], rows, 1)]).build()
  ]);
  return sheet;
}

/** Older layouts are rearranged by header name. A backup tab is made first, so nothing is lost. */
function migrateColumns_(book, sheet) {
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  if (!lastCol) return;
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var same = HEADERS.every(function (h, i) { return current[i] === h; });
  if (same) return;
  if (lastRow < 2) { sheet.getRange(1, 1, 1, lastCol).clearContent(); return; }
  var backupName = SHEET_NAME + ' backup ' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HHmm');
  if (!book.getSheetByName(backupName)) sheet.copyTo(book).setName(backupName);
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var index = {};
  current.forEach(function (h, i) { if (h) index[h] = i; });
  var moved = data.map(function (row) {
    return HEADERS.map(function (h) {
      if (index[h] !== undefined) return row[index[h]];
      if (h === CAL) return false;
      return '';
    });
  });
  sheet.getRange(1, 1, lastRow, lastCol).clearContent();
  sheet.getRange(1, 1, 1, lastCol).clearNote();
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns()).clearDataValidations();
  sheet.getRange(2, 1, moved.length, HEADERS.length).setValues(moved);
  console.log('Moved ' + moved.length + ' existing row(s) into the new layout. A copy of the old layout is in "' + backupName + '".');
}

function prepareSchedule_(book) {
  var sheet = book.getSheetByName(SCHEDULE_NAME) || book.insertSheet(SCHEDULE_NAME);
  styleTable_(sheet, SCHEDULE_HEADERS, [130, 150, 170, 180, 170, 130, 150, 110, 210, 110, 120]);
  var rows = sheet.getMaxRows() - 1;
  sheet.getRange(2, 1, rows, 1).setNumberFormat('ddd, mmm d, yyyy');
  sheet.getRange(1, 1).setNote('Filled automatically from Inquiries. Edit dates there, not here.');
  sheet.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",$A2<TODAY())').setFontColor('#9C8E80')
    .setRanges([sheet.getRange(2, 1, rows, SCHEDULE_HEADERS.length)]).build()]);
  protectWarn_(sheet, 'Schedule is rebuilt from the Inquiries tab.');
  return sheet;
}

function prepareActivity_(book) {
  var sheet = book.getSheetByName(ACTIVITY_NAME) || book.insertSheet(ACTIVITY_NAME);
  styleTable_(sheet, ACTIVITY_HEADERS, [160, 120, 180, 420]);
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('mmm d, yyyy h:mm am/pm');
  protectWarn_(sheet, 'Activity is written automatically.');
  return sheet;
}

function styleTable_(sheet, headers, widths) {
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setFontFamily(SANS).setFontSize(10).setFontColor(INK).setVerticalAlignment('top');
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground(INK).setFontColor(IVORY).setFontWeight('bold')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
}

/** The dashboard is formulas only, so it is always current without any script running. */
function prepareDashboard_(book) {
  var sheet = book.getSheetByName(DASHBOARD_NAME) || book.insertSheet(DASHBOARD_NAME, 0);
  sheet.clear();
  sheet.setConditionalFormatRules([]);
  if (sheet.getMaxColumns() < 9) sheet.insertColumnsAfter(sheet.getMaxColumns(), 9 - sheet.getMaxColumns());
  if (sheet.getMaxRows() < 70) sheet.insertRowsAfter(sheet.getMaxRows(), 70 - sheet.getMaxRows());
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setBackground(CREAM).setFontFamily(SANS).setFontSize(10)
    .setFontColor(INK).setVerticalAlignment('middle');
  sheet.setColumnWidth(1, 28);
  [124, 150, 170, 170, 170, 150, 150].forEach(function (w, i) { sheet.setColumnWidth(i + 2, w); });
  sheet.setColumnWidth(9, 28);
  for (var r = 13; r <= 66; r++) sheet.setRowHeight(r, 26);

  var I = "'" + SHEET_NAME + "'!";
  var range = function (name) { var l = letter_(COL[name]); return I + l + '2:' + l; };
  var status = range('Follow-up status');
  var lastLetter = letter_(HEADERS.length);

  // Title band
  sheet.getRange('A1:I3').setBackground(INK);
  sheet.setRowHeight(1, 20);
  sheet.getRange('B2').setValue('PAU VICENTE · INQUIRY DASHBOARD').setFontFamily(SERIF).setFontSize(20).setFontColor(IVORY);
  sheet.setRowHeight(2, 40);
  sheet.getRange('B3').setValue('Website inquiries, follow-ups and confirmed events. Updates on its own; nothing to refresh.')
    .setFontColor(ACCENT).setFontSize(10);
  sheet.setRowHeight(3, 30);
  sheet.getRange('A4:I4').setBackground(CARAMEL);
  sheet.setRowHeight(4, 3);
  sheet.setRowHeight(5, 18);

  // Figures
  var tiles = [
    ['NEEDS A REPLY', '=COUNTIF(' + status + ',"New")', 'Status is New'],
    ['CONTACTED', '=COUNTIF(' + status + ',"Contacted")', 'Waiting on client'],
    ['IN DISCUSSION', '=COUNTIF(' + status + ',"In Discussion")', 'Details being agreed'],
    ['CONFIRMED', '=COUNTIF(' + status + ',"Confirmed")', 'Booked with client'],
    ['UPCOMING EVENTS', '=COUNTIF(\'' + SCHEDULE_NAME + '\'!A2:A,">="&TODAY())', 'On the calendar'],
    ['THIS MONTH', '=COUNTIF(' + range('Submitted at') + ',">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1))', 'New inquiries'],
    ['ALL INQUIRIES', '=COUNTA(' + range('Inquiry ID') + ')', 'Since launch']
  ];
  var tileRange = sheet.getRange(6, 2, 3, 7);
  tileRange.setBackground(CARD).setHorizontalAlignment('left');
  tileRange.setBorder(true, true, true, true, true, false, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(6, 2, 1, 7).setValues([tiles.map(function (t) { return t[0]; })]).setFontSize(8).setFontWeight('bold').setFontColor(BROWN);
  sheet.getRange(7, 2, 1, 7).setFormulas([tiles.map(function (t) { return t[1]; })]).setFontFamily(SERIF).setFontSize(26);
  sheet.getRange(8, 2, 1, 7).setValues([tiles.map(function (t) { return t[2]; })]).setFontSize(8).setFontColor(MUTED);
  sheet.setRowHeight(6, 26); sheet.setRowHeight(7, 46); sheet.setRowHeight(8, 22);
  var reply = sheet.getRange('B6:B8');
  sheet.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B$7>0')
    .setBackground(INK).setFontColor(IVORY).setRanges([reply]).build()]);
  sheet.setRowHeight(9, 22);

  // Needs a reply
  section_(sheet, 10, 'Needs a reply', 'Oldest first. After you reply, change Follow-up status in Inquiries and the row leaves this list.');
  tableHead_(sheet, 12, ['Inquiry ID', 'Received', 'Name', 'Organization', 'Topic', 'Preferred date', 'Date status']);
  var pick = [COL['Inquiry ID'], COL['Submitted at'], COL['Name'], COL['Organization'], COL['Speaking topic'], COL['Preferred date'], COL['Date status']].join(',');
  sheet.getRange('B13').setFormula('=IFERROR(ARRAY_CONSTRAIN(SORT(CHOOSECOLS(FILTER(' + I + 'A2:' + lastLetter + ',' + status +
    '="New"),' + pick + '),2,TRUE),15,7),"Nothing waiting. You are all caught up.")');
  sheet.getRange('C13:C27').setNumberFormat('mmm d, h:mm am/pm');
  sheet.getRange('G13:G27').setNumberFormat('ddd, mmm d, yyyy');
  sheet.getRange('B28').setFormula('=IF(COUNTIF(' + status + ',"New")>15,"+ "&(COUNTIF(' + status + ',"New")-15)&" more in the Inquiries tab","")')
    .setFontColor(MUTED).setFontSize(9);
  sheet.getRange('B13:H27').setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);

  // Upcoming schedule
  section_(sheet, 30, 'Upcoming schedule', 'Confirmed events from today onward. Add one by ticking “' + CAL + '” in Inquiries.');
  tableHead_(sheet, 32, ['Date', 'Time', 'Client', 'Organization', 'Topic', 'Event type', 'Location']);
  sheet.getRange('B33').setFormula("=IFERROR(ARRAY_CONSTRAIN(CHOOSECOLS(FILTER('" + SCHEDULE_NAME + "'!A2:K,'" + SCHEDULE_NAME +
    "'!A2:A>=TODAY(),'" + SCHEDULE_NAME + "'!A2:A<>\"\"),1,2,3,4,5,6,7),10,7),\"No confirmed events yet.\")");
  sheet.getRange('B33:B42').setNumberFormat('ddd, mmm d, yyyy');
  sheet.getRange('B33:H42').setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);

  // Breakdown
  section_(sheet, 44, 'At a glance', 'All inquiries by topic and by how sure the client was about the date.');
  tableHead_(sheet, 46, ['Topic', 'Inquiries', '', 'Date status', 'Inquiries', '', '']);
  TOPICS.forEach(function (topic, i) {
    sheet.getRange(47 + i, 2).setValue(topic);
    sheet.getRange(47 + i, 3).setFormula('=COUNTIF(' + range('Speaking topic') + ',B' + (47 + i) + ')');
  });
  DATE_STATUSES.forEach(function (label, i) {
    sheet.getRange(47 + i, 5).setValue(label);
    sheet.getRange(47 + i, 6).setFormula('=COUNTIF(' + range('Date status') + ',E' + (47 + i) + ')');
  });
  sheet.getRange('C47:C50').setHorizontalAlignment('left');
  sheet.getRange('F47:F50').setHorizontalAlignment('left');
  sheet.getRange('B47:C50').setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('E47:F49').setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);

  // Recent activity
  section_(sheet, 52, 'Recent activity', 'The latest things that happened: new inquiries, emails, status changes, calendar updates.');
  tableHead_(sheet, 54, ['When', 'Inquiry ID', 'Name', 'Activity', '', '', '']);
  sheet.getRange('B55').setFormula("=IFERROR(ARRAY_CONSTRAIN(SORT(FILTER('" + ACTIVITY_NAME + "'!A2:D,'" + ACTIVITY_NAME +
    "'!A2:A<>\"\"),1,FALSE),12,4),\"No activity yet.\")");
  sheet.getRange('B55:B66').setNumberFormat('mmm d, h:mm am/pm');
  sheet.getRange('B55:H66').setBorder(null, null, true, null, null, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('B13:H66').setVerticalAlignment('middle');
  sheet.setFrozenRows(4);
  protectWarn_(sheet, 'The dashboard is calculated from the other tabs.');
  return sheet;
}

function section_(sheet, row, title, hint) {
  sheet.getRange(row, 2).setValue(title.toUpperCase()).setFontFamily(SERIF).setFontSize(15).setFontColor(INK);
  sheet.setRowHeight(row, 34);
  sheet.getRange(row + 1, 2).setValue(hint).setFontSize(9).setFontColor(MUTED);
  sheet.setRowHeight(row + 1, 22);
}

function tableHead_(sheet, row, labels) {
  sheet.getRange(row, 2, 1, labels.length).setValues([labels]).setFontSize(8).setFontWeight('bold').setFontColor(BROWN)
    .setBorder(null, null, true, null, null, null, CARAMEL, SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(row, 26);
}

function protectWarn_(sheet, description) {
  var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  if (existing.length) return;
  sheet.protect().setDescription(description).setWarningOnly(true);
}

/** Removes the blank "Sheet1" Google adds to new spreadsheets, only if it holds nothing at all. */
function removeEmptyDefaultSheet_(book) {
  var blank = book.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && blank.getLastColumn() === 0 && book.getSheets().length > 1) book.deleteSheet(blank);
}

function installTriggers_(book) {
  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('onSheetEdit') === -1) ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(book).onEdit().create();
  if (handlers.indexOf('retryPendingNotifications') === -1) {
    ScriptApp.newTrigger('retryPendingNotifications').timeBased().everyMinutes(15).create();
  }
}

/* ───────────────────────── Website → Sheet ───────────────────────── */

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
      log_(record.id, record.name, 'Inquiry received from the website' + (record.isTest ? ' (test)' : ''));
      notification = notify_(record);
      setColumnStatus_(record.id, 'Email notification status', notification);
      if (notification === 'Sent') log_(record.id, record.name, 'Email notification sent to Pau');
      var ack = acknowledge_(record);
      setColumnStatus_(record.id, 'Acknowledgment status', ack);
      if (ack === 'Sent') log_(record.id, record.name, 'Acknowledgment emailed to ' + record.email);
    } else {
      // A retry of the same inquiry: only resend what failed earlier, leave everything else alone.
      if (notification === 'Failed') {
        notification = notify_(record);
        setColumnStatus_(record.id, 'Email notification status', notification);
      }
      if (saved.acknowledgment === 'Failed') setColumnStatus_(record.id, 'Acknowledgment status', acknowledge_(record));
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
    if (row) {
      var current = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
      var first = function (name) { return String(current[COL[name] - 1]).split(' ')[0]; };
      return { duplicate: true, notification: first('Email notification status'), acknowledgment: first('Acknowledgment status') };
    }
    var preferred = isoDate_(record.preferredDate);
    var values = {
      'Inquiry ID': record.id,
      'Submitted at': new Date(record.submittedAt || Date.now()),
      'Name': cell_(record.name),
      'Follow-up status': 'New',
      'Email': cell_(record.email),
      'Organization': cell_(record.organization),
      'Inquiry type': cell_(record.inquiryType),
      'Speaking topic': cell_(record.topic),
      'Event type': cell_(record.eventType),
      'Preferred date': preferred || cell_(record.preferredDate),
      'Date status': cell_(record.dateStatus || (preferred ? 'Tentative' : 'Not yet decided')),
      'Date notes': cell_(record.dateNotes),
      'Location or platform': cell_(record.location),
      'Audience': cell_(record.audience),
      'Estimated size': cell_(record.audienceSize),
      'Message': cell_(record.message),
      'Confirmed date': preferred || '',
      'Email notification status': 'Pending',
      'Acknowledgment status': 'Pending',
      'Internal notes': record.isTest ? 'TEST RECORD - safe to delete' : ''
    };
    sheet.appendRow(HEADERS.map(function (h) { return values[h] === undefined ? '' : values[h]; }));
    SpreadsheetApp.flush();
    return { duplicate: false, notification: 'Pending', acknowledgment: 'Pending' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reconciliation: re-sends notifications and acknowledgments still marked Pending or Failed.
 * setup() installs a 15-minute trigger for this. Rows younger than two minutes are left to the request handling them.
 */
function retryPendingNotifications() {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  if (last < 2) return;
  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  values.forEach(function (row) {
    var submitted = row[COL['Submitted at'] - 1];
    if (submitted instanceof Date && Date.now() - submitted.getTime() < 2 * 60 * 1000) return;
    var record = recordFromRow_(row);
    if (/^(Pending|Failed)/.test(String(row[COL['Email notification status'] - 1]))) {
      var sent = notify_(record);
      setColumnStatus_(record.id, 'Email notification status', sent);
      if (sent === 'Sent') log_(record.id, record.name, 'Email notification sent to Pau (retry)');
    }
    if (/^(Pending|Failed)/.test(String(row[COL['Acknowledgment status'] - 1]))) {
      var ack = acknowledge_(record);
      setColumnStatus_(record.id, 'Acknowledgment status', ack);
      if (ack === 'Sent') log_(record.id, record.name, 'Acknowledgment emailed to ' + record.email + ' (retry)');
    }
  });
}

function recordFromRow_(row) {
  var get = function (name) { return row[COL[name] - 1]; };
  var preferred = get('Preferred date');
  return {
    id: String(get('Inquiry ID')), submittedAt: get('Submitted at') instanceof Date ? get('Submitted at').toISOString() : '',
    name: plain_(get('Name')), email: plain_(get('Email')), organization: plain_(get('Organization')),
    inquiryType: plain_(get('Inquiry type')), topic: plain_(get('Speaking topic')), eventType: plain_(get('Event type')),
    preferredDate: preferred instanceof Date ? Utilities.formatDate(preferred, TIMEZONE, 'yyyy-MM-dd') : plain_(preferred),
    dateStatus: plain_(get('Date status')), dateNotes: plain_(get('Date notes')), location: plain_(get('Location or platform')),
    audience: plain_(get('Audience')), audienceSize: plain_(get('Estimated size')), message: plain_(get('Message')),
    isTest: /TEST RECORD/.test(String(get('Internal notes')))
  };
}

function setColumnStatus_(id, column, status) {
  var sheet = sheet_();
  var row = findRow_(sheet, id);
  if (!row) return;
  var stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm');
  sheet.getRange(row, COL[column]).setValue(status === 'Off' ? 'Off' : status + ' (' + stamp + ')');
}

function log_(id, name, activity) {
  try {
    var sheet = book_().getSheetByName(ACTIVITY_NAME);
    if (sheet) sheet.appendRow([new Date(), id, cell_(oneLine_(name)), activity]);
  } catch (error) {
    console.error('activity log failed for ' + id + ': ' + (error && error.message));
  }
}

/* ───────────────────────── Sheet edits → Calendar ───────────────────────── */

/** Installed by setup() as an on-edit trigger for the spreadsheet (needed for Calendar access). */
function onSheetEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  var r0 = e.range.getRow(), nr = e.range.getNumRows(), c0 = e.range.getColumn(), c1 = c0 + e.range.getNumColumns() - 1;
  if (r0 + nr - 1 < 2) return;
  var touches = function (name) { return COL[name] >= c0 && COL[name] <= c1; };
  var statusEdit = touches('Follow-up status');
  var toggled = touches(CAL);
  var calendarEdit = toggled || touches('Confirmed date') || touches('Start time') || touches('End time');
  if (!statusEdit && !calendarEdit) return;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var scheduleChanged = false;
    for (var r = Math.max(r0, 2); r < r0 + nr; r++) {
      var row = sheet.getRange(r, 1, 1, HEADERS.length).getValues()[0];
      var id = String(row[0]);
      if (!id) continue;
      if (statusEdit) {
        sheet.getRange(r, COL['Last follow-up date']).setValue(today_());
        log_(id, plain_(row[COL['Name'] - 1]), 'Follow-up status set to ' + (row[COL['Follow-up status'] - 1] || 'blank'));
        scheduleChanged = true;
      }
      if (calendarEdit && syncCalendarRow_(sheet, r, toggled)) scheduleChanged = true;
    }
    if (scheduleChanged) rebuildSchedule_();
  } finally {
    lock.releaseLock();
  }
}

/** Create, update or remove the calendar event for one Inquiries row. Returns true when Schedule needs rebuilding. */
function syncCalendarRow_(sheet, r, toggled) {
  var row = sheet.getRange(r, 1, 1, HEADERS.length).getValues()[0];
  var shown = sheet.getRange(r, 1, 1, HEADERS.length).getDisplayValues()[0];
  var get = function (name) { return row[COL[name] - 1]; };
  var id = String(get('Inquiry ID')), name = plain_(get('Name'));
  var ticked = get(CAL) === true;
  var eventId = String(get('Calendar event ID') || '');
  var setCell = function (column, value) { sheet.getRange(r, COL[column]).setValue(value); };
  var calendar = CalendarApp.getDefaultCalendar();
  var existing = eventId ? findEvent_(calendar, eventId) : null;

  if (!ticked) {
    if (!toggled) return false;
    if (existing) existing.deleteEvent();
    setCell('Calendar event ID', '');
    setCell('Calendar status', eventId ? 'Removed from calendar ' + Utilities.formatDate(new Date(), TIMEZONE, 'MMM d') : '');
    if (eventId) log_(id, name, 'Removed from the calendar');
    return true;
  }

  var date = get('Confirmed date');
  if (!(date instanceof Date) && get('Preferred date') instanceof Date) {
    date = get('Preferred date');
    setCell('Confirmed date', date);
  }
  var refuse = function (message) {
    setCell(CAL, false);
    setCell('Calendar status', message);
    return false;
  };
  if (!(date instanceof Date)) return refuse('Add a Confirmed date first, then tick again');
  var day = Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
  var start = parseTime_(shown[COL['Start time'] - 1]);
  var end = parseTime_(shown[COL['End time'] - 1]);
  if (String(shown[COL['Start time'] - 1]).trim() && !start) return refuse('Check Start time (e.g. 2:00 PM), then tick again');

  var title = eventTitle_(row);
  var options = { description: eventDescription_(row), location: locationFor_(plain_(get('Location or platform'))) };
  var startAt, endAt;
  if (start) {
    startAt = Utilities.parseDate(day + ' ' + start, TIMEZONE, 'yyyy-MM-dd HH:mm');
    endAt = end ? Utilities.parseDate(day + ' ' + end, TIMEZONE, 'yyyy-MM-dd HH:mm') : null;
    if (!endAt || endAt <= startAt) endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
  }
  var allDay = Utilities.parseDate(day + ' 12:00', TIMEZONE, 'yyyy-MM-dd HH:mm');
  var event = existing;
  if (event) {
    event.setTitle(title);
    event.setDescription(options.description);
    event.setLocation(options.location);
    if (start) event.setTime(startAt, endAt); else event.setAllDayDate(allDay);
  } else {
    event = start ? calendar.createEvent(title, startAt, endAt, options) : calendar.createAllDayEvent(title, allDay, options);
  }
  var when = Utilities.formatDate(date, TIMEZONE, 'EEE, MMM d, yyyy') + (start ? ' · ' + timeLabel_(start, end, startAt, endAt) : ' · all day');
  setCell('Calendar event ID', event.getId());
  setCell('Calendar status', 'On calendar · ' + when);
  if (toggled) {
    var status = String(get('Follow-up status'));
    if (status !== 'Confirmed' && status !== 'Closed') {
      setCell('Follow-up status', 'Confirmed');
      setCell('Last follow-up date', today_());
    }
    log_(id, name, (existing ? 'Calendar event updated for ' : 'Added to the calendar for ') + when);
  } else {
    log_(id, name, 'Calendar event updated for ' + when);
  }
  return true;
}

function findEvent_(calendar, eventId) {
  try { return calendar.getEventById(eventId); } catch (error) { return null; }
}

function eventTitle_(row) {
  var get = function (name) { return plain_(row[COL[name] - 1]); };
  var what = [get('Speaking topic'), get('Event type'), get('Inquiry type')].filter(function (v) { return v && v !== 'Not sure yet'; })[0] || 'Speaking engagement';
  return 'Pau Vicente · ' + what + ' · ' + (get('Organization') || get('Name'));
}

function eventDescription_(row) {
  var get = function (name) { return plain_(row[COL[name] - 1]); };
  return [
    'Client: ' + get('Name'), 'Email: ' + get('Email'), 'Organization: ' + (get('Organization') || '-'),
    'Inquiry type: ' + get('Inquiry type'), 'Topic: ' + get('Speaking topic'), 'Event type: ' + get('Event type'),
    'Location or platform: ' + get('Location or platform'), 'Audience: ' + (get('Audience') || '-'), 'Estimated size: ' + get('Estimated size'),
    get('Date notes') ? 'Date notes: ' + get('Date notes') : '',
    '', 'Reference: ' + get('Inquiry ID'), 'Inquiry sheet: ' + book_().getUrl()
  ].filter(function (line, i, all) { return line !== '' || all[i + 1]; }).join('\n');
}

function locationFor_(value) { return value === 'Not yet decided' ? '' : value; }

function parseTime_(text) {
  var match = String(text || '').trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!match) return null;
  var hour = Number(match[1]), minute = Number(match[2] || 0);
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute;
}

function timeLabel_(start, end, startAt, endAt) {
  return Utilities.formatDate(startAt, TIMEZONE, 'h:mm a') + '–' + Utilities.formatDate(endAt, TIMEZONE, 'h:mm a');
}

/** Schedule mirrors every ticked row in Inquiries, sorted by date. It is rebuilt, never edited by hand. */
function rebuildSchedule_() {
  var book = book_();
  var schedule = book.getSheetByName(SCHEDULE_NAME);
  if (!schedule) return;
  var sheet = sheet_();
  var last = sheet.getLastRow();
  var rows = [];
  if (last >= 2) {
    var range = sheet.getRange(2, 1, last - 1, HEADERS.length);
    var values = range.getValues(), shown = range.getDisplayValues();
    values.forEach(function (row, i) {
      var get = function (name) { return row[COL[name] - 1]; };
      if (get(CAL) !== true || !get('Calendar event ID') || !(get('Confirmed date') instanceof Date)) return;
      var start = parseTime_(shown[i][COL['Start time'] - 1]);
      var end = parseTime_(shown[i][COL['End time'] - 1]);
      var time = 'All day';
      if (start) {
        var day = Utilities.formatDate(get('Confirmed date'), TIMEZONE, 'yyyy-MM-dd');
        var startAt = Utilities.parseDate(day + ' ' + start, TIMEZONE, 'yyyy-MM-dd HH:mm');
        var endAt = end ? Utilities.parseDate(day + ' ' + end, TIMEZONE, 'yyyy-MM-dd HH:mm') : null;
        if (!endAt || endAt <= startAt) endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
        time = timeLabel_(start, end, startAt, endAt);
      }
      rows.push([get('Confirmed date'), time, get('Name'), get('Organization'), get('Speaking topic'), get('Event type'),
        get('Location or platform'), get('Estimated size'), get('Email'), get('Inquiry ID'), get('Follow-up status')]);
    });
  }
  rows.sort(function (a, b) { return a[0].getTime() - b[0].getTime(); });
  var old = schedule.getLastRow();
  if (old >= 2) schedule.getRange(2, 1, old - 1, SCHEDULE_HEADERS.length).clearContent();
  if (rows.length) schedule.getRange(2, 1, rows.length, SCHEDULE_HEADERS.length).setValues(rows);
}

/* ───────────────────────── Email ───────────────────────── */

function notify_(record) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
    var subject = (record.isTest ? '[TEST] ' : '') + 'New speaking inquiry ' + record.id + ' from ' + oneLine_(record.name);
    var received = Utilities.formatDate(new Date(record.submittedAt || Date.now()), TIMEZONE, 'EEE, MMM d, yyyy · h:mm a');
    var first = firstName_(record.name);
    var date = dateLabel_(record.preferredDate);
    var details = [
      ['Topic', record.topic], ['Event type', record.eventType],
      ['Preferred date', date ? date : 'No date yet', record.dateStatus || ''],
      ['Date notes', record.dateNotes], ['Location or platform', record.location], ['Audience', record.audience],
      ['Estimated size', record.audienceSize], ['Email', record.email, '', 'mailto:' + record.email]
    ].filter(function (d) { return d[1]; });
    var replyLink = 'mailto:' + record.email + '?subject=' + encodeURIComponent('Re: Your speaking inquiry (' + record.id + ')');
    var html = shell_({
      preheader: oneLine_(record.name) + (record.organization ? ' · ' + oneLine_(record.organization) : '') + ' · ' + record.inquiryType,
      kicker: 'New speaking inquiry',
      body:
        pad_('32px 32px 6px',
          eyebrow_('Received ' + received) +
          '<h1 style="margin:12px 0 6px;font-family:' + SERIF_STACK + ';font-size:30px;line-height:1.15;font-weight:400;letter-spacing:1px;text-transform:uppercase;color:' + INK + '">' + esc_(record.name) + '</h1>' +
          '<p style="margin:0;font-family:' + SANS_STACK + ';font-size:15px;line-height:1.5;color:' + MUTED + '">' +
            esc_([record.organization, record.inquiryType].filter(Boolean).join(' · ')) + '</p>') +
        pad_('20px 32px 4px', referenceBox_(record.id, record.dateStatus)) +
        pad_('18px 32px 6px', detailTable_(details)) +
        pad_('22px 32px 4px',
          eyebrow_('Their message') +
          '<div style="margin:12px 0 0;padding:2px 0 2px 18px;border-left:2px solid ' + ACCENT + ';font-family:' + SERIF_STACK + ';font-size:18px;line-height:1.6;font-style:italic;color:' + INK + '">' +
            multiline_(record.message) + '</div>') +
        pad_('28px 32px 6px', buttons_([
          ['Reply to ' + first, replyLink, true],
          ['Open inquiry sheet', book_().getUrl(), false]
        ])) +
        pad_('14px 32px 32px',
          '<p style="margin:0;font-family:' + SANS_STACK + ';font-size:13px;line-height:1.6;color:' + MUTED + '">' +
          'Replying to this email goes straight to ' + esc_(record.email) + '. They have been sent an acknowledgment. ' +
          'After you reply, set Follow-up status to <strong style="color:' + INK + '">Contacted</strong> in the sheet.</p>'),
      footer: 'Sent by the inquiry form on your website.'
    });
    var text = [
      'New speaking inquiry ' + record.id, 'Received ' + received, '',
      'Name: ' + record.name, 'Organization: ' + (record.organization || '-'), 'Inquiry type: ' + record.inquiryType
    ].concat(details.map(function (d) { return d[0] + ': ' + d[1] + (d[2] ? ' (' + d[2] + ')' : ''); }))
      .concat(['', 'Message:', record.message, '', 'Reply to this email to respond directly. Inquiry sheet: ' + book_().getUrl()]).join('\n');
    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, replyTo: record.email, name: 'Pau Vicente website' });
    return 'Sent';
  } catch (error) {
    console.error('notify failed for ' + record.id + ': ' + (error && error.message));
    return 'Failed';
  }
}

/**
 * Receipt for the visitor. It repeats only fixed choices and the date, never their free text, so the form cannot be
 * used to send arbitrary content to someone else's inbox. It states plainly that it is not a booking confirmation.
 */
function acknowledge_(record) {
  if (PropertiesService.getScriptProperties().getProperty('SEND_ACKNOWLEDGMENT') === 'false') return 'Off';
  try {
    var owner = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
    var first = firstName_(record.name);
    var date = dateLabel_(record.preferredDate);
    var summary = [
      ['Inquiry type', record.inquiryType], ['Topic', record.topic], ['Event type', record.eventType],
      ['Preferred date', date || 'Not yet decided', date ? record.dateStatus : ''], ['Location or platform', record.location]
    ];
    var html = shell_({
      preheader: 'Pau has received your inquiry. Reference ' + record.id + '.',
      kicker: 'Inquiry received',
      body:
        pad_('34px 32px 4px',
          eyebrow_('Reference ' + record.id) +
          '<h1 style="margin:12px 0 14px;font-family:' + SERIF_STACK + ';font-size:32px;line-height:1.15;font-weight:400;letter-spacing:1px;text-transform:uppercase;color:' + INK + '">' +
            'Thank you, <em style="text-transform:none;color:' + BROWN + '">' + esc_(first) + '.</em></h1>' +
          para_('Your inquiry has reached Pau. She will review the details and reply to this email address to talk through your event.')) +
        pad_('18px 32px 6px',
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + CREAM + ';border:1px solid ' + LINE + '">' +
          '<tr><td style="padding:20px 22px 8px">' + eyebrow_('What you sent') + '</td></tr>' +
          '<tr><td style="padding:0 22px 14px">' + detailTable_(summary) + '</td></tr></table>') +
        pad_('20px 32px 0',
          para_('This email confirms that your inquiry was received. It does not yet confirm a date or a booking.') +
          para_('Want to add something? Reply to this email and keep the reference number in the subject.')) +
        pad_('22px 32px 4px',
          '<p style="margin:0;font-family:' + SANS_STACK + ';font-size:14px;color:' + MUTED + '">Warmly,</p>' +
          '<p style="margin:6px 0 2px;font-family:' + SERIF_STACK + ';font-size:24px;letter-spacing:1px;text-transform:uppercase;color:' + INK + '">Pau Vicente</p>' +
          '<p style="margin:0;font-family:' + SANS_STACK + ';font-size:12px;line-height:1.6;color:' + MUTED + '">Speaker · Freelance Coach · Social Media Marketing &amp; Branding Strategist</p>') +
        pad_('24px 32px 34px', buttons_([['Visit the website', SITE_URL, false]])),
      footer: 'You are receiving this because this address was entered on the inquiry form at pau-vicente-speaker.vercel.app.'
    });
    var text = [
      'Thank you, ' + first + '.', '',
      'Your inquiry has reached Pau. She will review the details and reply to this email address to talk through your event.', '',
      'Reference: ' + record.id
    ].concat(summary.map(function (d) { return d[0] + ': ' + d[1] + (d[2] ? ' (' + d[2] + ')' : ''); }))
      .concat(['', 'This email confirms that your inquiry was received. It does not yet confirm a date or a booking.',
        'Want to add something? Reply to this email and keep the reference number in the subject.', '', 'Warmly,', 'Pau Vicente', SITE_URL]).join('\n');
    MailApp.sendEmail({
      to: record.email, subject: (record.isTest ? '[TEST] ' : '') + 'Thank you for your inquiry · ' + record.id,
      body: text, htmlBody: html, replyTo: owner, name: 'Pau Vicente'
    });
    return 'Sent';
  } catch (error) {
    console.error('acknowledgment failed for ' + record.id + ': ' + (error && error.message));
    return 'Failed';
  }
}

// Email clients rarely load web fonts, so each stack falls back to a close system face.
var SERIF_STACK = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
var SANS_STACK = "'DM Sans',Helvetica,Arial,sans-serif";

function shell_(parts) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>' +
    '<body style="margin:0;padding:0;background:' + SAND + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:' + SAND + '">' + esc_(parts.preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + SAND + '"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:' + CARD + ';border:1px solid ' + LINE + '">' +
    '<tr><td style="background:' + INK + ';padding:24px 32px 22px">' +
      '<p style="margin:0;font-family:' + SERIF_STACK + ';font-size:15px;letter-spacing:5px;text-transform:uppercase;white-space:nowrap;color:' + IVORY + '">Pau Vicente</p>' +
      '<p style="margin:8px 0 0;font-family:' + SANS_STACK + ';font-size:10px;letter-spacing:2px;text-transform:uppercase;color:' + ACCENT + '">' + esc_(parts.kicker) + '</p>' +
      '</td></tr>' +
    '<tr><td style="height:3px;line-height:3px;font-size:0;background:' + CARAMEL + '">&nbsp;</td></tr>' +
    '<tr><td>' + parts.body + '</td></tr>' +
    '<tr><td style="background:' + CREAM + ';border-top:1px solid ' + LINE + ';padding:22px 32px;text-align:center">' +
      '<p style="margin:0 0 6px;font-family:' + SERIF_STACK + ';font-size:17px;font-style:italic;color:' + BROWN + '">Lead with Love. Grow with Purpose.</p>' +
      '<p style="margin:0;font-family:' + SANS_STACK + ';font-size:11px;line-height:1.6;color:' + MUTED + '">' + esc_(parts.footer) + '</p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function pad_(padding, inner) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:' + padding + '">' + inner + '</td></tr></table>';
}

function eyebrow_(text) {
  return '<p style="margin:0;font-family:' + SANS_STACK + ';font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:' + BROWN + '">' + esc_(text) + '</p>';
}

function para_(text) {
  return '<p style="margin:0 0 14px;font-family:' + SANS_STACK + ';font-size:15px;line-height:1.65;color:' + INK + '">' + esc_(text) + '</p>';
}

function referenceBox_(id, dateStatus) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + CREAM + ';border-left:3px solid ' + CARAMEL + '"><tr>' +
    '<td style="padding:16px 20px">' +
      '<p style="margin:0;font-family:' + SANS_STACK + ';font-size:10px;letter-spacing:2px;text-transform:uppercase;color:' + MUTED + '">Reference</p>' +
      '<p style="margin:4px 0 0;font-family:' + SERIF_STACK + ';font-size:22px;letter-spacing:2px;white-space:nowrap;color:' + INK + '">' + esc_(id) + '</p>' +
      (dateStatus ? '<p style="margin:12px 0 0">' + badge_(dateStatus) + '</p>' : '') + '</td></tr></table>';
}

function badge_(dateStatus) {
  var isFinal = dateStatus === 'Final';
  return '<span style="display:inline-block;padding:6px 12px;font-family:' + SANS_STACK + ';font-size:10px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;' +
    (isFinal ? 'background:' + INK + ';color:' + IVORY + ';' : 'background:' + CARD + ';color:' + BROWN + ';border:1px solid ' + ACCENT + ';') + '">' +
    esc_(dateStatus === 'Not yet decided' ? 'Date not decided' : dateStatus + ' date') + '</span>';
}

function detailTable_(rows) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows.map(function (r, i) {
    var value = r[3] ? '<a href="' + esc_(r[3]) + '" style="color:' + INK + ';text-decoration:underline">' + esc_(r[1]) + '</a>' : multiline_(r[1]);
    var extra = r[2] ? ' <span style="font-size:12px;color:' + BROWN + ';letter-spacing:.5px">· ' + esc_(r[2]) + '</span>' : '';
    var border = i === rows.length - 1 ? '' : 'border-bottom:1px solid ' + LINE + ';';
    return '<tr><td width="38%" valign="top" style="padding:11px 12px 11px 0;' + border + 'font-family:' + SANS_STACK + ';font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + MUTED + '">' + esc_(r[0]) + '</td>' +
      '<td valign="top" style="padding:10px 0;' + border + 'font-family:' + SANS_STACK + ';font-size:15px;line-height:1.5;color:' + INK + '">' + value + extra + '</td></tr>';
  }).join('') + '</table>';
}

function buttons_(list) {
  return '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' + list.map(function (b, i) {
    var solid = b[2];
    return '<td style="padding:0 ' + (i < list.length - 1 ? '10px' : '0') + ' 10px 0"><a href="' + esc_(b[1]) + '" style="display:inline-block;padding:13px 22px;' +
      'font-family:' + SANS_STACK + ';font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;' +
      (solid ? 'background:' + INK + ';color:' + IVORY + ';border:1px solid ' + INK : 'background:transparent;color:' + INK + ';border:1px solid ' + INK) + '">' + esc_(b[0]) + '</a></td>';
  }).join('') + '</tr></table>';
}

function multiline_(text) { return esc_(text).replace(/\n/g, '<br>'); }

function firstName_(name) {
  var first = String(name || '').replace(/^\[test\]\s*/i, '').trim().split(/\s+/)[0] || '';
  first = first.slice(0, 30);
  return !first || /[\/@:.<>]/.test(first) ? 'there' : first;
}

function dateLabel_(value) {
  var date = isoDate_(value);
  return date ? Utilities.formatDate(date, TIMEZONE, 'EEEE, MMMM d, yyyy') : String(value || '');
}

/* ───────────────────────── Helpers ───────────────────────── */

function isoDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  return Utilities.parseDate(String(value), TIMEZONE, 'yyyy-MM-dd');
}

function today_() {
  return Utilities.parseDate(Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd'), TIMEZONE, 'yyyy-MM-dd');
}

function letter_(column) {
  var s = '';
  for (var n = column; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
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

/* ───────────────────────── Manual checks ───────────────────────── */

/** Sends a sample of both emails to the script owner. Writes nothing to the sheet. */
function testEmails() {
  var me = Session.getEffectiveUser().getEmail();
  var sample = {
    id: 'PV-TEST-TEST', submittedAt: new Date().toISOString(), isTest: true, name: '[TEST] Setup check', email: me,
    organization: 'Sample organization', inquiryType: 'Speaking invitation', topic: 'Freelance 101', eventType: 'Seminar',
    preferredDate: Utilities.formatDate(new Date(Date.now() + 30 * 864e5), TIMEZONE, 'yyyy-MM-dd'), dateStatus: 'Tentative',
    dateNotes: 'Sample note: any Saturday that month works.', location: 'Onsite', audience: 'Graduating students',
    audienceSize: '100–300', message: 'This is a setup test from the Apps Script editor.'
  };
  console.log('Notification: ' + notify_(sample) + ' · Acknowledgment: ' + acknowledge_(sample));
}

/** Kept for older instructions; same as testEmails(). */
function testNotificationEmail() { testEmails(); }
