# Soul Runner — team scheduler

The app supports team registration, player self-enrollment, roster management, recurring weekly availability, owner-managed scheduled games, and private team chat. The original implementation is retained in `legacy/` for reference and is not imported by this application.

## Owner flow

1. Enter the league password supplied by Roman.
2. Press **Register team**.
3. Enter the team name, Main/G League division, owner's name, and Discord username.
4. Set a private owner password, a different shared team password, and a six-digit personal PIN. The owner is automatically included as a player.
5. Registration opens **Invite & settings**. Copy the team link and share it with the team password. Players enter their own names and Discord usernames; the owner does not need to pre-enter a roster.
6. Use **My hours** to save the owner's recurring availability, **Players** to manage the roster, and **Scheduled games** to record arranged matchups.

Discord usernames are contact fields, not verified Discord identities. The app does not use Discord OAuth or send Discord messages.

## Player flow

1. Open the team's link and enter the **team password** supplied by the owner.
2. Under **Join team**, enter their own name and Discord username, then create and confirm a six-digit personal PIN.
3. The app adds the player to the owner's roster and opens the player dashboard: scheduled games, Locker room, My availability, Metrics, and the combined team availability grid directly below Metrics.
4. On later visits, use **Returning player**, choose their name, and enter the PIN. Existing owner-added players can still select their roster entry and create their first PIN.
5. Under **My availability**, select recurring hours, **Sunday through Saturday**, one hour per block, and choose **Save hours**.

Self-enrollment reserves names and normalized Discord usernames within a team, including removed identities. Duplicate or removed profiles are directed to returning-player sign-in or the owner. The 20-active-player limit includes the owner and is enforced atomically. A stable join request identifier makes retries safe without replacing a player's credentials or saved data.

The editor supports multi-day ranges, weekday/weekend presets, and large per-day hourly buttons for phone and keyboard input. Touch scrolling does not paint hours. Availability persists on the server, including across devices. Each player chooses an IANA time zone; weekly wall-clock hours stay in that zone through daylight saving changes. The owner overview projects recurring patterns onto a selected week to account for daylight-saving changes. Ranked windows are proposals, not booked games.

An unanswered player has `slots = NULL`. A player who submits no available hours has `slots = []` and a saved timestamp. These are intentionally different. Saving includes a version check so a stale browser cannot overwrite a newer response silently.

## League setup

The production site has a hosted D1 database provisioned by Sites. It no longer needs Supabase credentials. No sample teams or default league password are seeded in production.

1. Visit `/?view=setup` while signed into the existing Site owner's ChatGPT account.
2. Set the league password (at least 10 characters).
3. Share the website and that password with owners once the host's access settings permit them to visit.

The server-side `LEAGUE_ADMIN_EMAIL` setting identifies the existing Site administrator. It is configured in Sites runtime settings and checked against the trusted platform-injected authenticated email. Only that administrator can set or rotate the league password. Visiting a URL, knowing the league password, or registering a team never grants league administration. In a public deployment, administrator sign-in remains available at the setup URL; ordinary team owners and players use the application passwords/PINs.

**Hosting access:** Public, as requested by the league owner. Owners and players enter using application passwords and player PINs; only league administration uses ChatGPT sign-in.

## Passwords and recovery

- League password: at least 10 characters, grants registration only.
- Owner password: at least 10 characters, grants management of that owner's team and the owner's own availability.
- Team password: at least 8 characters, grants access to self-enrollment and returning-player selection. A personal PIN is still required for each player profile.
- Personal PIN: exactly six digits, grants access to that player's availability. Knowing a player's PIN does not grant owner access, even when that player is the owner.
- Passwords/PINs are salted PBKDF2-SHA256 hashes with 100,000 iterations. Session tokens are random 256-bit values, stored hashed on the server and in HttpOnly / SameSite=Strict / Secure-on-HTTPS cookies.
- Incorrect password and PIN attempts are rate-limited on the server. PIN limits are scoped to a player, including across source IPs. All state-changing endpoints require same-origin JSON requests.
- Owners can add/edit players, reset a non-owner player's PIN, remove players, and restore removed players. Removal is soft and preserves their saved hours; it revokes their active player sessions. PIN reset revokes player sessions but preserves availability.
- Owners can change their team password, owner password, and own PIN under Invite & settings → Passwords & PIN. Team password changes revoke all player/team sessions for that team. Owner password changes revoke other owner sessions and replace the current owner's session.
- A player claiming a previously unclaimed name must know the team password. The first claimant establishes that name's PIN; this is a roster-based trust model, not verified Discord identity. Owners can reset mistaken claims.
- If an owner forgets their private password, there is no unauthenticated recovery endpoint. A league administrator must use trusted database maintenance to replace the hash and revoke that team's owner sessions. Do not hand out an owner's password to players.

## Local development

Node 22.13+ (Node 24 is used for tests), pnpm, and a working Cloudflare `workerd` runtime are required.

```sh
pnpm install
pnpm db:generate  # only after changing db/schema.ts
pnpm build
```

Apply each pending local migration once:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sour_franklin_storm.sql
```

Create ignored `.dev.vars` with `LEAGUE_ADMIN_EMAIL=seedy@sites.test` for the starter's loopback-only mock administrator. Run `pnpm dev`, open the printed localhost URL, and visit `/?view=setup`. “Administrator sign in” uses the starter's local mock identity. Production builds do not include that mock.

On this Windows machine the bundled `workerd` required the bundled Visual C++ runtime DLL directory on PATH. The verified path is `C:\Users\Roman\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\libheif\libheif\bin`. On another Windows installation, install the official Microsoft Visual C++ x64 runtime if `workerd --version` exits with missing-DLL status `0xC0000135`.

```sh
pnpm test   # API authorization, credential hashing, database persistence and integrity
pnpm check  # TypeScript
pnpm build  # deployable Worker and browser assets
```

`tests/local-smoke.mjs` is an **optional, loopback-only** fixture generator. With the local dev server running, it sets a test league password and creates an explicitly named local test team. It never contacts production. Do not use its published test passwords in a real league. Local D1 data is separate from hosted D1.

## Architecture and deployment

- Vinext / React / TypeScript with the supplied Sites build integration.
- Server API: `lib/phase-api.ts`; route: `app/api/[...path]/route.ts`.
- Credentials and validation: `lib/security.ts`.
- Client: `app/scheduler.tsx`; minimal responsive styling: `app/globals.css`.
- D1 schema: `db/schema.ts`. Generated schema-only migrations: `drizzle/`.
- Hosting manifest declares the existing project and the `DB` binding. Sites applies migrations when publishing.
- Runtime administrator configuration stays in Sites secrets; no password, PIN, or session token belongs in source or the hosting manifest.

Existing phase-zero Supabase code and migrations are retained in `legacy/` but are not deployed as routes or run against D1. Existing production teams and saved hours are preserved on deployment.

## Validation

Automated tests exercise the actual API handler with SQLite using the generated D1 SQL schema and a transaction-capable D1 adapter. They cover admin-only setup, registration gating, owner-as-player behavior, hashed secrets, roster privacy, first-PIN claim, wrong PINs, team isolation, recurring hours/time zones, unanswered versus empty responses, stale saves, duplicate records, PIN reset, reversible removal, session revocation, CSRF protection, and rate limits.

Browser QA uses a disposable local database at phone width. Hosted behavior should be checked with the real league password after the administrator sets it. No production league password was chosen on the administrator's behalf.

## Owner availability overview

Team Availability shows response progress and upcoming ranked windows. A proposal requires the same players for the complete 1–3 hour duration. The default requirement is five players; owners may change it explicitly. Proposals and missing-response reminders can be copied for manual sharing in Discord. Nothing is sent automatically and no game is booked. Matchups, confirmed bookings and date exceptions remain a later phase.

Every identified active player also sees the same combined grid on their home page, expanded by default. Owner and player views share the grid markup, colors, overlap calculations, week/time-zone controls, and player-name breakdown. Players can inspect team hours but still edit only their own. The team password alone does not grant access to the combined grid. Testing mode uses sample teammates and the test player's saved hours without requesting real team data.

## GitHub

The private repository is https://github.com/romanwilliammorse/soul-runner-scheduler. The local origin remote points there. Source snapshots are synchronized through the connected GitHub integration. Sites publication remains separate. Direct command-line Git pushes require local Git authentication.

## November 4 interface rebuild

The active entry point is now `app/league-app.tsx`. The new weekly grid adapts the MIT-licensed rectangle selector from `bibekg/react-schedule-selector`; see `vendor/schedule-selector/` for the pinned upstream revision and license. Heavy italic Barlow headings approximate the NBA 2K27 reference using self-hosted open-licensed fonts.

Players edit an eight-hour portion of their week using Night / Day / Evening. Mouse dragging selects rectangular blocks; keyboard users move with arrows and toggle with Space/Enter. Touch users can tap or enable Drag; ordinary scrolling leaves cells unchanged. Bulk range entry is available below the grid. The owner view defaults to five players for a two-hour window, with secondary controls collapsed. Existing saved comparison preferences remain respected.

Source comparisons, verification evidence, and limitations: `docs/rebuild-2026-11-04.md`. `tests/rebuild-fixture.mjs` creates a clearly labeled five-player fixture only on localhost port 5174.
