import { createApiClient, getBearerToken } from "@/lib/api/supabase";

export async function getAuthenticatedClient(request: Request) {
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
