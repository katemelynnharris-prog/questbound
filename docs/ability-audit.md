# Questbound ability audit — October 12, 2026

Status: audit complete; implementation draft, not deployed. Automatic approval review rejected both the broad core-function migration and the additive reward migration. No ability tables, XP awards, or live controls were added.

## Rank abilities

| Unlock | Ability | Current behavior | Required actionable behavior |
|---|---|---|---|
| 1 | The Ledger | Quest completion and activity tracking work | No activation needed; describe as a core unlock |
| 5 | Second Wind | Description only | Select a fitness quest or today's workout; arm/cancel; show ready/used and Monday reset; award one extra base Personal XP amount |
| 10 | Loot Find | Ordinary quest loot works; level-up challenge loot is not wired | Award challenge loot automatically once per new level; show it in unclaimed rewards |
| 15 | Signet | Specialization selection works, but is available before the advertised level | Link to choices; enforce level 15 for new selections; preserve existing choices |
| 20 | Rested | Description only | Show readiness after two full quiet days; apply a defined return bonus automatically |
| 25 | Witcher's Contract | Description only | Choose an available task; arm/cancel; display weekly use and the exact extra reward |
| 30 | Rally | Co-op already pays both members; no additional Rally modifier | Apply and itemize an additional bonus only for eligible recipients |
| 40 | Commander's Favor | Description only | Choose/change an existing category; show the current selection and apply the documented bonus |
| 50 | Masterwork | Description only | Choose an earlier ability to improve; show exactly what changes |
| 60 | War Council | No active focus list or extra slot exists | Add a real focus list and enforce the additional slot on the server |
| 75 | Legendary Draw | Ordinary shared Fate exists; no level-based rare weighting | Define and display the rare benefit and its actual weighting |
| 100 | Prestige | Description only | Add a milestone claim with visible eligibility and rewards; preserve XP and inventory |

## Specialization abilities

The database references player_specializations only in choose_specialization and admin_reset_playtest_data. No specialization-dependent reward computation was found in the live reward functions reviewed.

| Specialization | Ability | Required integration |
|---|---|---|
| Archivist | Deep Study | Automatic, itemized bonus on knowledge/study quests |
| Archivist | Research Expedition | Automatic, itemized expedition bonus |
| Vanguard | Second Wind | Clearly defined enhancement to the rank ability, not a second ambiguous activation |
| Vanguard | Battle Rhythm | Automatic workout/fitness bonus |
| Pathfinder | Cartographer | Extra map reveal on expedition completion |
| Pathfinder | Farther Roads | Extra Renown on expedition completion |
| Steward | Good Order | Automatic household quest bonus |
| Steward | Guild Provisioner | Automatic, itemized Campaign contribution bonus |

## Concrete draft balance

These are proposed values, not existing game rules and not yet approved or deployed:

- Second Wind: +100% base Personal XP, one use per player per Monday–Sunday week.
- Witcher's Contract: +100% base Personal XP, one use per player per week.
- Rested: +25% base Personal XP on returning after two full quiet days, maximum once per week.
- Rally: +10% base Personal XP for each recipient who has unlocked Rally.
- Commander's Favor: +20% base Personal XP in the selected category.
- Masterwork: increase Second Wind/Contract's extra amount by 25 percentage points; Rested to 50%; Rally to 20%; Favor to 30%.
- War Council: five focus slots initially; six at level 60.
- Legendary Draw: personal 10% daily chance of a +25% base Personal XP bonus on one quest. This would be a personal rare bonus, rather than replacing shared Fate.
- Prestige: milestone at level 100, then every 25 levels; +500 Personal XP and an available epic/legendary item. No level reset.
- Deep Study/Good Order/Battle Rhythm: +10% in their eligible categories.
- Research Expedition: +25% expedition Personal XP.
- Vanguard's Second Wind enhancement: +25 percentage points to its extra base XP.
- Cartographer: reveal one extra available map cell per expedition.
- Farther Roads: +20% base Renown, minimum +1.
- Guild Provisioner: +10% base Campaign XP on household quests.

## Validation required before live deployment

The proposal SQL is unexecuted and has not passed PostgreSQL integration tests. It must not be applied to production from this draft.

1. Test at each level boundary, including a forged low-level activation and another player's target.
2. Test one weekly use, Monday reset, cancellation, and separate uses for Kate and Drew.
3. Test daily counters: bonuses must use the per-log reward, including any remainder on the final log.
4. Test retries/concurrent requests; no double award or loot.
5. Test completion undo against total Personal and Campaign XP and ability-use policy.
6. Test co-op recipients separately; one player's passive must not silently give the other their bonus.
7. Test no active Campaign, Campaign near victory, and archived Campaigns.
8. Test expeditions and playtest date offsets.
9. Test client refresh/recovery when base completion succeeds but ability collection fails.
10. Validate endgame rewards and whether the proposed balance matches the intended design.

## Deployment order

Use separately tested changes: Second Wind first, then selection controls, then passive bonuses, then late-game systems. Update the Ability Ledger only when an effect is actually integrated. Do not publish controls pointing to missing APIs.
