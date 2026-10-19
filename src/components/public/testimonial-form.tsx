"use client";

// ---------------------------------------------------------------------------
// Dialogue « Proposer un témoignage » (§9.1) — composant client des fiches
// publiques. Le reste de la fiche reste un Server Component lisible sans JS.
//
//   - champs §9.1 : nom public ou pseudonyme, témoignage, relation
//     facultative, contact facultatif « conservé séparément » (jamais publié) ;
//   - déclaration d'acceptation des règles OBLIGATOIRE (case à cocher) ;
//   - honeypot « siteWeb » : champ présent dans le HTML mais invisible et
//     hors navigation (les robots le remplissent, les humains non) ;
//   - après envoi : message de remerciement explicite — « sera relu par
//     l'équipe avant publication » (aucune publication automatique §9.1).
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import { Loader2, MessageSquareHeart, Send } from "lucide-react";

import { postJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormState = "idle" | "sending" | "sent";

export function TestimonialForm({ slug, personName }: { slug: string; personName: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [nomPublic, setNomPublic] = useState("");
  const [relation, setRelation] = useState("");
  const [contenu, setContenu] = useState("");
  const [contact, setContact] = useState("");
  const [declaration, setDeclaration] = useState(false);

  // Valeur du honeypot : non contrôlée (les humains ne la voient jamais).
  const honeypotRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setNomPublic("");
    setRelation("");
    setContenu("");
    setContact("");
    setDeclaration(false);
    setError(null);
  }

  async function handleSubmit() {
    if (state === "sending") return;
    setError(null);

    if (nomPublic.trim().length < 2) {
      setError("Indiquez un nom public ou un pseudonyme (2 caractères au moins).");
      return;
    }
    if (contenu.trim().length < 30) {
      setError("Le témoignage doit contenir au moins 30 caractères.");
      return;
    }
    if (!declaration) {
      setError("Merci d'accepter les règles de publication pour envoyer votre témoignage.");
      return;
    }

    setState("sending");
    const result = await postJson<{ soumis: boolean; message: string }>(
      `/api/public/profiles/${encodeURIComponent(slug)}/testimonials`,
      {
        nomPublic: nomPublic.trim(),
        contenu: contenu.trim(),
        ...(relation.trim() !== "" ? { relation: relation.trim() } : {}),
        ...(contact.trim() !== "" ? { contact: contact.trim() } : {}),
        declaration: true,
        // Champ leurre : rempli uniquement par des robots.
        siteWeb: honeypotRef.current?.value ?? "",
      },
    );

    if (!result.ok) {
      setState("idle");
      setError(result.error.message);
      return;
    }
    setState("sent");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && state === "sent") {
          // Réouverture : propose un nouveau témoignage, formulaire neuf.
          setState("idle");
          resetForm();
        }
        if (!next) {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 border-pine text-pine hover:bg-accent hover:text-pine"
          aria-label={`Proposer un témoignage sur le parcours de ${personName}`}
        >
          <MessageSquareHeart aria-hidden="true" />
          Proposer un témoignage
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {state === "sent" ? (
          <div className="grid gap-4 py-2" role="status">
            <DialogHeader>
              <DialogTitle>Merci pour votre témoignage</DialogTitle>
              <DialogDescription>
                Votre contribution a bien été transmise. Elle sera relu par l&apos;équipe avant
                toute publication : rien n&apos;est publié automatiquement.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" className="min-h-11" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Proposer un témoignage</DialogTitle>
              <DialogDescription>
                Partagez ce que le parcours de {personName} vous inspire. Votre témoignage sera
                relu par l&apos;équipe avant toute publication.
              </DialogDescription>
            </DialogHeader>

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="testimonial-nom">Votre nom public ou pseudonyme *</Label>
                <Input
                  id="testimonial-nom"
                  name="nomPublic"
                  value={nomPublic}
                  onChange={(event) => setNomPublic(event.target.value)}
                  maxLength={80}
                  autoComplete="off"
                  required
                  disabled={state === "sending"}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="testimonial-relation">Votre relation avec la personne (facultatif)</Label>
                <Input
                  id="testimonial-relation"
                  name="relation"
                  value={relation}
                  onChange={(event) => setRelation(event.target.value)}
                  maxLength={120}
                  placeholder="Ex. : collaboratrice, voisine, bénéficiaire…"
                  autoComplete="off"
                  disabled={state === "sending"}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="testimonial-contenu">Votre témoignage *</Label>
                <Textarea
                  id="testimonial-contenu"
                  name="contenu"
                  value={contenu}
                  onChange={(event) => setContenu(event.target.value)}
                  rows={5}
                  maxLength={2000}
                  required
                  disabled={state === "sending"}
                />
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {contenu.trim().length} / 2000 caractères (30 au minimum)
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="testimonial-contact">Moyen de contact (facultatif)</Label>
                <Input
                  id="testimonial-contact"
                  name="contact"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  maxLength={200}
                  placeholder="Uniquement si vous acceptez d'être contactée pour vérification"
                  autoComplete="off"
                  disabled={state === "sending"}
                />
                <p className="text-xs text-muted-foreground">
                  Conservé séparément, jamais publié sur la fiche.
                </p>
              </div>

              {/* Honeypot anti-spam : champ invisible, hors navigation clavier
                  et lecteurs d'écran. Doit rester vide. */}
              <div aria-hidden="true" className="absolute -left-[9999px] top-auto size-px overflow-hidden">
                <label htmlFor="testimonial-site-web">Ne pas remplir ce champ</label>
                <input
                  ref={honeypotRef}
                  id="testimonial-site-web"
                  name="siteWeb"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  defaultValue=""
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <Checkbox
                  id="testimonial-declaration"
                  checked={declaration}
                  onCheckedChange={(checked) => setDeclaration(checked === true)}
                  required
                  disabled={state === "sending"}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="testimonial-declaration"
                  className="text-sm font-normal leading-relaxed text-foreground/90"
                >
                  Je déclare que ce témoignage est sincère, respectueux et exempt de propos
                  injurieux ou discriminatoires, et j&apos;accepte qu&apos;il soit relu et modéré
                  avant publication. *
                </Label>
              </div>

              {error ? (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setOpen(false)}
                  disabled={state === "sending"}
                >
                  Annuler
                </Button>
                <Button type="submit" className="min-h-11" disabled={state === "sending"}>
                  {state === "sending" ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Send aria-hidden="true" />
                  )}
                  Envoyer
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
