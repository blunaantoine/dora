// ---------------------------------------------------------------------------
// API admin des demandes de clarification d'un dossier (§8.2).
//
// GET  /api/admin/dossiers/[id]/clarifications
//      Liste des demandes du dossier (les plus récentes d'abord), en liste
//      blanche : les questions et le message explicatif sont des contenus
//      destinés à la participante (jamais de donnée privée).
//
// POST /api/admin/dossiers/[id]/clarifications
//      {fieldsConcerned[], questions[], message, dueDateHint?}
//      Crée la demande puis fait passer le dossier de UNDER_REVIEW à
//      CLARIFICATION_REQUESTED via la machine à états (canTransition — 409 si
//      le dossier est dans un autre statut : l'admin doit d'abord le remettre
//      en examen via PATCH /api/admin/dossiers/[id]).
//      Audit : CLARIFICATION_SENT + DOSSIER_STATUS_CHANGED {from,to}.
//
// Permission : MANAGE_DOSSIERS.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import { canTransition, type DossierStatus } from "@/lib/constants";
import { isPublicField, type PublicField } from "@/lib/public-fields";

const createSchema = z
  .object({
    fieldsConcerned: z
      .array(
        z
          .string()
          .trim()
          .refine((value) => isPublicField(value), "Champ concerné inconnu (liste blanche des champs publics uniquement)."),
      )
      .min(1, "Indiquez au moins un champ concerné.")
      .max(26, "26 champs maximum.")
      .transform((values) => Array.from(new Set(values)) as PublicField[]),
    questions: z
      .string()
      .trim()
      .min(5, "Les questions à clarifier sont obligatoires (5 caractères au moins).")
      .max(5000, "5000 caractères maximum."),
    message: z
      .string()
      .trim()
      .min(5, "Le message explicatif est obligatoire (5 caractères au moins).")
      .max(5000, "5000 caractères maximum."),
    dueDateHint: z.string().trim().max(60, "60 caractères maximum.").optional(),
  })
  .strict();

/** Sérialiseur liste blanche d'une demande de clarification. */
function serializeClarification(row: {
  id: string;
  fieldsConcerned: string;
  questions: string;
  message: string;
  dueDateHint: string | null;
  status: string;
  createdAt: Date;
  answeredAt: Date | null;
  askedBy: { displayName: string } | null;
}) {
  let fields: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.fieldsConcerned);
    if (Array.isArray(parsed)) fields = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    fields = [];
  }
  return {
    id: row.id,
    fieldsConcerned: fields,
    questions: row.questions,
    message: row.message,
    dueDateHint: row.dueDateHint,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
    askedByName: row.askedBy?.displayName ?? null,
  };
}

export const GET = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  await guardAdminApi(req, "MANAGE_DOSSIERS");

  const person = await db.personRecord.findUnique({ where: { id }, select: { id: true } });
  if (!person) {
    throw ApiError.notFound("Dossier introuvable.");
  }

  const rows = await db.clarificationRequest.findMany({
    where: { personId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      fieldsConcerned: true,
      questions: true,
      message: true,
      dueDateHint: true,
      status: true,
      createdAt: true,
      answeredAt: true,
      askedBy: { select: { displayName: true } },
    },
  });

  return jsonOk({ clarifications: rows.map(serializeClarification) });
});

export const POST = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "MANAGE_DOSSIERS");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const dossier = await db.personRecord.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!dossier) {
    throw ApiError.notFound("Dossier introuvable.");
  }
  const fromStatus = dossier.status as DossierStatus;

  const body: unknown = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const { fieldsConcerned, questions, message, dueDateHint } = parsed.data;

  // §8.2 : la demande de clarification part d'un dossier EN EXAMEN. Tout autre
  // statut → 409 : l'administrateur doit d'abord repositionner le dossier
  // (machine à états) via PATCH /api/admin/dossiers/[id].
  if (!canTransition(fromStatus, "CLARIFICATION_REQUESTED") || fromStatus !== "UNDER_REVIEW") {
    await writeAudit({
      ...actor,
      action: "CLARIFICATION_SENT",
      entityType: "PersonRecord",
      entityId: id,
      result: "DENIED",
      metadata: { raison: `statut incompatible : ${dossier.status}` },
      ip,
    });
    throw ApiError.conflict(
      "Une demande de précisions n'est possible que pour un dossier en cours d'examen. Repositionnez d'abord le dossier à « En cours d'examen ».",
    );
  }

  // Création + transition dans une seule transaction : le dossier ne peut pas
  // rester en examen alors qu'une demande existe (ou l'inverse).
  const created = await db.$transaction(async (tx) => {
    const request = await tx.clarificationRequest.create({
      data: {
        personId: id,
        askedById: session.user.id,
        fieldsConcerned: JSON.stringify(fieldsConcerned),
        questions,
        message,
        ...(dueDateHint !== undefined && dueDateHint !== "" ? { dueDateHint } : {}),
        status: "PENDING",
      },
      select: {
        id: true,
        fieldsConcerned: true,
        questions: true,
        message: true,
        dueDateHint: true,
        status: true,
        createdAt: true,
        answeredAt: true,
        askedBy: { select: { displayName: true } },
      },
    });

    await tx.personRecord.update({
      where: { id, status: fromStatus },
      data: { status: "CLARIFICATION_REQUESTED" },
    });

    return request;
  });

  // Audit hors transaction : une erreur d'audit ne doit jamais annuler
  // l'opération métier (writeAudit ne lève jamais).
  await writeAudit({
    ...actor,
    action: "CLARIFICATION_SENT",
    entityType: "ClarificationRequest",
    entityId: created.id,
    metadata: { personId: id, fieldsConcerned },
    ip,
  });
  await writeAudit({
    ...actor,
    action: "DOSSIER_STATUS_CHANGED",
    entityType: "PersonRecord",
    entityId: id,
    metadata: { from: fromStatus, to: "CLARIFICATION_REQUESTED" },
    ip,
  });

  return jsonOk({ clarification: serializeClarification(created), dossierStatus: "CLARIFICATION_REQUESTED" }, 201);
});
