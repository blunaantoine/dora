// ---------------------------------------------------------------------------
// Paramètres applicatifs (table Setting : clé → valeur JSON string).
// Les valeurs absentes en base retombent sur DEFAULT_SETTINGS (typées).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { DEFAULT_SETTINGS, type SettingKey, type SettingValue } from "@/lib/constants";

/**
 * Lit un paramètre. Si la clé est inconnue en base mais présente dans
 * DEFAULT_SETTINGS, retourne la valeur par défaut (cast typé et validé).
 */
export async function getSetting(key: string): Promise<SettingValue> {
  try {
    const row = await db.setting.findUnique({ where: { key } });
    if (row) {
      const parsed = safeParse(row.value);
      if (parsed !== undefined) return parsed;
      return row.value; // valeur brute si non JSON
    }
  } catch (error) {
    console.error(`[settings] Échec de lecture du paramètre « ${key} » :`, error);
  }
  const fallbackKey = key as SettingKey;
  return key in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[fallbackKey] : "";
}

/**
 * Écrit un paramètre (valeur sérialisée en JSON en base).
 */
export async function setSetting(key: string, value: SettingValue): Promise<void> {
  const serialized = JSON.stringify(value);
  await db.setting.upsert({
    where: { key },
    create: { key, value: serialized },
    update: { value: serialized },
  });
}

/**
 * Retourne tous les paramètres effectifs : valeurs par défaut fusionnées
 * avec les valeurs persistées en base.
 */
export async function getAllSettings(): Promise<Record<string, SettingValue>> {
  const merged: Record<string, SettingValue> = { ...DEFAULT_SETTINGS };
  try {
    const rows = await db.setting.findMany();
    for (const row of rows) {
      const parsed = safeParse(row.value);
      merged[row.key] = parsed !== undefined ? parsed : row.value;
    }
  } catch (error) {
    console.error("[settings] Échec de lecture des paramètres :", error);
  }
  return merged;
}

function safeParse(raw: string): SettingValue | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
