// ---------------------------------------------------------------------------
// DELETE /api/invitation/[token]/media/[id] — suppression d'un média par la
// participante (tant que son lien est actif).
//
// - Rate limité (invitationRateLimit) ; jeton validé sinon 404 générique ;
// - seul un média appartenant AU dossier du jeton peut être supprimé, sinon 404 ;
// - suppression logique (status DELETED) + suppression physique du fichier
//   privé (échec non bloquant, consigné) ; la photo principale est décrochée ;
// - audit MEDIA_DELETED (id + dossier, jamais de chemin).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardInvitationApi } from "@/lib/invitation-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { deletePrivateMediaFile } from "@/lib/media";

export const DELETE = withApi<{ token: string; id: string }>(async (req: NextRequest, ctx) => {
  const { token, id } = await ctx.params;
  const { invitation } = await guardInvitationApi(req, token);
  const ip = ipFromHeaders(req.headers);
  const person = invitation.person;

  const media = await db.mediaAsset.findUnique({
    where: { id },
    select: { id: true, personId: true, status: true, storagePath: true },
  });

  // 404 unique : média inconnu, hors dossier ou déjà supprimé — aucune distinction.
  if (!media || media.personId !== person.id || media.status === "DELETED") {
    throw ApiError.notFound("Média introuvable.");
  }

  await db.mediaAsset.update({
    where: { id: media.id },
    data: { status: "DELETED" },
  });

  // Décroche la photo principale si nécessaire (la relation est SetNull côté
  // schéma mais le média reste en base avec status DELETED).
  await db.personRecord
    .updateMany({
      where: { id: person.id, photoAssetId: media.id },
      data: { photoAssetId: null },
    })
    .catch(() => undefined);

  // Suppression physique du fichier privé — jamais bloquante.
  await deletePrivateMediaFile(media.storagePath);

  await writeAudit({
    actorLabel: "Participante (invitation)",
    action: "MEDIA_DELETED",
    entityType: "MediaAsset",
    entityId: media.id,
    metadata: { mediaId: media.id, personRecordId: person.id },
    ip,
  });

  return jsonOk({ deleted: true });
});
