"use client";

// ---------------------------------------------------------------------------
// Icône d'un badge (§12) — rendu client unique du nom d'icône stocké en base.
// Seul le sous-ensemble lucide sûr (src/lib/badge-icons.ts) est résolu,
// sinon repli déterministe sur « Award ». Aucun composant arbitraire.
// ---------------------------------------------------------------------------

import { resolveBadgeIcon } from "@/lib/badge-icons";

export function BadgeIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = resolveBadgeIcon(name);
  return <Icon aria-hidden="true" className={className} />;
}
