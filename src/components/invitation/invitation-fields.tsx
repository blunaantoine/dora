"use client";

// ---------------------------------------------------------------------------
// Champs de formulaire réutilisables du parcours invité (§7.1 : libellés
// explicites, distinction obligatoire/facultatif, messages d'erreur
// compréhensibles, WCAG 2.2 AA — aria-describedby, aria-invalid).
// ---------------------------------------------------------------------------

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Message d'erreur de champ, lié au contrôle par id (aria-describedby). */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}

interface BaseFieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  showCount?: boolean;
  value: string;
}

function useFieldIds(error?: string) {
  const generatedId = useId();
  const describedBy = [error ? `${generatedId}-error` : null].filter(Boolean).join(" ") || undefined;
  return { generatedId, describedBy };
}

function FieldFrame({
  htmlFor,
  label,
  hint,
  required,
  error,
  showCount,
  value,
  maxLength,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  showCount?: boolean;
  value: string;
  maxLength?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium leading-snug">
        {label}
        {required ? (
          <span className="ml-1 font-semibold text-destructive" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(facultatif)</span>
        )}
        {required ? <span className="sr-only"> (obligatoire)</span> : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {showCount && maxLength ? (
        <p className="text-right text-xs tabular-nums text-muted-foreground" aria-hidden="true">
          {value.length} / {maxLength}
        </p>
      ) : null}
      <FieldErrorWithHint htmlFor={htmlFor} error={error} />
    </div>
  );
}

/** Erreur affichée sous le champ ; le hint d'aria est fourni par le contrôle. */
function FieldErrorWithHint({ htmlFor, error }: { htmlFor: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-destructive">
      {error}
    </p>
  );
}

export function LabeledInput({
  label,
  hint,
  required,
  error,
  disabled,
  maxLength,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
}: BaseFieldProps & {
  onChange: (value: string) => void;
  type?: "text" | "tel" | "email";
  autoComplete?: string;
  placeholder?: string;
}) {
  const { generatedId, describedBy } = useFieldIds(error);
  return (
    <FieldFrame
      htmlFor={generatedId}
      label={label}
      hint={hint}
      required={required}
      error={error}
      value={value}
      maxLength={maxLength}
      showCount={false}
    >
      <Input
        id={generatedId}
        name={generatedId}
        type={type}
        inputMode={type === "text" ? undefined : type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${generatedId}-hint` : null, describedBy].filter(Boolean).join(" ") || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn("min-h-11 bg-white", error && "border-destructive aria-invalid:border-destructive")}
      />
    </FieldFrame>
  );
}

export function LabeledTextarea({
  label,
  hint,
  required,
  error,
  disabled,
  maxLength,
  showCount = true,
  value,
  onChange,
  rows = 5,
  placeholder,
}: BaseFieldProps & {
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const { generatedId, describedBy } = useFieldIds(error);
  return (
    <FieldFrame
      htmlFor={generatedId}
      label={label}
      hint={hint}
      required={required}
      error={error}
      value={value}
      maxLength={maxLength}
      showCount={showCount && Boolean(maxLength)}
    >
      <Textarea
        id={generatedId}
        name={generatedId}
        rows={rows}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? `${generatedId}-hint` : null, describedBy].filter(Boolean).join(" ") || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn("min-h-11 bg-white", error && "border-destructive aria-invalid:border-destructive")}
      />
    </FieldFrame>
  );
}
