// ---------------------------------------------------------------------------
// Petit utilitaire client pour appeler les API internes (réponse normalisée
// { ok, data } / { ok, error }). Utilisé par les formulaires d'administration
// et par le formulaire d'invitation. Jamais importé côté serveur : il
// s'appuie sur fetch navigateur (chemins relatifs uniquement).
// ---------------------------------------------------------------------------

export interface ApiFailurePayload {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string[]> };
}

export class ClientApiError extends Error {
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  constructor(code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "ClientApiError";
    this.code = code;
    this.fields = fields;
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ClientApiError };

/** Cœur commun : fetch + décodage de la réponse normalisée. */
async function requestJson<T>(
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok: true; data: T }
      | ApiFailurePayload
      | null;

    if (!payload) {
      return {
        ok: false,
        error: new ClientApiError("NETWORK_ERROR", "Le serveur n'a pas répondu. Réessayez."),
      };
    }
    if (payload.ok) return { ok: true, data: payload.data };
    return {
      ok: false,
      error: new ClientApiError(payload.error.code, payload.error.message, payload.error.fields),
    };
  } catch {
    return {
      ok: false,
      error: new ClientApiError("NETWORK_ERROR", "Connexion au serveur impossible. Réessayez."),
    };
  }
}

/** GET JSON vers une route interne. */
export function getJson<T>(url: string): Promise<ApiResult<T>> {
  return requestJson<T>(url, "GET");
}

/** POST JSON vers une route interne. */
export function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return requestJson<T>(url, "POST", body);
}

/** PUT JSON vers une route interne (brouillon d'invitation). */
export function putJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return requestJson<T>(url, "PUT", body);
}

/** PATCH JSON vers une route interne (même contrat que postJson). */
export function patchJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return requestJson<T>(url, "PATCH", body);
}

/** DELETE JSON vers une route interne. */
export function deleteJson<T>(url: string): Promise<ApiResult<T>> {
  return requestJson<T>(url, "DELETE");
}

/** POST multipart/form-data (téléversement de médias). */
export async function postForm<T>(
  url: string,
  form: FormData,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { method: "POST", body: form });
    const payload = (await response.json().catch(() => null)) as
      | { ok: true; data: T }
      | ApiFailurePayload
      | null;

    if (!payload) {
      return {
        ok: false,
        error: new ClientApiError("NETWORK_ERROR", "Le serveur n'a pas répondu. Réessayez."),
      };
    }
    if (payload.ok) return { ok: true, data: payload.data };
    return {
      ok: false,
      error: new ClientApiError(payload.error.code, payload.error.message, payload.error.fields),
    };
  } catch {
    return {
      ok: false,
      error: new ClientApiError("NETWORK_ERROR", "Connexion interrompue pendant l'envoi. Réessayez."),
    };
  }
}
