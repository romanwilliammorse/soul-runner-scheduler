# Player self-enrollment — local review

Implemented on 2026-11-07. These changes are local only, pending Roman's review; do not publish to Sites/Vercel or push to GitHub until he approves the result.

## Behavior

- Owners create the team and access credentials in two steps. The app opens Invite & settings immediately; no roster entry is required during registration.
- Invite links require the shared team password. New players enter their own name, Discord username, and confirmed six-digit PIN, then open the player dashboard.
- The owner roster receives the player's details. Returning and previously owner-added players retain the existing PIN sign-in flow and saved data.
- POST /api/team/:id/join requires team access, validates the fields, hashes the PIN, and creates a non-owner profile. The UUID request key makes an identical retry safe.
- Duplicate identities (including known removed profiles), concurrent joins beyond the 20-player limit, wrong-team access, and attempts to replace an existing profile are rejected. No database migration or dependency changes are needed.

## Verification

- 40 automated tests passed, including new self-enrollment, validation, duplicate/removal handling, retry safety, concurrency/capacity, cross-team access, owner-session clearing, and rate-limit cases.
- TypeScript check and production build passed.
- Browser-tested local owner registration, immediate invite screen, incorrect/correct team passwords, mismatched PIN, successful player join, owner roster visibility, availability save, returning-player sign-in, and duplicate rejection.
- Confirmed form draft restoration across mode changes. Inspected desktop and 390px/320px phone layouts with no document horizontal overflow.
- Static review covered route/unmount guards for stale authentication completions, owner-login error visibility, and Back/Continue draft restoration.

GitHub and production were not updated. Test records exist only in the local development database.
