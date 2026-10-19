// ---------------------------------------------------------------------------
// Page d'accès au formulaire privé : /invitation/[token] (§23, §7).
//
// Server Component — valide le jeton CÔTÉ SERVEUR (empreinte SHA-256, statut
// ACTIVE, non expiré, dossier non verrouillé) :
//   - VALID → rend le formulaire multi-étapes (Client Component, tâche 3-b) ;
//   - toute autre cause → écran « Lien invalide ou expiré » (message unique
//     volontairement générique, anti-énumération §6.2).
// Les en-têtes noindex/nofollow et Referrer-Policy: no-referrer sont posés par
// le proxy et next.config.ts.
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { validateInvitationToken } from "@/lib/tokens";
import { InvitationForm } from "@/components/invitation/invitation-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Formulaire privé",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const validation = await validateInvitationToken(token);
  const isValid = validation.status === "VALID";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F8F5EF] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#173D32]/15 bg-white p-6 text-center shadow-sm sm:p-8">
        {isValid ? (
          <InvitationForm token={token} />
        ) : (
          <>
            <p className="font-display text-xl font-semibold text-[#173D32]">
              Lien invalide ou expiré
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#202522]/80">
              Ce lien de formulaire n&apos;est plus utilisable. Merci de contacter
              l&apos;équipe de la plateforme pour obtenir un nouveau lien.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
