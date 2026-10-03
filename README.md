# Questbound

Questbound is a private-by-default two-player real-life RPG built on GitHub Pages + Supabase.

## Production architecture

- Static front end hosted from this repository
- Supabase Auth for player identity
- Supabase Postgres + Row Level Security for private/shared state
- Public repository contains **no private player data** and **no secret/service-role keys**
- Hidden surprise/secret quest content lives server-side rather than in the public bundle

## Supabase

Production project: `zzvqruhfgjocnwffavcb` (`Questbound`)

Only the publishable browser key belongs in the client. Never commit a service-role key, database password, or other secret.

## Current milestone

Authenticated beta foundation:

1. Auth gate
2. Guild membership gate
3. Campaign + character summaries
4. Quest Journal + quest completion RPC
5. Treasury empty-state
6. Activity feed
7. Structural shells for Training, Map, Calendar, Hall, and Guild Admin

The V20/V24 local prototypes remain the visual/content specification while the production data layer replaces prototype-local state.