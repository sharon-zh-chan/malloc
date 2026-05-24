export function createOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "To Do at One Glance REST API",
      version: "1.0.0",
      description:
        "REST API for signing in with a frontend account and managing the authenticated user's app state.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Authentication" },
      { name: "App State" },
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
          tags: ["App State"],
          summary: "Read app state",
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
          tags: ["App State"],
          summary: "Replace app state",
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
          tags: ["App State"],
          summary: "Delete app state",
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
