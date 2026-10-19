// ---------------------------------------------------------------------------
// Référentiel des icônes de badges (§12) — sous-ensemble lucide SÛR.
//
// L'icône est stockée en base comme chaîne libre (Badge.icon) : à l'affichage,
// seule une valeur présente dans ce mappage est rendue, sinon repli sur
// « Award » (fallback déterministe). Aucun autre nom lucide n'est accepté —
// on ne peut pas injecter de composant arbitraire.
// ---------------------------------------------------------------------------

import {
  Award,
  BookOpen,
  Flag,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Leaf,
  Lightbulb,
  ShieldCheck,
  Sprout,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

export const BADGE_ICON_NAMES = [
  "Award",
  "HeartHandshake",
  "Users",
  "Leaf",
  "BookOpen",
  "GraduationCap",
  "Lightbulb",
  "Sprout",
  "HandHeart",
  "Star",
  "ShieldCheck",
  "Flag",
] as const;

export type BadgeIconName = (typeof BADGE_ICON_NAMES)[number];

export const BADGE_ICON_LABELS: Record<BadgeIconName, string> = {
  Award: "Trophée",
  HeartHandshake: "Solidarité",
  Users: "Communauté",
  Leaf: "Environnement",
  BookOpen: "Transmission",
  GraduationCap: "Éducation",
  Lightbulb: "Innovation",
  Sprout: "Croissance",
  HandHeart: "Engagement",
  Star: "Exemplarité",
  ShieldCheck: "Protection",
  Flag: "Impact local",
};

/** Résout une icône : valeur exacte du sous-ensemble, sinon Award (fallback). */
export function resolveBadgeIcon(name: string | null | undefined): LucideIcon {
  if (name && (BADGE_ICON_NAMES as readonly string[]).includes(name)) {
    return {
      Award,
      HeartHandshake,
      Users,
      Leaf,
      BookOpen,
      GraduationCap,
      Lightbulb,
      Sprout,
      HandHeart,
      Star,
      ShieldCheck,
      Flag,
    }[name as BadgeIconName]!;
  }
  return Award;
}
