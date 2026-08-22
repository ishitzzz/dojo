import { NextResponse } from "next/server";
import { providerStatus } from "@/utils/transcript";
import { snapshot as breakerSnapshot } from "@/utils/transcript/circuitBreaker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/get-transcript/status → live view of provider chain + breakers. */
export async function GET() {
    const providers = await providerStatus();
    return NextResponse.json({ providers, circuitBreakers: breakerSnapshot() });
}
