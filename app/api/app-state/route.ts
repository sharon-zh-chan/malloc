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

export async function PUT() {
  return NextResponse.json(
    {
      error:
        "Full app-state replacement is disabled. Use POST /api/mutations for scoped writes.",
    },
    { status: 410 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Legacy full-workspace deletion is disabled. Use scoped workspace mutations.",
    },
    { status: 410 },
  );
}
