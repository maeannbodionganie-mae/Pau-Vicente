# Inquiry form: email + Google Sheets setup

The contact form posts to the Vercel function `/api/inquiry`. That function validates the inquiry, gives it a reference ID, and forwards a signed record to a private Google Apps Script attached to Pau's Google Sheet. The script **writes the Sheet row first**, then emails Pau from her own Gmail with the visitor as Reply-To, then emails the visitor an acknowledgment. The visitor sees "received" only after the Sheet confirms the row.

```
Visitor form ─▶ /api/inquiry (Vercel) ─signed─▶ Apps Script (Pau's Google account)
  date picker,    validate, ID, rate limit         1. append row (or find existing ID)
  date status,                                     2. branded email to Pau, Reply-To = visitor
  date notes                                       3. branded acknowledgment to the visitor
                                                   4. record both statuses + Activity log
Sheet edit ─▶ onSheetEdit trigger ─▶ Google Calendar event + Schedule tab
```

## The spreadsheet

| Tab | What it is |
|---|---|
| **Dashboard** | Opens first. Counts for *Needs a reply* (status New, highlighted when above zero), Contacted, In Discussion, Confirmed, Upcoming events, This month, All inquiries. Lists the inquiries waiting for a reply (oldest first), the upcoming schedule, a breakdown by topic and date status, and recent activity. Formulas only, so it is always current. This is where Pau checks what needs a reply; there is no separate reminder email. |
| **Inquiries** | One row per inquiry. Espresso headers are what the visitor sent; caramel headers are Pau's working columns: Follow-up status, Confirmed date, Start time, End time, **Final & confirmed → Calendar**, Last follow-up date, Internal notes. New rows are highlighted until the status changes. *Date status* shows what the visitor chose: Final, Tentative or Not yet decided. |
| **Schedule** | Every inquiry ticked for the calendar, sorted by date. Rebuilt automatically; past dates turn grey. |
| **Activity** | A log of each inquiry: received, emails sent, status changes, calendar added/updated/removed. |

**Putting a date on the calendar.** When the date is final and Pau has spoken with the client, she ticks *Final & confirmed → Calendar* on that row. The script creates the event in the account's Google Calendar (all day, or timed if *Start time* is filled; *End time* defaults to two hours later), sets Follow-up status to Confirmed, and adds it to Schedule. Editing Confirmed date or the times updates the event. Unticking removes it. *Confirmed date* is pre-filled from the visitor's preferred date; ticking a row with no date is refused with a note in *Calendar status*.

**Acknowledgment.** The visitor receives a branded "Thank you" email with their reference and their fixed choices (type, topic, event type, date and its status, location). It never repeats their free text, so the form cannot be used to send arbitrary content to someone else's inbox, and it says plainly that it does not confirm a date or booking. Set the script property `SEND_ACKNOWLEDGMENT` to `false` to stop it.

No paid service, npm package, or Google Cloud project is required.

## Current status

| Part | Implemented | Configured | Verified |
|---|---|---|---|
| Form, validation, states, reference ID | Yes | n/a | Yes, live on 2026-10-23 |
| `/api/inquiry` function | Yes | Yes: Production env vars set; `GET /api/inquiry` returns `ready` | Yes, live on 2026-10-23 |
| Apps Script (Sheet row + email) | Yes (`integrations/google-apps-script/Code.gs`) | Yes: standalone project *Pau Vicente Inquiries* in askspeakerpau@gmail.com, Sheet *Pau Vicente – Inquiries*, 15-minute retry trigger | Yes, live on 2026-10-23 |
| Branded emails, acknowledgment, Dashboard / Schedule / Activity, calendar checkbox | Yes (v2 of `Code.gs`, covered by `scripts/check-inquiry.cjs`) | See *Updating to v2* below | See the record below |

Until configured, the form shows "The online form isn't available yet" and offers a prefilled email with the visitor's details. Nothing is lost or falsely confirmed.

## One-time setup (about 15 minutes)

Do these steps while signed in to **askspeakerpau@gmail.com**, Pau's inquiry account. The Sheet lives in that account's Drive, notifications are sent from and delivered to that inbox, and the visitor is set as Reply-To.

1. **Create the Sheet.** In Google Sheets, create a private spreadsheet (for example *Pau Vicente – Inquiries*). Do not share it publicly.
2. **Add the script.** Go to Extensions → Apps Script. Replace the editor contents with `integrations/google-apps-script/Code.gs` and save.
3. **Time zone and optional script properties.** In Apps Script → Project Settings, set the time zone to **(GMT+08:00) Manila** (or paste `appsscript.json` from this folder), so all-day calendar events land on the right day. Script properties:
   - `NOTIFY_EMAIL`: optional. It defaults to the script owner, askspeakerpau@gmail.com.
   - `SEND_ACKNOWLEDGMENT`: optional. Acknowledgments are on; set to `false` to stop them.
4. **Run `setup`.** Choose `setup` in the function menu and click Run. Approve the permission prompt (Sheets, send email as you, Calendar, and triggers). This builds the Dashboard, Inquiries, Schedule and Activity tabs, the dropdowns and checkbox, highlighting, and the Asia/Manila timezone. It installs the on-edit trigger (calendar) and the 15-minute retry trigger once, and creates the `WEBHOOK_SECRET` script property. It is safe to run again; it never deletes inquiries.
5. **Check email delivery.** Run `testEmails`. Two `[TEST]` emails (notification and acknowledgment) should arrive in the owner's inbox. It writes nothing to the Sheet.
6. **Deploy.** Deploy → New deployment → Web app. Set *Execute as*: **Me**. Set *Who has access*: **Anyone**. The URL is unguessable and every request must carry a valid signature. Copy the URL ending in `/exec`.
7. **Configure Vercel.** In Project → Settings → Environment Variables, set for Production and Preview:
   - `INQUIRY_WEBHOOK_URL` = the `/exec` URL
   - `INQUIRY_WEBHOOK_SECRET`: in Apps Script, run `showWebhookSecret`, then copy the value from the execution log. Only the account owner should copy it.

   Redeploy so the function picks them up. `GET /api/inquiry` then returns `{"status":"ready"}`.

Never paste the secret into chat, HTML, browser JavaScript, screenshots, or this repository. `.env.example` lists the names with placeholders only.

## Updating to v2 (existing installs)

1. Paste the new `Code.gs` over the old one, keeping your `SPREADSHEET_ID` line, and save. Set the project time zone to Manila (step 3 above).
2. Run `setup` and approve the new permissions (Calendar and triggers). The old 17-column *Inquiries* layout is copied to an *Inquiries backup …* tab first, then rearranged by header name into the new layout. Nothing is deleted; the backup tab can be removed once you are happy.
3. Deploy → Manage deployments → edit the existing web app → Version: **New version** → Deploy. The `/exec` URL stays the same, so Vercel needs no change.
4. Redeploy the website so the form sends the new date fields.

To roll back: restore the previous `Code.gs` from git, deploy a new version, and copy rows back from the backup tab if needed.

## End-to-end verification (required before calling it live)

1. On the deployed site, submit the form with the name `[TEST] Website check` and a short message.
2. Confirm that the visitor message shows a reference ID such as `PV-7K3M-Q9TD`.
3. Confirm that the Sheet has one new row with that ID, Follow-up status **New**, Email notification status **Sent (…)**, and *TEST RECORD* in Internal notes.
4. Confirm that Pau's inbox has a `[TEST] New speaking inquiry PV-…` email with the same ID, and that Reply-To is the address you entered.
5. Delete the test row when done.

Record the date and result in this file once verified.

**Verified 2026-10-23.** A `[TEST] Website check` submission on https://pau-vicente-speaker.vercel.app showed reference ID `PV-ZF4M-T54N` with "Pau has been notified". The *Inquiries* sheet has the matching row, marked *TEST RECORD - safe to delete*. The askspeakerpau@gmail.com inbox received "[TEST] New speaking inquiry PV-ZF4M-T54N". The Apps Script project is standalone (`SPREADSHEET_ID` set in the deployed copy) because the Sheets *Extensions → Apps Script* shortcut could not be opened from the automation browser.

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

- Consumer Gmail accounts can send about 100 emails a day through Apps Script. Each inquiry uses two (notification + acknowledgment), so about 50 inquiries a day. That is far more than an inquiry form needs.
- Edits made by the script itself do not fire the on-edit trigger; only Pau's own edits in the Sheet do.
- Burst protection in the Vercel function is per instance. For deployment-wide limits, add a Vercel Firewall rate-limit rule for `/api/inquiry`.
