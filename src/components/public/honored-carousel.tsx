"use client";

// ---------------------------------------------------------------------------
// Carrousel « Top 5 des parcours » — bannière d'accueil (à droite du bandeau).
//
// Comportement (maquette client, reprise à l'identique) :
//   • défilement automatique toutes les 4 secondes par défaut, avec fondu
//     enchaîné ;
//   • badge de rang sur chaque carte : « 1re place » (or), « 2e place »
//     (argent), « 3e place » (bronze), « 4e »/« 5e place » (neutre). Le classement est un choix
//     éditorial de l'équipe (featuredRank), pas une notation : la plateforme
//     n'a ni notes, ni popularité, ni nombre de vues ;
//   • chaque carte : photo (ou emplacement réservé avec initiale), domaine
//     d'engagement, nom public et lien « Voir son parcours » vers la fiche
//     publique ;
//   • points d'accès direct par rang, flèches précédent/suivant, bouton pause.
//
// Accessibilité (WCAG 2.2.2 — le contenu en mouvement doit pouvoir être
// arrêté) : bouton pause/reprise avec libellé dynamique, pause automatique au
// survol et au focus clavier, respect de prefers-reduced-motion (pas de
// défilement automatique), région aria-roledescription="carrousel", annonces
// polies uniquement lors des navigations manuelles (l'automatique ne spamme
// pas les lecteurs d'écran), cartes hors écran inertes et masquées.
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
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

/** Intervalle du défilement automatique (maquette : 4 s). */
const AUTOPLAY_MS = 4000;

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

/** Libellé de rang : « 1re place », « 2e place »… (accord avec « place »). */
function rankLabel(rank: number): string {
  return rank === 1 ? "1re place" : `${rank}e place`;
}

/** Badges de rang : 1re place or, 2e argent, 3e bronze, suivantes neutres. */
function badgeStyle(rank: number): string {
  if (rank === 1) return "bg-gold text-pine-deep";
  if (rank === 2) return "bg-[#DCD8CE] text-pine-deep";
  if (rank === 3) return "bg-[#D9A27A] text-pine-deep";
  return "bg-gold-soft text-pine-deep";
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
          `Top 5 des parcours — ${rankLabel(item.rank)} sur ${count} : ${item.publicName}.`,
        );
      }
    },
    [count, items],
  );

  const goPrevious = useCallback(() => goTo((indexRef.current - 1 + count) % count), [goTo, count]);
  const goNext = useCallback(() => goTo((indexRef.current + 1) % count), [goTo, count]);

  // Navigation clavier gauche/droite sur la région (confort clavier — flèches
  // déjà accessibles au Tab via les boutons).
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
      aria-label="Top 5 des parcours"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className="w-full"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-gold uppercase">
          <Trophy aria-hidden="true" className="size-4" />
          Top 5 des parcours
        </h2>
        <p aria-hidden="true" className="text-sm text-[#F8F5EF]/75 tabular-nums">
          {index + 1} / {count}
        </p>
      </div>

      <p aria-live="polite" role="status" className="sr-only">
        {announce}
      </p>

      {/* Pile de cartes (toutes en [grid-area:1/1]). Fondu SÉQUENTIEL : la
          carte sortante s'efface (300 ms) avant que l'entrante n'apparaisse
          (300 ms, après un délai de 300 ms) — jamais deux textes superposés.
          Un cadre décalé en or donne l'effet de pile de la maquette. */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 translate-x-3 translate-y-3 rounded-3xl border border-gold/35"
        />
        <div className="relative grid overflow-hidden rounded-3xl bg-pine-deep">
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
                  "[grid-area:1/1] flex flex-col transition-opacity duration-300 ease-in-out motion-reduce:transition-none",
                  active
                    ? "z-10 opacity-100 delay-300"
                    : "pointer-events-none opacity-0 select-none delay-0",
                )}
              >
                {/* Photo publique (servie par /api/public/media, visibilité
                    revalidée à chaque accès) ou emplacement à initiale. */}
                <div className="relative aspect-[4/3] bg-pine-soft sm:aspect-[5/4]">
                  {item.photo ? (
                    <img
                      src={item.photo.url}
                      alt={item.photo.alt}
                      width={item.photo.width ?? 400}
                      height={item.photo.height ?? 300}
                      loading={position === 0 ? "eager" : "lazy"}
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center font-display text-8xl font-semibold text-gold-soft/90"
                    >
                      {initial}
                    </span>
                  )}
                  <span
                    className={cn(
                      "absolute top-4 left-4 inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-bold shadow-md",
                      badgeStyle(item.rank),
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 items-center justify-center rounded-full bg-pine-deep font-display text-base text-gold-soft"
                    >
                      {item.rank}
                    </span>
                    {rankLabel(item.rank)}
                  </span>
                </div>

                <div className="flex flex-col gap-2 bg-pine-deep px-5 pt-5 pb-5">
                  {item.categoryName ? (
                    <p className="truncate text-sm font-medium text-gold-soft">{item.categoryName}</p>
                  ) : null}
                  <h3 className="truncate font-display text-2xl leading-tight font-semibold text-[#F8F5EF]">
                    {item.publicName}
                  </h3>
                  <Link
                    href={`/profils/${item.slug}`}
                    tabIndex={active ? 0 : -1}
                    className="mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm font-semibold text-[#F8F5EF]/90 underline-offset-4 transition-colors hover:text-[#F8F5EF] hover:underline focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none"
                  >
                    Voir son parcours
                    <span className="sr-only"> : {item.publicName}</span>
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Commandes : points d'accès direct par rang, pause, précédent / suivant. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div role="group" aria-label="Accès direct à un rang" className="flex items-center">
          {items.map((item, position) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => goTo(position)}
              aria-label={`Afficher la ${rankLabel(item.rank)} : ${item.publicName}`}
              aria-current={position === index ? "true" : undefined}
              className="group flex h-11 w-7 items-center justify-center rounded-full focus-visible:ring-[3px] focus-visible:ring-gold/60 focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block h-2 rounded-full transition-all",
                  position === index ? "w-6 bg-gold" : "w-2 bg-[#F8F5EF]/45 group-hover:bg-[#F8F5EF]/70",
                )}
              />
            </button>
          ))}
        </div>

        <div role="group" aria-label="Commandes du carrousel" className="flex items-center gap-2">
          {count > 1 ? (
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
          ) : null}
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
