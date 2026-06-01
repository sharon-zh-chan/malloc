import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/api/auth";
import { workspaceMutationRequestSchema } from "@/lib/api/workspace-mutations";

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const result = workspaceMutationRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Expected a valid workspace mutation" },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc("apply_workspace_mutation", {
    client_mutation_id: result.data.client_mutation_id,
    action: result.data.action,
    payload: result.data.payload,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
