// ---------------------------------------------------------------------------
// Hachage et validation des mots de passe administrateurs.
// scrypt (node:crypto) — format stocké : "scrypt:<salt hex>:<hash hex>".
// Comparaison en temps constant via timingSafeEqual.
// ---------------------------------------------------------------------------

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16; // 128 bits
const KEY_LENGTH = 64; // 512 bits
const FORMAT_PREFIX = "scrypt";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${FORMAT_PREFIX}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Vérifie un mot de passe contre une empreinte stockée.
 * Toujours temps constant ; retourne false en cas de format invalide.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const [prefix, saltHex, hashHex] = parts;
    if (prefix !== FORMAT_PREFIX || !saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(password, salt, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface PasswordStrengthResult {
  ok: boolean;
  errors: string[];
}

/** Politique : minimum 12 caractères, au moins une lettre et un chiffre. */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];
  if (typeof password !== "string" || password.length < 12) {
    errors.push("Le mot de passe doit contenir au moins 12 caractères.");
  }
  if (typeof password !== "string" || !/[a-zA-Z]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins une lettre.");
  }
  if (typeof password !== "string" || !/[0-9]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins un chiffre.");
  }
  return { ok: errors.length === 0, errors };
}
