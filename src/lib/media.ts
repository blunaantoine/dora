// ---------------------------------------------------------------------------
// Médias téléversés (§7.8, §17.5) :
//   - vérification du type RÉEL du fichier par octets magiques (le MIME déclaré
//     par le navigateur n'est pas fiable) ;
//   - stockage PRIVÉ hors du dossier public (uploads-private/, hors Git) ;
//   - noms de fichiers générés par le serveur (UUID) — jamais le nom d'origine ;
//   - les fichiers ne sont JAMAIS servis directement : le seul point d'accès
//     est /api/admin/media/[id]/file (décision D7).
// ---------------------------------------------------------------------------

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

/** Racine du stockage privé (relative au répertoire de travail du processus). */
export const PRIVATE_UPLOAD_ROOT = "uploads-private";

/** Résout la clé de stockage relative en chemin absolu, avec garde anti-traversée. */
export function resolvePrivateMediaPath(storageKey: string): string | null {
  const normalized = path.normalize(storageKey);
  const root = path.normalize(`${PRIVATE_UPLOAD_ROOT}${path.sep}`);
  if (!normalized.startsWith(root)) return null; // refus hors racine (traversée de chemin)
  return path.join(process.cwd(), normalized);
}

export type SupportedImageType = "jpeg" | "png" | "webp";

/**
 * Détecte le type réel d'une image par octets magiques :
 *   - JPEG : FF D8 FF
 *   - PNG  : 89 50 4E 47 0D 0A 1A 0A
 *   - WebP : "RIFF"...."WEBP"
 * Retourne null pour tout autre contenu (exécutables, PDF, etc. — rejet §7.8).
 */
export function detectImageTypeByMagicBytes(buffer: Buffer): SupportedImageType | null {
  if (buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";

  // PNG
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => buffer[index] === byte)) return "png";

  // WebP : RIFF....WEBP
  const riff = buffer.subarray(0, 4).toString("ascii") === "RIFF";
  const webp = buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (riff && webp) return "webp";

  return null;
}

/** MIME officiel associé à un type détecté (le seul servi/stocké : image/jpeg après ré-encodage). */
export function mimeForType(type: SupportedImageType): string {
  switch (type) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
  }
}

export interface StoredMedia {
  storageKey: string; // chemin relatif au répertoire de travail (ex. uploads-private/2026/01/uuid.jpg)
  checksum: string; // SHA-256 hex du fichier final
  byteSize: number;
}

/**
 * Écrit le buffer (déjà traité par sharp) dans le stockage privé :
 * uploads-private/<yyyy>/<mm>/<uuid>.jpg — dossiers créés au besoin.
 * Ne stocke aucune URL publique ; la clé relative seule est renvoyée.
 */
export async function storePrivateMedia(buffer: Buffer): Promise<StoredMedia> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dirRelative = path.join(PRIVATE_UPLOAD_ROOT, yyyy, mm);
  const dirAbsolute = path.join(process.cwd(), dirRelative);
  await mkdir(dirAbsolute, { recursive: true });

  const fileName = `${randomUUID()}.jpg`;
  const storageKey = path.join(dirRelative, fileName);
  const absolutePath = path.join(dirAbsolute, fileName);

  await writeFile(absolutePath, buffer, { mode: 0o600 }); // lecture/écriture propriétaire uniquement

  return {
    storageKey,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    byteSize: buffer.byteLength,
  };
}

/**
 * Supprime physiquement un fichier privé. Ne lève jamais (le fichier a pu être
 * déjà supprimé) — l'échec est consigné côté serveur uniquement.
 */
export async function deletePrivateMediaFile(storageKey: string): Promise<void> {
  try {
    const absolutePath = resolvePrivateMediaPath(storageKey);
    if (!absolutePath) {
      console.error(`[media] Clé de stockage hors racine, suppression refusée : clé non conforme`);
      return;
    }
    await unlink(absolutePath);
  } catch (error) {
    // ENOENT : fichier déjà absent — non bloquant.
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[media] Échec de suppression du fichier privé :", error);
    }
  }
}
