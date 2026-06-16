# Till Slips — a simple catering expense app

A tiny, friendly app to **capture till slips (receipts) into jobs** for a small
catering business. Built to be easy for someone who is not comfortable with
technology, on an **iPhone**.

It works **offline**, keeps everything **on the phone** (nothing is sent
anywhere), and the totals **add up automatically**.

## What it does

- **Jobs** — make a job for each event (e.g. *“Smith Wedding”*, *“Church Lunch”*).
- **Add till slips** to a job: amount, shop, what it was for, the date, an
  optional **photo of the slip**, and a note.
- **Auto-calculate** — every job shows its running total, and the home screen
  shows the grand total of all jobs.
- **What to charge** — type a mark-up % and it suggests a price to quote the
  customer.
- **Export / Share** — send a job as a spreadsheet (CSV) by email, WhatsApp or
  save to Files, straight from the iPhone share sheet.
- **Print or Save PDF** — a clean one-page summary.
- **Backup & Restore** — save all your data to a file and load it back later.

## Getting it on the phone (one time)

**Android (Chrome):**
1. Open the app link in **Chrome**.
2. Tap the big **“Install app on this phone”** button (or the **⋮** menu →
   **Install app / Add to Home screen**).
3. An app icon appears on the home screen — tap it any time, even offline.

**iPhone (Safari):**
1. Open the app link in **Safari**.
2. Tap the **Share** button, then **“Add to Home Screen”**.
3. An app icon appears on the home screen — tap it any time, even offline.

Everyday use:

- Tap **+ New Job**, give it a name.
- Tap **+ Add Till Slip**, type the amount, take a photo of the slip, **Save**.
- The total updates by itself.
- When the event is done, tap **Export / Share** to send it on.

## Tech notes

Plain HTML, CSS and JavaScript — no build step, no accounts, no server.
Data is stored in the browser's `localStorage`; photos are compressed before
saving. It's a small PWA (manifest + service worker) so it installs to the
home screen and runs offline.

Just host the `catering/` folder as static files (or open `index.html`).
