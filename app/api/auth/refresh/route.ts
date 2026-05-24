import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiClient } from "@/lib/api/supabase";

const refreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = createApiClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const result = refreshRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Expected a refresh_token" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: result.data.refresh_token,
  });

  if (error || !data.session || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to refresh session" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: data.session.token_type,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
}
