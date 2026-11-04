# Independent app assessments — November 4, 2026

Scope: team registration, recurring availability, owner overlap and proposal preparation. Scores are expert judgments, not user satisfaction measurements. Three agents reviewed independently; the parent performed shared browser QA. No production roster or saved availability was modified during testing.

## Scores by review round

Round 1: baseline source review and 20 passing automated cases.
Round 2: redesigned implementation and source re-review; browser acceptance still pending.
Round 3: integrated Chrome acceptance tests and final corrective pass; 26 automated cases passing.

| Agent | Round | Usability | Clarity | Organization | Overall |
|---|---:|---:|---:|---:|---:|
| Usability | 1 | 6.5 | 7.0 | 7.0 | 6.5 |
| Functional | 1 | 6.5 | 7.0 | 7.0 | 6.8 |
| Product | 1 | 6.5 | 7.0 | 6.5 | 6.5 |
| Usability | 2 | 8.8 | 9.1 | 9.0 | 8.9 |
| Functional | 2 | 9.2 | 9.5 | 9.5 | 9.3 |
| Product | 2 | 9.0 | 9.2 | 9.2 | 9.0 |
| Usability | 3 | 9.5 | 9.5 | 9.5 | 9.5 |
| Functional | 3 | 9.5 | 9.6 | 9.5 | 9.5 |
| Product | 3 | 9.5 | 9.5 | 9.6 | 9.5 |

Intermediate feedback was consolidated into these three rounds; the rows are not manufactured automated measurements. Final scores were independently supplied by the reviewers after receiving the shared browser results. The usability agent's final score was conditional on the empty-hours check, which subsequently passed.

## Findings and modifications

- Repetitive 168-cell editing became visible multi-day range entry with weekday/weekend presets, large daily controls and sticky Save.
- Owner overview now leads with ranked upcoming windows, the same players throughout the required duration, a default five-player threshold and missing-response follow-up.
- Suggestions in the past are excluded. Explicit participant requirements survive roster changes. Stale stored comparison weeks return to the current week.
- Copyable proposals carry date, zone, names and an explicit not-booked label. Reminders only copy to the clipboard; nothing is sent automatically.
- Unsaved navigation has in-page Keep editing/Discard controls. Save locks editing. Stale revisions cannot overwrite newer data and have explicit recovery choices.
- Empty availability requires an explicit checkbox; invalid empty saves focus that checkbox.
- Successful password entries reset their relevant failed-attempt counters. Shared-network users no longer exhaust the budget simply by signing in correctly.
- Reused time-zone calculations cut the functional agent's 20-player overlap benchmark from 1,599ms to 158ms (about 10x). This is a local desktop observation, not a mobile performance guarantee.

## Executed checks

Automated: 26 passing tests against the actual API with an in-memory SQLite/D1 adapter, plus TypeScript. Coverage includes authentication, PIN claim races, team isolation, CSRF, rate limits, optimistic revisions, recurring slots, fractional-offset zones, missing/repeated DST hours, same-participant multi-hour windows, midnight continuity, and overlapping result suppression.

Scale: 75 players across 15 teams, 10 revisions per player, 750 saved updates. Final values and team isolation verified. This is a persistence simulation, not 75 concurrent live browser sessions.

Chrome UI, disposable local team:

- Applied weekday 7–10PM hours in one operation; preserved prior overlapping selections.
- Cancelled Sign out through Keep editing; selections and dirty status remained.
- Saved and reloaded; server-backed selected hours persisted.
- Created a newer revision in another tab; stale save was rejected. Keep editing preserved the draft; Replace my edits loaded the correct latest slots.
- Copied a Nov 8, 5–6PM PST proposal naming the correct two available fixture players. Increasing duration to two hours removed that result.
- Copied a reminder containing exactly the three missing fixture players and team URL.
- Confirmed no horizontal overflow at 390px and 320px (document widths 375px/305px with scrollbar).
- Empty-save attempt focused the explicit no-hours checkbox. Confirmed empty submission saved and persisted through reload.

The in-app browser stalled on a native confirmation; its incomplete check was not counted as a pass. Tests continued in Chrome, and native unsaved-edit prompts were replaced with in-page dialogs.

## Limits and next validation

These ratings do not cover opposing-team matching, confirmed games, conflict prevention, date-specific exceptions, or successful completion of ten real games. Those remain the next product phase. Before league-wide rollout, observe a small pilot of actual owners and players completing the flows on their own phones, including slow networks and accessibility needs.
