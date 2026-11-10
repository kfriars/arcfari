# What a Safari Web Extension can do in Safari 27

Research for [#3](https://github.com/kfriars/arcfari/issues/3) on the map [#1](https://github.com/kfriars/arcfari/issues/1). Researched 2026-11-10.

**Versions.** Checked against Safari 27.0.1 (build 22625.1.29.11.28) on macOS 27.0.1, with Xcode 27.2. Safari 27.2 shipped on 2026-10-26 for macOS 27.2 and 27.3 is in beta; anything that only arrives in those is marked. Anything only confirmed for an older Safari says so.

**Vocabulary.** Terms follow [GLOSSARY.md](../../GLOSSARY.md). Lowercase *window* and *tab* mean Safari's own windows and tabs as the `windows`/`tabs` APIs see them; capitalised **Window** is the glossary term.

**How each claim is backed** (tags used below):

- **[Apple]**: Apple developer documentation, Safari release notes, or a WWDC session.
- **[BCD]**: MDN browser-compat-data at commit [`07c6595`](https://github.com/mdn/browser-compat-data/tree/07c659514f0e1f528b16146f07778537d9178d5b/webextensions) (2026-11-10). Its Safari 27 update, [PR #31003](https://github.com/mdn/browser-compat-data/pull/31003), was written by Safari's extensions engineer and "checked against the Safari release notes, the WebKit and Safari source".
- **[WebKit]**: Safari's web-extension engine is WebKit's open-source `WKWebExtension` code. Links point at [`safari-7625.1.29.11-branch`](https://github.com/WebKit/WebKit/tree/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions) (WebKit 625.1.29.11), the branch the installed Safari 27.0.1 was built from. Safari's own UI and its delegate behaviour (shortcut conflicts, mapping Profiles to instances) are closed source.
- **[Local]**: read-only inspection of the Safari 27.0.1 app bundle and the Xcode 27.2 templates on this Mac. Nothing was run against Safari and no settings were changed.
- **[Untested]**: inferred but not verified. It needs an on-device spike (see [Open questions](#open-questions-for-an-on-device-spike)).

> Apple's own compatibility table, [Assessing your Safari web extension's browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility), still says `tabs.move` is "Not supported". That is stale for Safari 27; see [Tabs and windows](#2-tabs-and-windows).

## Short answers

| Question | Answer |
| --- | --- |
| Keyboard shortcuts | `commands` works and fires only while Safari is frontmost. It is limited to 4 manifest shortcuts, the key must be a letter, a digit, F1–F12, an arrow or one of a few named keys, and it fires on key-down only. Safari's own shortcuts win. ⌥⌘←/→ can be claimed. ⌘T, ⌘L and ⌘1–9 cannot while Safari binds them, and ⌘/ cannot at all. |
| Tabs and windows | Yes, across every window **of the extension's own Profile**: list, activate, create, close, focus a window. Moving tabs (`tabs.move`) and detaching a tab into a new window are new in Safari 27. Tab URL and title need host permission. There is no favicon, last-accessed time, discard or hide. |
| Profiles | Each Profile runs a separate instance with its own ID, background page and storage, enabled per Profile. An instance only sees its own Profile's windows and tabs and cannot act on another Profile. Site permissions are shared across Profiles. |
| Snapshots | `tabs.captureVisibleTab` works, but only for the **active** tab of a window (visible viewport, JPEG or PNG). It needs `activeTab` or host permission for that site. Background tabs cannot be captured. |
| Overlays | A content script can float a panel over any `http`/`https` page the user has granted. It can't on the Start Page, blank or `about:blank` tabs, Safari's internal pages, `file:` pages, other extensions' pages, or Private windows unless allowed. PDFs and Reader are untested. A new-tab page override is supported, once the user picks it in Safari Settings. |
| History | No `history` API, and no `topSites` or `sessions` either. Visits can be recorded with `webNavigation` + `tabs.onUpdated` given host permission, but there is no transition type (typed vs. link) and no `onHistoryStateUpdated`. |
| Native side | `runtime.sendNativeMessage` goes from the background script to the app extension's `SafariWebExtensionHandler` and carries the Profile's UUID. `runtime.connectNative` lets the containing app push messages. App Groups give a shared container and IPC. |

## 1. Keyboard shortcuts (`commands`)

**Supported.** `commands`, `commands.onCommand` and `commands.getAll` have been in Safari since 14. `onCommand` passes the `tab` from Safari 18 and `commands.onChanged` arrived in Safari 26. `commands.update`, `commands.reset`, `openShortcutSettings` and `global` shortcuts are not supported. **[BCD]** [`api/commands.json`](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/api/commands.json), [`manifest/commands.json`](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/manifest/commands.json)

**Commands are menu items now.** Safari 26: "Added support to show Web Extension commands in the menubar on macOS … On macOS, users can customize the keyboard shortcut associated with a command in Safari Settings." It also "prevented customization using System Settings", so App Shortcuts cannot rebind an extension's command. **[Apple]** [Safari 26 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes) WebKit builds each command as an `NSMenuItem` carrying the shortcut as its key equivalent ([`platformMenuItem`](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionCommandCocoa.mm#L279)). The host app is told to call `performCommandForEvent:` from its own event handling ([`WKWebExtensionContext.h`](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/API/Cocoa/WKWebExtensionContext.h#L602)). **[WebKit]** Because commands are menu key equivalents and `global` is unsupported, they **only fire while Safari is frontmost** and never bring Safari forward. That matches the map's hotkey rule.

**Limits, from the manifest parser.** **[WebKit]** [`WebExtension.cpp`](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/WebExtension.cpp#L2202):

- **At most 4 commands may have a `suggested_key`.** Any more produce "Too many shortcuts specified for `commands`, only 4 shortcuts are allowed" ([L161](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/WebExtension.cpp#L161), [L2382](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/WebExtension.cpp#L2382)). The limit only applies to manifest suggestions. The code path for a user-set shortcut ([`setActivationKey`](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionCommandCocoa.mm#L106)) has no count limit. So more commands can be declared without keys and bound by hand in Safari Settings. **[Untested]**
- **A shortcut is 1–2 modifiers plus one key.** Modifiers are `Command` (or `Ctrl`, which means ⌘ on Mac), `Alt` (⌥), `MacCtrl` (⌃) and `Shift`. The key must be A–Z, 0–9, F1–F12, `Comma`, `Period`, `Space`, `Insert`, `Delete`, `Home`, `End`, `PageUp`, `PageDown` or an arrow ([L2249–L2260](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/WebExtension.cpp#L2249)). User-set shortcuts get the same character check ([L116](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionCommandCocoa.mm#L116)). **`/` is not an allowed key, so ⌘/ can never be an extension command.**
- **Key-down only.** A command matches only a key-down event that isn't a repeat ([L319](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionCommandCocoa.mm#L319)). Nothing reports key-up or modifier release.

**Safari's own shortcuts win.** Safari 27.0.1's shortcut settings carry these strings: "This shortcut conflicts with a keyboard shortcut in Safari and will not work correctly." and "This shortcut conflicts with “%@” from the extension “%@” and may not work correctly." **[Local]** (`Safari.framework/…/en.lproj/Localizable.strings`) MDN's general rule agrees: "If a key combination is already used by the browser … you can't override it" ([MDN `commands`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands)). What Safari 27.0.1 binds, from the key equivalents in its `MainMenu.nib` **[Local]** and Apple's [Safari keyboard shortcuts](https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac) **[Apple]**:

| Arcfari wants | Safari 27.0.1 uses it for | Extension can claim it? |
| --- | --- | --- |
| ⌘T | New Tab | No, conflicts |
| ⌘L | Open Location… (focus the Smart Search field) | No, conflicts |
| ⌘1–⌘9 | Select tab 1–8 / last tab (Settings ▸ Tabs "Use ⌘1 through ⌘9 to switch tabs") | Not while that setting is on. Even with it off, only 4 can be manifest suggestions **[Untested]** |
| ⌥⌘← / ⌥⌘→ | Not bound in the main menu (⌥⌘[ and ⌥⌘] are Tab Group switching) | **Yes** (`Command+Alt+Left`/`Right`) |
| ⌘/ | Show Status Bar | **Never**: `/` is not a valid command key |

Safari's own menu items (not extensions' commands) can be rebound in System Settings ▸ Keyboard ▸ Keyboard Shortcuts ▸ App Shortcuts. That might free ⌘T or ⌘L for an extension command, but whether Safari's conflict check and dispatch honour the remap is **[Untested]**.

## 2. Tabs and windows

**Within the extension's Profile, across every window: yes.** These have all been supported since Safari 14 **[BCD]** ([`tabs.json`](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/api/tabs.json), [`windows.json`](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/api/windows.json)):

- `tabs`: `query` (all windows or one), `get`, `create` (with `windowId`, `index`, `active`, `pinned`), `update` (`active`, `url`, `pinned`, `muted`), `remove`, `duplicate`, `goBack`/`goForward`.
- `tabs` events: `onActivated`, `onUpdated`, `onCreated`, `onRemoved`.
- `windows`: `getAll({populate})`, `get`, `getLastFocused`, `create`, `update` (`focused`, bounds, `state`), `onFocusChanged`.

Switching to a tab in another window is `tabs.update(id, {active: true})` followed by `windows.update(windowId, {focused: true})`.

**New in Safari 27 (macOS):** `tabs.move` and `windows.create({tabId})`, which detaches a tab into a new window. **[Apple]** The [Safari 27 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes) list "Added support for the `tabId` key in `chrome.windows.create()`". **[BCD]** gives `tabs.move` as Safari 27. **[WebKit]** It landed as [316366@main](https://commits.webkit.org/316366@main) ([bug 318148](https://bugs.webkit.org/show_bug.cgi?id=318148)), and the [Safari 27.0.1 branch has it](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPITabsCocoa.mm#L581). It refuses to move tabs between private and non-private windows ([L632](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPITabsCocoa.mm#L632)). The release notes don't mention `tabs.move`, so confirm it on-device.

**Limits** **[BCD]**:

- `Tab.url` and `Tab.title` are empty strings without host permission for that tab.
- Unsupported: `Tab.favIconUrl`, `Tab.lastAccessed`, `tabs.discard`, `tabs.hide`/`show`, `tabs.highlight`, `tabs.captureTab`, tab groups, `windows.onBoundsChanged`, window `titlePreface`.
- `panel` window types are unsupported.

**Private windows** only appear if the user allows the extension in Private Browsing. That toggle exists since Safari 17 **[Apple]** ([Safari 17 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes)). WebKit filters windows and tabs the extension has no access to ([`openWindows`](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionContextCocoa.mm#L1214)). **[WebKit]**

## 3. Profiles

All of the following comes from Apple; the instance model was described for Safari 17, and no later release notes (18–27.3 beta) change it.

- **Enabled per Profile.** Safari 17 "Added support for enabling Safari Extensions per-profile" ([release notes](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes)). Users choose extensions per Profile, "This includes new tab page extensions" ([WWDC23 *What's new in Safari extensions*](https://developer.apple.com/videos/play/wwdc2023/10119/)). They are managed in Safari ▸ Settings ▸ Profiles ▸ *profile* ▸ Extensions ([Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)).
- **Separate instances.** "When an extension is turned on in a profile, it is an entirely new instance of that extension. This means each instance will have a different UUID, background page, and storage." (WWDC23)
- **No cross-Profile reach.** "When running in a profile, an extension only has access to the windows, tabs, and other data related to that profile." (WWDC23) So `tabs.query({})` and `windows.getAll()` return only that Profile's windows and tabs. Nothing in the JavaScript API names or reaches another Profile.
- **Shared site permissions.** "In Safari 17 and later, when you grant access to an extension for a specific web site, that grants the extension access to the site across all profiles, private browsing, and browsing without a profile." ([Managing Safari web extension permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions))
- **The native side can tell Profiles apart.** Messages to the native handler carry a Profile UUID under [`SFExtensionProfileKey`](https://developer.apple.com/documentation/safariservices/sfextensionprofilekey). Apple's sample treats a missing key as "normal browsing" (no Profile), and Xcode 27.2's template logs it as `none` **[Local]**. Apple says the app should "expect to receive messages from multiple profiles and respect the separation of data" (WWDC23).

## 4. Snapshots

- **`tabs.captureVisibleTab(windowId?, {format, quality})`** is supported since Safari 14. The default format is JPEG; `<all_urls>` is not required **[BCD]**, and Apple's table says the same **[Apple]**.
- **Active tab only.** WebKit resolves the window, takes `window->activeTab()` and snapshots its visible webpage ([L408–L426](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/API/WebExtensionContextAPITabsCocoa.mm#L408)). It fails with "either the 'activeTab' permission or granted host permissions for the current website are required" otherwise. **[WebKit]**
- **No background tabs.** There is no API for a tab that isn't the active one in its window (`tabs.captureTab` is a Firefox API, false for Safari **[BCD]**).
- **Non-web pages.** WebKit's permission flow only considers `http`/`https` URLs "valid to request … This avoids requesting for things like new tab pages, special tabs, other extensions, about:blank" ([L773](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionContextCocoa.mm#L773)). Capturing the Start Page or a blank tab is therefore expected to fail **[Untested]**.
- **Unknown:** whether a window that isn't frontmost (or is minimised) can be captured, and how fast captures can be repeated **[Untested]**. WebKit sets no rate limit.

## 5. Overlays and the new-tab page

**Content scripts can draw a floating panel on web pages.** Content scripts and `scripting.executeScript`/`registerContentScripts` (Safari 15.4/16.4 **[BCD]**) can inject a fixed-position element into the page. Shadow DOM keeps the page's CSS out. The schemes an extension can match are only `http`, `https` and its own extension pages ([`supportedSchemes`](https://github.com/WebKit/WebKit/blob/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions/WebExtensionMatchPattern.cpp#L62)) **[WebKit]**. "Safari ignores file URL schemes in manifest permissions" **[Apple]** (compatibility table).

**Safari 27 propagates user gestures** through `sendMessage()`, `connect()`, `postMessage()` and `executeScript()`, "enabling extensions to perform gesture-requiring actions" **[Apple]** ([Safari 27 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes)). A command handled in the background script can therefore hand a user gesture to the content script. Whether that is enough to move keyboard focus into an injected input is **[Untested]**.

**Where an overlay cannot appear:**

- The Start Page, blank tabs and top-level `about:blank`: not `http(s)`.
- Safari's own pages and UI.
- `file:` pages.
- Other extensions' pages, which use a different extension origin.
- Any site the user has not granted, which shows a permission badge instead ([Managing permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions)).
- Private windows, unless the extension is allowed there.
- Safari's PDF viewer and Reader: **[Untested]** (the URL may match, but the document is not a normal page).

**New-tab page override: supported.** `chrome_url_overrides.newtab` has worked since Safari 14.1, but "it does not take effect until the user chooses the extension to override the page in Safari's General settings" **[BCD]** ([`chrome_url_overrides.json`](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/manifest/chrome_url_overrides.json)). The choice is per Profile (WWDC23). The page is an extension page, so the extension fully controls it. `bookmarks` and `history` overrides are not supported.

**Other surfaces.** The toolbar popup (`action.openPopup`, Safari 16 **[BCD]**) anchors to the extension's Toolbar button; its behaviour with the Toolbar hidden is **[Untested]**. `windows.create({type: "popup"})` opens a separate window (`panel` types unsupported). Neither floats over the page the way a content script does.

## 6. History

- **No `history` API.** Every member and the `history` permission are false for Safari **[BCD]** ([`history.json`](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/api/history.json)). There is also no `topSites` and no `sessions`. Nothing reads Safari's own history from an extension.
- **Recording visits instead is possible:**
  - `webNavigation` (`onBeforeNavigate`, `onCommitted`, `onCompleted`, `onErrorOccurred`) since Safari 14, plus `tabs.onUpdated` (`url`, `title`, `status`).
  - Since Safari 17, webNavigation events no longer fire "for webpages where the extension hasn't been granted access" ([Safari 17 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes)). Tab URLs and titles also need host permission. So recording means granting the extension every website once, which is shared across Profiles.
- **Limits** ([Apple compatibility table](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility) **[Apple]**, **[BCD]**):
  - Missing: `transitionType` and `transitionQualifiers`. Typed and link visits can't be told apart, except for navigations the extension starts itself.
  - Missing: `onHistoryStateUpdated` (single-page-app `pushState` routes), `onReferenceFragmentUpdated`, `onCreatedNavigationTarget` and `onTabReplaced`.
  - Single-page-app route changes would have to come from `tabs.onUpdated`'s `url` change **[Untested]**.
- **Storage is per Profile automatically**, because each instance has its own (§3).
  - `storage.local`: 5 MB by default; the `unlimitedStorage` permission grants unlimited storage in Safari 16+ **[Apple]**.
  - `storage.sync` doesn't sync **[Apple]**.
  - `storage.session` is available since 16.4.
  - `setAccessLevel()` on `local`/`sync` arrives in 27.3 (beta) **[Apple]**. BCD says 27.2; the release notes win.

## 7. Native side

- **JavaScript → native.** Add the `nativeMessaging` permission. `browser.runtime.sendNativeMessage(…)` from the background script or an extension page reaches the app extension's `SafariWebExtensionHandler.beginRequest(with:)`. "Safari ignores the `application.id` parameter." "Content scripts that are injected into web content cannot send messages to the native app extension." **[Apple]** ([Messaging between the app and JavaScript](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)) Each message is a request/response, with the Profile UUID under `SFExtensionProfileKey` (§3). Xcode 27.2's template does exactly this **[Local]**.
- **App → JavaScript (macOS only).** `browser.runtime.connectNative(…)` opens a port to the containing app. The app sends with [`SFSafariApplication.dispatchMessage(withName:toExtensionWithIdentifier:userInfo:)`](https://developer.apple.com/documentation/safariservices/sfsafariapplication/dispatchmessage(withname:toextensionwithidentifier:userinfo:completionhandler:)), which launches Safari if needed **[Apple]**. Which Profile instances receive a dispatched message is not documented **[Untested]**.
- **Shared storage and IPC.** With App Groups, the app and its app extension share a group container. In macOS a `<team id>.<name>` group needs no registration. Group members can use Mach/XPC, POSIX semaphores and shared memory, and UNIX domain sockets **[Apple]** ([App Groups entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups)). This is the only channel through which one Profile's instance can learn about another's.
- **Packaging constraints that matter for daily use** **[Apple]**:
  - Native messaging needs the Xcode-packaged app; a temporary folder install can't message an app.
  - "Allow unsigned extensions" resets every time Safari quits.
  - Temporary installs are removed after 24 hours or on quit ([Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)).
  - Safari 18.4 added loading of Developer ID-signed, notarized extensions ([Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes)).
  - Signing itself is out of scope here.

## What this means for Arcfari

| Concern | The extension can own | The extension cannot own |
| --- | --- | --- |
| **Hotkeys** | ⌥⌘← / ⌥⌘→ as commands, firing only while Safari is frontmost, as the map wants. | ⌘T, ⌘L and ⌘1–9 while Safari binds them, and ⌘/ ever. It also can't see ⌘⌥ being released, so the Tab Switcher's "release to go" can't come from a command. |
| **Command Palette overlay** | Drawing the panel on any granted `http(s)` page via a content script. Searching the open tabs of all the Profile's windows. Taking over blank tabs through a new-tab override, once chosen in Settings. | The Start Page, blank and `about:blank` tabs (unless the override is chosen), internal pages, `file:` pages, other extensions' pages, possibly PDFs and Reader. |
| **Cross-window tab access** | Listing, activating, creating, closing and (Safari 27) moving tabs, and focusing or creating windows, all within the Profile. | Anything in another Profile. Moving tabs between private and non-private windows. |
| **Per-Profile behaviour** | "Active Profile only" comes for free: each Profile's instance sees and stores only its own data. | Switching a Window's Profile. Seeing or acting on other Profiles. Each Profile must have the extension turned on separately; site access is granted once. |
| **Snapshots** | Last-seen snapshots by capturing the active tab on `tabs.onActivated`/load. A live snapshot of the current tab. | Background tabs, and probably non-web pages. Favicons are not exposed (`favIconUrl` unsupported), so a content script must read the page's icon link. |
| **History recording** | A per-Profile visit log for Frecency and Inline Completion, given host access to all sites. | Safari's own history (no API). Typed-vs-link transition data. `pushState` events (fall back to `tabs.onUpdated`). |
| **Native bridge** | Background ↔ `SafariWebExtensionHandler` requests tagged with the Profile UUID, app → extension pushes, and App Group storage and IPC. | Content scripts talking to native directly (they relay via the background script). |

Net effect: an extension can be the **engine** for the Command Palette, Inline Completion, history and Frecency, tab search and switching, and snapshots. It cannot own **⌘T, ⌘L, ⌘/ or ⌘1–9**, the **Profile switch inside one Window**, or the **⌘⌥ release** of the Tab Switcher. Those need either Safari's menu shortcuts freed via App Shortcuts (untested) or the native app (Accessibility, event taps), which is a separate question.

## Open questions for an on-device spike

1. If Safari's New Tab / Open Location menu items are rebound in System Settings ▸ App Shortcuts, can an extension command then use ⌘T / ⌘L, and does Safari's conflict warning go away?
2. Can more than 4 commands be given shortcuts by hand in Safari Settings (the code path suggests yes)? Does turning off "Use ⌘1 through ⌘9 to switch tabs" free ⌘1–9 for them?
3. With the extension enabled in several Profiles, which instance gets `commands.onCommand`? Expected: the one for the front window's Profile.
4. Does a page or content-script `keydown` listener see ⌘T/⌘L before Safari's menu, and can it `preventDefault()` them?
5. Can a content script draw over Safari's PDF viewer and Reader? Can the user-gesture hand-off focus an injected input?
6. Can `captureVisibleTab` capture a window that isn't frontmost, and how often can it run?
7. Which Profile instance(s) receive `SFSafariApplication.dispatchMessage`?
8. Does `tabs.onUpdated` report `pushState` URL changes?
9. Confirm `tabs.move` works in 27.0.1; it is in WebKit and BCD but not in the release notes.

## Sources

- Apple:
  - [Assessing your Safari web extension's browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)
  - [Messaging between the app and JavaScript in a Safari web extension](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension)
  - [`SFExtensionProfileKey`](https://developer.apple.com/documentation/safariservices/sfextensionprofilekey)
  - [Managing Safari web extension permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions)
  - [Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
  - [`SFSafariApplication.dispatchMessage`](https://developer.apple.com/documentation/safariservices/sfsafariapplication/dispatchmessage(withname:toextensionwithidentifier:userinfo:completionhandler:))
  - [App Groups entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups)
  - [Safari keyboard shortcuts](https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac)
- Safari release notes: [17](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes), [18.4](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes), [26](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes), [27](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes), [27.2](https://developer.apple.com/documentation/safari-release-notes/safari-27_2-release-notes), [27.3 beta](https://developer.apple.com/documentation/safari-release-notes/safari-27_3-release-notes).
- WWDC: [WWDC23 10119 *What's new in Safari extensions*](https://developer.apple.com/videos/play/wwdc2023/10119/) (Profiles), [WWDC26 216 *Create web extensions for Safari*](https://developer.apple.com/videos/play/wwdc2026/216/) (general; nothing beyond the above).
- MDN browser-compat-data:
  - [`webextensions/` at `07c6595`](https://github.com/mdn/browser-compat-data/tree/07c659514f0e1f528b16146f07778537d9178d5b/webextensions)
  - [PR #31003 (Safari 27 update)](https://github.com/mdn/browser-compat-data/pull/31003)
  - [MDN `commands` manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands)
- WebKit:
  - [`Source/WebKit/UIProcess/Extensions` on `safari-7625.1.29.11-branch`](https://github.com/WebKit/WebKit/tree/2756e8be58521b10c8e8bff8da1f13d97f2eae27/Source/WebKit/UIProcess/Extensions)
  - [bug 318148 `tabs.move`](https://bugs.webkit.org/show_bug.cgi?id=318148)
- Local, read-only:
  - Key equivalents in `/Applications/Safari.app/Contents/Resources/Base.lproj/MainMenu.nib`.
  - Shortcut-conflict strings in `/System/Library/PrivateFrameworks/Safari.framework/Versions/A/Resources/en.lproj/Localizable.strings`.
  - The "⌘1 through ⌘9" checkbox in `TabsPreferences.nib`.
  - Xcode 27.2's `SharedContent Safari Extension.xctemplate` (`SafariWebExtensionHandler.swift`, `manifest.json`).
