// ---------------------------------------------------------------------------
// API admin des invitations (§6).
//
// GET  /api/admin/invitations?personRecordId=&status=
//      Liste en liste blanche : JAMAIS l'empreinte du jeton (tokenHash),
//      JAMAIS le jeton brut (il n'existe que dans la réponse de création).
//
// POST /api/admin/invitations {personRecordId}
//      Génère un jeton CSPRNG 256 bits, stocke l'empreinte SHA-256 + expiration
//      (TTL = setting INVITATION_TTL_DAYS, défaut 30 j) + créateur. Révoque
//      d'abord toute invitation ACTIVE du même dossier (règle « une seule
//      invitation active », §6.2). Le jeton brut est renvoyé UNE SEULE FOIS
//      avec l'URL /invitation/<token>.
//
// PATCH /api/admin/invitations/[id] {action: "revoke" | "renew"}
//      revoke : révocation immédiate. renew : nouveau jeton + nouveau TTL,
//      ancienne empreinte remplacée, statut ACTIVE (nouveau jeton renvoyé
//      une seule fois).
//
// Permission : MANAGE_DOSSIERS. Métadonnées d'audit SANS jeton ni empreinte.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { createInvitationToken } from "@/lib/tokens";
import {
  DOSSIER_FORM_OPEN_STATUSES,
  INVITATION_STATUSES,
  type DossierStatus,
  type InvitationStatus,
} from "@/lib/constants";
import { advanceDossierStatus } from "@/lib/dossier-status";

/** TTL de l'invitation en jours (setting INVITATION_TTL_DAYS, défaut 30). */
async function getInvitationTtlDays(): Promise<number> {
  const raw = await getSetting("INVITATION_TTL_DAYS");
  const days = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(days) || days < 1 || days > 365) return 30;
  return Math.floor(days);
}

/** URL absolue de la plateforme reconstruite depuis la requête (proxy inclus). */
function absoluteBaseUrl(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host");
  const proto = forwardedProto || (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

const invitationListSelect = {
  id: true,
  personId: true,
  status: true,
  channel: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  accessCount: true,
  lastAccessAt: true,
  createdAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

const querySchema = z.object({
  personRecordId: z.string().trim().max(64).optional(),
  status: z
    .string()
    .optional()
    .transform((raw) =>
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is InvitationStatus => (INVITATION_STATUSES as readonly string[]).includes(s)),
    ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withApi(async (req) => {
  await guardAdminApi(req, "MANAGE_DOSSIERS");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    throw ApiError.badRequest("Paramètres de requête invalides.");
  }
  const { personRecordId, status, page, pageSize } = parsed.data;

  const where = {
    ...(personRecordId ? { personId: personRecordId } : {}),
    ...(status.length > 0 ? { status: { in: status } } : {}),
  };

  const [total, items] = await Promise.all([
    db.invitation.count({ where }),
    db.invitation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        ...invitationListSelect,
        person: {
          select: {
            id: true,
            managementName: true,
            givenName: true,
            familyName: true,
            status: true,
          },
        },
      },
    }),
  ]);

  return jsonOk({ items, total, page, pageSize });
});

const createSchema = z.object({
  personRecordId: z.string().trim().min(1, "Le dossier est obligatoire.").max(64),
});

export const POST = withApi(async (req) => {
  const session = await guardAdminApi(req, "MANAGE_DOSSIERS");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const body: unknown = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Requête invalide.", zodErrorToFields(parsed.error));
  }
  const { personRecordId } = parsed.data;

  const person = await db.personRecord.findUnique({
    where: { id: personRecordId },
    select: { id: true, status: true },
  });
  if (!person) {
    throw ApiError.notFound("Dossier introuvable.");
  }
  if (!(DOSSIER_FORM_OPEN_STATUSES as readonly string[]).includes(person.status)) {
    throw ApiError.conflict(
      "Une invitation ne peut être créée que pour un dossier en préparation ou en cours de remplissage.",
    );
  }

  // Règle « une seule invitation active » : révocation des invitations
  // ACTIVE existantes pour ce dossier avant la création de la nouvelle.
  const activeInvitations = await db.invitation.findMany({
    where: { personId: personRecordId, status: "ACTIVE" },
    select: { id: true },
  });
  for (const active of activeInvitations) {
    await db.invitation.update({
      where: { id: active.id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: session.user.id },
    });
    await writeAudit({
      ...actor,
      action: "INVITATION_REVOKED",
      entityType: "Invitation",
      entityId: active.id,
      metadata: { invitationId: active.id, personRecordId, motif: "REMPLACEMENT" },
      ip,
    });
  }

  const ttlDays = await getInvitationTtlDays();
  const { token, hash } = createInvitationToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const invitation = await db.invitation.create({
    data: {
      personId: personRecordId,
      tokenHash: hash,
      status: "ACTIVE",
      expiresAt,
      createdById: session.user.id,
    },
    select: invitationListSelect,
  });

  // Le dossier passe de « Brouillon » à « Invitation créée » (machine à états).
  await advanceDossierStatus({
    personId: personRecordId,
    currentStatus: person.status as DossierStatus,
    target: "INVITATION_CREATED",
    actor,
  });

  // Audit SANS jeton ni empreinte (sanitizeMetadata les filtrerait de toute façon).
  await writeAudit({
    ...actor,
    action: "INVITATION_CREATED",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { invitationId: invitation.id, personRecordId, ttlDays },
    ip,
  });

  return jsonOk(
    {
      invitation,
      token, // jeton brut : renvoyé UNE SEULE FOIS, au moment de la création
      url: `/invitation/${token}`,
      urlAbsolue: `${absoluteBaseUrl(req)}/invitation/${token}`,
    },
    201,
  );
});
