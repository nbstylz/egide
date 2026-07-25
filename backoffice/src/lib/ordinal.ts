/** Rang en français : 1 → « 1er », 2 → « 2e », 3 → « 3e »… */
export function ordinalFr(position: number): string {
  return position === 1 ? '1er' : `${position}e`;
}
