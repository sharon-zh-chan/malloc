import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiClient } from "@/lib/api/supabase";

const tokenRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  const result = tokenRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Expected a valid email and password" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword(result.data);

  if (error || !data.session) {
    return NextResponse.json(
      { error: error?.message ?? "Invalid credentials" },
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
