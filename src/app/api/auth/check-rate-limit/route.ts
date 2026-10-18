// ---------------------------------------------------------------------------
// Pré-vérification du seuil de tentatives de connexion (recommandation 2-a) :
// la page /admin/connexion appelle isLoginAllowed(ip, email) AVANT
// signIn("credentials") afin d'afficher un message clair sans consommer une
// tentative de connexion inutile. Route publique mais strictement limitée en
// débit (pas de divulgation : la réponse ne dépend que du seuil mémoire).
// ---------------------------------------------------------------------------

import { z } from "zod";
import { withApi, jsonOk, ApiError } from "@/lib/api";
import { isLoginAllowed } from "@/lib/auth-options";
import { ipFromHeaders } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  email: z.email("Adresse e-mail invalide.").max(200),
});

export const POST = withApi(async (req) => {
  const ip = ipFromHeaders(req.headers) ?? "unknown";

  // Protection anti-sonde : 20 pré-vérifications / minute / IP au maximum.
  const limit = rateLimit(`check-login:${ip}`, 20, 60_000);
  if (!limit.allowed) {
    throw ApiError.rateLimited(
      "Trop de vérifications. Merci de patienter avant de réessayer.",
      limit.retryAfterSec,
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    // Corps invalide : réponse neutre, aucune information divulguée.
    return jsonOk({ allowed: true, retryAfterSec: 0 });
  }

  const result = isLoginAllowed(ip, parsed.data.email);
  return jsonOk(result);
});
