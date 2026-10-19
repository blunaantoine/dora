import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";

// Carte d'indicateur du tableau de bord.
// - destination fournie → carte cliquable (Link) ;
// - sinon → carte NON cliquable avec la mention « Bientôt disponible »
//   (aucun lien mort : la fonctionnalité n'existe pas encore).

export interface StatCardProps {
  label: string;
  value: number;
  hint?: string;
  href?: string;
  ariaLabel?: string;
}

export function StatCard({ label, value, hint, href, ariaLabel }: StatCardProps) {
  const body = (
    <>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-foreground tabular-nums">
        {value.toLocaleString("fr-FR")}
      </p>
      {hint ? (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-3" />
          {hint}
        </p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel ?? `${label} : ${value}. Ouvrir la page associée.`}
        className={cn(
          "group relative flex flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-all",
          "hover:-translate-y-0.5 hover:border-pine/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        )}
      >
        {body}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-pine opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Ouvrir
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </span>
      </Link>
    );
  }

  return (
    <div
      className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-xs"
      aria-label={`${label} : ${value}. Fonctionnalité à venir.`}
    >
      {body}
      <p className="mt-3 text-xs text-muted-foreground/80 italic">Bientôt disponible</p>
    </div>
  );
}
