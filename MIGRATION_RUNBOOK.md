# BlockCtrl migration runbook

Runtime requests do not execute DDL. Database schema changes are deployment operations and **must be applied before the new web build is exposed to production traffic**.

## Production order

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm check
pnpm build
pnpm start
```

The migration runner reads sorted `*.sql` files from `migrations/`, runs each pending file in a transaction, and records applied versions in `schema_migrations`. If a migration fails, that migration is rolled back and its version is not recorded.

## Current migrations

- `0001_runtime_ddl_baseline.sql` — records the boundary where runtime DDL was removed.
- `0002_metrics_alerts_notifications.sql` — creates server metrics, alert rules and notifications.
- `0003_information_pages.sql` — creates persistent block-based Bilgilendirme pages.
- `0004_support_announcements.sql` — creates editable support settings, request types, announcements and read tracking.
- `0005_lost_item_restore.sql` — adds lost-item restore/operation persistence required by the recovery flow.
- `0006_member_owner_permissions.sql` — backfills/normalizes member owner permissions for existing servers.
- `0007_websites.sql` — creates the website publishing records used by BlockCtrl website management.
- `0008_website_builder.sql` — adds website builder JSON and publish timestamp fields.
- `0009_website_runtime.sql` — creates website members, member sessions and website form submissions.
- `0010_website_auth_access.sql` — adds website registration/login modes, Minecraft identity, roles, per-member page access and auth settings.
- `0011_website_integrity_security.sql` — adds website runtime foreign-key cascades, removes orphan runtime rows and creates persistent public-auth rate-limit storage.
- `0012_website_runtime_hardening.sql` — adds explicit public website-data permission for shared servers and case-insensitive per-site uniqueness for e-mail/Minecraft identities.
- `0013_player_moderation.sql` — adds persistent per-server player moderation notes used by the Players screen.
- `0014_server_website_data.sql` — stores bounded agent-produced public website snapshots such as player bans and kill leaderboards.
- `0015_server_players.sql` — creates the persistent per-server player directory used for online state, UUID, OP/whitelist/ban metadata, last-seen timestamps and accumulated play time.
- `0016_website_server_binding.sql` — binds each website and website form submission to a primary Minecraft server so live counters, maps, support/forms and member flows can inherit the same authorized server.

## Required checks after migration

1. Run `pnpm check` and stop the deployment if lint/typecheck fails.
2. Run `pnpm build` and stop the deployment if Next.js build fails.
3. After startup, call `/api/health`. `database.status` and `migration.status` must be `ok`.
4. `/api/health.migration.latest` must be at least `0016_website_server_binding`.
5. If nodes are configured, `agent.status` should be `ok`; `offline` means the panel is available but no node heartbeat was received in the last 90 seconds.

Do not rely on `ensurePanelSchema()` to repair production. It is intentionally a no-op so runtime requests never execute DDL or acquire migration locks.
