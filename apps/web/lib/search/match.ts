/**
 * Matching for the merchant panel search (Ctrl+K). Pure: no React, no fetch.
 *
 * Entries come from `panel-index.json` (one per feature, with Spanish
 * keywords and synonyms). Matching is accent-insensitive, tolerates one typo
 * per word (from 4 letters on) and ranks exact keyword hits first.
 */

export type SearchEntry = {
  id: string
  title: string
  /** One line: what the screen does or where the action lives. */
  description: string
  /** Panel route, optionally with a deep link (`?nueva=1`, `?segment=...`), or an https URL. */
  href: string
  group: string
  keywords: string[]
  /** Only offered to programs of this type. */
  program?: "stamps" | "points"
}

export type SearchHit = { entry: SearchEntry; score: number }

/** Lowercase, no accents, single spaces. "Notificación Push" → "notificacion push". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s{}._@+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * One typo away? Insertion, deletion, substitution or a swapped pair
 * (optimal string alignment distance ≤ 1). Words are short, so the full
 * table is cheap.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  const prev2: number[] = []
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1)
      }
      cur[j] = d
    }
    prev2.splice(0, prev2.length, ...prev)
    prev = cur
  }
  return prev[b.length] <= 1
}

const EXACT_KEYWORD = 10
const PREFIX = 6
const CONTAINS = 4
const FUZZY = 3

/** Best score of one query token against one entry (0 = no match). */
function tokenScore(
  token: string,
  entry: { keywords: string[]; words: string[]; text: string },
): number {
  let best = 0
  for (const k of entry.keywords) {
    if (k === token) return EXACT_KEYWORD
    if (k.startsWith(token)) best = Math.max(best, PREFIX)
  }
  for (const w of entry.words) {
    if (w === token) best = Math.max(best, EXACT_KEYWORD - 1)
    else if (w.startsWith(token)) best = Math.max(best, PREFIX)
  }
  if (best === 0 && token.length >= 3 && entry.text.includes(token)) best = CONTAINS
  if (best === 0 && token.length >= 4) {
    for (const w of entry.words) {
      if (withinOneEdit(token, w)) {
        best = FUZZY
        break
      }
    }
  }
  return best
}

type Prepared = { entry: SearchEntry; keywords: string[]; words: string[]; text: string }

export function prepare(entries: SearchEntry[]): Prepared[] {
  return entries.map((entry) => {
    const keywords = entry.keywords.map(normalize)
    const text = normalize(`${entry.title} ${entry.description} ${entry.keywords.join(" ")}`)
    const words = [...new Set(text.split(" ").filter(Boolean))]
    return { entry, keywords, words, text }
  })
}

/**
 * Rank entries for a query. Every token must match something; entries hit by
 * exact keywords come first. Empty query → nothing (the UI shows shortcuts).
 */
export function searchEntries(
  prepared: Prepared[],
  query: string,
  opts: { program?: "stamps" | "points" | null; limit?: number } = {},
): SearchHit[] {
  const tokens = normalize(query).split(" ").filter(Boolean)
  if (tokens.length === 0) return []
  const limit = opts.limit ?? 8
  const hits: SearchHit[] = []
  for (const p of prepared) {
    if (p.entry.program && opts.program && p.entry.program !== opts.program) continue
    let score = 0
    let matched = 0
    for (const t of tokens) {
      const s = tokenScore(t, p)
      if (s > 0) {
        matched++
        score += s
      }
    }
    if (matched === 0) continue
    // Partial matches of a multi-word query rank below full ones.
    if (matched < tokens.length) score = score / (tokens.length - matched + 1) - 1
    if (score > 0) hits.push({ entry: p.entry, score })
  }
  hits.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "es"))
  return hits.slice(0, limit)
}
