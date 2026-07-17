/**
 * Normaliserer et søk før cache-nøkkelbygging, slik at " The  MATRIX " og
 * "the matrix" treffer samme cache-oppføring.
 */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}
