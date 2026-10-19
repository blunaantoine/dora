// ---------------------------------------------------------------------------
// POST /api/invitation/[token]/media — téléversement d'un média par la
// participante (§7.8, §17.5).
//
// Sécurité appliquée :
//   - rate limit invitation (20/h/IP) ; jeton validé sinon 404 générique ;
//   - taille ≤ setting MAX_UPLOAD_MB (défaut 2 Mo) ;
//   - MIME déclaré vérifié (jpeg/png/webp) ET octets magiques vérifiés sur le
//     contenu réel — rejet 400 TYPE_NON_SUPPORTE sinon (anti fichier exécutable) ;
//   - traitement sharp : rotation d'orientation, largeur ≤ 1600 px, ré-encodage
//     JPEG qualité 82, TOUTES les métadonnées/EXIF supprimées (par défaut sharp
//     ne conserve aucune metadata) ;
//   - stockage PRIVÉ hors dossier public : uploads-private/<yyyy>/<mm>/<uuid>.jpg
//     (noms générés par le serveur, jamais le nom d'origine) ;
//   - MediaAsset : kind, visibility PRIVATE, status READY, storagePath (chemin
//     relatif), mimeType image/jpeg, taille après traitement, checksum SHA-256,
//     uploadedByTokenHash (empreinte du jeton) — JAMAIS d'URL publique ;
//   - audit MEDIA_UPLOADED sans chemin complet (id + taille seulement).
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi } from "@/lib/api";
import { guardInvitationApi } from "@/lib/invitation-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import {
  MEDIA_JPEG_QUALITY,
  MEDIA_KINDS,
  MEDIA_MAX_PER_DOSSIER,
  MEDIA_MAX_WIDTH_PX,
  type MediaKind,
} from "@/lib/constants";
import { detectImageTypeByMagicBytes, storePrivateMedia } from "@/lib/media";

const ALLOWED_DECLARED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function getMaxUploadBytes(): Promise<number> {
  const raw = await getSetting("MAX_UPLOAD_MB");
  const mb = typeof raw === "number" ? raw : Number(raw);
  const safeMb = Number.isFinite(mb) && mb >= 1 && mb <= 50 ? mb : 2;
  return safeMb * 1024 * 1024;
}

export const POST = withApi<{ token: string }>(async (req: NextRequest, ctx) => {
  const { token } = await ctx.params;
  const { invitation } = await guardInvitationApi(req, token);
  const ip = ipFromHeaders(req.headers);
  const person = invitation.person;

  const form = await req.formData().catch(() => null);
  if (!form) {
    throw ApiError.badRequest("Requête multipart invalide.");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw ApiError.validation("Aucun fichier reçu.", { file: ["Aucun fichier reçu."] });
  }

  // Type déclaré par le client (indicatif — vérifié ensuite par octets magiques).
  const declaredMime = (file.type || "").toLowerCase();
  if (!ALLOWED_DECLARED_MIMES.has(declaredMime)) {
    throw new ApiError(
      400,
      "TYPE_NON_SUPPORTE",
      "Format de fichier non pris en charge. Formats acceptés : JPEG, PNG, WebP.",
    );
  }

  // Taille maximale configurable (setting MAX_UPLOAD_MB).
  const maxBytes = await getMaxUploadBytes();
  if (file.size > maxBytes) {
    throw new ApiError(
      400,
      "FICHIER_TROP_GRAND",
      `Fichier trop volumineux : la taille maximale est de ${Math.floor(maxBytes / (1024 * 1024))} Mo.`,
    );
  }

  // Type réel par octets magiques.
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageTypeByMagicBytes(rawBuffer);
  if (!detected) {
    throw new ApiError(
      400,
      "TYPE_NON_SUPPORTE",
      "Le contenu du fichier ne correspond pas à une image JPEG, PNG ou WebP valide.",
    );
  }

  // Kind optionnel (liste blanche) — défaut : photo d'activité.
  const rawKind = form.get("kind");
  let kind: MediaKind = "ACTIVITY_PHOTO";
  if (typeof rawKind === "string" && rawKind.length > 0) {
    if (!(MEDIA_KINDS as readonly string[]).includes(rawKind)) {
      throw ApiError.validation("Type de média inconnu.", { kind: ["Type de média inconnu."] });
    }
    kind = rawKind as MediaKind;
  }

  // Limitation du nombre de fichiers par dossier (§7.8).
  const existingCount = await db.mediaAsset.count({
    where: { personId: person.id, status: { not: "DELETED" } },
  });
  if (existingCount >= MEDIA_MAX_PER_DOSSIER) {
    throw ApiError.conflict(
      `Nombre maximum de fichiers atteint pour ce dossier (${MEDIA_MAX_PER_DOSSIER}).`,
    );
  }

  // Traitement sharp : orientation conservée (rotate auto), redimensionnement
  // maximal 1600 px de large (sans agrandissement), ré-encodage JPEG q82,
  // EXIF et métadonnées supprimés (comportement par défaut de sharp).
  let processed;
  try {
    processed = await sharp(rawBuffer, { failOn: "none" })
      .rotate()
      .resize({ width: MEDIA_MAX_WIDTH_PX, withoutEnlargement: true })
      .jpeg({ quality: MEDIA_JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    console.error("[media] Échec du traitement sharp :", error);
    throw new ApiError(400, "IMAGE_INVALIDE", "Le fichier image n'a pas pu être traité.");
  }

  const stored = await storePrivateMedia(processed.data);

  const asset = await db.mediaAsset.create({
    data: {
      personId: person.id,
      kind,
      visibility: "PRIVATE",
      status: "READY",
      storagePath: stored.storageKey,
      originalName: file.name.slice(0, 200) || null,
      mimeType: "image/jpeg",
      sizeBytes: stored.byteSize,
      width: processed.info.width ?? null,
      height: processed.info.height ?? null,
      checksum: stored.checksum,
      uploadedByTokenHash: invitation.tokenHash,
    },
    select: {
      id: true,
      kind: true,
      status: true,
      sizeBytes: true,
      width: true,
      height: true,
      uploadedAt: true,
    },
  });

  await writeAudit({
    actorLabel: "Participante (invitation)",
    action: "MEDIA_UPLOADED",
    entityType: "MediaAsset",
    entityId: asset.id,
    metadata: { mediaId: asset.id, personRecordId: person.id, tailleOctets: stored.byteSize },
    ip,
  });

  return jsonOk({ media: asset }, 201);
});
