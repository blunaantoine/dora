import { cn } from "@/lib/utils";

// Carte de profil public — reçoit UNIQUEMENT les champs destinés à la
// publication (aucune donnée privée, aucun indicateur d'âge). Les fiches
// détaillées publiques arrivent en phase 5 : la carte n'est volontairement
// PAS un lien (aucune destination réelle n'existe encore).

export interface PublicProfileData {
  id: string;
  publicName: string;
  shortPresentation: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  categoryName: string | null;
  publishedAt: string; // déjà formaté côté serveur (fr-FR)
}

export function ProfileCard({ profile }: { profile: PublicProfileData }) {
  const initial = profile.publicName.trim().charAt(0).toUpperCase() || "•";
  const lieu = [profile.city, profile.region, profile.country].filter(Boolean).join(" · ");

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-pine font-display text-lg font-semibold text-[#F8F5EF]"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold text-foreground">
            {profile.publicName}
          </h3>
          {profile.categoryName ? (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-pine px-2.5 py-0.5 text-xs font-medium text-[#F8F5EF]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
              {profile.categoryName}
            </p>
          ) : null}
        </div>
      </div>
      {profile.shortPresentation ? (
        <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
          {profile.shortPresentation}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground italic">
          Présentation à découvrir prochainement.
        </p>
      )}
      <div className={cn("mt-auto pt-4", "text-xs text-muted-foreground")}>
        {lieu ? <p>{lieu}</p> : null}
        <p>Publiée le {profile.publishedAt}</p>
      </div>
    </article>
  );
}
