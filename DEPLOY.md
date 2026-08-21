# Getting this online

Order matters. Each step assumes the one before it worked.

Everything here is a one-time setup. Once it's done, deploying a change is
`git push`.

---

## 0. Before anything else: rescue the Base44 artwork

**Do this first, and don't skip it.** The 135 logos, crests and fonts on the
imported orders still live on base44.app. When that app is switched off they're
gone, and no amount of hosting work brings them back.

```
npm run dev
```

Open http://localhost:3000/orders. There's an amber banner counting the files
still at risk — click **Copy them here**, leave the tab open until it finishes.
The banner disappears when the count reaches zero.

---

## 1. GitHub

The repo is already initialised with two commits. It needs a remote:

```
cd C:\Users\keena\Downloads\powerplay-order-manager
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

If the repo already has a commit in it (a README from when you created it),
push over it with `git push -u --force origin main` — nothing there is worth
keeping.

**What is deliberately NOT committed**, and must never be: `admin-code.txt`,
`.env.local`, `data/db.json`, `public/uploads/`. The first two are secrets; the
last two are data that belongs in Supabase.

---

## 2. Supabase

### Create the project

Free tier allows two projects per person and you have two, so free one up or
upgrade. Then create a project — `powerplay-order-manager`, region
`ca-central-1` (Canada, closest to you and your customers).

### Apply the schema

In the SQL editor, run these in order:

1. `supabase/migrations/0001_init.sql` — tables, indexes, row-level security
2. `supabase/migrations/0002_artwork_bucket.sql` — the private artwork bucket

### Get the keys

Project Settings → API:

- **Project URL** → `SUPABASE_URL`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

The service role key bypasses every security rule in the database. Treat it
like the password to the whole thing: server-side only, never in a browser,
never in the repo. If it ever leaks, rotate it in that same screen.

### Check the schema actually works

Put both values in `.env.local`, then:

```
node scripts/check-supabase.mjs
```

It writes a throwaway order, exercises every query the app makes, and deletes
it. All green means the schema is sound. Anything red — stop and fix it before
moving a single real order across.

### Move the data across

```
node scripts/migrate-to-supabase.mjs            # dry run — read what it says
node scripts/migrate-to-supabase.mjs --commit   # actually do it
```

It reports what landed versus what was expected. Run it twice if you like;
it's idempotent.

Then restart `npm run dev`. With `.env.local` set the app is now reading
Supabase rather than `data/db.json` — same orders, same everything. Click
around before you go further: open an order, check the artwork loads, open a
share link.

`data/db.json` is still on your disk untouched. Keep it until you're confident.

---

## 3. Vercel

Import the GitHub repo at vercel.com. It detects Next.js on its own; no build
settings to change.

Set these environment variables (Production **and** Preview):

| Variable | Value |
|---|---|
| `ADMIN_ACCESS_CODE` | your access code — there's no `admin-code.txt` up there |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `SUPABASE_URL` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
| `NEXT_PUBLIC_BASE_URL` | your real URL, e.g. `https://orders.powerplaycustoms.ca` |

`NEXT_PUBLIC_BASE_URL` matters more than it looks: it's what the Copy Share
Link and Copy Client Form Link buttons paste. Get it wrong and you send
customers links to `localhost`.

Deploy, then check:

- `/orders` asks for the code
- a share link opens without one, and the artwork on it loads
- a client roster link opens and accepts a submission

---

## Afterwards

Any push to `main` redeploys. To change the access code, edit it in Vercel and
redeploy — everyone gets signed out, which is the point.

Two things worth knowing:

- **Free-tier Supabase pauses a project after a week of no activity.** An app
  nobody opened for a week comes back slow on the first request. Not a problem
  in season; worth remembering in July.
- **Signed artwork links last an hour.** A customer who leaves a share page
  open all afternoon and then reloads gets fresh links. One they forwarded last
  week is dead — deliberately.
