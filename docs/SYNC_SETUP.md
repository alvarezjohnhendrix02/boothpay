# Connect ContactSheet to a Google Sheet (about 10 minutes)

Do this once, on a laptop, with the Google account that should own the sales records
(the moderator's or the club's account).

## 1. Make the Sheet
1. Go to sheets.google.com → **Blank spreadsheet**.
2. Name it, for example `ContactSheet Sales 2026`.

## 2. Add the script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete everything in `Code.gs`, then paste in the whole of `gas/Code.gs` from this folder.
3. Find this line near the top:
   ```js
   const SYNC_KEY = 'CHANGE-ME';
   ```
   Change `CHANGE-ME` to your own secret words, at least 8 characters, e.g. `mediaarts-fair-7731`.
   Treat it like a password: anyone who has it can add rows to the Sheet.
4. Click **Save** (the disk icon).

## 3. Publish it as a web app
1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" and pick **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
   ("Anyone" is needed so phones can reach it without signing in. The sync key keeps out everyone else.)
4. Click **Deploy**. Google asks you to authorize: pick your account → **Advanced → Go to (project name)** → **Allow**.
5. Copy the **Web app URL** (it ends in `/exec`).

## 4. Connect ContactSheet
1. Open ContactSheet → **I'm the moderator** → **Sync & phones** (top right).
2. Paste the Web app URL and type the same sync key → **Save & test**.
   You should see "Connected to …". Tabs named Sales, SaleItems, Tickets, Voids and Setup appear in the Sheet as data arrives.
3. Tap **Download setup file** and send it to every booth phone. On each phone: open ContactSheet →
   **Got a setup file? Load it**. The file carries the Sheet connection, so you only do this once per phone.

## How it works after that
- Every sale is saved on the phone first, so selling works with no internet. When the phone is online,
  it sends its sales to the Sheet within about 20 seconds. The top bar shows "Synced" or "3 waiting".
- When you change booths, prices, PINs or the running event, phones pick up the changes by themselves
  (between customers, never in the middle of a sale).
- Reports on the moderator page include every booth's sales from the Sheet, plus your PMS uploads.
- Rows are never edited or deleted. An undone sale adds a row to the **Voids** tab.
- Money columns ending in `_c` are in centavos (5000 = ₱50). `total_php` is the same amount in pesos.

## If something goes wrong
| You see | Do this |
|---|---|
| "Wrong sync key" | The key in ContactSheet and in Code.gs must match exactly. |
| "Set your own SYNC_KEY…" | You did not change `CHANGE-ME`, or it is shorter than 8 characters. |
| "The Sheet link did not answer" | Check that the URL ends in `/exec` and that access is **Anyone**. |
| You edited Code.gs but nothing changed | **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.** The URL stays the same. |
| "3 waiting · offline" on a phone | Normal without internet. The sales send themselves later. |
