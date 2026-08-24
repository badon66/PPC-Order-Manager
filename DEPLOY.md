# Getting this online

Order matters. Each step assumes the one before it worked.

Everything here is a one-time setup. Once it's done, deploying a change is
`git push`.

---

## 0. Read this before touching the order of the steps

The Base44 artwork rescue has to happen **after** the data is in Supabase, not
before. That's the reverse of what an earlier version of this file said, and
the reason is worth understanding because getting it wrong is silent.

`src/lib/data/index.ts` chooses its backend by whether `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set, and `src/lib/storage.ts` chooses where
uploads land the same way. So the moment those two variables exist in
`.env.local`:

- `/orders` reads Supabase, not `data/db.json`. Before the migration runs that
  is an empty database — no orders, and therefore **no artwork banner**, because
  the banner counts assets it can see. Nothing is broken; there is simply
  nothing there yet.
- The rescue writes into the private Supabase bucket and updates the asset rows
  in Supabase.

Run the rescue *before* the migration and it writes files to
`public/uploads/` and stamps `/uploads/…` paths into `db.json` instead. Those
paths then migrate across and point at a directory that does not exist on
Vercel, where the filesystem is read-only and wiped on every deploy. Every
image would 404 in production and the banner would say zero, because the URLs
no longer look like Base44 ones.

So: **GitHub → Supabase schema → migrate the data → rescue the artwork →
Vercel.**

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

### The project and schema are already done

Project **PPC-Order-Manager** (`usnivtmicsqvegidzzce`), region `us-east-2`,
created 2026-08-24. All three migrations are applied and verified:

1. `0000_immutable_json_casts.sql` — the two immutable parsers
2. `0001_init.sql` — 6 tables, 10 generated columns on `orders`, 17 indexes, RLS
3. `0002_artwork_bucket.sql` — the private `artwork` bucket, 25 MB cap

Verified after applying: every table has RLS on with **zero** policies, both
token indexes are unique-and-partial, and a round-trip insert confirmed the
generated columns parse dates, UTC timestamps and empty-string-as-null
correctly. The security linter reports only the six expected
`rls_enabled_no_policy` notices, which is the design, not a finding.

**Re-applying, if you ever rebuild the project:** run all three in order in the
SQL editor. 0000 must come first — 0001's generated columns call its functions.

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
around before you go further: open an order, open a share link.

`data/db.json` is still on your disk untouched. Keep it until you're confident.

### Now rescue the Base44 artwork

**Do not skip this, and don't leave it for later.** The 135 logos, crests and
fonts on the imported orders still live on base44.app. When that app is
switched off they are gone, and no amount of hosting work brings them back.

With the dev server running, open http://localhost:3000/orders. There's an
amber banner counting the files still at risk — click **Copy them here**, and
leave the tab open until the count reaches zero. The banner removes itself.

It has to run in your browser: neither the container nor the device bridge has
a network route to base44.app. Chrome does.

Now that Supabase is configured, each file lands in the private `artwork`
bucket and its asset row is updated in place, so the result is what production
will actually serve.

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

- **On Pro, projects don't pause for inactivity.** That was a free-tier
  behaviour and no longer applies.
- **The project is in `us-east-2` (Ohio), not Canada.** Customer names, emails,
  phones and shipping addresses therefore live on US infrastructure. Latency is
  a non-issue; data residency may or may not matter to you. Changing it means
  recreating the project, which is cheap right now while it's empty and painful
  once real orders are in it.
- **Signed artwork links last an hour.** A customer who leaves a share page
  open all afternoon and then reloads gets fresh links. One they forwarded last
  week is dead — deliberately.
