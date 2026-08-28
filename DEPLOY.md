# Deploying ThermoRivet

You can do this entirely from a phone browser. No terminal, no Docker.

Two free accounts are involved: **Neon** for the database and **Vercel** for the
app. Both let you sign in with GitHub, so it's mostly tapping.

Budget about five minutes.

---

## 1. Database — Neon

1. Go to **neon.tech** and sign in with GitHub.
2. **Create project.** Any name, any region. Postgres 16.
3. On the project dashboard, find the **connection string**. It looks like:

   ```
   postgresql://neondb_owner:...@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

4. **Copy the one WITHOUT `-pooler` in the hostname.**

   This matters. The pooled endpoint runs PgBouncer in transaction mode, and
   database migrations need a direct connection — they take advisory locks that
   a transaction pooler cannot hold. Using the pooled URL makes the first
   deploy fail with a confusing lock error.

Keep that string handy for step 2.

> Neon has the `vector` extension available, which this app requires for the
> knowledge base. Supabase works too. A plain Postgres without pgvector will
> fail on the first migration with `extension "vector" is not available`.

---

## 2. App — Vercel

1. Go to **vercel.com** and sign in with GitHub.
2. **Add New → Project**, then import
   `Nikzadfa/Verification-page-denver-helth`.
3. **Important:** under the branch selector, choose
   `claude/thermorivet-hvac-platform-gyz69p`. The default branch does not
   contain the app.
4. Expand **Environment Variables** and add these two:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string from step 1 (the non-pooler one) |
   | `AUTH_SECRET` | any random string of 32+ characters |
   | `BOOTSTRAP_ADMIN_EMAILS` | the email you plan to register with |

   `AUTH_SECRET` signs session cookies. Any long random string works — mash the
   keyboard if you like, it just has to be 32 characters or more and stay
   secret. Changing it later signs everyone out.

   `BOOTSTRAP_ADMIN_EMAILS` is optional but worth setting: the first account
   registered with that address becomes a platform admin, which is what unlocks
   `/admin` and the AI Testing Center.

5. **Deploy.**

The build runs migrations and seeds the manufacturer, fault-code, procedure and
eval data automatically, so the app comes up populated. First build takes a
couple of minutes.

---

## 3. Use it

Open the URL Vercel gives you and tap **Create an account** at `/register`.
Register with the email you put in `BOOTSTRAP_ADMIN_EMAILS`.

Add it to your home screen — there's a web manifest, so it runs full-screen
without browser chrome, which is the point on a phone.

---

## What works without any further configuration

Everything that matters:

- The full diagnostic engine — ranking, next-test selection, conclusions
- Fault-code lookup with board-level scoping
- Model-number decoding
- All four field calculators
- Jobs, service reports, PDF export
- The admin dashboard and AI Testing Center
- Voice input (it uses the browser's own speech recognition, on-device)

## What needs more keys

| Feature | Add | Notes |
|---|---|---|
| Readable prose instead of templates | `ANTHROPIC_API_KEY` | The engine's decisions do not change. Only the wording does. |
| Free-text understanding beyond the built-in parser | `ANTHROPIC_API_KEY` | The deterministic parser already handles reading lists like "suction 118, liquid 325". |
| Photo analysis | `ANTHROPIC_API_KEY` | Without it, enter the model number by hand. |
| Photos that survive a restart | `S3_*` variables | Without S3 on a serverless host, uploads go to the temp directory and are lost on a cold start. Fine for evaluating, not for real jobs. |
| Self-service upgrade/checkout | `STRIPE_*` | Plans and limits work regardless; only the payment flow is disabled. |

Add any of these in Vercel under **Settings → Environment Variables**, then
redeploy.

---

## Optional: a demo account with a worked example

If you would rather look at a finished diagnosis than run one, there's a seed
that creates an admin account preloaded with a customer, a job, and a completed
Carrier diagnosis driven through the real engine.

It is **not** run automatically on deploy, deliberately: it creates an
administrator with a published, well-known password, and putting that on a
public URL means anyone who finds the URL is an admin.

Run it only against a database you don't mind exposing:

```bash
DATABASE_URL="<your neon url>" npx tsx prisma/seed/demo.ts
```

Credentials are printed at the end (`demo@thermorivet.local`). If you do run it
on a public deployment, delete that user afterwards.

---

## If the first deploy fails

**`extension "vector" is not available`** — the database does not have
pgvector. Use Neon or Supabase.

**`Timed out trying to acquire an advisory lock`** — you used the `-pooler`
connection string. Switch `DATABASE_URL` to the direct one and redeploy.

**`AUTH_SECRET is missing or shorter than 32 characters`** — exactly what it
says; the app refuses to run with a weak session secret rather than pretending
to be secure.

**Build succeeds but every page redirects to `/login`** — that is correct
behaviour. Register an account.
