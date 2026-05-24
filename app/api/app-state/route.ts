import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiClient, getBearerToken } from "@/lib/api/supabase";
import type { AppState } from "@/lib/types";

const appStateSchema = z.object({
  timeRange: z.string().catch(""),
  blocks: z.array(z.unknown()).catch([]),
  textBlocks: z.array(z.unknown()).catch([]),
  memoCollections: z.array(z.unknown()).catch([]),
  lastUpdatedAt: z.number().catch(Date.now()),
});

async function getAuthenticatedClient(request: Request) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return { error: "Missing bearer token", status: 401 } as const;
  }

  const supabase = createApiClient(accessToken);

  if (!supabase) {
    return { error: "Supabase is not configured", status: 503 } as const;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { error: "Invalid bearer token", status: 401 } as const;
  }

  return { supabase, user } as const;
}

function normalizeState(state: unknown): AppState {
  const parsed = appStateSchema.parse(state);

  return {
    timeRange: parsed.timeRange,
    blocks: parsed.blocks as AppState["blocks"],
    textBlocks: parsed.textBlocks as AppState["textBlocks"],
    memoCollections: parsed.memoCollections as AppState["memoCollections"],
    lastUpdatedAt: parsed.lastUpdatedAt,
  };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabase
    .from("app_state")
    .select("state, updated_at, version")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ state: null, updated_at: null, version: null });
  }

  return NextResponse.json({
    state: normalizeState(data.state),
    updated_at: data.updated_at,
    version: data.version ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const result = z.object({ state: appStateSchema }).safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Expected a valid app state object under the state key" },
      { status: 400 },
    );
  }

  const state = normalizeState(result.data.state);
  const updatedAt = new Date().toISOString();

  const { data: existing, error: existingError } = await auth.supabase
    .from("app_state")
    .select("version")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const nextVersion =
    typeof existing?.version === "number" ? existing.version + 1 : 0;

  const { data, error } = await auth.supabase
    .from("app_state")
    .upsert(
      {
        user_id: auth.user.id,
        state: { ...state, lastUpdatedAt: Date.now() },
        updated_at: updatedAt,
        version: nextVersion,
      },
      { onConflict: "user_id" },
    )
    .select("state, updated_at, version")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    state: normalizeState(data.state),
    updated_at: data.updated_at,
    version: data.version ?? null,
  });
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await auth.supabase
    .from("app_state")
    .delete()
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
