# Where Arcfari can read each Profile's history, and Arc's

Research for [#6](https://github.com/kfriars/arcfari/issues/6) (map [#1](https://github.com/kfriars/arcfari/issues/1)). Researched 2026-11-10 on macOS 27.0.1 with Safari 27.0.1. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Short answer

- **Safari's own history**: Profiles do not share one file. The default Profile's history is `~/Library/Safari/History.db`, and each other Profile has its own `History.db` under `~/Library/Containers/com.apple.Safari/Data/Library/Safari/Profiles/<UUID>/`. These are undocumented SQLite files. Reading them needs Full Disk Access (FDA), plus a process the App Sandbox doesn't block. With that access, changes can be watched. Forensic tooling confirms the per-Profile layout for Safari 17. For Safari 27 it is **not confirmed**: TCC blocked every read here, so only file existence could be checked.
- **Extension route**: Safari has no `history` API, so a Safari Web Extension can't read Safari's history. It can record visits itself with `webNavigation` and `tabs.onUpdated`. Each Profile runs its own copy of the extension with its own storage, so the records are kept apart per Profile without extra work. It misses visits from before it was turned on (or while it is off), visits synced from other devices, Safari's "Clear History", how a visit started (typed or link), and possibly SPA route changes.
- **Arc**: each Arc profile directory holds a standard Chromium `History` SQLite database. Its `urls` and `visits` tables match current Chromium `main` exactly. Arc ties Spaces to profile directories only in `~/Library/Application Support/Arc/StorableSidebar.json`, at `sidebar.containers[].spaces[].profile`.
- **Recommendation**: build Frecency from Arcfari's own visit records, kept by the Arcfari extension in each Profile and seeded once from the matching Arc Space's `History`. Reading Safari's `History.db` is a fallback only (see [What this means for Arcfari](#what-this-means-for-arcfari)).

---

## 1. Safari 27: where each Profile's history lives

### Layout

| What | Path | Status |
|---|---|---|
| Default Profile history | `~/Library/Safari/History.db` (+ `-wal`, `-shm`, `-lock`) | On this machine all four files exist (`stat` works, opening them fails; see Access). |
| Other Profiles' history | `~/Library/Containers/com.apple.Safari/Data/Library/Safari/Profiles/<profile UUID>/History.db` | mac_apt reads it here since Safari 17 support was added (2024-03) [S1]. Here the `Profiles` directory doesn't exist yet. That fits no extra Profile having been created, but this couldn't be checked. |
| Profile list (UUID ↔ name) | `~/Library/Containers/com.apple.Safari/Data/Library/Safari/SafariTabs.db`, table `bookmarks`, rows with `parent = 0 AND type = 1 AND subtype = 2`: `external_uuid` = Profile UUID (the directory name), `title` = Profile name, `server_id` = UUID of that Profile's `WebExtensions/Extensions.plist` folder | Per mac_apt [S1]. On this machine the file exists in the container, not in `~/Library/Safari` (one forensic KB says `~/Library/Safari/SafariTabs.db` [S3]; that is older or wrong for Safari 27). |
| Shared across Profiles | `CloudTabs.db`, `SafariTabs.db`, `BrowserState.db` | mac_apt treats these as "common databases for all profiles" [S1]. |

Apple's own documents only go as far as saying history is per Profile: "History, favorites, Tab Groups and website data … are scoped per-profile" [S4]; "Each profile has separate history, cookies, website data, extensions, Tab Groups, and favorites" [S5]. **Apple documents no path or schema.** Everything below comes from reverse-engineering by forensic tools, which mostly date from before Safari 27.

### Schema (from forensic sources, not Apple)

`History.db` is SQLite in WAL mode [S2][S3]. The main tables are [S2]:

- `history_items`: one row per URL. Columns: `id`, `url`, `domain_expansion`, `visit_count` (running total), `daily_visit_counts` and `weekly_visit_counts` (compressed BLOBs, format undocumented), `autocomplete_triggers`, `should_recompute_derived_visit_counts`, `visit_count_score` (Safari's own ranking score, formula undocumented).
- `history_visits`: one row per visit. Columns: `id`, `history_item` (→ `history_items.id`), `visit_time`, `title`, `load_successful`, `http_non_get`, `synthesized`, `redirect_source`, `redirect_destination`, `origin`, `generation`, `attributes`, `score`.
- `history_tombstones` (deletions, for iCloud sync; Safari 15+), `history_client_version` / metadata.
- `history_tags` and `history_items_to_tags`: topic tags linked to Wikidata IDs. These are recent; mac_apt started parsing them in 2026-10 [S1][S6].

`visit_time` is Core Data / Cocoa time: seconds since 2001-01-01 UTC, stored as REAL. Add 978307200 to get Unix seconds [S2].

Profiles are separated by **separate database files**, not by a column. Each Profile directory has its own `History.db` [S1].

### Access

- Full Disk Access covers this data. Apple's description reads "Allow apps to access all files on your computer, including data from other apps (for example, Mail, Messages, Safari, and Home)…", and apps must be added by hand in System Settings → Privacy & Security [S7][S8].
- What happened on this machine, where Terminal has no FDA:
  - `ls ~/Library/Safari` and `ls ~/Library/Containers/com.apple.Safari` both returned `Operation not permitted`.
  - `cp ~/Library/Safari/History.db …` returned `Operation not permitted`.
  - `stat` on individual known paths still succeeded. So TCC hides directory listings and contents but not whether a file exists.
- The App Sandbox is a second barrier. Apple says a Safari Web Extension's app, native app extension and JavaScript "operate independently in their own sandboxed environments" [S9], and that a sandboxed app "doesn't have unrestricted access to the user's home folder" [S10]. So reading `History.db` would need a separate process that isn't sandboxed and holds FDA, for example a helper app. The extension's native handler can't do it. Whether FDA alone lets a sandboxed process in was not verified.

### Watching for changes

With FDA, yes. Safari writes new visits to `History.db-wal` until a checkpoint, which happens at roughly 1000 pages [S11]. So a watcher would:

1. Watch the Profile directory (FSEvents) or the `-wal` file (kqueue / `DispatchSource`).
2. Re-query read-only.

SQLite can read a WAL database read-only if the `-shm` and `-wal` files already exist and are readable [S11]. Copying all three files first avoids touching Safari's `-shm`.

Apple's (archived) FSEvents guide says events are only delivered for directories "the user can reach … through standard file system permissions" [S12]. It predates TCC, so whether events arrive for TCC-protected directories without FDA is unverified. The question doesn't matter in practice, because the file can't be read without FDA anyway.

### Fit with ADR-0001

Reading `History.db` uses only Apple APIs (file access, SQLite, FSEvents) plus Safari. That stays within the letter of [ADR-0001](../adr/0001-only-apple-or-this-repo.md). But it depends on a private, undocumented file layout that Apple can change in any release; history tags were added in 2026, for example. That runs against the spirit of "Apple-supported", so treat it as a fragility risk.

---

## 2. Extension route: can a Safari Web Extension record visits itself?

**It can't read Safari's history.** MDN browser-compat-data (v8.1.8, which tracks Safari up to 27.2 current / 27.3 beta) lists `history` and every member as `version_added: false` for Safari. `browsingData`, `sessions` and `topSites` are also `false` [S13]. Ticket #3 covers the wider capabilities question.

**It can record visits itself:**

- `webNavigation.onCommitted` / `onCompleted` / `onBeforeNavigate` / `onErrorOccurred` are supported since Safari 14 [S13]. Filter on `frameId === 0` to keep main-frame visits only.
- `tabs.onUpdated` with `changeInfo.url` / `changeInfo.title` is supported since Safari 14. It "Requires host permissions for the tab, otherwise is an empty string" [S14]. Apple's notes add that `tabs` needs host permission [S15].
- `tabs.Tab.incognito` is supported [S14], so Private Browsing tabs can be skipped.

**Per-Profile separation is built in.** The WebKit blog (Safari 17) says: "Each profile runs a separate instance of the extension — meaning there are unique storage areas, background pages, service workers, and more." It also says "per-site permissions are shared across profiles" [S4]. So a visit log in `browser.storage.local` (or IndexedDB) is scoped to the Profile without any extra code. When the extension calls its native app extension, the message carries the Profile's identifier: `userInfo[SFExtensionProfileKey] as? UUID` (macOS 14+ / Safari 17+). It is absent for the default Profile [S9][S16]. Whether that UUID equals the `Profiles/<UUID>` directory name was not verified.

**Storage**: `storage.local` is capped at 5 MB unless the extension declares `unlimitedStorage`, which in Safari 16+ "grants unlimited storage" [S15]. `storage.sync` doesn't sync in Safari [S15][S17].

**What it would miss:**

1. **Visits before it is turned on, or while it is off in a Profile.** "By default, extensions are turned off for each new profile" [S5]. It has to be turned on in all four Profiles.
2. **Private Browsing.** Extensions that access browsing data are off there by default [S4]. That is the behaviour Arcfari wants anyway.
3. **Visits made on other devices** that iCloud syncs into Safari's history. The extension only sees navigations in this Safari.
4. **Deletions.** There is no `history.onVisitRemoved` and no `browsingData`, so clearing a Profile's history in Safari does not clear Arcfari's log. Arcfari would need its own way to forget visits.
5. **How a visit started.** `transitionType` / `transitionQualifiers` are not supported in Safari [S13][S15], so typed and link visits look the same. Arcfari's own Command Palette can mark the navigations it starts.
6. **SPA route changes.** `onHistoryStateUpdated` and `onReferenceFragmentUpdated` are not supported [S13][S15]. `tabs.onUpdated` URL changes may cover `pushState`, but this is unverified in Safari.
7. **Redirect chains.** Only the committed URL is seen, unlike Safari's `redirect_source` / `redirect_destination`.

---

## 3. Arc: the Chromium `History` database and how Spaces map to profiles

### Location

`~/Library/Application Support/Arc/User Data/<Default | Profile N>/History`. Each profile directory here also has `History-journal`, `Favicons`, `Top Sites` and `Preferences`. On this machine Arc reports Chromium 155 in `User Data/Last Version`.

Access: Terminal read these files without FDA, so Arc's data is not TCC-protected. A sandboxed app would still need the user to pick the folder (user-selected file access).

Locking: Chromium opens databases with `exclusive_locking` on by default [S18], so the file can't be opened in place while Arc is running. Copy it first, ideally with Arc quit. The database uses a rollback journal (`PRAGMA journal_mode` = `delete`); Chromium's WAL mode is behind a feature flag [S19].

### Schema (inspected on copies; `.schema` only, no rows read)

Every profile directory has the same set of tables, columns and indexes. Two variants differ only in table order in `sqlite_master`, and in `"urls"` being quoted in one. Both point to Chromium migrations that rebuilt `urls`. The tables are the ones Chromium creates today (`kCurrentVersionNumber = 70`) [S19]:

```sql
CREATE TABLE urls(id INTEGER PRIMARY KEY AUTOINCREMENT, url LONGVARCHAR, title LONGVARCHAR,
  visit_count INTEGER DEFAULT 0 NOT NULL, typed_count INTEGER DEFAULT 0 NOT NULL,
  last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL);

CREATE TABLE visits(id INTEGER PRIMARY KEY AUTOINCREMENT, url INTEGER NOT NULL, visit_time INTEGER NOT NULL,
  from_visit INTEGER, external_referrer_url TEXT, transition INTEGER DEFAULT 0 NOT NULL, segment_id INTEGER,
  visit_duration INTEGER DEFAULT 0 NOT NULL, incremented_omnibox_typed_score BOOLEAN DEFAULT FALSE NOT NULL,
  opener_visit INTEGER, originator_cache_guid TEXT, originator_visit_id INTEGER, originator_from_visit INTEGER,
  originator_opener_visit INTEGER, is_known_to_sync BOOLEAN DEFAULT FALSE NOT NULL,
  consider_for_ntp_most_visited BOOLEAN DEFAULT FALSE NOT NULL, visited_link_id INTEGER DEFAULT 0 NOT NULL,
  app_id TEXT);

CREATE TABLE visit_source(id INTEGER PRIMARY KEY, source INTEGER NOT NULL);
-- indexes: urls_url_index ON urls(url); visits_url_index ON visits(url); visits_time_index ON visits(visit_time); …
```

The other tables are not needed for Frecency: `meta`, `downloads*`, `visited_links`, `keyword_search_terms`, `segments`, `segment_usage`, `content_annotations`, `context_annotations`, `clusters*`, `history_sync_metadata`, `journeys*`.

Meaning, from Chromium source:

- **Join**: `visits.url` → `urls.id` [S20].
- **Timestamps** (`visits.visit_time`, `urls.last_visit_time`) are `base::Time` values: microseconds since 1601-01-01 UTC. Unix µs = value − 11 644 473 600 000 000 [S21].
- **`urls.visit_count`** "is really designed for autocomplete ranking, so some 'useless' transitions … aren't counted". Reloads don't increment it [S22][S23].
- **`urls.typed_count`** is the number of times the URL was typed in the omnibox, counting typed non-redirect and keyword-generated navigations [S22][S23]. Whether Arc's Command Bar records `TYPED` was not checked, since that would mean reading rows.
- **`urls.hidden = 1`** means "we won't autocomplete this URL" (usually subframes) [S22].
- **`visits.transition`**: the core type is `transition & 0xFF`: 0 LINK, 1 TYPED, 2 AUTO_BOOKMARK, 3 AUTO_SUBFRAME, 4 MANUAL_SUBFRAME, 5 GENERATED, 6 AUTO_TOPLEVEL, 7 FORM_SUBMIT, 8 RELOAD, 9 KEYWORD, 10 KEYWORD_GENERATED. The high bits are qualifiers: `0x01000000` FORWARD_BACK, `0x02000000` FROM_ADDRESS_BAR, `0x10000000` CHAIN_START, `0x20000000` CHAIN_END, `0x40000000` CLIENT_REDIRECT, `0x80000000` SERVER_REDIRECT [S24].
- **`visit_source.source`**: 0 synced, 1 browsed (not stored, because it is the default), 2 extension, 3–5 imported, … [S25].
- **Retention**: Chromium expires visits older than 90 days (`kExpireDaysThreshold = 90`) and subtracts them from `visit_count` / `typed_count` [S26][S27]. An Arc import therefore probably covers about the last 90 days, unless Arc changed the default (not verified).

### How Arc ties Spaces to profile directories

Copied `StorableSidebar.json` and walked it to print key paths and types only, never values.

- The live data is in `$.sidebar.containers[]`. One container has only `global`. The other has `items`, `spaces` and `topAppsContainerIDs`.
- `spaces` is a flat array that alternates `"<space id>"`, `{space object}`. Each string equals the next object's `id`.
- Each space object has `id`, `title`, `containerIDs[]`, `newContainerIDs[]`, `customInfo.iconType.icon` and `profile`.
- `profile` takes one of two forms:
  - `{"default": true}`: the `Default` directory.
  - `{"custom": {"_0": {"directoryBasename": "Profile N", "machineID": "<id>"}}}`: the directory `User Data/Profile N` on the machine with that ID.
- Every directory the Spaces reference exists. There are **more profile directories than Spaces**. The unreferenced ones look like leftovers, so the import should go by the Sidebar mapping, not list `User Data/`.
- `$.sidebarSyncState.*` and `$.firebaseSyncState.*` hold copies (`spaceModels[].value.profile…`, `orderedSpaceIDs`). Here they are stale and don't match the live Spaces, so ignore them.
- `User Data/Local State` → `profile.info_cache` lists Chromium's view of every directory, orphans included. It does not link directories to Spaces.
- Arc writes timestamped backups (`StorableSidebar.<date>.json`) next to the live file.

---

## 4. Safari's documented history import/export format

Safari has an Apple-documented, per-Profile history format. **File → Export Browsing Data to File** writes a ZIP that contains, for each Profile, a `History.json` named with the Profile name as a suffix [S28][S29]. History JSON has:

- `metadata`: `browser_name`, `browser_version`, `data_type: "history"`, `export_time_usec`, `schema_version`.
- `history[]`: entries with `url`, `title?`, `time_usec` (Unix µs of the latest visit), `visits_count`, `destination_url?` / `destination_time_usec?`, `source_url?` / `source_time_usec?`, `latest_visit_was_load_failure?`, `latest_visit_was_http_get?`.

Apple says other browsers "can also export … in the same format for someone to import into Safari", via **File → Import Browsing Data from File or Folder** [S28][S30]. Apple documents a profile choice for **export** ("choose the profile … or choose All Profiles") but **not for import** [S29][S30], so it is unverified which Profile imported history lands in. Safari's direct import only supports Chrome and Firefox; Arc isn't listed [S31]. The programmatic export sheet (`SFSafariSettings.openExportBrowsingDataSettings`) is iOS / iPadOS / visionOS 26+ only, not macOS [S32].

---

## What this means for Arcfari

**Recommended history source per Profile: Arcfari's own visit records, kept by the Arcfari Safari Web Extension running in that Profile.**

- **Recording**: main-frame `webNavigation.onCommitted` plus `tabs.onUpdated` URL/title changes, skipping `incognito` tabs. Records go into that Profile's extension storage (`storage.local` with `unlimitedStorage`, or IndexedDB). The Command Palette marks navigations it starts as typed. Frecency and Inline Completion read only this store, so they always cover the Active Profile only.
- **Access needed**:
  - Extension permissions: `webNavigation`, `tabs`, host access to all sites (needed anyway to show the Command Palette over pages), `storage` and `unlimitedStorage`.
  - The extension turned on in each of the four Profiles.
  - No FDA, and no private Safari files.
- **Cost of this choice**: no history from other devices, no reaction to Safari's "Clear History", and no transition types beyond Arcfari's own. All of these are acceptable for Frecency-driven completion.
- **Fallback, only if that proves too thin**: a non-sandboxed helper with FDA that reads `History.db` for each Profile (default at `~/Library/Safari/`, others at `…/Containers/com.apple.Safari/Data/Library/Safari/Profiles/<UUID>/`). It would map UUIDs to Profiles through `SafariTabs.db` and watch the `-wal` files. It depends on an undocumented layout that is not confirmed for Safari 27.

**How the Arc import maps onto it (one-time)**:

1. Quit Arc.
2. Read `StorableSidebar.json` → `sidebar.containers[].spaces[]` objects, in array order. For each Space, take the `title` and the directory: `profile.default` means `Default`; otherwise use `profile.custom._0.directoryBasename`.
3. Copy that directory's `History`.
4. Aggregate per URL from `visits` joined to `urls`:
   - Skip `hidden = 1` rows, reloads, subframe types (3, 4) and intermediate redirect hops (no CHAIN_END).
   - Keep the visit timestamps (converted from 1601 µs to Unix) so Frecency's recency part has real data, not only `last_visit_time`.
   - Keep `typed_count` as a weight.
5. Write one seed per Space.
6. Pair each seed with its Profile. The extension can't read its Profile's name; native messaging gives only a UUID. So the pairing has to be chosen once inside each Profile, for example on the extension's settings page: "this Profile = Arc Space X". Matching names through `SafariTabs.db` would need FDA.
7. Run the importer as a one-off tool in this repo, run from Terminal. That needs no FDA and no sandbox exception, and it isn't a runtime dependency under ADR-0001.

Optionally, each seed could also be written in Apple's `History.json` shape so it can be fed to Safari's own Import Browsing Data, giving Safari's own UI the Arc history too. Which Profile the import goes into is unverified.

## Open questions to settle while building

- Does `SFExtensionProfileKey` equal the `Profiles/<UUID>` directory name / `SafariTabs.db` `external_uuid`? This only matters for the fallback.
- Does `tabs.onUpdated` fire for `history.pushState` URL changes in Safari 27?
- Where do Safari 27 Profiles' history files actually live? Checking needs a one-off FDA grant to Terminal, or a Profile created and checked by `stat`.
- Which Profile does Safari's "Import Browsing Data from File" write history into?
- Does Arc keep Chromium's 90-day expiry?

## Sources

- [S1] mac_apt Safari plugin (Yogesh Khatri), `plugins/safari.py`, `GetSafariProfiles` / `ProcessSafariFolder`; profile support added in commit fe80071815 (2024-03-22), tags in 5283d8ab71 (2026-10-02). https://github.com/ydkhatri/mac_apt/blob/master/plugins/safari.py
- [S2] macfor KB, Safari History. https://kb-macfor-io.pages.dev/docs/browsers/safari/history
- [S3] macfor KB, Safari. https://kb-macfor-io.pages.dev/docs/browsers/safari
- [S4] WebKit blog, "News from WWDC23: WebKit Features in Safari 17 beta". https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/
- [S5] Apple Support, "Use profiles in Safari on Mac" (Safari 17+). https://support.apple.com/en-us/105100
- [S6] Cyber Security News on SwiftForensics' Safari history tags research (2026-10). https://cybersecuritynews.com/safari-history-tags-reveal-browsing-on-macos/
- [S7] Apple, Mac User Guide, "Change Privacy & Security settings on Mac" (macOS 27). https://support.apple.com/guide/mac-help/mchl211c911f/mac
- [S8] Apple Platform Security, "Controlling app access to files in macOS". https://support.apple.com/guide/security/secddd1d86a6/web
- [S9] Apple Developer, "Messaging between the app and JavaScript in a Safari web extension". https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension
- [S10] Apple Developer, "Protecting user data with App Sandbox". https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox
- [S11] SQLite, "Write-Ahead Logging" (§5 read-only, §6 checkpoints). https://www.sqlite.org/wal.html
- [S12] Apple (archive), FSEvents Programming Guide, "File System Event Security". https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/FileSystemEventSecurity/FileSystemEventSecurity.html
- [S13] MDN browser-compat-data v8.1.8, `webextensions/api/{history,webNavigation,browsingData,sessions,topSites}.json`. https://github.com/mdn/browser-compat-data/tree/main/webextensions/api
- [S14] MDN browser-compat-data, `webextensions/api/tabs.json`. https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/tabs.json
- [S15] Apple Developer, "Assessing your Safari web extension's browser compatibility". https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility
- [S16] Apple Developer, `SFExtensionProfileKey` (macOS 14.0+). https://developer.apple.com/documentation/safariservices/sfextensionprofilekey
- [S17] MDN browser-compat-data, `webextensions/api/storage.json`. https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/storage.json
- [S18] Chromium, `sql/database.h` (`exclusive_locking_ = true`). https://source.chromium.org/chromium/chromium/src/+/main:sql/database.h
- [S19] Chromium, `components/history/core/browser/history_database.cc` (`kCurrentVersionNumber = 70`, WAL behind `kHistoryDatabaseWriteAheadLogging`). https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/history_database.cc
- [S20] Chromium, `components/history/core/browser/url_database.cc` (`CreateURLTable`) and `visit_database.cc` (`InitVisitTable`). https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/url_database.cc , https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/visit_database.cc
- [S21] Chromium, `base/time/time.h` (Windows-epoch µs, `kMicrosecondsFromWindowsToUnixEpoch`). https://source.chromium.org/chromium/chromium/src/+/main:base/time/time.h
- [S22] Chromium, `components/history/core/browser/url_row.h`. https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/url_row.h
- [S23] Chromium, `components/history/core/browser/history_backend.cc` (`IsTypedIncrement`, `AddPageVisit`). https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/history_backend.cc
- [S24] Chromium, `ui/base/page_transition_types.h`. https://source.chromium.org/chromium/chromium/src/+/main:ui/base/page_transition_types.h
- [S25] Chromium, `components/history/core/browser/history_types.h` (`VisitSource`). https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/history_types.h
- [S26] Chromium, `components/history/core/browser/history_backend.h` (`kExpireDaysThreshold = 90`). https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/history_backend.h
- [S27] Chromium, `components/history/core/browser/expire_history_backend.cc`. https://source.chromium.org/chromium/chromium/src/+/main:components/history/core/browser/expire_history_backend.cc
- [S28] Apple Developer, "Importing data exported from Safari". https://developer.apple.com/documentation/safariservices/importing-data-exported-from-safari
- [S29] Apple, Safari User Guide, "Export browsing data from Safari on Mac". https://support.apple.com/guide/safari/ibrwebf10132/mac
- [S30] Apple, Safari User Guide, "Import browsing data from a file or folder". https://support.apple.com/guide/safari/ibrw9ffa6d10/mac
- [S31] Apple, Safari User Guide, "Import bookmarks and history from another browser". https://support.apple.com/guide/safari/ibrw1015/mac
- [S32] Apple Developer, `SFSafariSettings.openExportBrowsingDataSettings(completionHandler:)` (iOS/iPadOS/visionOS 26+). https://developer.apple.com/documentation/safariservices/sfsafarisettings/openexportbrowsingdatasettings(completionhandler:)
