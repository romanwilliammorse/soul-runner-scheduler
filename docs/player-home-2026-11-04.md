# Player home update

Player entry now opens scheduled games with opponent, date, time and explicit local time-zone abbreviation. Red Locker room and My availability buttons follow the list. Owner View as player shows the real team; the landing-page View as player opens an isolated, labeled sample mode at `?view=player-demo` with browser-local test messages and availability. Real team records remain in D1.

Owners can record and remove arranged games under Scheduled games. Availability suggestions do not automatically create games or imply opponent acceptance. Games remain visible for six hours after start, then leave the upcoming list. The list is bounded to 100 games.

Locker room requires an active identified member, derives authorship from the session, stores messages in D1, refreshes every five seconds while visible, and loads older messages in batches of 100. Plain text is rendered through React escaping. Per-member rate limit is 60 sends per 15 minutes; retry IDs prevent duplicate posts. No attachments, push notifications or read receipts are implied.

The landing helper uses the same League Serif italic 600/16px typography as League settings. Removed the top Team Scheduler label and redundant footer. Existing red/black/white colors and self-hosted licensed font substitutes remain.

## Reuse review

Searched GitHub and Hugging Face before implementation. Reviewed [Chatscope React UI kit](https://github.com/chatscope/chat-ui-kit-react/blob/master/package.json): MIT, React 19 supported, repository release metadata version 2.1.1 and substantial existing usage. It supplies a broader chat UI, but no D1 persistence or this app’s team/PIN authorization. Its additional component/style system is unnecessary for one plain-text team room. Reviewed [HuggingChat Space](https://huggingface.co/spaces/huggingchat/chat-ui): active Space, oriented to AI conversations, not team messaging; not imported, so no unverified license or compatibility assumption. Search also surfaced SkedulerApp documentation, not a suitable maintained React/D1 starter. Reused the installed React stack, existing session/rate-limit helpers, SQL storage, licensed fonts, and existing availability grid (including its MIT rectangle selector) rather than replacing the app or adding a second service.

## Verification

- 29 automated tests passed, including new chat/schedule authentication, cross-team isolation, removed-member revocation, sender spoof prevention, retry deduplication, message validation, pagination, future-date validation, and owner-only schedule mutation.
- TypeScript check passed. New schema migration generated with Drizzle and applied to local D1.
- Browser QA: sample player home, chat send, availability save/reload, unsaved navigation warning; owner-created local game visible in player mode with correct local date/time; local D1 chat send displayed with authenticated author.
- Sample availability retained 7 selected hours after browser reload. Production records were not used for test writes.
- Mobile browser check at 390px: no horizontal overflow; game dates/opponents readable and action buttons stack vertically. Computed action backgrounds are rgb(255, 0, 0). Landing helper and text-button control both resolve to League Serif, italic, weight 600, 16px.
