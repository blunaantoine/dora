// ---------------------------------------------------------------------------
// GET /api/admin/media/[id]/file — point d'accès AUTORISÉ UNIQUE aux fichiers
// privés (décision D7) : l'administrateur visualise le média sans que le
// fichier soit jamais exposé publiquement.
//
// - session admin + permission MANAGE_DOSSIERS (guardAdminApi) ;
// - média existant et non supprimé, sinon 404 ;
// - flux du fichier avec Content-Type réel, Cache-Control: private, no-store ;
// - le chemin de stockage n'apparaît jamais dans la réponse.
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { ApiError, withApi } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { resolvePrivateMediaPath } from "@/lib/media";

export const GET = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  await guardAdminApi(req, "MANAGE_DOSSIERS");

  const media = await db.mediaAsset.findUnique({
    where: { id },
    select: { id: true, status: true, storagePath: true, mimeType: true },
  });

  if (!media || media.status === "DELETED") {
    throw ApiError.notFound("Média introuvable.");
  }

  const absolutePath = resolvePrivateMediaPath(media.storagePath);
  if (!absolutePath) {
    // Clé hors racine privée : incohérence de données — signalée côté serveur.
    console.error("[media] Clé de stockage hors racine privée, accès refusé.");
    throw ApiError.notFound("Média introuvable.");
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    console.error("[media] Fichier privé illisible ou absent :", error);
    throw ApiError.notFound("Média introuvable.");
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": media.mimeType || "image/jpeg",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="media-${media.id}.jpg"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
