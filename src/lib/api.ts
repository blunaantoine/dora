// ---------------------------------------------------------------------------
// Enveloppe standard des routes API : réponses JSON cohérentes, erreurs typées,
// jamais de stack trace exposée au client.
//
// Format de succès :  { ok: true, data: ... }
// Format d'erreur  :  { ok: false, error: { code, message, fields? } }
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static badRequest(message = "Requête invalide.", fields?: Record<string, string[]>) {
    return new ApiError(400, "BAD_REQUEST", message, fields);
  }

  static validation(message = "Certaines informations sont invalides.", fields?: Record<string, string[]>) {
    return new ApiError(400, "VALIDATION_ERROR", message, fields);
  }

  static unauthorized(message = "Authentification requise.") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Accès refusé : vous n'avez pas les droits nécessaires.") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Ressource introuvable.") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static rateLimited(message = "Trop de requêtes. Merci de patienter avant de réessayer.", retryAfterSec = 0) {
    return new ApiError(429, "RATE_LIMITED", message, retryAfterSec > 0 ? { retryAfterSec: [String(retryAfterSec)] } : undefined);
  }

  static conflict(message = "Cette opération entre en conflit avec l'état actuel des données.") {
    return new ApiError(409, "CONFLICT", message);
  }
}

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string[]> };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Réponse de succès normalisée. */
export function jsonOk<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, { status });
}

/** Transforme une ZodError en map champs → messages (pour l'affichage par formulaire). */
export function zodErrorToFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}

interface RouteParams {
  [key: string]: string | string[] | undefined;
}

export interface RouteContext<P = RouteParams> {
  params: Promise<P>;
}

type Handler<P> = (req: NextRequestLike, ctx: RouteContext<P>) => Promise<Response> | Response;

// `NextRequest` est importé comme type pour bénéficier de son typage tout en
// restant compatible avec n'importe quelle requête entrante.
type NextRequestLike = import("next/server").NextRequest;

/**
 * Enveloppe un route handler :
 * - capture toute exception et la convertit en réponse JSON normalisée ;
 * - formate les erreurs zod (champs → messages) ;
 * - ne divulgue jamais la stack trace ni le message d'erreur interne brut
 *   (message générique + console.error côté serveur).
 */
export function withApi<P = RouteParams>(handler: Handler<P>) {
  return async (req: NextRequestLike, ctx: RouteContext<P>): Promise<Response> => {
    try {
      const response = await handler(req, ctx);
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json<ApiFailure>(
          { ok: false, error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } },
          { status: error.status },
        );
      }

      if (error instanceof ZodError) {
        const fields = zodErrorToFields(error);
        return NextResponse.json<ApiFailure>(
          { ok: false, error: { code: "VALIDATION_ERROR", message: "Certaines informations sont invalides.", fields } },
          { status: 400 },
        );
      }

      // Erreur inattendue : message générique au client, détail complet en serveur.
      console.error("[api] Erreur interne non gérée :", error);
      return NextResponse.json<ApiFailure>(
        { ok: false, error: { code: "INTERNAL_ERROR", message: "Une erreur interne est survenue. Merci de réessayer." } },
        { status: 500 },
      );
    }
  };
}
