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

### Read app state

```bash
curl http://localhost:3000/api/app-state \
  -H 'Authorization: Bearer <access_token>'
```

### Replace app state

```bash
curl -X PUT http://localhost:3000/api/app-state \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Content-Type: application/json' \
  -d '{"state":{"timeRange":"","blocks":[],"textBlocks":[],"memoCollections":[],"lastUpdatedAt":0}}'
```

### Delete app state

```bash
curl -X DELETE http://localhost:3000/api/app-state \
  -H 'Authorization: Bearer <access_token>'
```

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

<a href="https://v0.app/chat/api/kiro/clone/sharon-zh-chan/malloc" alt="Open in Kiro"><img src="https://pdgvvgmkdvyeydso.public.blob.vercel-storage.com/open%20in%20kiro.svg?sanitize=true" /></a>
