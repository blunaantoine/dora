"use client";

// ---------------------------------------------------------------------------
// Carrousel « À l'honneur » — bannière d'accueil (à droite du bandeau).
//
// Comportement (maquette client) :
//   • défilement automatique toutes les 4 secondes avec fondu enchaîné ;
//   • badge de classement sur chaque carte : « Coup de cœur n°1 » (or),
//     n°2 (argent), n°3 (bronze), n°4-5 (neutre) — c'est un CHOIX ÉDITORIAL
//     de l'équipe, PAS une notation (la plateforme n'a ni notes, ni
//     popularité, ni nombre de vues) ;
//   • chaque carte : photo (ou emplacement initialée), domaine, nom public et
//     lien « Voir son parcours » vers la fiche publique ;
//   • points d'accès direct, flèches précédent/suivant, bouton pause.
//
// Accessibilité (WCAG 2.2.2 — le contenu en mouvement doit pouvoir être
// arrêté) : bouton pause/reprise avec libellé dynamique, pause automatique au
// survol et au focus clavier, respect de prefers-reduced-motion (pas de
// défilement automatique), région aria-roledescription="carrousel", annonces
// polies uniquement lors des navigations manuelles (l'automatique ne spamme
// pas les lecteurs d'écran), cartes hors écran inertes et masquées.
//
// La vitesse (4 s) et ses bornes (2 à 10 s, cf. « Tweaks » de la maquette)
// sont des constantes : le réglage par visiteur n'est pas prévu au cahier des
// charges, seul l'arrêt l'est.
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

/** Intervalle de défilement automatique (maquette : 4 s). */
const AUTOPLAY_MS = 4000;
/** Bornes documentées dans la maquette (onglet « Tweaks ») : 2 à 10 secondes. */
export const AUTOPLAY_MIN_MS = 2000;
export const AUTOPLAY_MAX_MS = 10000;

export interface HonoredCarouselItem {
  slug: string;
  publicName: string;
  categoryName: string | null;
  /** Rang éditorial réel (1..5) — affiché tel quel même si des rangs manquent. */
  rank: number;
  photo: {
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
}

/** Badges de classement : 1re place or, 2e argent, 3e bronze, suivantes neutres. */
function badgeStyle(rank: number): string {
  if (rank === 1) return "bg-gold text-pine-deep";
  if (rank === 2) return "bg-[#C9CDD2] text-[#202522]";
  if (rank === 3) return "bg-[#C08A52] text-white";
  return "bg-pine-deep/85 text-[#F8F5EF]";
}

// Préférence système « moins de mouvement » — stock externe (aucun setState
// dans un effet : le carrousel démarre en pause quand la préférence est active).
function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HonoredCarousel({ items }: { items: HonoredCarouselItem[] }) {
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [announce, setAnnounce] = useState("");
  // Miroir de l'index pour les handlers (lu hors rendu uniquement).
  const indexRef = useRef(0);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  const baseId = useId();

  // Défilement automatique : suspendu si l'utilisateur met en pause, survole
  // la zone, y donne le focus clavier, si l'onglet est caché, ou si le
  // système demande moins de mouvement.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    // Serveur : aucune préférence connue — la valeur réelle est adoptée dès
    // l'hydratation (le carrousel démarre alors en pause si nécessaire).
    () => false,
  );
  const running = !userPaused && !hovered && !focused && !reducedMotion && count > 1;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      // Onglet caché : ne fait rien (reprendra au retour sans sauter).
      if (typeof document !== "undefined" && document.hidden) return;
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [running, count]);

  const goTo = useCallback(
    (target: number) => {
      setIndex(target % count);
      const item = items[target % count];
      if (item) {
        setAnnounce(
          `Parcours à l'honneur ${target % count + 1} sur ${count} : ${item.publicName}.`,
        );
      }
    },
    [count, items],
  );

  const goPrevious = useCallback(() => goTo((indexRef.current - 1 + count) % count), [goTo, count]);
  const goNext = useCallback(() => goTo((indexRef.current + 1) % count), [goTo, count]);

  // Navigation clavier gauche/droite sur la région (confort lecteur d'écran
  // désactivé — flèches déjà utilisables via les boutons au Tab).
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    }
  };

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="Parcours à l'honneur, choix de l'équipe"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className="w-full"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-semibold text-gold">À l&apos;honneur</h2>
        <p className="text-xs text-[#F8F5EF]/75">Choix de l&apos;équipe — ni notes, ni popularité.</p>
      </div>

      <p aria-live="polite" role="status" className="sr-only">
        {announce}
      </p>

      {/* Pile de cartes — toutes en [grid-area:1/1] : la hauteur vaut celle de
          la plus grande, et le fondu enchaîné se fait par opacité. */}
      <div className="grid" aria-atomic="false">
        {items.map((item, position) => {
          const active = position === index;
          const initial = item.publicName.trim().charAt(0).toUpperCase() || "•";
          return (
            <article
              key={item.slug}
              id={`${baseId}-slide-${position}`}
              aria-hidden={!active}
              inert={!active}
              className={cn(
                "[grid-area:1/1] flex h-full flex-col overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-lg transition-opacity duration-700 ease-in-out",
                active ? "z-10 opacity-100" : "pointer-events-none select-none opacity-0",
              )}
            >
              {/* Photo ou emplacement réservé (maquette : cadre pine, initiale
                  en Fraunces, liseré or) — la vraie photo est servie par
                  /api/public/media (visibilité revalidée à chaque accès). */}
              <div className="relative h-44 shrink-0 border-b border-border/60 bg-[#22503F]">
                {item.photo ? (
                  <img
                    src={item.photo.url}
                    alt={item.photo.alt}
                    width={item.photo.width ?? 400}
                    height={item.photo.height ?? 300}
                    loading={position === 0 ? "eager" : "lazy"}
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-full w-full items-center justify-center font-display text-6xl font-semibold text-[#EAD9AC]"
                  >
                    {initial}
                  </span>
                )}
                <span
                  className={cn(
                    "absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm",
                    badgeStyle(item.rank),
                  )}
                >
                  Coup de cœur n°{item.rank}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 p-5">
                {item.categoryName ? (
                  <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-pine px-2.5 py-0.5 text-xs font-medium text-[#F8F5EF]">
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-gold" />
                    <span className="truncate">{item.categoryName}</span>
                  </p>
                ) : null}
                <h3 className="truncate font-display text-lg font-semibold text-foreground">
                  {item.publicName}
                </h3>
                <Link
                  href={`/profils/${item.slug}`}
                  tabIndex={active ? 0 : -1}
                  className="mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm font-semibold text-pine underline-offset-4 transition-colors hover:text-pine-deep hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Voir son parcours
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {/* Commandes : points d'accès direct, pause, précédent / suivant */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div role="group" aria-label="Accès direct à un rang" className="flex items-center gap-1.5">
          {items.map((item, position) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => goTo(position)}
              aria-label={`Voir le parcours n°${item.rank} : ${item.publicName}`}
              aria-current={position === index ? "true" : undefined}
              className={cn(
                "h-3 rounded-full transition-all focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none",
                position === index ? "w-6 bg-gold" : "w-3 bg-[#F8F5EF]/35 hover:bg-[#F8F5EF]/60",
              )}
            />
          ))}
        </div>

        <div role="group" aria-label="Commandes du carrousel" className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUserPaused((paused) => !paused)}
            // Le bouton reflète le choix explicite de l'utilisateur ; la pause
            // temporaire au survol/focus ne change pas son libellé.
            aria-pressed={userPaused}
            aria-label={
              userPaused
                ? "Reprendre le défilement automatique"
                : "Mettre en pause le défilement automatique"
            }
            className="inline-flex size-11 items-center justify-center rounded-full border border-[#F8F5EF]/35 text-[#F8F5EF] transition-colors hover:bg-[#F8F5EF]/10 focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none"
          >
            {userPaused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
          </button>
          <button
            type="button"
            onClick={goPrevious}
            aria-label="Parcours précédent"
            className="inline-flex size-11 items-center justify-center rounded-full border border-[#F8F5EF]/35 text-[#F8F5EF] transition-colors hover:bg-[#F8F5EF]/10 focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Parcours suivant"
            className="inline-flex size-11 items-center justify-center rounded-full border border-[#F8F5EF]/35 text-[#F8F5EF] transition-colors hover:bg-[#F8F5EF]/10 focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
