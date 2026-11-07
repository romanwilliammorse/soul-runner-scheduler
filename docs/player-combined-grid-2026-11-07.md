# Player combined availability

The player home page now shows the combined team grid immediately below Metrics. It is expanded by default. Owner and player views reuse one grid markup block in `app/team-availability.tsx`, the same CSS, `overlapWeek` calculations, and slot-details dialog. Player controls include the highlight threshold, week, time zone, and evening/all-hours display. Proposal and reminder actions remain in the owner view.

Identified active teammates may read the same four-field availability payload as owners. Shared-password-only, expired, revoked, and cross-team sessions cannot read it. Players still save only their own hours. No database migration is needed.

Built-in player testing mode supplies clearly named sample teammates without fetching a real team. The current test player's saved hours feed the combined grid; changing that player's timezone does not move the sample teammates' schedules.

## Verification

- Full automated suite: 43 passed, 0 failed. Covers owner/player payload equality, authorization and revocation boundaries, personal-only writes, self-enrollment, and recurring timezone/DST overlap behavior.
- TypeScript check and production build passed after the final source changes.
- Local browser: signed-in player sees the grid below Metrics, 56 evening cells, correct saved-player count, and available/unavailable/unanswered names on cell selection.
- All-hours view includes the repeated daylight-saving hour in the current Chicago week.
- Phone viewports of 390 and 320 px: no horizontal page overflow; grid remained visible and aligned.
- Testing mode shows five sample players and highlighted shared hours. Saving an additional personal hour and returning home updates its combined count.

## Reuse review

The existing owner grid is the direct reusable implementation and has no new dependencies. GitHub's MIT-licensed `bibekg/react-schedule-selector` is already partially vendored for personal editing; its older dependencies do not provide combined counts or the app's timezone calculations. The inspected Hugging Face Space `jcole161616/screentime-squad-friend-availability-tracker` is a static ready/busy interface without a declared license and is unsuitable as a replacement.
