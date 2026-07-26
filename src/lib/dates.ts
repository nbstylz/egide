/** Saisie et lecture des dates au format français, partagées par les écrans. */

/** « JJ/MM/AAAA » → « AAAA-MM-JJ », ou null si la date est invalide. */
export function parseFrenchDate(text: string): string | null {
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const valid =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);
  if (!valid) return null;
  return `${year}-${month}-${day}`;
}

/** Insère automatiquement les « / » pendant la saisie d'une date. */
export function maskDateInput(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Date du jour au format ISO « AAAA-MM-JJ ». */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dernier jour du mois en cours, au format ISO. */
export function endOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/** Date dans `days` jours, au format ISO. */
export function inDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
