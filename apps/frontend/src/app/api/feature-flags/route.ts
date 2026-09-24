import { NextResponse } from "next/server";
import { getFeatureFlags } from "@/lib/featureFlags";

// Read env at request time so flags can be toggled without a rebuild.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getFeatureFlags(), {
    headers: { "Cache-Control": "no-store" },
  });
}
