import Link from "next/link";
import { MapPin } from "lucide-react";

import type { PublicCardView } from "@/lib/public-profile";

// Carte de profil public (annuaire / accueil) — reçoit UNIQUEMENT les données
// sérialisées par src/lib/public-profile.ts (champs approuvés, aucune donnée
// privée, aucun indicateur d'âge). Toute la carte est un lien vers la fiche
// publique /profils/<slug>.

export function ProfileCard({ profile }: { profile: PublicCardView }) {
  const initial = profile.publicName.trim().charAt(0).toUpperCase() || "•";

  return (
    <article className="h-full overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-shadow hover:shadow-sm">
      <Link
        href={`/profils/${profile.slug}`}
        className="flex h-full min-h-44 flex-col focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Voir le profil public de ${profile.publicName}`}
      >
        {profile.photo ? (
          // Image servie par /api/public/media/[id] (visibilité publique +
          // publication active vérifiées côté serveur à chaque accès).
          // <img> volontaire (perf 3G, §19 : pas de pipeline d'optimisation JS,
          // dimensions explicites pour éviter tout décalage de mise en page).
          <img
            src={profile.photo.url}
            alt={profile.photo.alt}
            width={profile.photo.width ?? 400}
            height={profile.photo.height ?? 300}
            loading="lazy"
            decoding="async"
            className="h-40 w-full border-b border-border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-40 w-full items-center justify-center border-b border-border bg-pine font-display text-4xl font-semibold text-[#F8F5EF]"
          >
            {initial}
          </span>
        )}

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold text-foreground">
              {profile.publicName}
            </h3>
            {profile.categoryName ? (
              <p className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-pine px-2.5 py-0.5 text-xs font-medium text-[#F8F5EF]">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-gold" />
                <span className="truncate">{profile.categoryName}</span>
              </p>
            ) : null}
          </div>

          {profile.shortPresentation ? (
            <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
              {profile.shortPresentation}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Présentation à découvrir sur la fiche.
            </p>
          )}

          <div className="mt-auto space-y-1 pt-2 text-xs text-muted-foreground">
            {profile.country ? (
              <p className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                {profile.country}
              </p>
            ) : null}
            {profile.publishedAtISO ? (
              <p>
                Publiée le{" "}
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
                  new Date(profile.publishedAtISO),
                )}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
