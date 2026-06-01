export function createOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "To Do at One Glance REST API",
      version: "1.0.0",
      description:
        "REST API for signing in with a frontend account, hydrating a workspace, and applying action-shaped mutations.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      {
        name: "Authentication",
        description: "Exchange account credentials for user-scoped API tokens.",
      },
      {
        name: "Workspace",
        description: "Hydrate the signed-in user's current workspace.",
      },
      {
        name: "Mutations",
        description: "Apply targeted workspace changes while preserving user intent.",
      },
      {
        name: "Compatibility",
        description: "Legacy full-state endpoints for migration and recovery only.",
      },
    ],
    paths: {
      "/api/auth/token": {
        post: {
          tags: ["Authentication"],
          summary: "Sign in with email and password",
          operationId: "createAuthToken",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TokenRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Signed in successfully.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuthSession" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "503": { $ref: "#/components/responses/ServiceUnavailable" },
          },
        },
      },
      "/api/auth/refresh": {
        post: {
          tags: ["Authentication"],
          summary: "Refresh an access token",
          operationId: "refreshAuthToken",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RefreshTokenRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Token refreshed successfully.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AuthSession" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "503": { $ref: "#/components/responses/ServiceUnavailable" },
          },
        },
      },
      "/api/app-state": {
        get: {
          tags: ["Compatibility"],
          summary: "Read app state (compatibility)",
          operationId: "getAppState",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "The user's current app state, or null if none exists.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AppStateResponse" },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/InternalServerError" },
            "503": { $ref: "#/components/responses/ServiceUnavailable" },
          },
        },
        put: {
          tags: ["Compatibility"],
          summary: "Replace app state (compatibility)",
          operationId: "replaceAppState",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReplaceAppStateRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "The saved app state.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AppStateResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/InternalServerError" },
            "503": { $ref: "#/components/responses/ServiceUnavailable" },
          },
        },
        delete: {
          tags: ["Compatibility"],
          summary: "Delete app state (compatibility)",
          operationId: "deleteAppState",
          security: [{ bearerAuth: [] }],
          responses: {
            "204": { description: "The user's app state was deleted." },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/InternalServerError" },
            "503": { $ref: "#/components/responses/ServiceUnavailable" },
          },
        },
      },
      "/api/workspace": {
        get: {
          tags: ["Workspace"],
          summary: "Hydrate workspace",
          operationId: "getWorkspace",
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            "200": {
              description: "The user's hydrated workspace, or null if none exists.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/WorkspaceResponse",
                  },
                },
              },
            },
            "401": {
              $ref: "#/components/responses/Unauthorized",
            },
            "500": {
              $ref: "#/components/responses/InternalServerError",
            },
            "503": {
              $ref: "#/components/responses/ServiceUnavailable",
            },
          },
        },
      },
      "/api/mutations": {
        post: {
          tags: ["Mutations"],
          summary: "Apply a workspace mutation",
          operationId: "applyWorkspaceMutation",
          security: [
            {
              bearerAuth: [],
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WorkspaceMutationRequest",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "The mutation was applied and the hydrated workspace is returned.",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/WorkspaceResponse",
                  },
                },
              },
            },
            "400": {
              $ref: "#/components/responses/BadRequest",
            },
            "401": {
              $ref: "#/components/responses/Unauthorized",
            },
            "500": {
              $ref: "#/components/responses/InternalServerError",
            },
            "503": {
              $ref: "#/components/responses/ServiceUnavailable",
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Use the access_token returned by POST /api/auth/token or POST /api/auth/refresh.",
        },
      },
      responses: {
        BadRequest: { description: "The request body is missing or invalid." },
        Unauthorized: {
          description: "Credentials or bearer token are missing, invalid, or expired.",
        },
        InternalServerError: {
          description: "The request failed while reading or writing app data.",
        },
        ServiceUnavailable: {
          description: "Supabase environment variables are not configured.",
        },
      },
      schemas: {
        TokenRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", example: "user@example.com" },
            password: { type: "string", format: "password" },
          },
        },
        RefreshTokenRequest: {
          type: "object",
          required: ["refresh_token"],
          properties: { refresh_token: { type: "string" } },
        },
        AuthSession: {
          type: "object",
          required: ["access_token", "refresh_token", "token_type", "expires_in", "user"],
          properties: {
            access_token: { type: "string" },
            refresh_token: { type: "string" },
            token_type: { type: "string", example: "bearer" },
            expires_in: { type: "integer", example: 3600 },
            expires_at: { type: ["integer", "null"] },
            user: { $ref: "#/components/schemas/AuthUser" },
          },
        },
        AuthUser: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: ["string", "null"], format: "email" },
          },
        },
        AppStateResponse: {
          type: "object",
          required: ["state", "updated_at", "version"],
          properties: {
            state: { anyOf: [{ $ref: "#/components/schemas/AppState" }, { type: "null" }] },
            updated_at: { type: ["string", "null"], format: "date-time" },
            version: { type: ["integer", "null"] },
          },
        },
        WorkspaceResponse: {
          type: "object",
          required: ["state", "updated_at"],
          properties: {
            state: {
              anyOf: [
                {
                  $ref: "#/components/schemas/AppState",
                },
                {
                  type: "null",
                },
              ],
            },
            updated_at: {
              type: ["string", "null"],
              format: "date-time",
            },
          },
        },
        WorkspaceMutationRequest: {
          type: "object",
          required: ["client_mutation_id", "action", "payload"],
          properties: {
            client_mutation_id: {
              type: "string",
              description: "Unique idempotency key generated by the client.",
            },
            action: {
              type: "string",
              enum: [
                "setTimeRange",
                "addSticky",
                "renameSticky",
                "deleteSticky",
                "reorderStickies",
                "addTask",
                "editTask",
                "setTaskStatus",
                "reorderTasks",
                "clearArchivedTasks",
                "clearStickyArchivedTasks",
                "addMemo",
                "renameMemo",
                "editMemo",
                "moveMemo",
                "archiveMemo",
                "restoreMemo",
                "deleteMemo",
                "addMemoCollection",
                "renameMemoCollection",
                "deleteMemoCollection",
              ],
            },
            payload: {
              type: "object",
              description: "Action-specific payload. See the human-readable API docs for examples.",
            },
          },
        },
        ReplaceAppStateRequest: {
          type: "object",
          required: ["state"],
          properties: { state: { $ref: "#/components/schemas/AppState" } },
        },
        AppState: {
          type: "object",
          required: ["timeRange", "blocks", "textBlocks", "memoCollections", "lastUpdatedAt"],
          properties: {
            timeRange: { type: "string" },
            blocks: { type: "array", items: { type: "object", additionalProperties: true } },
            textBlocks: { type: "array", items: { type: "object", additionalProperties: true } },
            memoCollections: { type: "array", items: { type: "object", additionalProperties: true } },
            lastUpdatedAt: { type: "integer", description: "Unix timestamp in milliseconds." },
          },
        },
      },
    },
  };
}
