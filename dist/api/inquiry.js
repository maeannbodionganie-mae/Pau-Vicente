'use strict';
/*
 * Speaking inquiry endpoint.
 * Flow: validate → derive a stable inquiry ID → forward a signed record to the private Google Apps Script
 * (which writes the Sheet row first, then emails Pau) → report only what was actually confirmed.
 *
 * Configuration (Vercel environment variables, never in source):
 *   INQUIRY_WEBHOOK_URL     Apps Script web app URL ending in /exec
 *   INQUIRY_WEBHOOK_SECRET  shared HMAC secret, also stored as the script property WEBHOOK_SECRET
 */
const crypto = require('node:crypto');

const ENUMS = {
  inquiryType: ['Speaking invitation', 'Workshop or training', 'Coaching', 'General inquiry'],
  topic: ['Not sure yet', 'Freelance 101', 'Social Media Marketing', 'Inspirational Leadership'],
  eventType: ['Not sure yet', 'Keynote', 'Workshop', 'Seminar', 'Webinar', 'Panel discussion', 'Coaching session', 'Q&A session', 'Other'],
  dateStatus: ['Not yet decided', 'Tentative', 'Final'],
  location: ['Not yet decided', 'Online', 'Onsite'],
  audienceSize: ['Not sure yet', 'Under 30', '30–100', '100–300', 'More than 300']
};
const LIMITS = { name: 120, email: 160, organization: 160, dateNotes: 300, audience: 200, message: 3000 };
const DAY_MS = 86400000;
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const buckets = new Map();

const configured = () => Boolean(process.env.INQUIRY_WEBHOOK_URL && process.env.INQUIRY_WEBHOOK_SECRET);

function clean(value, multiline = false) {
  if (typeof value !== 'string') return '';
  let text = value.normalize('NFC').replace(/\r\n?/g, '\n');
  // Remove control characters (keep newlines and tabs in multi-line text only).
  text = text.replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g
                                : /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, multiline ? '' : ' ');
  if (multiline) text = text.replace(/\n{4,}/g, '\n\n\n');
  return text.replace(/[ \t]+/g, ' ').trim();
}

function validate(body) {
  const fields = {};
  const data = {};
  for (const [name, max] of Object.entries(LIMITS)) {
    data[name] = clean(body[name], name === 'message');
    if (data[name].length > max) fields[name] = `Please keep this under ${max} characters.`;
  }
  for (const [name, options] of Object.entries(ENUMS)) {
    const value = clean(body[name]);
    if (name === 'inquiryType') {
      if (!options.includes(value)) fields.inquiryType = 'Please choose an inquiry type.';
      data[name] = value;
    } else data[name] = options.includes(value) ? value : options[0];
  }
  // Preferred date comes from a date picker: empty, or a real calendar date from today up to five years ahead.
  data.preferredDate = clean(body.preferredDate);
  if (data.preferredDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.preferredDate);
    const day = match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) : NaN;
    const real = match && new Date(day).getUTCDate() === +match[3];
    // A day of slack either side covers visitors in other time zones.
    if (!real) fields.preferredDate = 'Please choose a date from the calendar.';
    else if (day < Date.now() - 2 * DAY_MS) fields.preferredDate = 'Please choose a date from today onward.';
    else if (day > Date.now() + 5 * 366 * DAY_MS) fields.preferredDate = 'Please choose a date within the next five years.';
  }
  if (data.preferredDate && data.dateStatus === 'Not yet decided') data.dateStatus = 'Tentative';
  if (!data.preferredDate && data.dateStatus === 'Final' && !fields.preferredDate) {
    fields.preferredDate = 'Please choose the final date, or mark the date as tentative.';
  }
  if (data.name.length < 2) fields.name = 'Please enter your full name.';
  if (!data.email) fields.email = 'Please enter your email address.';
  else if (!EMAIL_PATTERN.test(data.email)) fields.email = 'Please enter an email address like name@example.com.';
  if (!data.message) fields.message = 'Please share your event goals or inquiry details.';
  else if (data.message.length < 20) fields.message = 'Please add a little more detail (at least 20 characters).';
  return { data, fields };
}

/** The same submission key always yields the same ID, so a retried request cannot create a second lead. */
function inquiryId(submissionKey) {
  const digest = crypto.createHash('sha256').update(`pau-inquiry:${submissionKey}`).digest();
  let id = '';
  for (let i = 0; i < 8; i++) id += ID_ALPHABET[digest[i] % ID_ALPHABET.length];
  return `PV-${id.slice(0, 4)}-${id.slice(4)}`;
}

function rateLimited(req) {
  // Instance-local burst protection; use Vercel Firewall for deployment-wide limits.
  const key = crypto.createHash('sha256').update(String(req.headers['x-forwarded-for'] || 'anonymous')).digest('hex').slice(0, 20);
  const now = Date.now();
  for (const [id, bucket] of buckets) if (now - bucket.start > 600000) buckets.delete(id);
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= 2000) return true;
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  return ++bucket.count > 6;
}

async function forward(record) {
  const body = JSON.stringify(record);
  let lastCode = 'webhook_unreachable';
  for (let attempt = 0; attempt < 2; attempt++) {
    const ts = String(Date.now());
    const sig = crypto.createHmac('sha256', process.env.INQUIRY_WEBHOOK_SECRET).update(`${ts}.${body}`).digest('hex');
    try {
      const response = await fetch(process.env.INQUIRY_WEBHOOK_URL, {
        method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(11000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ts, sig, body })
      });
      if (response.ok) {
        const result = await response.json().catch(() => null);
        if (result && result.ok === true && result.id === record.id) return { ok: true, result };
        lastCode = (result && typeof result.code === 'string' && /^[a-z_]{1,40}$/.test(result.code)) ? `webhook_${result.code}` : 'webhook_invalid_response';
        // A definite rejection (bad signature, invalid record) will not improve on retry.
        if (result && result.ok === false) break;
      } else {
        lastCode = `webhook_http_${response.status}`;
        if (response.status < 500) break;
      }
    } catch (error) {
      lastCode = ['TimeoutError', 'AbortError'].includes(error && error.name) ? 'webhook_timeout' : 'webhook_network';
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return { ok: false, code: lastCode };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') return res.status(200).json({ status: configured() ? 'ready' : 'not_configured' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed.' }); }

  const origin = req.headers.origin;
  try {
    if (!origin || new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Please use the form on Pau’s website.' });
  } catch { return res.status(403).json({ error: 'Invalid origin.' }); }
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'Use a JSON request.' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid request format.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Invalid request format.' });
  if (JSON.stringify(body).length > 12000) return res.status(413).json({ error: 'The inquiry is too long.' });
  if (typeof body.submissionKey !== 'string' || !/^[A-Za-z0-9-]{16,80}$/.test(body.submissionKey)) {
    return res.status(400).json({ error: 'Please reload the page and try again.' });
  }
  if (rateLimited(req)) { res.setHeader('Retry-After', '600'); return res.status(429).json({ error: 'Too many attempts. Please try again later.' }); }

  const { data, fields } = validate(body);
  if (Object.keys(fields).length) return res.status(400).json({ error: 'Please correct the highlighted fields.', fields });

  const id = inquiryId(body.submissionKey);
  // Honeypot: automated submissions fill the hidden field. They get a normal-looking reply and are not recorded.
  if (clean(body.website)) return res.status(200).json({ status: 'received', id, notification: 'sent' });
  if (!configured()) return res.status(503).json({ status: 'unavailable', code: 'not_configured', error: 'The online form is not connected yet.' });

  const isTest = /^\[test\]/i.test(data.name) || /^\[test\]/i.test(data.message);
  const record = { id, submittedAt: new Date().toISOString(), isTest, ...data };
  const outcome = await forward(record);
  if (!outcome.ok) {
    // Log only the reference and diagnostic code, never visitor details.
    console.error(JSON.stringify({ event: 'inquiry_not_recorded', id, code: outcome.code }));
    return res.status(502).json({ status: 'not_recorded', code: 'not_recorded', error: 'The inquiry could not be recorded.' });
  }
  const notification = ['sent', 'failed', 'disabled', 'pending'].includes(outcome.result.notification) ? outcome.result.notification : 'pending';
  if (notification !== 'sent') console.warn(JSON.stringify({ event: 'inquiry_notification_pending', id, notification }));
  return res.status(200).json({ status: 'received', id, notification, duplicate: Boolean(outcome.result.duplicate) });
};

module.exports.inquiryId = inquiryId;
module.exports.validate = validate;
