# Local events and optional challenges

Implemented October 17, 2026.

- `local-map.js`: keep Free outing and setting; equipment appears in optional challenge rolls. Swap until a bonus is claimed, including after the visit. Rewards remain once per outing.
- `local-events.js`: dated event cards on map/calendar and a live limited-time sidequest alongside the normal three. All attendance actions are co-op. Event pins use approximate venue coordinates, with official links and costs.
- `event-upgrade.sql`: authenticated attendance, per-guild event claims, date validation, server-side draw expiry, existing expedition/gear/ability rewards, co-op partner XP. Grace period: 72 hours after an event ends to record actual attendance. No late random rolls.
- `event-collector/`: Supabase function `refresh-local-events`, JWT verification enabled. Uses only fixed official sources; accepts no caller-supplied URLs, data, XP, or SQL. Service credentials stay in Edge environment variables. Service-only atomic lease limits refreshes to once per six days (retry after six hours if unavailable). App triggers a check on opening; this is not a background scheduled job.
- Collector sources: Humanities Tennessee, Frist, Parnassus, Belcourt, Game Point. A source failure does not interrupt the game. Show partial availability. No guarantee of comprehensive local coverage. No paid/unknown-price music, country music, sold-out, member-only, or out-of-region listings. Unknown prices are conservatively treated as paid.
- Belcourt screenings use actual published showtimes, weekday verification, recent page modification, and runtime for an approximate end; no generic release windows or invented annual dates.
- Seeded official listings: Southern Festival of Books October 17–18; Frist architecture tour October 17; Nikki Barber free café performance October 29; Belcourt Staff Pick November 3. Manual records preserve verified notes if collector rediscovers them.
- Hammocks are tree-hung. No current destination is marked tree-hanging permitted: require a specific land-manager permission URL and `hammock_tree_permission=true`, plus `hammock_permitted` tag, before offering the challenge. Suitable healthy trees and straps still need checking on arrival. Do not infer permission from tree cover or a picnic designation.
- $10/$30 challenges use low-budget destination tags. Free outing excludes purchases and paid bonus challenges; parking is explicitly excluded from the free-admission filter.

Validation: PGlite reward/access/expiry tests, event parser tests, jsdom flow tests, actual Leaflet mounting, live authenticated state check, live attendance test in a rolled-back transaction, and live collector invocation. Existing anonymous friend-feed access remains unchanged.
