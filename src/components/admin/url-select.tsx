"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface UrlSelectOption {
  value: string;
  label: string;
}

// Select synchronisé avec l'URL (filtres de listes admin) : modifie un
// paramètre de requête, réinitialise la pagination et navigue réellement.
export function UrlSelect({
  param,
  label,
  allValue,
  allLabel,
  options,
  value,
  triggerClassName,
}: {
  param: string;
  label: string;
  allValue: string;
  allLabel: string;
  options: UrlSelectOption[];
  value: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === allValue) {
      params.delete(param);
    } else {
      params.set(param, next);
    }
    params.delete("page");
    startTransition(() => {
      router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Select value={value} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger
          aria-label={label}
          className={triggerClassName ?? "w-[220px] bg-card"}
          size="default"
        >
          {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allValue}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
