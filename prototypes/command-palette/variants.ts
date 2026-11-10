// PROTOTYPE — throwaway. Three radically different Command Palettes, same data, same keys.
//
//   A  Spotlight   big field, one flat list, completion drawn as selected text, empty ⌘T is just the field
//   B  Sectioned   Profile chip in the field, grouped two-line rows, key-hint footer, empty ⌘T is just the field
//   C  Address     URL-first dense rows tinted by the Profile, ghost-text completion, empty ⌘T shows top sites

import type { Row } from "./palette-logic";

export type VM = {
  mode: "t" | "l";
  profile: { n: number; name: string; color: string; engine: string };
  typed: string;
  suffix: string;
  rows: Row[];
  selected: number;
  empty: boolean; // nothing typed: rows are this variant's empty-state rows
  actionLabel(row: Row): string;
  icon(site: string, size: number): string; // html for a favicon or monogram
};

export type Mounted = { input: HTMLInputElement; update(vm: VM): void };

export type Variant = {
  key: "A" | "B" | "C";
  name: string;
  style: "selection" | "ghost"; // how Inline Completion is drawn
  empty: "none" | "tabs" | "topSites"; // what an empty ⌘T shows
  mount(root: HTMLElement, h: { pick(i: number): void; hover(i: number): void }): Mounted;
};

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SVG = {
  search: `<svg viewBox="0 0 20 20" width="100%" height="100%"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12.6 12.6 17 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  tab: `<svg viewBox="0 0 20 20" width="100%" height="100%"><rect x="2.5" y="5" width="15" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 8.5h15" stroke="currentColor" stroke-width="1.6"/></svg>`,
  clock: `<svg viewBox="0 0 20 20" width="100%" height="100%"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4.3l2.8 1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 20 20" width="100%" height="100%"><path d="M6 14 14 6M8 6h6v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function wire(list: HTMLElement, h: { pick(i: number): void; hover(i: number): void }) {
  list.addEventListener("mousedown", (e) => e.preventDefault()); // keep the field focused
  list.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (el) h.pick(Number(el.dataset.i));
  });
  list.addEventListener("mousemove", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
    if (el) h.hover(Number(el.dataset.i));
  });
}

function field(input: HTMLInputElement) {
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.placeholder = "Search or enter address";
}

const isSearch = (r: Row) => r.kind === "search" || r.kind === "suggestion";

// ---------------------------------------------------------------- A · Spotlight

export const A: Variant = {
  key: "A",
  name: "Spotlight",
  style: "selection",
  empty: "none",
  mount(root, h) {
    root.innerHTML = `
      <div class="pa">
        <div class="pa-field"><span class="pa-lead"></span><input class="pa-input"><span class="pa-prof"></span></div>
        <div class="pa-list"></div>
      </div>`;
    const input = root.querySelector<HTMLInputElement>(".pa-input")!;
    const lead = root.querySelector<HTMLElement>(".pa-lead")!;
    const prof = root.querySelector<HTMLElement>(".pa-prof")!;
    const list = root.querySelector<HTMLElement>(".pa-list")!;
    field(input);
    wire(list, h);
    return {
      input,
      update(vm) {
        const top = vm.rows[Math.max(0, vm.selected)];
        lead.innerHTML = top && !isSearch(top) && top.site ? vm.icon(top.site, 26) : `<span class="glyph">${SVG.search}</span>`;
        prof.innerHTML = `<i style="background:${vm.profile.color}"></i>${esc(vm.profile.name)}`;
        list.hidden = vm.rows.length === 0;
        list.innerHTML = vm.rows
          .map((r, i) => {
            const icon = isSearch(r) ? `<span class="glyph sm">${SVG.search}</span>` : vm.icon(r.site, 18);
            const title = r.kind === "go" ? r.display : r.title;
            const sub = isSearch(r) ? "" : r.kind === "go" ? "" : r.display;
            return `<div class="pa-row${i === vm.selected ? " sel" : ""}" data-i="${i}">${icon}<span class="pa-t">${esc(title)}</span>${
              sub ? `<span class="pa-u">— ${esc(sub)}</span>` : ""
            }<span class="pa-act">${esc(vm.actionLabel(r))}</span></div>`;
          })
          .join("");
      },
    };
  },
};

// ---------------------------------------------------------------- B · Sectioned

const SECTION: Record<Row["kind"], string> = {
  complete: "Top Hit",
  go: "Top Hit",
  search: "Top Hit",
  tab: "Open Tabs",
  history: "History",
  suggestion: "Suggestions",
};

export const B: Variant = {
  key: "B",
  name: "Sectioned",
  style: "selection",
  empty: "none",
  mount(root, h) {
    root.innerHTML = `
      <div class="pb">
        <div class="pb-field"><span class="pb-chip"></span><input class="pb-input"></div>
        <div class="pb-body"></div>
        <div class="pb-foot"><span class="pb-keys"></span><span class="pb-where"></span></div>
      </div>`;
    const panel = root.querySelector<HTMLElement>(".pb")!;
    const input = root.querySelector<HTMLInputElement>(".pb-input")!;
    const chip = root.querySelector<HTMLElement>(".pb-chip")!;
    const body = root.querySelector<HTMLElement>(".pb-body")!;
    const keys = root.querySelector<HTMLElement>(".pb-keys")!;
    const where = root.querySelector<HTMLElement>(".pb-where")!;
    field(input);
    wire(body, h);
    return {
      input,
      update(vm) {
        panel.style.setProperty("--c", vm.profile.color);
        chip.innerHTML = `<i></i>${esc(vm.profile.name)}`;
        let html = "";
        let last = "";
        vm.rows.forEach((r, i) => {
          const sec = vm.empty ? `Open Tabs in ${vm.profile.name}` : r.kind === "suggestion" ? `${vm.profile.engine} Suggestions` : SECTION[r.kind];
          if (sec !== last) {
            html += `<div class="pb-sec">${esc(sec)}</div>`;
            last = sec;
          }
          const icon = isSearch(r) ? `<span class="pb-tile glyph">${SVG.search}</span>` : `<span class="pb-tile">${vm.icon(r.site, 20)}</span>`;
          const title = r.kind === "go" ? r.display : r.kind === "search" ? `${r.title}` : r.title;
          const sub = r.kind === "search" ? `Search ${vm.profile.engine}` : r.kind === "suggestion" ? "" : r.kind === "go" ? "Go to address" : r.display;
          html += `<div class="pb-row${i === vm.selected ? " sel" : ""}" data-i="${i}">${icon}<span class="pb-text"><span class="pb-t">${esc(title)}</span>${
            sub ? `<span class="pb-u">${esc(sub)}</span>` : ""
          }</span><span class="pb-act">${isSearch(r) ? "" : esc(vm.actionLabel(r)) + " "}↵</span></div>`;
        });
        body.innerHTML = html;
        body.hidden = !html;
        keys.innerHTML = `<kbd>⇥</kbd> Complete <kbd>↑↓</kbd> Select <kbd>↵</kbd> ${vm.mode === "t" ? "Open" : "Go"} <kbd>esc</kbd> Close`;
        where.textContent = `⌘${vm.profile.n} ${vm.profile.name} · ${vm.profile.engine}`;
      },
    };
  },
};

// ---------------------------------------------------------------- C · Address

const GLYPH: Record<Row["kind"], string> = { complete: SVG.arrow, go: SVG.arrow, search: SVG.search, suggestion: SVG.search, tab: SVG.tab, history: SVG.clock };

function splitUrl(display: string) {
  const i = display.search(/[\/?#]/);
  return i === -1 ? [display, ""] : [display.slice(0, i), display.slice(i)];
}

export const C: Variant = {
  key: "C",
  name: "Address",
  style: "ghost",
  empty: "topSites",
  mount(root, h) {
    root.innerHTML = `
      <div class="pc">
        <div class="pc-cap"></div>
        <div class="pc-field"><div class="pc-ghost"><span class="pc-gt"></span><span class="pc-gs"></span><kbd class="pc-gk">tab</kbd></div><input class="pc-input"></div>
        <div class="pc-list"></div>
      </div>`;
    const panel = root.querySelector<HTMLElement>(".pc")!;
    const input = root.querySelector<HTMLInputElement>(".pc-input")!;
    const cap = root.querySelector<HTMLElement>(".pc-cap")!;
    const gt = root.querySelector<HTMLElement>(".pc-gt")!;
    const gs = root.querySelector<HTMLElement>(".pc-gs")!;
    const gk = root.querySelector<HTMLElement>(".pc-gk")!;
    const list = root.querySelector<HTMLElement>(".pc-list")!;
    field(input);
    wire(list, h);
    return {
      input,
      update(vm) {
        panel.style.setProperty("--c", vm.profile.color);
        cap.innerHTML = `<b>${esc(vm.profile.name)}</b><span>${vm.mode === "t" ? "new tab" : "this tab"} · ${esc(vm.profile.engine)}</span>`;
        gt.textContent = vm.typed;
        gs.textContent = vm.suffix;
        gk.hidden = !vm.suffix;
        if (vm.empty) {
          list.className = "pc-list tiles";
          list.innerHTML = vm.rows
            .map((r, i) => `<div class="pc-tile${i === vm.selected ? " sel" : ""}" data-i="${i}">${vm.icon(r.site, 36)}<span>${esc(r.site)}</span></div>`)
            .join("");
        } else {
          list.className = "pc-list";
          list.innerHTML = vm.rows
            .map((r, i) => {
              const [host, rest] = isSearch(r) ? [r.title, ""] : splitUrl(r.display);
              const right = isSearch(r) ? vm.profile.engine : r.kind === "go" ? "" : r.title;
              return `<div class="pc-row k-${r.kind}${i === vm.selected ? " sel" : ""}" data-i="${i}"><span class="pc-g">${GLYPH[r.kind]}</span><span class="pc-url"><b>${esc(
                host,
              )}</b>${esc(rest)}</span><span class="pc-title">${esc(right)}</span><span class="pc-act">${esc(vm.actionLabel(r))}</span></div>`;
            })
            .join("");
        }
        list.hidden = vm.rows.length === 0;
      },
    };
  },
};

export const VARIANTS = { A, B, C } as const;
export const ORDER = ["A", "B", "C"] as const;
