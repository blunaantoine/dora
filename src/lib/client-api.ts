// ---------------------------------------------------------------------------
// Petit utilitaire client pour appeler les API internes (réponse normalisée
// { ok, data } / { ok, error }). Utilisé par les formulaires d'administration.
// Jamais importé côté serveur : il s'appuie sur fetch navigateur.
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

/** POST JSON vers une route interne et décode la réponse normalisée. */
export async function postJson<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: ClientApiError }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

/** PATCH JSON vers une route interne (même contrat que postJson). */
export async function patchJson<T>(
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: ClientApiError }> {
  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
