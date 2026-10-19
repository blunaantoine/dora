// ---------------------------------------------------------------------------
// PATCH /api/admin/dossiers/[id] — édition des champs de base d'un dossier et
// changement de statut par l'administration.
//
// - Le changement de statut passe OBLIGATOIREMENT par canTransition()
//   (machine à états §5.4) : toute transition interdite → 409 CONFLICT, et
//   chaque transition appliquée est journalisée (DOSSIER_STATUS_CHANGED, {from,to}).
// - Les modifications de champs sont journalisées (DOSSIER_UPDATED, liste des
//   champs touchés — jamais leurs valeurs).
// - Permission : MANAGE_DOSSIERS.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, jsonOk, withApi, zodErrorToFields } from "@/lib/api";
import { guardAdminApi, auditDeniedMutation } from "@/lib/admin-guard";
import { ipFromHeaders, writeAudit } from "@/lib/audit";
import {
  DOSSIER_STATUSES,
  GENDER_VALUES,
  type DossierStatus,
} from "@/lib/constants";
import { computeIsMinorFromYear } from "@/lib/person";
import { manualDossierTransition } from "@/lib/dossier-status";

const patchSchema = z.object({
  // Identité de gestion
  givenName: z.string().trim().min(1, "Le prénom est obligatoire.").max(100).optional(),
  familyName: z.string().trim().min(1, "Le nom est obligatoire.").max(100).optional(),
  managementName: z.string().trim().min(1, "Le nom de gestion est obligatoire.").max(200).optional(),
  publicName: z.string().trim().max(150).nullable().optional(),
  gender: z.enum(GENDER_VALUES, { message: "Genre attendu : FEMME ou FILLE." }).optional(),
  birthYear: z.coerce.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  isMinor: z.boolean().optional(),
  // Présentation et localisation
  shortPresentation: z.string().max(600).nullable().optional(),
  biography: z.string().max(20000).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  languages: z.string().trim().max(300).nullable().optional(),
  categoryId: z.string().trim().max(64).nullable().optional(),
  // Statut (machine à états)
  status: z.enum(DOSSIER_STATUSES, { message: "Statut de dossier inconnu." }).optional(),
  // Données privées de gestion (PersonPrivateData)
  privateData: z
    .object({
      phone: z.string().trim().max(40).nullable().optional(),
      email: z.email("Adresse e-mail invalide.").max(200).nullable().optional(),
      contactPreference: z.string().trim().max(60).nullable().optional(),
      guardianName: z.string().trim().max(150).nullable().optional(),
      guardianContact: z.string().trim().max(200).nullable().optional(),
      internalNotes: z.string().max(5000).nullable().optional(),
    })
    .optional(),
});

export const PATCH = withApi<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const session = await guardAdminApi(req, "MANAGE_DOSSIERS");
  const ip = ipFromHeaders(req.headers);
  const actor = {
    actorId: session.user.id,
    actorLabel: session.user.email ?? session.user.name ?? undefined,
  };

  const existing = await db.personRecord.findUnique({
    where: { id },
    select: { id: true, status: true, isMinor: true, categoryId: true },
  });
  if (!existing) {
    throw ApiError.notFound("Dossier introuvable.");
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Certaines informations sont invalides.", zodErrorToFields(parsed.error));
  }
  const { status, privateData, ...fields } = parsed.data;

  // Catégorie : doit exister (ou être explicitement retirée avec null).
  if (fields.categoryId !== undefined && fields.categoryId !== null) {
    const category = await db.category.findUnique({
      where: { id: fields.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw ApiError.validation("Catégorie introuvable.", { categoryId: ["Catégorie introuvable."] });
    }
  }

  // Construction de la mise à jour des champs scalaires (liste blanche).
  const data: Record<string, unknown> = {};
  const touchedFields: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      data[key] = value;
      touchedFields.push(key);
    }
  }

  // Minorité : le flag explicite prime ; sinon, si l'année de naissance change,
  // réévaluation conservatrice (l'ancien état mineur n'est jamais retiré).
  if (data.birthYear !== undefined && data.birthYear !== null && fields.isMinor === undefined) {
    data.isMinor = existing.isMinor || computeIsMinorFromYear(data.birthYear as number);
  } else if (fields.isMinor !== undefined) {
    data.isMinor = fields.isMinor;
  }

  if (privateData !== undefined) {
    const privateUpdate: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(privateData)) {
      if (value !== undefined) {
        privateUpdate[key] = value === "" ? null : value;
      }
    }
    if (Object.keys(privateUpdate).length > 0) {
      data.privateData = {
        upsert: {
          create: privateUpdate,
          update: privateUpdate,
        },
      };
      touchedFields.push("privateData");
    }
  }

  let updated = existing;
  if (Object.keys(data).length > 0) {
    updated = await db.personRecord.update({
      where: { id },
      data,
      select: { id: true, status: true, isMinor: true, categoryId: true },
    });
    await writeAudit({
      ...actor,
      action: "DOSSIER_UPDATED",
      entityType: "PersonRecord",
      entityId: id,
      metadata: { fields: touchedFields },
      ip,
    });
  }

  // Changement de statut : uniquement via la machine à états.
  if (status !== undefined && status !== updated.status) {
    try {
      await manualDossierTransition({
        personId: id,
        from: updated.status as DossierStatus,
        to: status,
        actor,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await auditDeniedMutation({
          session,
          action: "DOSSIER_STATUS_CHANGED",
          entityType: "PersonRecord",
          entityId: id,
          raison: "transition refusée par la machine à états",
        });
      }
      throw error;
    }
    updated = { ...updated, status };
  }

  // Réponse en liste blanche.
  const response = await db.personRecord.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      managementName: true,
      givenName: true,
      familyName: true,
      publicName: true,
      gender: true,
      birthYear: true,
      isMinor: true,
      shortPresentation: true,
      country: true,
      region: true,
      city: true,
      languages: true,
      categoryId: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return jsonOk({ dossier: response });
});
