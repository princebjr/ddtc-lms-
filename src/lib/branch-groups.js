import { useCallback, useState } from 'react';

// Learners grouped by branch (Phase 10.1, ADR-016; owner request and answers of 2026-11-10; D42):
// lists of learners for lecturers and administrators open grouped by branch, branches in alphabetical
// order and "No branch" last, each with its count; grouping can be switched off, and the choice is
// remembered in this browser (a convenience only: nothing depends on it).

export const NO_BRANCH_LABEL = 'No branch';
const STORAGE_KEY = 'ddtc.groupByBranch';

/**
 * Splits rows into branch groups, keeping each group's rows in their given order.
 * @template {{ branch_name: string | null }} Row
 * @param {Row[]} rows
 * @returns {Array<{ branch: string, rows: Row[] }>}
 */
export function groupByBranch(rows) {
  /** @type {Map<string, Row[]>} */
  const groups = new Map();
  for (const r of rows) {
    const key = r.branch_name?.trim() || NO_BRANCH_LABEL;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return [...groups]
    .map(([branch, list]) => ({ branch, rows: list }))
    .sort((a, b) => (a.branch === NO_BRANCH_LABEL ? 1 : b.branch === NO_BRANCH_LABEL ? -1 : a.branch.localeCompare(b.branch, 'en-GB')));
}

/** Rows ordered branch by branch ("No branch" last), names within a branch as given. @template {{ branch_name: string | null }} Row @param {Row[]} rows */
export function sortByBranch(rows) {
  return groupByBranch(rows).flatMap((g) => g.rows);
}

/** Whether lists are grouped by branch: on unless this browser chose otherwise. @returns {[boolean, (on: boolean) => void]} */
export function useGroupByBranch() {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const set = useCallback((/** @type {boolean} */ next) => {
    setOn(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // storage unavailable (private window): the choice lasts for this page only
    }
  }, []);
  return [on, set];
}
