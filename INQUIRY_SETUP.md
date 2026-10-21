# Inquiry form: email + Google Sheets setup

The contact form posts to the Vercel function `/api/inquiry`. That function validates the inquiry, gives it a reference ID, and forwards a signed record to a private Google Apps Script attached to Pau's Google Sheet. The script **writes the Sheet row first**, then emails Pau from her own Gmail with the visitor as Reply-To. The visitor sees "received" only after the Sheet confirms the row.

```
Visitor form ─▶ /api/inquiry (Vercel) ─signed─▶ Apps Script (Pau's Google account)
                  validate, ID, rate limit         1. append row (or find existing ID)
                                                   2. email Pau, Reply-To = visitor
                                                   3. record email status on the row
```

No paid service, npm package, or Google Cloud project is required.

## Current status

| Part | Implemented | Configured | Verified |
|---|---|---|---|
| Form, validation, states, reference ID | Yes | n/a | Browser-tested with simulated responses |
| `/api/inquiry` function | Yes | **No**: needs the two environment variables below | Contract-tested against the real `Code.gs` on an in-memory Sheet |
| Apps Script (Sheet row + email) | Yes (`integrations/google-apps-script/Code.gs`) | **No**: needs Pau's Sheet and deployment | Not yet. Requires the end-to-end test below |

Until configured, the form shows "The online form isn't available yet" and offers a prefilled email with the visitor's details. Nothing is lost or falsely confirmed.

## One-time setup (about 15 minutes)

Do these steps while signed in to the Google account whose Gmail should send the notifications. Normally that is Pau's account.

1. **Create the Sheet.** In Google Sheets, create a private spreadsheet (for example *Pau Vicente – Inquiries*). Do not share it publicly.
2. **Add the script.** Go to Extensions → Apps Script. Replace the editor contents with `integrations/google-apps-script/Code.gs` and save.
3. **Create the shared secret.** Generate a long random string, for example with `openssl rand -hex 32`. In Apps Script → Project Settings → Script properties, add:
   - `WEBHOOK_SECRET` = the random string (required)
   - `NOTIFY_EMAIL` = the inbox to notify (optional; defaults to the script owner)
   - `SEND_ACKNOWLEDGMENT` = `true` to email visitors a receipt (optional; the receipt states it does not confirm a booking)
4. **Run `setup`.** Choose `setup` in the function menu and click Run. Approve the permission prompt (Sheets + send email as you). This creates the *Inquiries* tab, headers, the Follow-up status dropdown (New, Contacted, In Discussion, Confirmed, Closed), and sets the timezone to Asia/Manila.
5. **Check email delivery.** Run `testNotificationEmail`. A `[TEST]` email should arrive. It writes nothing to the Sheet.
6. **Deploy.** Deploy → New deployment → Web app. Set *Execute as*: **Me**. Set *Who has access*: **Anyone**. The URL is unguessable and every request must carry a valid signature. Copy the URL ending in `/exec`.
7. **Add a reconciliation trigger.** Triggers (clock icon) → Add trigger → function `retryPendingNotifications`, time-driven, every 15 minutes. This re-sends any notification that failed. It never duplicates rows or changes manual columns.
8. **Configure Vercel.** In Project → Settings → Environment Variables, set for Production and Preview:
   - `INQUIRY_WEBHOOK_URL` = the `/exec` URL
   - `INQUIRY_WEBHOOK_SECRET` = the same random string as step 3

   Redeploy so the function picks them up. `GET /api/inquiry` then returns `{"status":"ready"}`.

Never paste the secret into chat, HTML, browser JavaScript, screenshots, or this repository. `.env.example` lists the names with placeholders only.

## End-to-end verification (required before calling it live)

1. On the deployed site, submit the form with the name `[TEST] Website check` and a short message.
2. Confirm that the visitor message shows a reference ID such as `PV-7K3M-Q9TD`.
3. Confirm that the Sheet has one new row with that ID, Follow-up status **New**, Email notification status **Sent (…)**, and *TEST RECORD* in Internal notes.
4. Confirm that Pau's inbox has a `[TEST] New speaking inquiry PV-…` email with the same ID, and that Reply-To is the address you entered.
5. Delete the test row when done.

Record the date and result in this file once verified.

## How failures behave

| Situation | Visitor sees | Record |
|---|---|---|
| Validation error | Field messages + summary; nothing sent | None |
| Double-click or retry | Same reference ID | One row (ID is derived from a per-form key) |
| Sheet write fails / Apps Script unreachable | "We couldn't confirm…", form kept, email fallback | None; safe to retry |
| Row written, email fails | "Received", with wording that does not claim Pau was emailed | Row with `Failed (…)`; trigger re-sends |
| Response lost after row written | Retry returns the same ID | Still one row, one email |
| Not configured | "Isn't available yet", prefilled email link | None |

Manual columns (Follow-up status, Last follow-up date, Internal notes) are never overwritten by retries. Values that start with `=`, `+`, `-`, `@` are stored as text so they cannot run as formulas. Server logs contain only the reference ID and a diagnostic code, never visitor details.

## Limits

- Consumer Gmail accounts can send about 100 emails a day through Apps Script. That is far more than an inquiry form needs.
- Burst protection in the Vercel function is per instance. For deployment-wide limits, add a Vercel Firewall rate-limit rule for `/api/inquiry`.
