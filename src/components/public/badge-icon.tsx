"use client";

// ---------------------------------------------------------------------------
// Icône d'un badge (§12) — rendu client unique du nom d'icône stocké en base.
// Seul le sous-ensemble lucide sûr (src/lib/badge-icons.ts) est résolu,
// sinon repli déterministe sur « Award ». Aucun composant arbitraire.
//
// La règle React Compiler « Cannot create components during render » est
// neutralisée ici : le composant renvoyé provient d'une table statique
// (déclarée hors rendu dans src/lib/badge-icons.ts) — il n'est pas créé
// pendant le rendu et ne porte aucun état local.
// ---------------------------------------------------------------------------

import { resolveBadgeIcon } from "@/lib/badge-icons";

export function BadgeIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = resolveBadgeIcon(name);
  return (
    // eslint-disable-next-line react-hooks/static-components -- table statique hors rendu, sans état
    <Icon aria-hidden="true" className={className} />
  );
}
