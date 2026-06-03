import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REST API Docs | To Do at One Glance",
  description: "OpenAPI documentation for the To Do at One Glance REST API.",
};

const endpoints = [
  {
    method: "POST",
    path: "/api/auth/token",
    title: "Sign in",
    description:
      "Exchange a user's email and password for an access token and refresh token.",
    auth: "No bearer token required.",
  },
  {
    method: "POST",
    path: "/api/auth/refresh",
    title: "Refresh token",
    description: "Exchange a refresh token for a new access token.",
    auth: "No bearer token required.",
  },
  {
    method: "GET",
    path: "/api/workspace",
    title: "Hydrate workspace",
    description: "Fetch the signed-in user's current workspace for display.",
    auth: "Requires Authorization: Bearer <access_token>.",
  },
  {
    method: "POST",
    path: "/api/mutations",
    title: "Apply a workspace mutation",
    description:
      "Apply an idempotent action such as addTask, reorderStickies, editMemo, or archiveMemo.",
    auth: "Requires Authorization: Bearer <access_token>.",
  },
  {
    method: "GET",
    path: "/api/app-state",
    title: "Legacy app-state read",
    description:
      "Read the full workspace for compatibility and migration verification. Full-state writes are disabled.",
    auth: "Requires Authorization: Bearer <access_token>.",
  },
];

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#202124]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-4 border-b border-[#202124]/20 pb-8">
          <p className="text-sm font-semibold uppercase text-[#1b6950]">
            OpenAPI 3.1
          </p>
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold sm:text-5xl">
              To Do at One Glance REST API
            </h1>
            <p className="max-w-3xl text-base leading-7 text-[#555f68] sm:text-lg">
              Authenticate with the same email and password used in the
              frontend, hydrate the workspace, then preserve user intent with
              targeted mutations.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#202124] px-4 text-sm font-semibold text-white"
              href="/api/openapi.json"
            >
              Open OpenAPI JSON
            </a>
            <a
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#202124]/30 px-4 text-sm font-semibold"
              href="/"
            >
              Back to app
            </a>
          </div>
        </div>

        <section className="grid gap-4">
          {endpoints.map((endpoint) => (
            <article
              className="rounded-lg border border-[#202124]/15 bg-white p-5 shadow-sm"
              key={`${endpoint.method}-${endpoint.path}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#e7f0e7] px-2 py-1 text-xs font-bold text-[#1c5b36]">
                      {endpoint.method}
                    </span>
                    <code className="break-all rounded bg-[#eef2f7] px-2 py-1 text-sm">
                      {endpoint.path}
                    </code>
                  </div>
                  <h2 className="text-xl font-bold">{endpoint.title}</h2>
                  <p className="text-sm leading-6 text-[#555f68]">
                    {endpoint.description}
                  </p>
                </div>
                <p className="max-w-sm text-sm font-medium text-[#9a4f14]">
                  {endpoint.auth}
                </p>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-4 border-t border-[#202124]/20 pt-8">
          <h2 className="text-2xl font-bold">Quick Start</h2>
          <pre className="overflow-x-auto rounded-lg bg-[#202124] p-4 text-sm leading-6 text-white">
            <code>{`curl -X POST /api/auth/token \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"user@example.com","password":"password"}'

curl /api/workspace \\
  -H 'Authorization: Bearer <access_token>'

curl -X POST /api/mutations \\
  -H 'Authorization: Bearer <access_token>' \\
  -H 'Content-Type: application/json' \\
  -d '{"client_mutation_id":"unique-request-id","action":"addTask","payload":{"stickyId":"sticky-id","task":{"id":"task-id","text":"Ship it","status":"todo","createdAt":1767225600000,"order":0}}}'`}</code>
          </pre>
        </section>
      </section>
    </main>
  );
}
