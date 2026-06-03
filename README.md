# malloc

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_Lj1H0vEVx5mrKhitzODt0EsegjjT)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## REST API

The API uses the same Supabase email/password accounts as the frontend. Do not
share a Supabase service role key with users. Instead, exchange the user's email
and password for a short-lived access token, then send it as a bearer token.

Published docs:

- Human-readable API docs: `/api-docs`
- Machine-readable OpenAPI spec: `/api/openapi.json`

### Sign in

```bash
curl -X POST http://localhost:3000/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password"}'
```

The response includes `access_token`, `refresh_token`, and expiry metadata.

### Refresh a token

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"<refresh_token>"}'
```

### Hydrate a workspace

```bash
curl http://localhost:3000/api/workspace \
  -H 'Authorization: Bearer <access_token>'
```

### Apply a targeted mutation

```bash
curl -X POST http://localhost:3000/api/mutations \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{"client_mutation_id":"unique-request-id","action":"addTask","payload":{"stickyId":"sticky-id","task":{"id":"task-id","text":"Ship it","status":"todo","createdAt":1767225600000,"order":0}}}'
```

Each `client_mutation_id` is an idempotency key. Supported actions include
`addSticky`, `reorderStickies`, `addTask`, `setTaskStatus`, `reorderTasks`,
`clearStickyArchivedTasks`,
`addMemo`, `editMemo`, `archiveMemo`, and memo collection operations.

### Legacy app-state compatibility

`GET /api/app-state` remains available for migration verification. Full-state
REST writes are disabled; ordinary writes must use targeted mutations through
`POST /api/mutations`.

### Database rollout

Apply `scripts/003_add_action_shaped_persistence.sql` before deploying the
RPC-based frontend. It adds and backfills the normalized tables without
breaking the legacy frontend. After the new frontend and external helpers are
verified, apply `scripts/004_disable_legacy_app_state_writes.sql` to disable
direct legacy blob writes.

For a safe production rollout:

1. Back up or export `public.app_state`.
2. Apply `scripts/003_add_action_shaped_persistence.sql`. It intentionally
   preserves `public.app_state` while copying existing user data into the
   normalized tables.
3. Verify that existing stickies, tasks, memos, and memo collections appear for
   signed-in users before merging or deploying the RPC-based frontend.
4. Deploy the frontend and verify that a new task survives refresh and sign-in.
5. Apply `scripts/004_disable_legacy_app_state_writes.sql` after the new
   frontend and any external helpers are using targeted mutations. It revokes
   direct legacy table writes and direct execution of the full replacement and
   deletion RPCs.

If `scripts/003_add_action_shaped_persistence.sql` was applied before the
mutation conflict fix, apply `scripts/005_fix_workspace_mutation_conflict.sql`
once before testing writes.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

<a href="https://v0.app/chat/api/kiro/clone/sharon-zh-chan/malloc" alt="Open in Kiro"><img src="https://pdgvvgmkdvyeydso.public.blob.vercel-storage.com/open%20in%20kiro.svg?sanitize=true" /></a>
