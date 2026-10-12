# Isolated ability regression checks

Run npm ci here, then node run.mjs, node workout-tests.mjs, node milestone-tests.mjs, node legendary-tests.mjs, node variety-tests.mjs, node usable-tests.mjs and node ui-tests.mjs.

These tests use in-memory PGlite/PostgreSQL and jsdom, with mirrored column types, real original workout/expedition functions, and synthetic fixtures. They do not connect to production. The SQL fixtures record the independently staged ability layers; current production definitions are recorded in migrations/actionable_abilities_functions.sql. Live rollback integration tests additionally checked the production stack.
