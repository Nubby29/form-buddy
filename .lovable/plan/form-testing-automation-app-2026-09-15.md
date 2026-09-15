# Form Testing Automation App

Test any website's forms: fill them with realistic dummy data, optionally submit, capture before/after screenshots, and produce shareable reports.

## What gets built

**Run a test**
- Paste a URL, pick a mode: Fill Only, or Fill & Submit (submits immediately, no confirmation step).
- A real cloud browser opens the page, finds the form, works out what each field wants (name, email, phone, date, dropdown, checkbox, textarea), and fills it with believable dummy values.
- Two screenshots are captured and stored: one of the filled form, one of whatever the page shows afterwards (success banner, validation errors, or an error state).

**Report**
- Checklist: every field found, its type, the value used, whether it filled cleanly.
- Outcome: submitted / blocked by validation / error / fill-only, plus an overall pass or fail.
- Side-by-side visual evidence with the two screenshots.
- Share by link (anyone with the link can view, no login) and download as PDF.

**Accounts and history**
- Email sign-up and sign-in.
- Saved targets: give a site a name, keep its default test mode and any custom field values.
- Run history per target, newest first, with status at a glance.

## Screens

- Home / landing with a URL box and a sign-in call to action
- Sign in / sign up
- Dashboard: recent runs, quick "new test" box
- Targets: list, add, edit, delete
- Target detail: its run history
- Report page: checklist + screenshots + share and PDF buttons
- Public shared report page (read-only)

## Look and feel

Dark technical console aesthetic: near-black background, a single acid-green accent for pass states and amber/red for warnings and failures, monospace for field names and values, clean sans for prose. Screenshots presented as framed evidence panels with subtle borders.

## Technical notes

- Lovable Cloud for auth, database and screenshot storage. Tables: `profiles`, `targets`, `runs`, `run_fields`, all with row-level security scoped to the owner, plus a public read policy on shared runs keyed by an unguessable share token.
- Browser work runs through Browserless over its WebSocket/REST API from a server function — the app's own server cannot run a browser. Requires a `BROWSERLESS_TOKEN` secret, which I'll request once you have the key.
- Field detection uses a heuristic pass over input name/id/type/label/placeholder to choose a dummy value generator; unmatched fields fall back to generic text.
- Screenshots uploaded to a storage bucket; report pages read them by signed or public URL depending on share state.
- PDF export rendered client-side from the report layout.
- A run can take 15-40 seconds, so runs are recorded as `queued → running → done/failed` and the report page polls for updates.

## Order of work

1. Enable Cloud, schema, auth, dashboard shell.
2. Targets CRUD and run history.
3. Browserless integration: fill, submit, screenshots, field log.
4. Report page, share links, PDF export.

## Limitations worth knowing

- Sites behind logins, CAPTCHAs, or heavy bot protection will fail to test; the report records that as the outcome.
- Fill & Submit sends real data to the target site, so only point it at sites you own or are authorised to test.
