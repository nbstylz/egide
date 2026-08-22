/** Utilitaires d'export de données (téléchargement côté navigateur). */

/** Échappe un champ CSV : séparateur « ; », guillemets doublés si besoin. */
function csvField(value: string | number): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Construit un CSV (séparateur point-virgule, BOM UTF-8 + fins de ligne CRLF
 * pour qu'Excel FR l'ouvre proprement avec les accents) et déclenche son
 * téléchargement.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(';'));
  const content = '﻿' + lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Transforme un libellé en fragment de nom de fichier sûr (sans accents). */
export function slugForFile(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
