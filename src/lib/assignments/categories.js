// Grade categories while editing (D12): the running total of the weights as typed, and what to fix
// before saving. Saving is allowed at any total; releasing grades needs exactly 100 (Phase 9, checked
// by the database). The server checks the same rules again.

/** @typedef {{ id?: string, name: string, weight: string }} CategoryDraft */

/** @param {CategoryDraft[]} rows */
export function weightTotal(rows) {
  return rows.reduce((sum, r) => sum + (/^\d+$/.test(r.weight.trim()) ? Number(r.weight) : 0), 0);
}

/** @param {CategoryDraft[]} rows @returns {string | null} */
export function categoriesProblem(rows) {
  if (!rows.length) return 'Keep at least one category';
  if (rows.length > 10) return 'Use at most 10 categories';
  if (rows.some((r) => !r.name.trim())) return 'Give each category a name';
  if (rows.some((r) => r.name.trim().length > 80)) return 'Use 80 characters or fewer for a name';
  const names = rows.map((r) => r.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Two categories cannot share a name';
  if (rows.some((r) => !/^\d+$/.test(r.weight.trim()) || Number(r.weight) > 100)) return 'Each weight is a whole number from 0 to 100';
  return null;
}
