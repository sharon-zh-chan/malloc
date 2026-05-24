import { NextResponse } from "next/server";
import { createOpenApiSpec } from "@/lib/api/openapi";

export function GET(request: Request) {
  const { origin } = new URL(request.url);

  return NextResponse.json(createOpenApiSpec(origin));
}
