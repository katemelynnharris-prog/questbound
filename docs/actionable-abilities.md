# Actionable abilities

Updated 2026-10-12. The existing ability audit is implemented through additive reward APIs and personal controls.

| Level | Ability | Action / effect |
| --- | --- | --- |
| 1 | The Ledger | Existing quest tracking and XP; five personal Focus Board pins |
| 5 | Second Wind | Choose an eligible fitness quest or workout, review, then spend your weekly use for one extra base XP reward |
| 10 | Loot Find | Claim a Gauntlet Token every five levels, starting at 10; Keep and Use it from the Pack |
| 15 | Signet | Learn/deepen a path in Chosen Paths; two named abilities per path |
| 20 | Rested | Log one hour without screens or another intentionally restful activity once weekly; +25% base XP on the next quest |
| 25 | Witcher’s Contract | Select an available quest; next completion adds +100% base XP, one use weekly |
| 30 | Rally | Automatic +10% base Personal XP on co-op rewards, independently for eligible recipients |
| 40 | Commander’s Favor | Select a category; automatic +20% base Personal XP on matching rewards |
| 50 | Masterwork | Select Wind (+25 percentage points), Rested (50%), Contract (125%), Rally (20%), or Favor (30%) |
| 60 | War Council | Focus Board capacity increases to six personal pins |
| 75 | Legendary Draw | Stable personal daily 10% rare draw; +25% base XP on the next eligible quest reward that day |
| 100 | Prestige | Claim +500 Personal XP and epic/legendary gear at 100 and every 25 levels afterward; preserves XP and inventory |

Bonuses add fractions of base XP; they do not multiply one another. Counter quests use the current log’s share and preserve the final remainder. Contract, Wind, Rested and Legendary Draw remain spent after undo; undo reverses awarded XP exactly. Rested applies to quests, not standalone workouts or expeditions. Daily-accessible quests remain outside the Daily Ledger unless explicitly flagged.

## Specializations

Saved choices are preserved; effects and new purchases unlock with Signet at 15. There are two meaningful ranks per path, so further purchases cannot waste points on unnamed abilities.

| Path | Rank 1 | Rank 2 |
| --- | --- | --- |
| Archivist | Deep Study: +10% Knowledge/Growth/Finish a book base XP | Research Expedition: +25% base expedition XP |
| Vanguard | +25% base XP when Second Wind is used | Battle Rhythm: +10% base fitness/workout XP |
| Pathfinder | Cartographer: one additional unexplored expedition map cell while available | Farther Roads: +20% base expedition Renown, minimum +1 |
| Steward | Good Order: +10% base Home/Tasks/Homestead/Finance/Garage XP | Guild Provisioner: +10% base Campaign XP for those quests completed by you, capped at the active goal |

## Loot

Both players use the same catalog. There are 14 common gear pieces across all nine slots. Gear already received, including discarded copies, has 12% of an unseen item’s selection weight; consecutive identical gear drops are excluded when an eligible alternative exists. Repeats remain possible and completing a collection never stops loot.

20% of successful ordinary drops select one of the two functioning uncommon single-use items: Safe Passage or Gauntlet Token. Keep then Use it from the Pack. Safe Passage protects the next Treasury withdrawal penalty; the token offers an eligible spouse Gauntlet. Both consume once. Loot Find milestone tokens are separate from ordinary drops.

## Validation

23 isolated PostgreSQL reward tests; 11 tests using the actual workout/expedition functions against mirrored staging tables; milestone and Legendary Draw tests; 1,000 small-collection variety draws; 600 mixed gear/usable draws; DOM interaction checks for controls and own-player restrictions. Live integration checks ran in rollback transactions for stacking, recipient separation, exact undo, usable activation, rank gates and milestone claims. No test XP, inventory or quest completions persisted.

Security advisors retain the existing two lint categories: authenticated SECURITY DEFINER APIs (intentional authenticated endpoints with authorization checks) and disabled leaked-password protection. Private reward helpers cannot be executed by anon or authenticated roles.
