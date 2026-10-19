"use client";

// ---------------------------------------------------------------------------
// Formulaire public « Proposer une personne » (§11.1) — composant client.
//
//   - champs §11.1 : nom public de la personne, domaine d'engagement (slug de
//     catégorie active), présentation de l'action, raison de la proposition,
//     lien source public facultatif, nom du proposant facultatif, contact
//     facultatif « traité de manière confidentielle » ;
//   - déclaration de bonne foi OBLIGATOIRE ;
//   - honeypot « siteWeb » invisible (rejet silencieux côté API) ;
//   - contexte affiché : l'acceptation ne publie jamais automatiquement la
//     personne — l'équipe vérifie puis contacte (§11.2).
//   - AUCUNE donnée sensible demandée sur la personne proposée (§11.1).
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { postJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface NominationCategory {
  slug: string;
  name: string;
}

type FormState = "idle" | "sending" | "sent";

export function NominationForm({ categories }: { categories: NominationCategory[] }) {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  const [nomPersonne, setNomPersonne] = useState("");
  const [domaine, setDomaine] = useState("");
  const [presentation, setPresentation] = useState("");
  const [raison, setRaison] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [nomProposant, setNomProposant] = useState("");
  const [contactProposant, setContactProposant] = useState("");
  const [declaration, setDeclaration] = useState(false);

  const honeypotRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (state === "sending") return;
    setError(null);

    if (nomPersonne.trim().length < 2) {
      setError("Indiquez le nom public de la personne à proposer.");
      return;
    }
    if (domaine === "") {
      setError("Choisissez un domaine d'engagement.");
      return;
    }
    if (presentation.trim().length < 30) {
      setError("La présentation de l'action doit contenir au moins 30 caractères.");
      return;
    }
    if (raison.trim().length < 30) {
      setError("La raison de la proposition doit contenir au moins 30 caractères.");
      return;
    }
    if (!declaration) {
      setError("Merci de signer la déclaration de bonne foi pour envoyer votre proposition.");
      return;
    }

    setState("sending");
    const result = await postJson<{ soumis: boolean; message: string }>("/api/public/nominations", {
      nomPersonne: nomPersonne.trim(),
      domaine,
      presentation: presentation.trim(),
      raison: raison.trim(),
      ...(sourceUrl.trim() !== "" ? { sourceUrl: sourceUrl.trim() } : {}),
      ...(nomProposant.trim() !== "" ? { nomProposant: nomProposant.trim() } : {}),
      ...(contactProposant.trim() !== "" ? { contactProposant: contactProposant.trim() } : {}),
      declaration: true,
      // Champ leurre : rempli uniquement par des robots.
      siteWeb: honeypotRef.current?.value ?? "",
    });

    if (!result.ok) {
      setState("idle");
      setError(result.error.message);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8"
      >
        <h2 className="font-display text-lg font-semibold text-emerald-900">
          Merci, votre proposition a bien été transmise.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-emerald-900/85">
          L&apos;équipe va l&apos;examiner avec attention. Accepter une proposition ne publie pas
          automatiquement la personne : l&apos;équipe vérifie d&apos;abord son identité et la
          pertinence du dossier, puis la contacte directement. Si vous avez laissé un moyen de
          contact, il pourra servir à vous informer de la suite — il n&apos;est jamais publié.
        </p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      noValidate={false}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="nomination-nom">Nom public de la personne à proposer *</Label>
        <Input
          id="nomination-nom"
          name="nomPersonne"
          value={nomPersonne}
          onChange={(event) => setNomPersonne(event.target.value)}
          maxLength={120}
          autoComplete="off"
          required
          disabled={state === "sending"}
        />
        <p className="text-xs text-muted-foreground">
          Le nom sous lequel elle est connue publiquement. Aucune donnée privée n&apos;est
          nécessaire à ce stade.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nomination-domaine">Domaine d&apos;engagement *</Label>
        <Select value={domaine} onValueChange={setDomaine} disabled={state === "sending"} required>
          <SelectTrigger id="nomination-domaine" className="bg-card" aria-required="true">
            <SelectValue placeholder="Choisir un domaine d'engagement" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.slug} value={category.slug}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nomination-presentation">Présentation de son action *</Label>
        <Textarea
          id="nomination-presentation"
          name="presentation"
          value={presentation}
          onChange={(event) => setPresentation(event.target.value)}
          rows={5}
          maxLength={3000}
          required
          disabled={state === "sending"}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {presentation.trim().length} / 3000 caractères (30 au minimum) — que fait-elle, pour
          qui, où ?
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nomination-raison">Raison de votre proposition *</Label>
        <Textarea
          id="nomination-raison"
          name="raison"
          value={raison}
          onChange={(event) => setRaison(event.target.value)}
          rows={4}
          maxLength={3000}
          required
          disabled={state === "sending"}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {raison.trim().length} / 3000 caractères (30 au minimum) — pourquoi ce parcours mérite
          d&apos;être documenté ?
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nomination-source">Lien vers une source publique (facultatif)</Label>
        <Input
          id="nomination-source"
          name="sourceUrl"
          type="url"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          maxLength={500}
          placeholder="https://…"
          autoComplete="off"
          disabled={state === "sending"}
        />
        <p className="text-xs text-muted-foreground">
          Article, site associatif, page officielle… tout élément public qui aide l&apos;équipe à
          vérifier.
        </p>
      </div>

      <div className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nomination-proposant">Votre nom (facultatif)</Label>
          <Input
            id="nomination-proposant"
            name="nomProposant"
            value={nomProposant}
            onChange={(event) => setNomProposant(event.target.value)}
            maxLength={120}
            autoComplete="off"
            disabled={state === "sending"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nomination-contact">Votre contact (facultatif)</Label>
          <Input
            id="nomination-contact"
            name="contactProposant"
            value={contactProposant}
            onChange={(event) => setContactProposant(event.target.value)}
            maxLength={200}
            placeholder="E-mail ou téléphone"
            autoComplete="off"
            disabled={state === "sending"}
          />
          <p className="text-xs text-muted-foreground">
            Traité de manière confidentielle : il sert uniquement au suivi de la proposition,
            jamais publié.
          </p>
        </div>
      </div>

      {/* Honeypot anti-spam : invisible, hors navigation clavier et lecteurs
          d'écran. Doit rester vide. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto size-px overflow-hidden">
        <label htmlFor="nomination-site-web">Ne pas remplir ce champ</label>
        <input
          ref={honeypotRef}
          id="nomination-site-web"
          name="siteWeb"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
        <Checkbox
          id="nomination-declaration"
          checked={declaration}
          onCheckedChange={(checked) => setDeclaration(checked === true)}
          required
          disabled={state === "sending"}
          className="mt-0.5"
        />
        <Label
          htmlFor="nomination-declaration"
          className="text-sm font-normal leading-relaxed text-foreground/90"
        >
          Je déclare agir de bonne foi : les informations transmises sont exactes à ma connaissance
          et j&apos;accepte les règles de soumission de la plateforme. *
        </Label>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="submit" size="lg" className="min-h-11 w-full sm:w-auto" disabled={state === "sending"}>
          {state === "sending" ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Send aria-hidden="true" />
          )}
          Envoyer la proposition
        </Button>
      </div>
    </form>
  );
}
