// ---------------------------------------------------------------------------
// GET /api/public/media/[id] — servage PUBLIC des seuls médias autorisés.
//
// Garde d'accès (défense en profondeur, un média n'est jamais public par défaut) :
//   1. le média existe, n'est pas supprimé, et visibility = "PUBLIC"
//      (bascule explicite de l'administration via PATCH /api/admin/media/[id]) ;
//   2. le média appartient à un dossier (personId direct ou via l'initiative)
//      dont la publication est ACTIVE : ProfilePublication.state = "PUBLISHED"
//      ET PersonRecord.status = "PUBLISHED" — sinon 404 ;
//   3. les médias privés restent inaccessibles (décision D7 inchangée :
//      /api/admin/media/[id]/file reste le seul point d'accès privé).
//
// Réponse : flux binaire avec Content-Type réel, Cache-Control public
// max-age=3600 (perf 3G, §19), X-Content-Type-Options: nosniff. Le chemin de
// stockage n'apparaît jamais. Toute condition non remplie → 404 générique
// (aucune information sur l'existence d'un média privé).
// ---------------------------------------------------------------------------

import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";
import { ApiError, withApi } from "@/lib/api";
import { resolvePrivateMediaPath } from "@/lib/media";

export const GET = withApi<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;

  const media = await db.mediaAsset.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      visibility: true,
      storagePath: true,
      mimeType: true,
      personId: true,
      person: { select: { id: true, status: true, publication: { select: { state: true } } } },
      initiative: { select: { person: { select: { id: true, status: true, publication: { select: { state: true } } } } } },
    },
  });

  // 1. Média existant, non supprimé et explicitement public.
  if (!media || media.status === "DELETED" || media.visibility !== "PUBLIC") {
    throw ApiError.notFound("Média introuvable.");
  }

  // 2. Le dossier concerné (direct ou via l'initiative) doit être publié.
  const owner = media.person ?? media.initiative?.person ?? null;
  if (!owner || owner.status !== "PUBLISHED" || owner.publication?.state !== "PUBLISHED") {
    throw ApiError.notFound("Média introuvable.");
  }

  // 3. Lecture du fichier privé (garde anti-traversée incluse).
  const absolutePath = resolvePrivateMediaPath(media.storagePath);
  if (!absolutePath) {
    console.error("[media] Clé de stockage hors racine privée, accès public refusé.");
    throw ApiError.notFound("Média introuvable.");
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    console.error("[media] Fichier public illisible ou absent :", error);
    throw ApiError.notFound("Média introuvable.");
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": media.mimeType || "image/jpeg",
      "Content-Length": String(buffer.byteLength),
      // Perf 3G (§19) : cache navigateur/CDN d'une heure, revalidé ensuite.
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
