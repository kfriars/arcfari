// PROTOTYPE — throwaway. The page around the Command Palette: a fake Safari Window,
// the keys, the variant switcher, and the "Why" panel that shows what the logic decided.

import {
  ENGINES,
  buildRows,
  complete,
  displayUrl,
  makePage,
  mayFetchSuggestions,
  recordVisit,
  siteOf,
  toKey,
  topSites,
  type Completion,
  type Engine,
  type Page,
  type Row,
  type Tab,
} from "./palette-logic";
import { ORDER, VARIANTS, esc, type Mounted, type Variant, type VM } from "./variants";

type Packed = { n: number; name: string; engine: "kagi" | "google"; pages: [string, string, number, number, number[]][]; tabs: { id: number; url: string; title: string }[]; iconSites: string[]; stats: Record<string, number> };

type Prof = {
  n: number;
  name: string;
  color: string;
  engineId: "kagi" | "google";
  engine: Engine;
  pages: Page[];
  byKey: Map<string, Page>;
  tabs: Tab[];
  current: number; // tab id
  iconSites: Set<string>;
  stats: Record<string, number>;
};

const now = () => Math.floor(Date.now() / 1000);
const data = await (await fetch("/api/data")).json();
let nextTabId = 100000;

const profiles: Prof[] = (data.profiles as Packed[]).map((p, i) => {
  const t = now();
  const pages = p.pages.map(([url, title, count, typed, vs]) =>
    makePage(url, title, vs.map((v) => ({ t: Math.floor(v / 2), typed: (v & 1) === 1 })), count, typed, t),
  );
  pages.sort((a, b) => b.score - a.score);
  const tabs = p.tabs.map((x) => ({ id: x.id, url: x.url, title: x.title, key: toKey(x.url) }));
  return {
    n: p.n,
    name: p.name,
    color: data.colors[i % data.colors.length],
    engineId: p.engine,
    engine: ENGINES[p.engine],
    pages,
    byKey: new Map(pages.map((pg) => [pg.key, pg])),
    tabs,
    current: tabs[0]?.id ?? -1,
    iconSites: new Set(p.iconSites),
    stats: p.stats,
  };
});

// ---------- state ----------

const params = new URLSearchParams(location.search);
const S = {
  variant: (ORDER as readonly string[]).includes((params.get("variant") ?? "A").toUpperCase()) ? ((params.get("variant") ?? "A").toUpperCase() as Variant["key"]) : "A",
  active: profiles[0],
  open: false,
  mode: "t" as "t" | "l",
  typed: "",
  suffix: "",
  full: "",
  completion: { suffix: "", full: "", reason: "closed", candidates: [] } as Completion,
  rows: [] as Row[],
  selected: 0,
  sug: { q: "", items: [] as string[], status: "idle" },
  knobs: { drill: false, sugFirst: false, live: !data.offline },
  backdrop: "page" as "page" | "start",
  why: params.has("why"),
  last: "",
  lastInputType: "",
  ms: 0,
};

let mounted: { key: string; m: Mounted } | null = null;
const $ = (s: string) => document.querySelector<HTMLElement>(s)!;
const root = $("#palette");
const scrim = $("#scrim");

// ---------- icons ----------

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function icon(site: string, size: number): string {
  const p = S.active;
  const box = `width:${size}px;height:${size}px`;
  if (site && p.iconSites.has(site)) return `<img class="fav" style="${box}" src="/api/favicon?p=${p.n}&site=${encodeURIComponent(site)}" alt="">`;
  const letter = (site.replace(/^www\./, "")[0] ?? "•").toUpperCase();
  return `<span class="mono" style="${box};font-size:${Math.round(size * 0.55)}px;background:hsl(${hue(site)} 42% 52%)">${esc(letter)}</span>`;
}

// ---------- core loop ----------

function variant(): Variant {
  return VARIANTS[S.variant];
}

function currentTab(): Tab | undefined {
  return S.active.tabs.find((t) => t.id === S.active.current);
}

function actionLabel(r: Row) {
  if (r.kind === "tab") return "Switch to Tab";
  if (r.kind === "search" || r.kind === "suggestion") return `Search ${S.active.engine.name}`;
  return S.mode === "t" ? "Open" : "Go";
}

function emptyRows(): Row[] {
  const v = variant();
  if (v.empty === "tabs")
    return S.active.tabs.map((t) => ({ kind: "tab", title: t.title, url: t.url, display: displayUrl(t.url), site: siteOf(t.key), score: S.active.byKey.get(t.key)?.score ?? 0, tabId: t.id }));
  if (v.empty === "topSites")
    return topSites(S.active.pages, 8, S.active.engine).map((s) => ({ kind: "go", title: s.title, url: s.url, display: displayUrl(s.url), site: s.site, score: s.score }));
  return [];
}

function recompute() {
  const t0 = performance.now();
  const typed = S.typed.trim();
  if (!typed) S.rows = emptyRows();
  else {
    const lowered = typed.toLowerCase();
    const fresh = S.sug.q.toLowerCase() === lowered;
    const items = fresh ? S.sug.items : S.sug.items.filter((s) => s.toLowerCase().startsWith(lowered));
    S.rows = buildRows({
      typed: S.typed,
      completion: S.completion,
      pages: S.active.pages,
      byKey: S.active.byKey,
      tabs: S.active.tabs.filter((t) => t.id !== S.active.current || S.backdrop === "start"),
      engine: S.active.engine,
      suggestions: S.knobs.live ? items : [],
      suggestionsBeforeHistory: S.knobs.sugFirst,
    });
  }
  S.ms = performance.now() - t0;
  if (S.selected >= S.rows.length) S.selected = S.rows.length - 1;
}

function render(caret?: "end" | "all" | number) {
  renderWindow();
  renderBar();
  renderWhy();
  root.hidden = scrim.hidden = !S.open;
  if (!S.open) return;
  const v = variant();
  if (!mounted || mounted.key !== v.key) {
    mounted = { key: v.key, m: v.mount(root, { pick: (i) => pick(i), hover: (i) => hover(i) }) };
    attach(mounted.m.input);
  }
  const vm: VM = {
    mode: S.mode,
    profile: { n: S.active.n, name: S.active.name, color: S.active.color, engine: S.active.engine.name },
    typed: S.typed,
    suffix: S.suffix,
    rows: S.rows,
    selected: S.selected,
    empty: !S.typed.trim(),
    actionLabel,
    icon,
  };
  mounted.m.update(vm);
  const input = mounted.m.input;
  const value = v.style === "selection" ? S.typed + S.suffix : S.typed;
  if (input.value !== value) input.value = value;
  if (document.activeElement !== input) input.focus();
  if (caret === "all") input.setSelectionRange(0, value.length);
  else if (caret === "end") input.setSelectionRange(value.length, value.length);
  else if (typeof caret === "number") input.setSelectionRange(caret, caret);
  else if (S.suffix && v.style === "selection") input.setSelectionRange(S.typed.length, value.length);
}

function setCompletion(c: Completion) {
  S.completion = c;
  S.suffix = c.suffix;
  S.full = c.full;
}

function retype(allowed: boolean, why: string) {
  const prev = S.full || null;
  if (allowed) setCompletion(complete(S.typed, S.active.pages, now(), { allowPathAfterBareSite: false, previousFull: prev }));
  else setCompletion({ suffix: "", full: "", reason: why, candidates: [] });
  S.selected = S.typed.trim() ? 0 : -1;
  recompute();
  scheduleSuggestions();
}

function attach(input: HTMLInputElement) {
  input.addEventListener("beforeinput", (e) => (S.lastInputType = (e as InputEvent).inputType));
  input.addEventListener("input", () => {
    S.typed = input.value;
    const it = S.lastInputType;
    const atEnd = input.selectionStart === input.value.length;
    const typing = it === "insertText" || it === "insertCompositionText";
    const why = it.startsWith("delete") ? "after a delete: no completion" : it === "insertFromPaste" ? "after a paste: no completion" : it.startsWith("history") ? "after undo: no completion" : !atEnd ? "caret not at the end" : `no completion after ${it}`;
    retype(typing && atEnd, why);
    render();
  });
  input.addEventListener("pointerup", () => {
    if (S.suffix && variant().style === "selection") {
      S.typed = input.value;
      setCompletion({ suffix: "", full: "", reason: "accepted by clicking in the field", candidates: [] });
      recompute();
      renderWhy();
    }
  });
  input.addEventListener("keydown", (e) => onFieldKey(e, input));
}

function acceptCompletion(how: string) {
  S.typed = S.typed + S.suffix;
  if (S.knobs.drill && how === "Tab") {
    setCompletion(complete(S.typed, S.active.pages, now(), { allowPathAfterBareSite: true, previousFull: null }));
    if (!S.suffix) S.completion.reason = `accepted with Tab; ${S.completion.reason}`;
  } else setCompletion({ suffix: "", full: "", reason: `accepted with ${how}; the next step waits for typing`, candidates: [] });
  S.selected = 0;
  recompute();
  scheduleSuggestions();
}

function onFieldKey(e: KeyboardEvent, input: HTMLInputElement) {
  if (e.ctrlKey && /^[1-9]$/.test(e.key)) return; // handled globally
  const style = variant().style;
  const tiles = variant().empty === "topSites" && !S.typed.trim();
  switch (e.key) {
    case "Tab":
      e.preventDefault();
      if (S.suffix) {
        acceptCompletion("Tab");
        render(style === "selection" && S.suffix ? undefined : "end");
      }
      return;
    case "ArrowRight":
    case "End":
      if (tiles && e.key === "ArrowRight") return move(e, 1);
      if (S.suffix) {
        e.preventDefault();
        acceptCompletion(e.key === "End" ? "End" : "→");
        render("end");
      }
      return;
    case "ArrowLeft":
    case "Home":
      if (tiles && e.key === "ArrowLeft") return move(e, -1);
      if (S.suffix) {
        const at = e.key === "Home" ? 0 : S.typed.length;
        S.typed = S.typed + S.suffix;
        setCompletion({ suffix: "", full: "", reason: `kept as text by ${e.key === "Home" ? "Home" : "←"}`, candidates: [] });
        recompute();
        if (style === "selection") {
          e.preventDefault();
          render(at);
        } else render();
      }
      return;
    case "ArrowDown":
      return move(e, 1);
    case "ArrowUp":
      return move(e, -1);
    case "Enter":
      e.preventDefault();
      if (S.rows[S.selected]) act(S.rows[S.selected]);
      return;
    case "Escape":
      e.preventDefault();
      close("Esc: nothing changed");
      return;
  }
}

function move(e: KeyboardEvent, d: number) {
  e.preventDefault();
  if (!S.rows.length) return;
  S.selected = S.selected < 0 ? (d > 0 ? 0 : S.rows.length - 1) : (S.selected + d + S.rows.length) % S.rows.length;
  render(variant().style === "selection" && S.suffix ? undefined : "end");
}

function hover(i: number) {
  if (i === S.selected) return;
  S.selected = i;
  render(variant().style === "selection" && S.suffix ? undefined : "end");
}

function pick(i: number) {
  if (S.rows[i]) act(S.rows[i]);
}

// ---------- suggestions ----------

let sugTimer: ReturnType<typeof setTimeout> | undefined;
let sugAbort: AbortController | undefined;
function scheduleSuggestions() {
  clearTimeout(sugTimer);
  const q = S.typed.trim();
  if (!S.knobs.live) return void (S.sug.status = data.offline ? "off (--offline)" : "off");
  if (!q) return void (S.sug = { q: "", items: [], status: "idle" });
  if (!mayFetchSuggestions(q)) return void (S.sug = { q, items: [], status: "held back: looks like an address" });
  S.sug.status = "waiting";
  sugTimer = setTimeout(async () => {
    sugAbort?.abort();
    sugAbort = new AbortController();
    try {
      const r = await fetch(`/api/suggest?engine=${S.active.engineId}&q=${encodeURIComponent(q)}`, { signal: sugAbort.signal });
      const [rq, items] = (await r.json()) as [string, string[]];
      if (String(rq).trim().toLowerCase() !== S.typed.trim().toLowerCase()) return; // stale
      S.sug = { q: S.typed.trim(), items, status: `${items.length} from ${S.active.engine.name}` };
      if (S.open) {
        recompute();
        render(variant().style === "selection" && S.suffix ? undefined : "end");
      }
    } catch {
      /* aborted or offline: fail silently */
    }
  }, 100);
}

// ---------- acting ----------

function act(r: Row) {
  const p = S.active;
  if (r.kind === "tab") {
    p.current = r.tabId!;
    S.backdrop = "page";
    close(`Switched to tab “${r.title}”. Not a Visit.`);
    return;
  }
  const search = r.kind === "search" || r.kind === "suggestion";
  const title = search ? `${r.query} – ${p.engine.name}` : p.byKey.get(toKey(r.url))?.title || r.title || displayUrl(r.url);
  let note: string;
  if (search) note = "Search results pages aren't recorded.";
  else {
    recordVisit(p.pages, p.byKey, r.url, title, true, now());
    p.pages.sort((a, b) => b.score - a.score);
    note = "Recorded a Typed Visit; Frecency updated.";
  }
  const tab: Tab = { id: nextTabId++, url: r.url, title, key: toKey(r.url) };
  if (S.mode === "t" || !currentTab() || S.backdrop === "start") {
    const at = p.tabs.findIndex((t) => t.id === p.current);
    p.tabs.splice(at + 1, 0, tab);
    p.current = tab.id;
    close(`Opened in a new tab: ${r.url}. ${note}`);
  } else {
    Object.assign(currentTab()!, { url: r.url, title, key: tab.key });
    close(`Navigated this tab to ${r.url}. ${note}`);
  }
  S.backdrop = "page";
  render();
}

function openPalette(mode: "t" | "l") {
  S.open = true;
  S.mode = mode;
  const cur = currentTab();
  S.typed = mode === "l" && S.backdrop === "page" && cur ? cur.url : "";
  setCompletion({ suffix: "", full: "", reason: mode === "l" ? "pre-filled: no completion until you type" : "empty", candidates: [] });
  S.sug = { q: "", items: [], status: "idle" };
  S.selected = S.typed ? 0 : -1;
  recompute();
  render(mode === "l" ? "all" : "end");
}

function close(what: string) {
  S.open = false;
  S.last = what;
  clearTimeout(sugTimer);
  sugAbort?.abort();
  mounted?.m.input.blur();
  toast(what);
  render();
}

function switchProfile(n: number) {
  const p = profiles.find((x) => x.n === n);
  if (!p || p === S.active) return;
  S.active = p;
  if (S.open) {
    retype(true, "");
    render(variant().style === "selection" && S.suffix ? undefined : "end");
  } else render();
}

function setVariant(k: Variant["key"]) {
  S.variant = k;
  const u = new URL(location.href);
  u.searchParams.set("variant", k);
  history.replaceState(null, "", u);
  if (S.open) {
    if (!S.typed.trim()) S.selected = -1;
    recompute();
  }
  render(S.open ? (variant().style === "selection" && S.suffix ? undefined : "end") : undefined);
}

// ---------- chrome around it ----------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

function renderWindow() {
  const p = S.active;
  const cur = currentTab();
  $("#profile-btn").innerHTML = `<i style="background:${p.color}"></i>${esc(p.name)}`;
  $("#tabs").innerHTML = p.tabs
    .map((t) => `<div class="tab${t.id === p.current && S.backdrop === "page" ? " on" : ""}">${icon(siteOf(t.key), 14)}<span>${esc(t.title)}</span></div>`)
    .join("") + (S.backdrop === "start" ? `<div class="tab on"><span>Start Page</span></div>` : "");
  const page = $("#page");
  page.className = S.backdrop === "start" ? "start" : "site";
  if (S.backdrop === "start") {
    page.innerHTML = `<div class="sp"><h2>Favourites</h2><div class="sp-grid">${Array.from({ length: 8 }, () => `<div class="sp-fav"></div>`).join("")}</div><h2>Privacy Report</h2><div class="sp-card"></div></div>`;
  } else {
    page.innerHTML = `<div class="fake"><div class="hint">Prototype keys: <kbd>T</kbd> for ⌘T · <kbd>L</kbd> for ⌘L · <kbd>1</kbd>–<kbd>${profiles.length}</kbd> or <kbd>ctrl</kbd>+number for ⌘number · <kbd>←</kbd><kbd>→</kbd> change variant · <kbd>?</kbd> why panel · <kbd>S</kbd> Start Page</div><div class="fake-url">${esc(cur ? displayUrl(cur.url) : "")}</div><h1>${esc(cur?.title ?? "")}</h1>${Array.from(
      { length: 9 },
      (_, i) => `<div class="bar" style="width:${[92, 86, 95, 60, 88, 79, 93, 70, 45][i]}%"></div>`,
    ).join("")}<div class="block"></div>${Array.from({ length: 6 }, (_, i) => `<div class="bar" style="width:${[90, 84, 96, 66, 81, 58][i]}%"></div>`).join("")}
</div>`;
  }
}

function renderBar() {
  const v = variant();
  const k = S.knobs;
  $("#bar").innerHTML = `
    <button data-act="prev" title="Previous variant (←)">‹</button>
    <span class="bar-label"><b>${v.key}</b> ${esc(v.name)}</span>
    <button data-act="next" title="Next variant (→)">›</button>
    <span class="sep"></span>
    ${profiles.map((p) => `<button data-act="prof" data-n="${p.n}" class="${p === S.active ? "on" : ""}" title="${esc(p.name)}">${p.n}${p === S.active ? " " + esc(p.name) : ""}</button>`).join("")}
    <span class="sep"></span>
    <button data-act="t" class="${S.open && S.mode === "t" ? "on" : ""}">⌘T</button>
    <button data-act="l" class="${S.open && S.mode === "l" ? "on" : ""}">⌘L</button>
    <button data-act="start" class="${S.backdrop === "start" ? "on" : ""}" title="Show Safari's Start Page behind it (S)">Start Page</button>
    <span class="sep"></span>
    <button data-act="drill" class="${k.drill ? "on" : ""}" title="After Tab accepts a step, offer the next one straight away">Tab drills down</button>
    <button data-act="sugFirst" class="${k.sugFirst ? "on" : ""}" title="Put search suggestions above history (Firefox's order)">Suggestions first</button>
    <button data-act="live" class="${k.live ? "on" : ""}" ${data.offline ? "disabled" : ""} title="Fetch Kagi / Google suggestions">Live suggestions</button>
    <span class="sep"></span>
    <button data-act="why" class="${S.why ? "on" : ""}">Why?</button>`;
}

function renderWhy() {
  const el = $("#why");
  el.hidden = !S.why;
  if (!S.why) return;
  const p = S.active;
  const c = S.completion;
  const st = p.stats;
  const pct = st.visits ? Math.round((100 * st.typedVisits) / st.visits) : 0;
  el.innerHTML = `
    <h3>Why <small>local only · ${data.mode === "sample" ? "made-up history" : "your Arc history"}</small></h3>
    <dl>
      <dt>Profile</dt><dd>⌘${p.n} ${esc(p.name)} · ${p.engine.name}</dd>
      <dt>History</dt><dd>${st.keptPages.toLocaleString()} pages loaded (${st.pages.toLocaleString()} in all), ${st.visits.toLocaleString()} Visits, ${pct}% typed, oldest ${st.oldestDays} days</dd>
      <dt>Mode</dt><dd>${S.open ? (S.mode === "t" ? "⌘T: opens in a new tab" : "⌘L: navigates this tab") : "closed"}</dd>
      <dt>Typed</dt><dd><code>${esc(S.typed) || "∅"}</code></dd>
      <dt>Completion</dt><dd>${c.suffix ? `<code>${esc(S.typed)}<u>${esc(c.suffix)}</u></code> → <code>${esc(c.full)}</code>` : "none"}</dd>
      <dt>Because</dt><dd>${esc(c.reason)}</dd>
      <dt>Suggestions</dt><dd>${esc(S.sug.status)}</dd>
      <dt>Ranked in</dt><dd>${S.ms.toFixed(1)} ms</dd>
    </dl>
    ${
      c.candidates.length
        ? `<h4>Steps considered</h4><table>${c.candidates
            .slice(0, 8)
            .map(
              (x) =>
                `<tr class="${x.floorOk ? "" : "no"}${x.full === c.full ? " won" : ""}"><td><code>${esc(x.step)}</code></td><td>${x.score.toFixed(0)}</td><td>${x.pages}p</td><td>${x.floorOk ? (x.isSite ? "site ✓" : "path") : esc(x.floorWhy)}</td></tr>`,
            )
            .join("")}</table>`
        : ""
    }
    ${S.rows.length ? `<h4>Rows</h4><table>${S.rows.map((r, i) => `<tr class="${i === S.selected ? "won" : ""}"><td>${r.kind}</td><td class="clip">${esc(r.title)}</td><td>${r.score ? r.score.toFixed(0) : ""}</td></tr>`).join("")}</table>` : ""}
    ${S.last ? `<h4>Last</h4><p>${esc(S.last)}</p>` : ""}`;
}

// ---------- global keys and clicks ----------

$("#bar").addEventListener("mousedown", (e) => e.preventDefault());
$("#bar").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!b) return;
  const i = ORDER.indexOf(S.variant);
  const keep = () => render(S.open ? (variant().style === "selection" && S.suffix ? undefined : "end") : undefined);
  switch (b.dataset.act) {
    case "prev":
      return setVariant(ORDER[(i + ORDER.length - 1) % ORDER.length]);
    case "next":
      return setVariant(ORDER[(i + 1) % ORDER.length]);
    case "prof":
      return switchProfile(Number(b.dataset.n));
    case "t":
    case "l":
      return openPalette(b.dataset.act);
    case "start":
      S.backdrop = S.backdrop === "start" ? "page" : "start";
      return keep();
    case "drill":
    case "sugFirst":
    case "live":
      S.knobs[b.dataset.act] = !S.knobs[b.dataset.act];
      if (S.open) recompute();
      return keep();
    case "why":
      S.why = !S.why;
      return keep();
  }
});

scrim.addEventListener("mousedown", (e) => {
  e.preventDefault();
  close("Clicked outside: nothing changed");
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    return switchProfile(Number(e.key));
  }
  if (S.open) {
    if (e.key === "Escape") close("Esc: nothing changed");
    return;
  }
  if (e.metaKey || e.altKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === "t" || k === "l") {
    e.preventDefault();
    openPalette(k);
  } else if (/^[1-9]$/.test(k)) switchProfile(Number(k));
  else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const i = ORDER.indexOf(S.variant);
    setVariant(ORDER[(i + (e.key === "ArrowRight" ? 1 : ORDER.length - 1)) % ORDER.length]);
  } else if (k === "?") {
    S.why = !S.why;
    render();
  } else if (k === "s") {
    S.backdrop = S.backdrop === "start" ? "page" : "start";
    render();
  }
});

render();
if (params.has("open")) openPalette(params.get("open") === "l" ? "l" : "t");
