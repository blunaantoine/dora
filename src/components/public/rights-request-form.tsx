"use client";

// ---------------------------------------------------------------------------
// Formulaire de demande de droits (§15.3) — page publique /demandes-droits.
//
// Procédure : accès, correction, limitation/retrait, effacement, retrait du
// consentement, signalement. Honeypot anti-robots, déclaration obligatoire,
// aucune donnée sensible collectée. Le lien de fiche est pré-rempli quand
// la demande part d'un profil (?profil=<slug>).
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { postJson } from "@/lib/client-api";
import { RIGHTS_REQUEST_TYPES, RIGHTS_REQUEST_TYPE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormState = "idle" | "sending" | "sent";

export function RightsRequestForm({ initialSlug }: { initialSlug?: string }) {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [nomProfil, setNomProfil] = useState("");
  const [type, setType] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterContact, setRequesterContact] = useState("");
  const [description, setDescription] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const descriptionCount = useMemo(() => description.trim().length, [description]);

  async function handleSubmit() {
    setError(null);
    if (slug.trim() === "" && nomProfil.trim() === "") {
      setError("Indiquez la fiche concernée (lien ou nom) ou « Je ne connais pas le lien ».");
      return;
    }
    if (type === "") {
      setError("Choisissez le type de demande.");
      return;
    }
    if (requesterName.trim().length < 2) {
      setError("Indiquez votre nom.");
      return;
    }
    if (descriptionCount < 20) {
      setError("Décrivez votre demande (20 caractères au moins).");
      return;
    }
    if (!declaration) {
      setError("Merci de signer la déclaration pour envoyer votre demande.");
      return;
    }

    setState("sending");
    const result = await postJson<{ soumis: boolean; message: string }>("/api/public/rights-requests", {
      ...(slug.trim() !== "" ? { slug: slug.trim().replace(/^.*\/profils\//, "") } : {}),
      ...(slug.trim() === "" && nomProfil.trim() !== "" ? { nomProfil: nomProfil.trim() } : {}),
      type,
      requesterName: requesterName.trim(),
      ...(requesterContact.trim() !== "" ? { requesterContact: requesterContact.trim() } : {}),
      description: description.trim(),
      declaration: true,
      siteWeb: honeypotRef.current?.value ?? "",
    });
    if (!result.ok) {
      setState("idle");
      setError(result.error.message);
      return;
    }
    setState("sent");
    toast.success("Demande enregistrée.");
  }

  if (state === "sent") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center" role="status">
        <ShieldCheck aria-hidden="true" className="mx-auto h-8 w-8 text-emerald-700" />
        <h2 className="mt-3 font-display text-lg font-semibold text-emerald-900">
          Votre demande est enregistrée
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-900/85">
          L&apos;équipe va la traiter avec soin. Elle peut vous contacter via le moyen que vous
          avez indiqué si un complément est utile. Vous recevrez une réponse explicative.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        Conformément à notre politique de confidentialité, vous pouvez demander l&apos;accès à vos
        données, leur correction, le retrait de la publication de votre profil, l&apos;effacement de
        votre dossier ou le retrait de votre consentement. Chaque demande est enregistrée, suivie
        et fait l&apos;objet d&apos;une décision explicative.
      </p>

      <div className="grid gap-1.5">
        <Label htmlFor="droits-slug">Lien de la fiche concernée (si vous le connaissez)</Label>
        <Input
          id="droits-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          maxLength={200}
          className="min-h-11"
          placeholder="Ex. : /profils/mariam-a — ou laissez vide"
        />
      </div>

      {slug.trim() === "" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="droits-nom">Nom de la personne concernée</Label>
          <Input
            id="droits-nom"
            value={nomProfil}
            onChange={(event) => setNomProfil(event.target.value)}
            maxLength={150}
            className="min-h-11"
            placeholder="Nom public ou nom d'usage"
          />
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="droits-type">Type de demande *</Label>
        <Select value={type} onValueChange={setType} disabled={state === "sending"}>
          <SelectTrigger id="droits-type" className="min-h-11 bg-card" aria-required="true">
            <SelectValue placeholder="Choisir un type de demande" />
          </SelectTrigger>
          <SelectContent>
            {RIGHTS_REQUEST_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {RIGHTS_REQUEST_TYPE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="droits-nom-demandeur">Votre nom *</Label>
        <Input
          id="droits-nom-demandeur"
          value={requesterName}
          onChange={(event) => setRequesterName(event.target.value)}
          maxLength={120}
          className="min-h-11"
          autoComplete="name"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="droits-contact">Votre contact (facultatif — confidentiel)</Label>
        <Input
          id="droits-contact"
          value={requesterContact}
          onChange={(event) => setRequesterContact(event.target.value)}
          maxLength={200}
          className="min-h-11"
          placeholder="Téléphone ou adresse e-mail — sert uniquement au traitement de la demande"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="droits-description">Votre demande *</Label>
        <Textarea
          id="droits-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={3000}
          rows={5}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {descriptionCount} / 3000 caractères (20 au minimum)
        </p>
      </div>

      {/* Honeypot : invisible pour les personnes, rempli par les robots. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Site web
          <input type="text" name="siteWeb" tabIndex={-1} autoComplete="off" ref={honeypotRef} />
        </label>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="droits-declaration"
          checked={declaration}
          onCheckedChange={(checked) => setDeclaration(checked === true)}
          disabled={state === "sending"}
          className="mt-0.5"
          aria-required="true"
        />
        <Label htmlFor="droits-declaration" className="text-sm font-normal leading-relaxed">
          Je déclare agir de bonne foi : les informations transmises sont exactes à ma
          connaissance et je suis la personne concernée (ou son représentant légal). *
        </Label>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto sm:justify-self-start"
        disabled={state === "sending"}
        onClick={() => void handleSubmit()}
      >
        {state === "sending" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Envoyer la demande
      </Button>
    </div>
  );
}
