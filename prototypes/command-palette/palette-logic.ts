// PROTOTYPE — throwaway. Lives on branch prototype/command-palette only; never merge.
//
// The pure part of the Command Palette prototype: Frecency, Inline Completion and
// row order, exactly as recommended in "How should Inline Completion rank and
// complete URLs?" (kfriars/arcfari#7). No DOM in here: the page calls in, nothing
// calls out. The real engine is Swift, so this is a reference, not a lift.

export type Visit = { t: number; typed: boolean }; // t: unix seconds

export type Page = {
  key: string; // lowercased url, no scheme, no www., no #fragment, no trailing /
  url: string; // the recorded url (real scheme, www. kept)
  title: string;
  site: string; // key up to the first / ? #
  visits: Visit[]; // at most the 10 most recent, oldest first
  visitCount: number;
  typedCount: number;
  lastVisit: number;
  lastTypedVisit: number; // 0 if never typed
  score: number; // Frecency S at load (or after the last visit)
  hay: string; // key + " " + lowercased title, for word-start matching
};

export type Tab = { id: number; url: string; title: string; key: string };

const DAY = 86400;
const LAMBDA = Math.LN2 / (30 * DAY);
const SEP = /[\/?#]/;

// ---------- keys ----------

export function toKey(url: string): string {
  let k = url.trim().toLowerCase();
  k = k.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  k = k.replace(/^www\./, "");
  k = k.replace(/#.*$/, "");
  k = k.replace(/\/+$/, "");
  return k;
}

export function siteOf(key: string): string {
  const i = key.search(SEP);
  return i === -1 ? key : key.slice(0, i);
}

/** What the user typed, reduced to the same shape as a key, for prefix matching. */
export function toQuery(typed: string): string {
  let q = typed.toLowerCase();
  q = q.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  q = q.replace(/^www\./, "");
  return q;
}

// ---------- Frecency ----------

export function frecency(p: Pick<Page, "visits" | "visitCount">, now: number): number {
  const recent = p.visits.slice(-10);
  const n = recent.length;
  if (n === 0) return 0;
  let sum = 0;
  for (const v of recent) sum += (v.typed ? 100 : 50) * Math.exp(-LAMBDA * Math.max(0, now - v.t));
  return (sum / n) * Math.max(p.visitCount, n);
}

export function makePage(
  url: string,
  title: string,
  visits: Visit[],
  visitCount: number,
  typedCount: number,
  now: number,
): Page {
  const key = toKey(url);
  const recent = visits.slice(-10);
  const lastVisit = recent.length ? recent[recent.length - 1].t : 0;
  let lastTypedVisit = 0;
  for (const v of recent) if (v.typed) lastTypedVisit = Math.max(lastTypedVisit, v.t);
  const page: Page = {
    key,
    url,
    title,
    site: siteOf(key),
    visits: recent,
    visitCount,
    typedCount,
    lastVisit,
    lastTypedVisit,
    score: 0,
    hay: key + " " + title.toLowerCase(),
  };
  page.score = frecency(page, now);
  return page;
}

/** Record one Visit into the in-memory history (the prototype has no persistence). */
export function recordVisit(pages: Page[], byKey: Map<string, Page>, url: string, title: string, typed: boolean, now: number): Page {
  const key = toKey(url);
  let p = byKey.get(key);
  if (!p) {
    p = makePage(url, title || key, [], 0, 0, now);
    pages.push(p);
    byKey.set(key, p);
  }
  p.visits = [...p.visits, { t: now, typed }].slice(-10);
  p.visitCount += 1;
  if (typed) {
    p.typedCount += 1;
    p.lastTypedVisit = now;
  }
  p.lastVisit = now;
  p.url = url;
  if (title) p.title = title;
  p.hay = p.key + " " + p.title.toLowerCase();
  p.score = frecency(p, now);
  return p;
}

// ---------- Inline Completion ----------

export type StepCandidate = {
  step: string; // the text the step would append
  full: string; // query + step
  score: number; // summed Frecency of the pages under it
  pages: number;
  isSite: boolean;
  floorOk: boolean;
  floorWhy: string;
};

export type Completion = {
  suffix: string; // "" when nothing to complete
  full: string; // normalized address the completion reaches
  reason: string;
  candidates: StepCandidate[];
};

export type CompleteOptions = {
  /** Path steps may follow a bare site (true after a Tab when "Tab drills down" is on). */
  allowPathAfterBareSite: boolean;
  /** The completion shown before this keystroke; kept while the user types along it. */
  previousFull: string | null;
};

const NONE = (reason: string, candidates: StepCandidate[] = []): Completion => ({ suffix: "", full: "", reason, candidates });

/** The step a candidate would add: skip leading / ? #, then stop before the next one. */
export function stepOf(rest: string): string {
  let i = 0;
  while (i < rest.length && SEP.test(rest[i])) i++;
  const lead = rest.slice(0, i);
  const after = rest.slice(i);
  const j = after.search(SEP);
  const body = j === -1 ? after : after.slice(0, j);
  return body ? lead + body : "";
}

/** The floor for the site step, from the site's own pages (all pages under one site step share it). */
function siteFloor(g: { visits: number; last: number; lastTyped: number }, now: number): { ok: boolean; why: string } {
  const cutoff = now - 90 * DAY;
  if (g.lastTyped >= cutoff) return { ok: true, why: "typed in the last 90 days" };
  if (g.visits >= 4 && g.last >= cutoff) return { ok: true, why: `${g.visits} visits, one in the last 90 days` };
  if (g.last < cutoff) return { ok: false, why: "no visit in the last 90 days" };
  return { ok: false, why: `never typed, only ${g.visits} visit${g.visits === 1 ? "" : "s"}` };
}

export function complete(typed: string, pages: Page[], now: number, opts: CompleteOptions): Completion {
  if (!typed) return NONE("empty");
  if (/\s/.test(typed)) return NONE("has a space: never completes");
  const q = toQuery(typed);
  if (!q) return NONE("only a scheme or www. so far");

  // Keep the same completion while the user types along it.
  if (opts.previousFull && opts.previousFull.startsWith(q) && opts.previousFull.length > q.length) {
    const suffix = opts.previousFull.slice(q.length);
    return { suffix, full: opts.previousFull, reason: "kept: you're typing along it", candidates: [] };
  }

  const qHasSep = SEP.test(q);
  const groups = new Map<string, { score: number; pages: number; visits: number; last: number; lastTyped: number }>();
  for (const p of pages) {
    if (p.key.length <= q.length || !p.key.startsWith(q)) continue;
    const step = stepOf(p.key.slice(q.length));
    if (!step) continue;
    const g = groups.get(step);
    if (g) {
      g.score += p.score;
      g.pages += 1;
      g.visits += p.visitCount;
      if (p.lastVisit > g.last) g.last = p.lastVisit;
      if (p.lastTypedVisit > g.lastTyped) g.lastTyped = p.lastTypedVisit;
    } else groups.set(step, { score: p.score, pages: 1, visits: p.visitCount, last: p.lastVisit, lastTyped: p.lastTypedVisit });
  }
  if (groups.size === 0) return NONE("nothing in this Profile's history starts with that");

  const candidates: StepCandidate[] = [];
  for (const [step, g] of groups) {
    const lead = SEP.test(step[0]);
    const isSite = !qHasSep && !lead;
    const pathAfterBareSite = !qHasSep && lead;
    let floorOk = true;
    let floorWhy = "";
    if (isSite) {
      const f = siteFloor(g, now);
      floorOk = f.ok;
      floorWhy = f.why;
    } else if (pathAfterBareSite && !opts.allowPathAfterBareSite) {
      floorOk = false;
      floorWhy = "path steps wait for a typed /";
    }
    candidates.push({ step, full: q + step, score: g.score, pages: g.pages, isSite, floorOk, floorWhy });
  }
  candidates.sort((a, b) => b.score - a.score || a.step.length - b.step.length);

  const best = candidates.find((c) => c.floorOk);
  if (!best) return NONE(candidates[0].floorWhy ? `best step held back: ${candidates[0].floorWhy}` : "no step passes", candidates);
  return {
    suffix: best.step,
    full: best.full,
    reason: best.isSite ? `site step (${best.floorWhy})` : "path step",
    candidates,
  };
}

/** Where Enter goes for a completed or typed address: the recorded url, else https:// + text. */
export function resolveAddress(full: string, byKey: Map<string, Page>, pages: Page[]): string {
  const exact = byKey.get(full);
  if (exact) return exact.url;
  const site = siteOf(full);
  const sitePage = pages.find((p) => p.site === site);
  if (sitePage) {
    const m = sitePage.url.match(/^([a-z][a-z0-9+.-]*:\/\/)(www\.)?/i);
    if (m) return m[1] + (m[2] ?? "") + full;
  }
  return "https://" + full;
}

// ---------- Rows ----------

export type Engine = { name: string; searchUrl: (q: string) => string; resultsPage: RegExp };

export const ENGINES: Record<"kagi" | "google", Engine> = {
  kagi: {
    name: "Kagi",
    searchUrl: (q) => "https://kagi.com/search?q=" + encodeURIComponent(q),
    resultsPage: /^kagi\.com\/search\?/,
  },
  google: {
    name: "Google",
    searchUrl: (q) => "https://www.google.com/search?q=" + encodeURIComponent(q),
    resultsPage: /^google\.[a-z.]+\/search\?/,
  },
};

export type RowKind = "complete" | "go" | "search" | "tab" | "history" | "suggestion";

export type Row = {
  kind: RowKind;
  title: string;
  url: string; // where acting on it goes ("" for a suggestion until resolved)
  display: string; // url as shown
  site: string;
  score: number;
  query?: string; // for search / suggestion
  tabId?: number;
};

export function isUrlLike(input: string): boolean {
  const s = input.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+/i.test(s)) return true;
  if (/^localhost(:\d+)?([\/?#].*)?$/i.test(s)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?([\/?#].*)?$/.test(s)) return true;
  return /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([\/?#].*)?$/i.test(s);
}

/** Chromium never sends these to a suggestion service: they may be private. */
export function mayFetchSuggestions(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  if (isUrlLike(s)) return false;
  return !/[\/?@]|:\d|^[a-z][a-z0-9+.-]*:/i.test(s);
}

export function matchesTerms(hay: string, terms: string[]): boolean {
  for (const t of terms) {
    let i = hay.indexOf(t);
    let hit = false;
    while (i !== -1) {
      if (i === 0 || !/[a-z0-9]/.test(hay[i - 1])) {
        hit = true;
        break;
      }
      i = hay.indexOf(t, i + 1);
    }
    if (!hit) return false;
  }
  return true;
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

export type RowInput = {
  typed: string;
  completion: Completion;
  pages: Page[];
  byKey: Map<string, Page>;
  tabs: Tab[];
  engine: Engine;
  suggestions: string[];
  suggestionsBeforeHistory: boolean;
};

export function buildRows(i: RowInput): Row[] {
  const typed = i.typed.trim();
  if (!typed) return [];
  const rows: Row[] = [];
  const taken = new Set<string>();

  // 1. One default row.
  if (i.completion.suffix) {
    const url = resolveAddress(i.completion.full, i.byKey, i.pages);
    const page = i.byKey.get(i.completion.full);
    rows.push({ kind: "complete", title: page?.title || i.completion.full, url, display: displayUrl(url), site: siteOf(i.completion.full), score: page?.score ?? 0 });
    taken.add(toKey(url));
  } else if (isUrlLike(typed)) {
    const full = toKey(typed);
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : resolveAddress(full, i.byKey, i.pages);
    rows.push({ kind: "go", title: displayUrl(url), url, display: displayUrl(url), site: siteOf(full), score: i.byKey.get(full)?.score ?? 0 });
    taken.add(toKey(url));
  } else {
    rows.push({ kind: "search", title: typed, url: i.engine.searchUrl(typed), display: `Search ${i.engine.name}`, site: "", score: 0, query: typed });
  }

  const terms = typed.toLowerCase().split(/\s+/).filter(Boolean).map((t) => toQuery(t)).filter(Boolean);

  // 2. Open tabs: up to 3, by Frecency.
  const tabRows = i.tabs
    .filter((t) => matchesTerms(t.key + " " + t.title.toLowerCase(), terms))
    .map((t) => ({ t, score: i.byKey.get(t.key)?.score ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ t, score }): Row => ({ kind: "tab", title: t.title, url: t.url, display: displayUrl(t.url), site: siteOf(t.key), score, tabId: t.id }));
  for (const r of tabRows) taken.add(toKey(r.url));

  // 3. History: up to 4, by Frecency; every term at a word start in the url or title.
  //    (i.pages is kept sorted by score, highest first, so the first four hits win.)
  const hist: Page[] = [];
  for (const p of i.pages) {
    if (!matchesTerms(p.hay, terms)) continue;
    if (taken.has(p.key) || i.engine.resultsPage.test(p.key)) continue;
    hist.push(p);
    if (hist.length === 4) break;
  }
  hist.sort((a, b) => b.score - a.score);
  const histRows = hist.slice(0, 4).map((p): Row => ({ kind: "history", title: p.title || p.key, url: p.url, display: displayUrl(p.url), site: p.site, score: p.score }));

  // 4. Search suggestions in the remaining rows, up to 4.
  const lowered = typed.toLowerCase();
  const sugRows = i.suggestions
    .filter((s) => s.toLowerCase() !== lowered)
    .slice(0, 4)
    .map((s): Row => ({ kind: "suggestion", title: s, url: i.engine.searchUrl(s), display: `Search ${i.engine.name}`, site: "", score: 0, query: s }));

  rows.push(...tabRows);
  if (i.suggestionsBeforeHistory) rows.push(...sugRows, ...histRows);
  else rows.push(...histRows, ...sugRows);
  return rows.slice(0, 10);
}

/** Sites ranked by summed Frecency, for an empty-input view. */
export function topSites(pages: Page[], n: number, engine: Engine): { site: string; url: string; title: string; score: number }[] {
  const by = new Map<string, { score: number; best: Page }>();
  for (const p of pages) {
    if (engine.resultsPage.test(p.key)) continue;
    const g = by.get(p.site);
    if (g) {
      g.score += p.score;
      if (p.key === p.site || (g.best.key !== g.best.site && p.score > g.best.score)) g.best = p;
    } else by.set(p.site, { score: p.score, best: p });
  }
  return [...by.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, n)
    .map(([site, g]) => ({ site, url: g.best.key === site ? g.best.url : "https://" + site, title: g.best.key === site ? g.best.title : site, score: g.score }));
}
