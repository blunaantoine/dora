// ---------------------------------------------------------------------------
// PATCH /api/admin/media/[id] — bascule de visibilité d'un média (§7.8, §8.4).
//
// PATCH {visibility: "PUBLIC" | "PRIVATE"}
//   Un média ne devient PUBLIC que sur décision explicite de l'administration
//   (permission PUBLISH_PROFILES — c'est l'équivalent « autoriser la photo »
//   du flux de publication). La route publique /api/public/media/[id] ne sert
//   ensuite le fichier que si le dossier concerné est lui-même publié : les
//   deux gardes sont indépendantes (défense en profondeur).
//
//   Revenir à PRIVATE retire immédiatement le fichier de l'accès public.
//
// Audit : MEDIA_VISIBILITY_CHANGED {mediaId, personId, from, to} (SUCCESS) et
// result=DENIED si le média est introuvable ou supprimé.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { MEDIA_VISIBILITY } from "@/lib/constants";

const patchSchema = z
  .object({
    visibility: z.enum(MEDIA_VISIBILITY, {
      message: "Visibilité attendue : PUBLIC ou PRIVATE.",
    }),
  })
  .strict();

export const PATCH = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "PUBLISH_PROFILES");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Requête invalide.", zodErrorToFields(parsed.error));
  }
  const { visibility } = parsed.data;

  const media = await db.mediaAsset.findUnique({
    where: { id },
    select: { id: true, personId: true, status: true, visibility: true },
  });

  if (!media || media.status === "DELETED") {
    await writeAudit({
      ...actor,
      action: "MEDIA_VISIBILITY_CHANGED",
      entityType: "MediaAsset",
      entityId: id,
      result: "DENIED",
      metadata: { raison: "média introuvable ou supprimé" },
      ip,
    });
    throw ApiError.notFound("Média introuvable.");
  }

  if (media.visibility === visibility) {
    // Idempotent : rien à faire, aucune entrée d'audit inutile.
    return jsonOk({
      media: { id: media.id, visibility, status: media.status, personId: media.personId },
      unchanged: true,
    });
  }

  const updated = await db.mediaAsset.update({
    where: { id },
    data: { visibility },
    select: { id: true, personId: true, status: true, visibility: true },
  });

  await writeAudit({
    ...actor,
    action: "MEDIA_VISIBILITY_CHANGED",
    entityType: "MediaAsset",
    entityId: id,
    metadata: { mediaId: id, personId: media.personId, from: media.visibility, to: visibility },
    ip,
  });

  return jsonOk({
    media: { id: updated.id, visibility: updated.visibility, status: updated.status, personId: updated.personId },
    unchanged: false,
  });
});
