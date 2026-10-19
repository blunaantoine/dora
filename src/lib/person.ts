// ---------------------------------------------------------------------------
// Utilitaires « personne » : calcul de la minorité (§14 — protection des
// mineures). La date de naissance complète n'est PAS stockée (minimisation) :
// seule l'année de naissance l'est ; le flag isMinor est calculé une fois
// (à la création du dossier, éventuellement à partir d'une date exacte fournie
// par l'administrateur) puis réévalué de manière CONSERVATRICE à la lecture :
// en cas d'ambiguïté (anniversaire non passé), la personne est considérée
// comme mineure — le sens de la protection prime.
// ---------------------------------------------------------------------------

/** Âge révolu à partir d'une date de naissance exacte. */
export function computeExactAgeYears(birthDate: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Minorité à partir de l'année de naissance seule : règle conservatrice.
 * `now.getFullYear() - année <= 18` signifie que la personne a au plus 18 ans
 * révolus depuis moins d'un an — en cas de doute, on la traite comme mineure.
 */
export function computeIsMinorFromYear(birthYear: number, now: Date = new Date()): boolean {
  if (!Number.isInteger(birthYear) || birthYear <= 1900 || birthYear > now.getFullYear()) {
    return false;
  }
  return now.getFullYear() - birthYear <= 18;
}

/**
 * Minorité à partir d'une date de naissance exacte (fournie à la création par
 * l'administrateur ; seule l'année est ensuite conservée en base).
 */
export function computeIsMinorFromDate(birthDate: Date, now: Date = new Date()): boolean {
  const year = birthDate.getFullYear();
  if (year <= 1900 || year > now.getFullYear()) return false;
  return computeExactAgeYears(birthDate, now) < 18;
}

interface MinorSource {
  birthYear?: number | null;
  isMinor: boolean;
}

/**
 * Est-mineure « effective » utilisée par l'API publique : le flag administratif
 * `isMinor` prime, et la réévaluation conservatrice à partir de l'année ne peut
 * que renforcer la protection (jamais la retirer).
 */
export function computeEffectiveIsMinor(person: MinorSource, now: Date = new Date()): boolean {
  if (person.isMinor) return true;
  if (typeof person.birthYear === "number") {
    return computeIsMinorFromYear(person.birthYear, now);
  }
  return false;
}

/** Initiale du nom de famille affichable dans le formulaire invité (ex. « M. »). */
export function nameInitial(familyName?: string | null, fallback?: string | null): string | null {
  const source = familyName?.trim() || fallback?.trim() || "";
  const first = source.charAt(0).toUpperCase();
  return first ? `${first}.` : null;
}
