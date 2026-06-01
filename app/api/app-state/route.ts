import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedClient } from "@/lib/api/auth";
import type { AppState } from "@/lib/types";

const appStateSchema = z.object({
  timeRange: z.string().catch(""),
  blocks: z.array(z.unknown()).catch([]),
  textBlocks: z.array(z.unknown()).catch([]),
  memoCollections: z.array(z.unknown()).catch([]),
  lastUpdatedAt: z.number().catch(Date.now()),
});

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

  const { data, error } = await auth.supabase.rpc("get_workspace_state");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.state) {
    return NextResponse.json({ state: null, updated_at: null, version: null });
  }

  return NextResponse.json({
    state: normalizeState(data.state),
    updated_at: data.updated_at,
    version: null,
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
  const { data, error } = await auth.supabase.rpc("replace_workspace_state", {
    replacement_state: state,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    state: normalizeState(data.state),
    updated_at: data.updated_at,
    version: null,
  });
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await auth.supabase.rpc("delete_workspace");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
