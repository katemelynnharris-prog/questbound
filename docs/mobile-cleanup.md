# Mobile cleanup and quest tracking

Home character cards display side by side with compact art, typography and stats below 680px. Drew's ready Cheat Day button reads "Use cheat day".

Second Wind no longer adds buttons to quest rows or a separate workout block. Completing an eligible quest or workout while the weekly use is ready offers Use Second Wind, Complete normally or Cancel. Normal completion preserves the weekly use; a used/unavailable ability does not interrupt completion. The ability detail panel remains available for deliberate activation.

Check the mail is a shared household quest, available once per day, with 20 base Personal XP to the completing player and 5 base Campaign XP. It is random/gauntlet eligible and outside the Daily Ledger.

Fold laundry keeps its daily reset and existing history, but completion_scope is player: one person's completion neither blocks nor rewards the other.

Verified in rollback integration checks for both quest ownership rules and XP recipients. DOM checks covered normal completion, Wind use, Cancel, eligible workout, ineligible/used bypass, removed inline controls, and CSS parsing.
