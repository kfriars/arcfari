// PROTOTYPE — throwaway. Lives on branch prototype/command-palette only; never merge.
//
//   bun prototypes/command-palette/serve.ts            # your Arc history, read from a temp copy
//   bun prototypes/command-palette/serve.ts --sample   # made-up history, nothing of yours
//   add --offline to stop search suggestions being fetched
//
// Arc's files are copied to $TMPDIR/arcfari-palette-PROTOTYPE-wipe-me and read there.
// Nothing is written into the repo, and nothing leaves this Mac except the search
// suggestion requests you type (Kagi for ⌘1, Google for the rest), as the real palette would.

import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import index from "./index.html";
import { siteOf, toKey } from "./palette-logic";

const args = new Set(process.argv.slice(2));
const SAMPLE = args.has("--sample");
const OFFLINE = args.has("--offline");
const PORT = Number(process.env.PORT ?? 4917);
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

type PackedPage = [url: string, title: string, visitCount: number, typedCount: number, visits: number[]];
type ProfileData = {
  n: number;
  name: string;
  engine: "kagi" | "google";
  pages: PackedPage[];
  tabs: { id: number; url: string; title: string }[];
  iconSites: string[];
  stats: { pages: number; visits: number; typedVisits: number; keptPages: number; oldestDays: number };
};

const COLORS = ["#2f7cf6", "#f08a24", "#2fb26a", "#9b5de5", "#e5484d", "#0fb5ae", "#d6409f", "#8d6e3f", "#6e7781"];
const SEARCH_PAGE = /^(kagi\.com\/search\?|google\.[a-z.]+\/search\?)/;

const profiles: ProfileData[] = [];
const iconDbs = new Map<number, { db: Database; bySite: Map<string, number> }>();

// ---------- Arc ----------

function loadArc() {
  const arc = join(homedir(), "Library/Application Support/Arc");
  const sidebar = JSON.parse(readFileSync(join(arc, "StorableSidebar.json"), "utf8"));
  const spaces: { title: string; dir: string }[] = [];
  for (const c of sidebar.sidebar?.containers ?? []) {
    for (const s of c.spaces ?? []) {
      if (typeof s !== "object" || !s) continue;
      const dir = s.profile?.default ? "Default" : s.profile?.custom?._0?.directoryBasename;
      if (dir) spaces.push({ title: s.title || `Space ${spaces.length + 1}`, dir });
    }
  }
  const tmp = join(tmpdir(), "arcfari-palette-PROTOTYPE-wipe-me");
  rmSync(tmp, { recursive: true, force: true });
  for (const [i, sp] of spaces.slice(0, 9).entries()) {
    const n = i + 1;
    const from = join(arc, "User Data", sp.dir);
    const to = join(tmp, sp.dir);
    mkdirSync(to, { recursive: true });
    for (const f of ["History", "History-journal", "Favicons", "Favicons-journal"]) {
      if (existsSync(join(from, f))) copyFileSync(join(from, f), join(to, f));
    }
    profiles.push(readChromiumHistory(n, sp.title, new Database(join(to, "History"))));
    if (existsSync(join(to, "Favicons"))) openIcons(n, new Database(join(to, "Favicons")));
  }
}

function readChromiumHistory(n: number, name: string, db: Database): ProfileData {
  const rows = db
    .query("SELECT v.visit_time AS t, v.transition AS tr, u.url AS url, u.title AS title FROM visits v JOIN urls u ON u.id = v.url ORDER BY v.visit_time")
    .all() as { t: number; tr: number; url: string; title: string }[];
  type Agg = { url: string; title: string; visits: number[]; count: number; typed: number; last: number };
  const by = new Map<string, Agg>();
  let visits = 0;
  let typedVisits = 0;
  let oldest = NOW;
  for (const r of rows) {
    const core = r.tr & 0xff;
    if (core === 3 || core === 4 || core === 8) continue; // subframes, reloads
    if (!(r.tr & 0x20000000)) continue; // not the end of a redirect chain
    if (!/^https?:\/\//i.test(r.url)) continue;
    const key = toKey(r.url);
    if (!key || SEARCH_PAGE.test(key)) continue;
    const t = Math.floor(r.t / 1e6 - 11644473600);
    const typed = core === 1 || core === 10;
    visits++;
    if (typed) typedVisits++;
    oldest = Math.min(oldest, t);
    let a = by.get(key);
    if (!a) by.set(key, (a = { url: r.url, title: "", visits: [], count: 0, typed: 0, last: 0 }));
    a.url = r.url;
    if (r.title) a.title = r.title;
    a.visits.push(t * 2 + (typed ? 1 : 0));
    if (a.visits.length > 10) a.visits.shift();
    a.count++;
    if (typed) a.typed++;
    a.last = t;
  }
  return pack(n, name, by, visits, typedVisits, oldest);
}

function pack(
  n: number,
  name: string,
  by: Map<string, { url: string; title: string; visits: number[]; count: number; typed: number; last: number }>,
  visits: number,
  typedVisits: number,
  oldest: number,
): ProfileData {
  // Keep the payload sane: everything from the last year, plus anything ever typed.
  const all = [...by.values()];
  const kept = all.filter((a) => a.last >= NOW - 365 * DAY || a.typed > 0);
  kept.sort((a, b) => b.last - a.last);
  const capped = kept.slice(0, 80000);
  const tabs: ProfileData["tabs"] = [];
  const seen = new Set<string>();
  for (const a of capped) {
    const site = siteOf(toKey(a.url));
    if (seen.has(site)) continue;
    seen.add(site);
    tabs.push({ id: n * 1000 + tabs.length, url: a.url, title: a.title || site });
    if (tabs.length === 8) break;
  }
  return {
    n,
    name,
    engine: n === 1 ? "kagi" : "google",
    pages: capped.map((a) => [a.url, a.title, a.count, a.typed, a.visits]),
    tabs,
    iconSites: [],
    stats: { pages: all.length, visits, typedVisits, keptPages: capped.length, oldestDays: Math.round((NOW - oldest) / DAY) },
  };
}

function openIcons(n: number, db: Database) {
  const bySite = new Map<string, number>();
  for (const r of db.query("SELECT page_url AS u, icon_id AS id FROM icon_mapping").all() as { u: string; id: number }[]) {
    if (!/^https?:\/\//i.test(r.u)) continue;
    bySite.set(siteOf(toKey(r.u)), r.id);
  }
  iconDbs.set(n, { db, bySite });
  const p = profiles.find((p) => p.n === n);
  if (p) {
    const wanted = new Set(p.pages.map((pg) => siteOf(toKey(pg[0]))));
    p.iconSites = [...bySite.keys()].filter((s) => wanted.has(s));
  }
}

// ---------- Sample ----------

function loadSample() {
  let seed = 7;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // [url, title, visits per week, share typed]
  const SITES: [string, string, number, number][] = [
    ["https://github.com/", "GitHub", 6, 0.6],
    ["https://github.com/pulls", "Pull requests", 5, 0.3],
    ["https://github.com/notifications", "Notifications", 4, 0.2],
    ["https://github.com/apple/swift", "apple/swift: The Swift Programming Language", 1.5, 0.1],
    ["https://github.com/apple/swift/issues", "Issues · apple/swift", 0.8, 0],
    ["https://github.com/oven-sh/bun", "oven-sh/bun: Incredibly fast JavaScript runtime", 1, 0.1],
    ["https://news.ycombinator.com/", "Hacker News", 7, 0.8],
    ["https://news.ycombinator.com/item?id=41234567", "Show HN: A tiny browser built on Safari", 0.3, 0],
    ["https://developer.apple.com/documentation/appkit/nspanel", "NSPanel | Apple Developer Documentation", 2, 0.1],
    ["https://developer.apple.com/documentation/appkit/nsvisualeffectview", "NSVisualEffectView | Apple Developer Documentation", 1, 0],
    ["https://developer.apple.com/documentation/safariservices/safari-web-extensions", "Safari web extensions | Apple Developer Documentation", 1.5, 0.1],
    ["https://developer.apple.com/documentation/screencapturekit", "ScreenCaptureKit | Apple Developer Documentation", 0.7, 0],
    ["https://docs.swift.org/swift-book/documentation/the-swift-programming-language/", "The Swift Programming Language", 1, 0.3],
    ["https://en.wikipedia.org/wiki/Frecency", "Frecency - Wikipedia", 0.3, 0],
    ["https://en.wikipedia.org/wiki/Exponential_decay", "Exponential decay - Wikipedia", 0.2, 0],
    ["https://mail.google.com/mail/u/0/#inbox", "Inbox - Mail", 9, 0.5],
    ["https://calendar.google.com/calendar/r", "Calendar - Week of November 9, 2026", 4, 0.5],
    ["https://example.com/", "Example Domain", 1, 0.5],
    ["https://example.com/admin", "Admin · Example", 3, 0.4],
    ["https://example.com/admin/users", "Users · Admin · Example", 2, 0.1],
    ["https://example.com/admin/settings", "Settings · Admin · Example", 0.6, 0],
    ["https://example.com/blog", "Blog · Example", 0.4, 0],
    ["https://exampleshop.net/", "Example Shop", 0.2, 0],
    ["https://www.youtube.com/", "YouTube", 3, 0.7],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "A video about window managers - YouTube", 0.3, 0],
    ["https://www.reddit.com/r/swift/", "r/swift", 1, 0.3],
    ["https://stackoverflow.com/questions/1234567/nspanel-non-activating-key-window", "NSPanel that is non-activating but can become key - Stack Overflow", 0.5, 0],
    ["http://localhost:3000/dashboard", "Dashboard — dev", 5, 0.6],
    ["https://www.apple.com/macos/", "macOS - Apple", 0.2, 0],
    ["https://linear.app/", "Linear", 2, 0.4],
    ["https://www.figma.com/files/recent", "Recent files – Figma", 1, 0.2],
    ["https://kagi.com/", "Kagi Search", 0.5, 0.8],
    ["https://weather.gov/", "National Weather Service", 0.08, 0],
  ];
  const NAMES = ["Personal", "Work", "Studio", "Family"];
  for (const [i, name] of NAMES.entries()) {
    const n = i + 1;
    const by = new Map<string, { url: string; title: string; visits: number[]; count: number; typed: number; last: number }>();
    let visits = 0;
    let typedVisits = 0;
    for (const [url, title, perWeek, typedShare] of SITES) {
      if (n > 1 && rnd() < 0.35) continue; // each Profile has its own mix
      const rate = perWeek * (n === 1 ? 1 : 0.3 + rnd());
      const ts: number[] = [];
      for (let d = 120; d >= 0; d--) {
        const expected = rate / 7;
        let k = 0;
        while (rnd() < expected / (k + 1) && k < 6) k++;
        for (let j = 0; j < k; j++) ts.push(NOW - d * DAY - Math.floor(rnd() * DAY));
      }
      ts.sort((a, b) => a - b);
      if (!ts.length) continue;
      const vs = ts.map((t) => {
        const typed = rnd() < typedShare;
        visits++;
        if (typed) typedVisits++;
        return t * 2 + (typed ? 1 : 0);
      });
      by.set(toKey(url), { url, title, visits: vs.slice(-10), count: vs.length, typed: vs.filter((v) => v & 1).length, last: ts[ts.length - 1] });
    }
    profiles.push(pack(n, name, by, visits, typedVisits, NOW - 120 * DAY));
  }
}

// ---------- serve ----------

if (SAMPLE) loadSample();
else loadArc();

const payload = Bun.gzipSync(JSON.stringify({ mode: SAMPLE ? "sample" : "arc", offline: OFFLINE, now: NOW, colors: COLORS, profiles }));

const server = Bun.serve({
  port: PORT,
  development: true,
  routes: {
    "/": index,
    "/api/data": () => new Response(payload, { headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" } }),
    "/api/favicon": (req) => {
      const u = new URL(req.url);
      const icons = iconDbs.get(Number(u.searchParams.get("p")));
      const id = icons?.bySite.get(u.searchParams.get("site") ?? "");
      if (!icons || id === undefined) return new Response(null, { status: 404 });
      const r = icons.db
        .query("SELECT image_data AS d FROM favicon_bitmaps WHERE icon_id = ? AND length(image_data) > 0 ORDER BY abs(width - 32) LIMIT 1")
        .get(id) as { d: Uint8Array } | null;
      if (!r) return new Response(null, { status: 404 });
      const png = r.d[0] === 0x89 && r.d[1] === 0x50;
      return new Response(r.d, { headers: { "Content-Type": png ? "image/png" : "image/x-icon", "Cache-Control": "max-age=3600" } });
    },
    "/api/suggest": async (req) => {
      const u = new URL(req.url);
      const q = u.searchParams.get("q") ?? "";
      const engine = u.searchParams.get("engine");
      if (OFFLINE || !q) return Response.json([q, []]);
      const target =
        engine === "kagi"
          ? "https://kagisuggest.com/api/autosuggest?q=" + encodeURIComponent(q)
          : "https://www.google.com/complete/search?client=firefox&q=" + encodeURIComponent(q);
      try {
        const res = await fetch(target, { signal: AbortSignal.timeout(1500), headers: { Accept: "application/json" } });
        const body = JSON.parse(await res.text());
        return Response.json([body[0], Array.isArray(body[1]) ? body[1].map(String) : []]);
      } catch {
        return Response.json([q, []]);
      }
    },
  },
});

const total = profiles.reduce((s, p) => s + p.stats.keptPages, 0);
console.log(`Command Palette prototype (${SAMPLE ? "made-up history" : "your Arc history, from a temp copy"}${OFFLINE ? ", offline" : ""})`);
console.log(`${profiles.length} Profiles, ${total} pages loaded`);
console.log(`Open ${server.url}  (Safari: open -a Safari ${server.url})`);
