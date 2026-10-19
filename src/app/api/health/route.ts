// ---------------------------------------------------------------------------
// GET /api/health — sonde de supervision (docs/DEPLOIEMENT-VPS.md §7).
//
// Vérifie que le processus répond ET que la base est lisible (requête la plus
// légère possible). Ne divulgue AUCUNE information interne (pas de compteurs,
// pas de détails de configuration). Réponse minimale, cache désactivé.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] base illisible :", error);
    return NextResponse.json(
      { status: "degraded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
