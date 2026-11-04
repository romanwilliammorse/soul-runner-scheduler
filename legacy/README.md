# Soul Runner PC 2K League scheduler

A working React + TypeScript + Vite application with Supabase Auth, Postgres authorization and transactional scheduling, and a Discord notification Edge Function. The browser is static-hostable; all trusted business operations run in Postgres RPCs. No league team names, logos, rosters, or results were supplied. The default sample league is fictional and explicitly labeled.

## Run locally

Requires Node 22.12+ and pnpm 11 (or npm).

```sh
pnpm install
pnpm dev
```

Open the printed local URL (normally http://127.0.0.1:5173). With no environment configuration, the app runs in browser-local **sample mode**. Sample changes persist in localStorage and can be reset in League admin. This mode never contacts Discord and never imports sample records into your live database. It demonstrates the interface; production authorization and booking integrity live in the database.

```sh
pnpm test     # Actual migrations / RPCs / RLS in embedded PostgreSQL, plus time tests
pnpm check    # TypeScript
pnpm build    # TypeScript + optimized production bundle in dist/
```

## Configure Supabase and Discord login

1. Create a Supabase project. Use a fresh project/database for this application.
2. Run the SQL files in `supabase/migrations` in ascending numeric order in the Supabase SQL editor, or apply them with the Supabase CLI after linking your project. They require PostgreSQL 14+ (range aggregation / multiranges). They create public tables, private helper functions, RLS, restricted RPC grants, and the two real division **formats**, not invented team data.
3. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application. Add this OAuth redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
4. In Supabase Authentication → Providers → Discord, enable Discord and enter the Discord client ID and secret. Keep the client secret in Supabase, never in this repository or browser environment.
5. Set the Supabase Site URL to your deployed website origin. Allow that exact origin and `http://127.0.0.1:5173` as redirect URLs while developing. This app returns OAuth users to the origin and uses the Supabase browser session.
6. Copy `.env.example` to `.env.local` and fill in:

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project API URL |
   | `VITE_SUPABASE_ANON_KEY` | Publishable key or legacy anon key; safe for the client because RLS/RPC authorization is enforced |

   Both must be set. Never use a service-role key in a `VITE_*` variable. Restart the dev server after configuration. Production static deployments must rebuild with these variables available at build time; adding runtime secrets to an already built static site does not change its JS.
7. Sign in with Discord. A new account has **no league permissions** and sees an invitation/linking message until an administrator associates it with a member.

Official provider instructions: [Supabase Discord OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord). Security model: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Securely bootstrap the first administrator

There is no public “make me admin” endpoint. Only a project owner with trusted SQL-editor/database access performs this step.

1. Sign in through Discord once.
2. In Supabase Authentication → Users, inspect the account and its Discord identity. Verify the Discord snowflake against the intended administrator in Discord. Do not trust a display name, supplied email, or client-editable profile metadata.
3. Copy the exact Supabase auth user UUID and verified Discord ID. In the SQL editor, replace the placeholders and execute:

   ```sql
   insert into public.members(name, user_id, discord_id, is_admin)
   values ('Your league admin name', 'VERIFIED_AUTH_USER_UUID'::uuid,
           'VERIFIED_DISCORD_USER_ID', true);
   ```

4. Reload the scheduler. Use League admin → Members to create/link other members and grant additional admin access only when intended. The last admin cannot be removed by the application.
5. Owners and playing eligibility are assigned separately in **Rosters**. A member can have assignments to multiple teams, including across divisions. A free agent or owner does not count as an eligible player unless the assignment’s `eligible` flag is true. `kind` records player, bench, or call-up; it does not grant eligibility on its own.

The admin UI lets trusted admins link user UUIDs and Discord IDs. Identity verification is deliberately an admin responsibility. Users cannot select their own team or role to obtain access.

## Set up your actual league

1. Create a season with ISO timestamps including a UTC offset or `Z`, a scheduling deadline, 30-minute slots, and a 120-minute reservation (both configurable).
2. The seeded Main league format is 12 teams / one meeting per pair. G League is six teams / two meetings per pair. The season permits up to 180 days; create subsequent seasons for longer competition periods.
3. Add your actual teams, members, owner assignments, and eligible rosters manually or through CSV.
4. Select the season and division in the page header, then choose **Generate missing matchups**. It requires the format’s exact team count. It creates 66 Main or 30 G League series and ignores existing pair/meeting keys. Re-running does not delete results, reset notes, or duplicate series.
5. Import or edit already-played matchups as `completed`, with team IDs, meeting number, and a short note. Or open an existing matchup and use **Admin resolution → Mark already completed**. They are excluded from recommendations.
6. Matchup `starts_at`/`ends_at` are its allowed scheduling window before confirmation and its actual reserved interval afterward. Null bounds inherit the season. `deadline` can narrow the season deadline. Cancelling a confirmed series clears its old interval; an admin can set a new allowed window afterward. A cancellation reason is visible on the matchup.
7. Owners propose recommended windows, then both owners explicitly accept that same proposal. Creating it does not accept it. A member who owns both teams still makes separate decisions for each team.

## CSV import contract

Each admin tab provides a header-only template and an import preview. UTF-8 CSV, comma-delimited, standard double-quote escaping, headers required; `true` / `false` for booleans. Maximum 500 rows per import. Dates use ISO 8601 with offset (`2030-11-03T01:00:00-07:00`) or UTC (`2030-11-03T08:00:00Z`). Empty nullable fields are null. Blank `id` creates a UUID; a known `id` updates that record. Foreign-key fields must use existing UUIDs. IDs are shown in the admin table and editor. Use your own stable UUIDs for related bulk imports or create parents first and copy their generated IDs. A live import is one transaction: any invalid row rolls back all rows. Sample-mode import is only a UI demonstration and does not enforce SQL foreign keys.

| Tab | Columns |
| --- | --- |
| seasons | `id,name,starts_at,ends_at,deadline,slot_minutes,duration_minutes` |
| divisions | `id,name,team_count,meetings` |
| teams | `id,name,season_id,division_id` |
| members | `id,name,user_id,discord_id,is_admin` |
| rosters | `id,team_id,member_id,owner,eligible,kind` |
| matchups | `id,team_a,team_b,meeting,status,starts_at,ends_at,deadline,note` |

Import order: seasons/divisions → teams/members → rosters → matchups. Matchup team IDs are canonicalized in ascending order by the importer. `meeting` is 1 for Main and 1 or 2 for G League. Allowed manual statuses: `unscheduled`, `completed`, `cancelled`. Confirmed bookings cannot be created or modified through CSV; use normal owner acceptance or an explicitly recorded admin override. Existing matchups with an active proposal must have the proposal cancelled before edits. Linked records cannot be deleted until dependencies have been handled; there are no destructive cascading deletes of league data.

Example **fictional** roster row (replace UUIDs with your records):

```csv
id,team_id,member_id,owner,eligible,kind
,11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,true,true,player
```

## Availability, privacy, ranking, and conflicts

- Availability is personal and applies to every explicitly assigned team. UTC `timestamptz` intervals use half-open `[start,end)` semantics, allowing adjacent reservations without overlap. Display uses IANA zones and real instants. A DST day can have 23 or 25 hours; repeated hours carry offsets in accessible labels and the range-entry form. The quick-fill form is a complete keyboard/screen-reader alternative to drag/touch painting.
- Green means submitted available, striped means submitted unavailable, blank means no response. Saving replaces the displayed local week, preserving ranges outside it. Partially covered blocks are not painted as fully available. Untouched partial intervals are preserved when saving, even after a slot-size or time-zone change.
- Recommendations use continuously available **individual players**, not a rotating count of five different players in different blocks. Ownership alone does not count. At least ten distinct people must be assignable across both teams; a shared member cannot play for both sides.
- Rank: greatest smaller-side count, then greatest total count, then earliest UTC start. Up to eight windows. No substitute “almost qualifies” options are presented.
- Any confirmed team overlap disqualifies a window. Players booked for another confirmed series are removed from the candidates. The confirmation chooses five per side deterministically, preferring A-only players before shared players, then UUID order. These booked participants are shown through team-readable booking records. Additional eligible bench players are not booked unless selected. An override reserves every currently eligible player from both teams, so conflicts remain explicit.
- Every scheduling write, availability save, roster/admin mutation, and generation operation uses the same transaction-level advisory lock. Second acceptance rechecks all criteria under that lock. No authenticated client has direct table-write grants. This intentionally coarse lock is practical for an 18-team league and can be partitioned later only with careful shared-player ordering.
- Individual opposing availability is hidden by RLS. Owners can see their own players, players can see their own availability, admins can see everything. Recommendations expose only counts. League members can read league schedules/roster assignments; member identities are restricted to their own teams. Failed or missing Discord delivery never rolls back the scheduling transaction.
- A cancellation removes bookings and cancels the active proposal; the decision history and admin audit remain. An override is always labeled with its reason, does not impersonate owner acceptance, and cannot overlap existing team or eligible-player bookings.

## Discord notifications (optional, disabled by default)

The integration uses a channel webhook, not DMs. Nothing is sent until an admin configures both the secret and worker, then enables notifications in the UI.

1. In the intended Discord server/channel, an administrator with **Manage Webhooks** creates an incoming webhook. No bot or message-content intent is required. Keep the URL secret.
2. Deploy `supabase/functions/discord-notifications` as a Supabase Edge Function. Set its **server-side** secrets: `DISCORD_WEBHOOK_URL` and a high-entropy `NOTIFICATION_WORKER_SECRET`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in hosted Edge Functions. Do not place any of these secrets in the frontend.
3. Deploy this function with JWT verification disabled (`supabase functions deploy discord-notifications --no-verify-jwt`), because it verifies its own scheduler secret in the Authorization header. Do not remove that check. An ordinary user JWT cannot invoke the worker successfully.
4. Configure a trusted scheduler (Supabase Cron + pg_net / Vault, or another server scheduler) to POST every minute to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-notifications` with `Authorization: Bearer YOUR_NOTIFICATION_WORKER_SECRET`. Store the secret in the scheduler’s secret store, not a checked-in command or browser client. Use the Supabase dashboard to configure the schedule and secret.
5. Enable notifications in League admin. Enabled events are proposal, decision, confirmed, and cancelled. Confirmations include teams, meeting, full UTC date/time, and UTC zone. Overrides are labeled. Discord mentions are disabled.

The outbox claims 20 jobs at a time, retries up to five times, and recovers stale 10-minute leases. Missing webhook configuration leaves jobs queued. Disabling notifications stops claims; queued jobs may be sent if later re-enabled, so clear outdated pending jobs with a trusted SQL editor before re-enabling if needed. The admin panel shows failed and queued deliveries. After fixing an exhausted failure, a trusted administrator can reset that outbox row’s `attempts=0,status='pending'` in Supabase. Delivery is **at least once**: a worker crash after Discord accepts a message but before the sent status is saved can produce a duplicate; event IDs are included to identify it.

## Deployment

`dist/` can be hosted on Sites, Cloudflare Pages, Netlify, Vercel static hosting, or another HTTPS static host. Routes use URL hashes, so deep links work without server rewrites. Supabase remains the trusted backend.

The attached Sites deployment starts owner-private and in sample mode because no Supabase or Discord credentials were supplied. The source is in this folder, including `.openai/hosting.json`. Configure the two public Supabase build variables, rebuild and redeploy before inviting real players. Keep the Site’s audience unchanged until you deliberately choose who can access it; Discord authorization remains required by the app even if the static host later becomes public.

## Validation and practical limits

`tests/database.test.ts` runs the actual migrations and RPCs in PGlite (embedded PostgreSQL), with a minimal test `auth.uid()` shim. It checks full overlap, missing/fewer players, gaps, contiguous slots, cross-zone DST instants, shared players, cross-team conflicts, owner acceptance, decline, changed availability, queued conflicting confirmations, 66/30 generation, RLS, CSV rollback, and cancellation. `tests/time.test.ts` checks spring/fall DST slots and round-robin totals.

PGlite serializes one connection; the competing acceptance test validates rechecking and the resulting invariant but is **not** a live multi-connection concurrency test. Before production use, run two independent owner sessions against your configured Supabase project and verify one competing reservation confirms while the other becomes invalid. Live Discord OAuth, webhook delivery, and hosted Supabase migrations were not tested without credentials. Browser verification uses sample data; touch events should also receive a final real-device check.

The default two-hour reservation is a configurable planning assumption intended to cover up to three games and the league’s two 10-minute inter-game breaks. It is not a claim about official game duration. No standings, statistics, box scores, awards, or game-rule enforcement are implemented.

Visual direction follows the supplied [Cheetah 2K League reference](https://cheetah2kleague.com/): near-black surfaces, off-white type, gold accents, condensed headings. The SR wordmark, court illustration, and placeholder monograms are original; no reference-site logos or imagery were copied. Fonts are Google Fonts Barlow Condensed and DM Sans with local fallbacks.

### Optional live concurrency check

In a disposable staging project, create two overlapping proposals for the same two G League teams (meetings 1 and 2). Have owner A accept both. Set environment variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OWNER_B_ACCESS_TOKEN`, `PROPOSAL_A_ID`, `PROPOSAL_B_ID`, `TEAM_B_ID`, and `CONFIRM_STAGING_TEST=yes` in your local secret-aware shell/session, then run `node tests/live-concurrency.mjs`. It sends two independent concurrent HTTP requests and asserts exactly one confirms and one becomes invalid. It changes those staging proposals. Do not commit the token or run against real bookings. This optional test was supplied but not run without credentials.
