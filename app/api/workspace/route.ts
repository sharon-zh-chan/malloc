import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/api/auth";

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabase.rpc("get_workspace_state");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
