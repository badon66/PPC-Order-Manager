# See the app running — start here

## Step 1: check you have Node

Press the Windows key, type **powershell**, hit Enter. Paste this:

```
node --version
```

- Get a version number like `v22.x.x`? Skip to step 2.
- Get an error? Go to **nodejs.org**, download the LTS installer, run it, then
  close PowerShell and open a new one before continuing.

## Step 2: run it

Paste these two lines, one at a time. The first takes a minute or two.

```
cd $HOME\Downloads\powerplay-order-manager
npm install
```

```
npm run dev
```

You'll see a line that says **Local: http://localhost:3000**.
Open that in your browser.

Leave PowerShell open while you're using it. Press `Ctrl+C` in that window to stop.

## What you can click

- **Orders** — the list, with search and status filter
- **View Details** on any order — full spec view. Change the status, finish date,
  or tracking code and it saves as you go
- **Production** in the top nav — what's overdue, what's due soon
- **Copy Share Link** on an order detail page, then paste that URL in a new tab —
  that's what a customer sees. No login, and no contact info or shipping address
- **Download CSV Roster** — the file that goes to production

**Edit**, **New Order**, and the client roster form are placeholders for now.

## If something goes wrong

Copy whatever the red error says and send it to me — that's usually enough to fix it.

---

## If you'd rather use Claude Code

Open PowerShell in this folder and run `claude`, then paste:

> This is a Next.js order manager for my custom hockey jersey business, Powerplay
> Customs. Read README.md first — it explains the layout and what's built.
>
> Get it running for me and tell me the URL to open. Install dependencies, start
> the dev server, and if anything errors, fix it and explain in plain language what
> was wrong.
>
> Then click through the app yourself and confirm three things actually work:
> 1. An order with a date stored as 2026-08-13 displays as August 13 — not the 12th.
> 2. The customer share page (/share/<token>) shows no contact name, email, phone,
>    or shipping address anywhere.
> 3. The CSV roster export re-imports to identical data.
>
> I'm not a developer. Ask before guessing, and don't change the design or add a
> pricing feature — pricing is deliberately excluded.
