# Can Safari 27 show no tabs at all?

Research for [Can Safari 27 show no tabs at all?](https://github.com/kfriars/arcfari/issues/18), on the map [Map: Arc's favourite features on Safari](https://github.com/kfriars/arcfari/issues/1). Checked 2026-11-10 against Safari 27.0.1 (bundle build 22625.1.29.11.28) on macOS 27.0.1 (26A434), plus Apple's release notes for the Safari 27.3 beta.

**The rule.** No tabs on screen, ever, except inside an opened sidebar, at any cost. It overrules the "keep the tabs" part of [Zero chrome or thin strip?](https://github.com/kfriars/arcfari/issues/9). This document lists the routes and what each costs. It doesn't pick one: [How does a Window show no tabs?](https://github.com/kfriars/arcfari/issues/19) does that.

**Builds on** three earlier documents, which aren't repeated here:

- [safari-chrome.md](https://github.com/kfriars/arcfari/blob/research/safari-chrome/docs/research/safari-chrome.md): only Separate and Compact exist in 27.0.1, Compact puts the tabs in the toolbar, and the toolbar can't be hidden in a normal window.
- [native-control.md](https://github.com/kfriars/arcfari/blob/research/native-control/docs/research/native-control.md): what the Swift helper can do through AppleScript, Accessibility (AX), event taps and ScreenCaptureKit.
- [safari-web-extension.md](https://github.com/kfriars/arcfari/blob/research/safari-web-extension/docs/research/safari-web-extension.md): what the extension can do.

**Method.** Read-only, nothing run against Safari:

- Apple's macOS 27 Safari User Guide and Mac User Guide pages, the Safari 27.0–27.3 beta release notes, and AppKit reference pages.
- The installed Safari 27.0.1: the `MainMenu.nib` and `TabsPreferences.nib` strings, `Defaults.plist`, the English string tables, and the C strings of `Safari.framework` read from the dyld shared cache with `dyld_info -section __TEXT __cstring`.

I didn't launch Safari, change a setting, run AppleScript or read any of this Mac's Safari data. Nothing here was observed on screen.

**Tags:**

- **[doc]**: stated by Apple, for macOS 27 or Safari 27.x unless the text says otherwise.
- **[bundle]**: read from the installed Safari 27.0.1.
- **[older]**: only confirmed for an older Safari.
- **[inferred]**: my reading of the evidence, or a press or third-party report (named inline). Each one needs an on-device check before anything is built on it.

## Summary

| Route | On Safari 27.0.1 today? | What still puts a tab on screen | Main cost | Verdict |
|---|---|---|---|---|
| **A. Vertical Tabs, sidebar closed** | No. New in **Safari 27.3**, now in beta | The tab column itself, if it can't be fully hidden. Unknown | Run macOS 27.3 beta, or wait for its release (the press expects December). Nothing in Arcfari's design changes | **Best fit, if the column hides.** Matches the rule's own exception |
| **B. One page per window** (Separate layout, Always Show Tab Bar off) | Yes, if the one-tab hiding still works (not yet confirmed on 27) | "Open Link in New Tab", Merge All Windows, pinned sites, Tab Groups and extensions still make tabs. The tab bar flashes until something splits the extra tab out | Every page becomes its own Safari window. The Window model, Tab Switcher and Command Palette all have to be reworked, and ⌘\` and Mission Control show one entry per page | **Works today, but it's expensive and leaky.** The fallback |
| **C. Full screen every day** | Yes | The top-edge reveal shows the strip, tabs included, and Safari can't stop it. Avoiding that needs route B too, which makes every page its own Space | A Space transition on every page switch and every ⌘#. Apple caps a Mac at 16 Spaces | **No** |
| **D1. Strip pushed above the screen** | No | n/a | AppKit keeps a titled window's top edge on a screen | **No** |
| **D2. Helper panel covering the strip** | Yes, with Apple APIs | Mission Control, drags, resizes and window animations, where the panel lags or isn't there | Arcfari redraws the window controls, Profile button and extension buttons. Ordering against another app's window is undocumented. It saves no space | **Last resort** |
| **E. Safari's sidebar tab list** | Partly. 27.0.1's sidebar can list a Tab Group's tabs | The tab bar still shows them too | n/a | **Not a route on its own.** It's the base Vertical Tabs appears to build on |

**Recommendation.**

- **Prefer Vertical Tabs (A), with the sidebar closed.** It's the only route that keeps tabs off screen without reworking the Window model, the Tab Switcher or the Command Palette. Its tabs live in a left column, which is exactly the rule's exception ("inside an opened sidebar").
  - It depends on one fact nobody has published: whether the Mac column can be closed completely, leaving no icon rail. Settle that first, on macOS 27.3.
  - That means either running the macOS 27.3 beta for the week of exclusive use, or waiting for 27.3 to ship.
- **Keep one page per window (B) only as the fallback.** Use it if the column can't be hidden, or if neither the beta nor the wait is acceptable. It works on 27.0.1, but it turns every page into a Safari window. That multiplies the ⌘\` and Mission Control leak that [How does a Window show one Profile at a time?](https://github.com/kfriars/arcfari/issues/12) already has to manage.
- **Rule out** C and D1. Keep D2 as a last resort only.

---

## 1. Vertical Tabs in Safari 27.3 (route A)

### What Apple says

- The Safari 27.3 beta release notes, under **Browser › New Features**: "Vertical Tabs introduces a new vertical layout for navigating and managing tabs with a space-efficient design that maximizes webpage content. (188851209)" **[doc]**
  - This corrects [safari-chrome.md](https://github.com/kfriars/arcfari/blob/research/safari-chrome/docs/research/safari-chrome.md), which read the 27.3 beta notes as silent on window chrome. The note is there now.
- "Safari 27.3 beta is available for iOS 27.3 beta, iPadOS 27.3 beta, visionOS 27.3 beta, macOS 27.3 beta, macOS 26, and macOS Sequoia." **[doc]** On macOS 27, then, it comes only with the macOS 27.3 beta.
- Apple's consumer Safari User Guide (macOS 27) doesn't cover it yet. Its Tabs settings page still offers only Separate and Compact. **[doc]**

### What the installed 27.0.1 shows

- **No vertical layout.**
  - `TabsPreferences.nib` has only `separateTabLayoutButton` and `compactTabLayoutButton`.
  - `MainMenu.nib` has no "Tab Layout" item.
  - The only layout-related code strings are `SeparateTabLayoutSpring2026` and `CompactTabLayoutSpring2026`.

  **[bundle]**
- **The sidebar can already list tabs.**
  - The string table has "Show Tabs in Sidebar" and "Hide Tabs in Sidebar" (both "library item context menu").
  - There's a per-tab context menu: Close Tab, Close Other Tabs, **Close Tabs Below**, Duplicate Tab, **Move Tab To New Window**, Copy Link, New Tab Group.
  - There's an accessibility string "Sidebar, close vertical tab" = "Close Tab".
  - The code has `SidebarLibraryItemTab`, `SidebarLibraryItemTabGroup`, `SidebarLibraryItemClusteredTab`, `SidebarLibraryItemTopic` and a block signature taking a `LibraryItemVerticalTab`. **[bundle]**
  - Apple's macOS 27 guide agrees. "Pinned sites stay put on the left side of your tab bar, and at the top of Tab Groups in the sidebar", and a tab can be dragged "to a new position in the tab bar, sidebar, or another window". **[doc]**

  So in 27.0.1 the sidebar lists a Tab Group's tabs as vertical rows, but the tab bar keeps showing them (route E). It's a reasonable guess that 27.3's Vertical Tabs is this sidebar list promoted to a layout, so closing the sidebar would hide the tabs. **[inferred]**

### What the press reports (not Apple)

All of these come from the developer beta (build 26C5035r, 2026-11-03; public beta about 2026-11-05). Several writers say outright that they haven't used it. **[inferred]**

- **Turning it on:** View › Tab Layout › Vertical, or Safari Settings › Tabs › Vertical ([iDownloadBlog](https://www.idownloadblog.com/2026/11/05/vertical-tabs-safari/)). [MacRumors](https://www.macrumors.com/2026/11/03/ios-27-3-safari/) says "in the Safari settings or in the View menu on Mac and iPad".
- **Look:** tabs sit on the left, shown as icons by default, and the column can be widened to show titles ([MacRumors](https://www.macrumors.com/2026/11/03/ios-27-3-safari/), [Gizmodo](https://gizmodo.com/safari-vertical-tabs-mac-ipad-iphone-duo-2000833607), [Macworld](https://www.macworld.com/article/3273418/apple-finally-brings-vertical-tabs-to-safari-in-surprise-27-3-feature-drop.html)).
- **Other features:** works with Tab Groups and Topics. Pinning by dragging still works ([MacRumors](https://www.macrumors.com/2026/11/03/ios-27-3-safari/)).
- **Release:** final release "expected in December" ([Macworld](https://www.macworld.com/article/3273418/apple-finally-brings-vertical-tabs-to-safari-in-surprise-27-3-feature-drop.html)). Apple hasn't announced a date ([iThinkDifferent](https://www.ithinkdiff.com/macos-golden-gate-27-3-public-beta-safari-vertical-tabs/)).
- **Gaps:** **No report says whether the Mac column can be collapsed or hidden.** None says what the top strip holds in this layout either. iDownloadBlog describes a collapse control only for iPad.

### What it costs

- **A beta OS, or waiting.** Getting Safari 27.3 on macOS 27 means the macOS 27.3 beta until it ships. **[doc]**
- **No Arcfari redesign.** Windows still hold many tabs, so these all stay as designed:
  - the Window model of [How does a Window show one Profile at a time?](https://github.com/kfriars/arcfari/issues/12);
  - the Tab Switcher;
  - the Command Palette's "switch to an open tab";
  - the helper's AppleScript tab control;
  - the extension's Visits. **[inferred]**
- **Setup changes.**
  - [docs/setup/safari.md](https://github.com/kfriars/arcfari/blob/main/docs/setup/safari.md) swaps Compact for Vertical and keeps the sidebar closed.
  - Safari has a `ShowSidebarInNewWindows` preference **[bundle]**, which suggests the closed state can carry over to new windows.
  - Toolbar items are saved per Profile *and per layout*, so the Toolbar has to be trimmed again in the new layout, in every Profile. The 27.0.1 identifiers are `ProfileCompactTabBarBrowserToolbarIdentifier-v3-…` and `ProfileStandaloneTabBarBrowserToolbarIdentifier-v3-…`. **[bundle]**
- **Glossary.** The **Toolbar** entry would stop holding "the tabs".
- **What could still break the rule:**
  - an icon rail, if the column can only shrink;
  - a tab-shaped element left in the top strip;
  - a hover reveal at the left edge.

  All three need checking.

## 2. One page per window (route B)

The idea: use the Separate layout with View › Always Show Tab Bar off, so the tab bar hides while a window has one tab. Then make sure no window ever gets a second tab.

### Does the tab bar still hide with one tab on 27.0.1?

- **Probably.** 27.0.1 still has all the pieces. **[bundle]**
  - the View menu item `alwaysShowTabBarMenuItem` (placeholder title "Show Tab Bar"), wired to `toggleAlwaysShowTabBar:`;
  - the "Always Show Tab Bar" title string;
  - the `AlwaysShowTabBar` preference, which `Defaults.plist` doesn't set.
- Apple's macOS 27 guide doesn't describe the behaviour. **[doc]**
- On Safari 26.0.1, users said the bar disappears with one tab when the item is unchecked. One reported that it came back after a second tab was opened and closed. **[older]** ([Apple Community](https://discussions.apple.com/thread/256176551))
- Only Separate can do this. In Compact the single tab *is* the Smart Search field, and a second tab appears beside it at once, with no hiding rule. **[doc]**, **[inferred]**

### Settings that send new pages to windows instead of tabs

| What opens a page | What decides tab or window | Setting for "window" | Evidence |
|---|---|---|---|
| ⌘-click and ⇧⌘-click on links, Favorites and bookmarks; ⌘-click on Back/Forward; ⌘-Return or ⌘-click on a Smart Search suggestion | Settings › Tabs › **"⌘-click opens a link in a new tab"** | **Off.** The labels switch to "Opens a link in a new window." and "…in a new window, and makes it the active window." | **[doc]** ("To use these Command-key shortcuts to open webpages in new windows instead of new tabs… deselect '⌘-click opens a link in a new tab'"). **[bundle]**: the nib labels, and the `CommandClickMakesTabs` preference, default `true` |
| `target="_blank"` links and `window.open` | Settings › Tabs › **"Open pages in tabs instead of windows"** | **Never**: "Links designed to open in new windows open in new windows." | **[doc]**. **[bundle]**: `TabCreationPolicy`, default `1` (Automatically) |
| Middle-click | Probably the same as ⌘-click | (as above) | **[inferred]** |
| Context menu **Open Link in New Tab** | Nothing. It's an explicit command | None. The same menu offers Open Link in New Window | **[bundle]** (both strings) |
| Links from other apps | Apple only documents *which Profile* ("the profile used most recently"), not tab or window | Unknown; check | **[doc]** ([Use profiles in Safari on Mac](https://support.apple.com/en-us/105100)) |
| A new window should come up in front | Settings › Tabs › "When a new tab or window opens, make it active" | On | **[doc]** |
| Topics (Apple Intelligence) | Settings › Tabs › Organize tabs | **Never**. Otherwise "a suggested topic appears in the tab row" | **[doc]** |

Safari 27.3 beta also fixes "only one new window opening when a page … followed several links with `target="_blank"` in a row" **[doc]**. Pages like that open several windows, not tabs, under Never.

### What still creates a second tab

These can't be switched off by any setting. Each one either has to be avoided or caught afterwards.

- **Open Link in New Tab** from a link's context menu. **[bundle]** App Shortcuts only change shortcuts of menu-bar commands **[doc]**, so the item stays.
- **Window › Merge All Windows** (`consolidateTabsAndWindows:`). It "convert[s] all open Safari windows to tabs in a single window". **[doc]**, **[bundle]** It can be given an unused shortcut but not removed.
- **Pinned sites.**
  - They "stay in place, even when you open a new Safari window", so one pin gives every window two tabs.
  - "When you click a link to another website from a pinned site, the other website opens in a new tab." **[doc]**
  - Rule: **no pinned sites** in any Profile.
- **Tab Groups.** Opening one fills the window with all of its tabs. **[doc]** Don't use them.
- **⌘T, File › New Tab at End, the New Tab button, and Tab Overview's +.** **[bundle]**
  - The helper's event tap already swallows ⌘T.
  - As a backstop, give New Tab and New Tab at End unused shortcuts in App Shortcuts, so a missed ⌘T does nothing.
  - Remove the New Tab and Tab Overview buttons in Customize Toolbar.
- **Duplicate Tab**, and the sidebar's **Open in New Tabs** on a bookmark folder. **[doc]**, **[bundle]**
- **Extensions.** `tabs.create` without a `windowId` adds a tab to the current window. 1Password, uBlock Origin Lite and Dark Reader can all open settings or fill pages that way. **[inferred]**
- **Dragging.** With the tab bar hidden there's no tab to drag. A link dropped on Safari's Dock icon or on a hidden tab bar is untested. **[inferred]**
- **Session restore** brings each window back with the tabs it had. One-tab windows restore as one-tab windows. **[inferred]**

### Catching a second tab and moving it out

- **From the extension (fastest, documented).**
  - `tabs.onCreated` fires in the Profile's own instance (Safari 14+).
  - `windows.create({tabId, left, top, width, height})` detaches that tab into a new window at the Window's frame. `tabId` support is new in Safari 27. **[doc]** ([Safari 27 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes))
  - An extension instance only sees its own Profile's windows **[doc]** (WWDC23), so the new window stays in the same Profile.
  - Cost: the extension gets a second job, which changes [ADR-0002](https://github.com/kfriars/arcfari/blob/main/docs/adr/0002-helper-draws-everything-extension-records-visits.md) ("the extension only records Visits").
- **From the helper.**
  - Count tabs with AppleScript (`count tabs of every window`), either on AX window notifications or by polling. **[doc]** (sdef)
  - Select the extra tab (`set current tab`).
  - Press **Window › Move Tab to New Window** (`moveCurrentTabToNewWindow:`) through AX. **[bundle]**
  - Safari's code names `AXSafariOpenedLinkInNewTab` and `AXSafariOpenedLinkInNewBackgroundTab`. They look like VoiceOver announcements, not a documented signal. **[bundle]**, **[inferred]**
- **Either way the tab bar is on screen until the move lands.** That's at least the event round trip plus Safari's own tab-bar animation. **[inferred]** So the settings above have to catch nearly everything. The split is a safety net, and each catch is a brief break of the rule.

### What the Separate toolbar row holds, and how small it gets

- With the tab bar hidden, Separate is a single row holding:
  - the window controls;
  - the combined Sidebar / Tab Group / Profile item (`CombinedSidebarTabGroupToolbarIdentifier`, string "Sidebar / Tab Groups / Private Browsing (Toolbar)");
  - Back/Forward;
  - the **Smart Search field** (`InputFieldsToolbarIdentifier`);
  - whatever buttons are kept: Share, New Tab, Tab Overview, extension buttons, Downloads and so on.

  **[bundle]** (toolbar identifiers), **[doc]** ([Customize the Safari browser window](https://support.apple.com/guide/safari/customize-the-safari-window-ibrw1012/mac))
- **The Smart Search field isn't a tab** in Separate. It's the address field, and "Tabs remain in the tab bar, below the toolbar". **[doc]**
- **Customize Toolbar** can remove most buttons. **[doc]** Apple doesn't say whether the Smart Search field can be removed. Its ⌘-drag tip excludes it. Either way, removing it wouldn't make the row shorter. **[inferred]**
- **Height.** Apple publishes no height for Separate or Compact. Both are one row here, so measure with a screenshot.
- **Per-Profile setup.** The Separate layout has its own per-Profile toolbar configuration (`ProfileStandaloneTabBarBrowserToolbarIdentifier-v3-<id>`), so trimming is redone in every Profile. **[bundle]**

### Knock-on costs

- **[How does a Window show one Profile at a time?](https://github.com/kfriars/arcfari/issues/12)**
  - A Window stops being "one Safari window per Profile". It becomes an Arcfari-kept stack of single-page Safari windows per Profile, all at one frame.
  - Every page window needs identifying (title prefix), framing and syncing on move or resize.
  - ⌘\`, Mission Control, the Window menu and the Dock menu list every page, not every Profile. That makes the `visible = false` hiding spike from [native-control.md](https://github.com/kfriars/arcfari/blob/research/native-control/docs/research/native-control.md) close to essential. **[inferred]**
  - ⌘W closes a window. macOS then brings up whichever Safari window is next in z-order, possibly another Profile's, so Arcfari has to re-raise the right page. That means a brief flash of the wrong page. **[inferred]**
- **Tab Switcher.**
  - "Tabs in list order" becomes page windows in an order Arcfari keeps itself. Safari only knows window z-order (AppleScript `index`). **[doc]** (sdef)
  - Switching means raising a window.
  - Previews: ScreenCaptureKit can target each page window directly. Whether occluded windows keep painting is untested, so last-seen snapshots stay the plan. **[inferred]**
- **Command Palette.**
  - "Switch to an open tab" means raising that page window at the Window's frame.
  - "Anything else opens in a new tab" means opening a new window in the Active Profile. That's an AX press of File › New ⟨Profile⟩ Window, then setting its URL and frame. It's slower than a tab, and macOS animates it. **[inferred]**
- **Vocabulary.** The glossary's "tab" would have to mean "page window" inside Arcfari.
- **Private windows** share the app-wide Tabs settings, so they open new windows too. **[inferred]** They stay stock otherwise.

## 3. Full screen every day (route C)

### Can the top-edge reveal be kept from showing tabs?

- **Not with Safari's settings.**
  - With View › Always Show Toolbar in Full Screen off, the toolbar "hides and shows with autoHidden menuBar" ([`autoHideToolbar`](https://developer.apple.com/documentation/appkit/nsapplication/presentationoptions-swift.struct/autohidetoolbar)). **[doc]**
  - The only other choices make it worse. Always Show keeps the toolbar visible. Setting the menu bar to auto-hide **Never** keeps the menu bar visible in full screen ([Use apps in full screen](https://support.apple.com/guide/mac-help/use-apps-in-full-screen-mchl9c21d2be/mac)) **[doc]**, which presumably keeps the toolbar visible with it. **[inferred]**
- **What the reveal shows:**
  - In **Compact**, it holds the tabs.
  - In **Separate**, it holds the toolbar plus the tab bar when the window has more than one tab **[inferred]** (open check 3 in [safari-chrome.md](https://github.com/kfriars/arcfari/blob/research/safari-chrome/docs/research/safari-chrome.md)).
  - With Vertical Tabs, it would hold the toolbar only. **[inferred]**
- **A helper could fence the pointer.** For example, `CGWarpMouseCursorPosition` (public, in the macOS 27 SDK's `CGRemoteOperation.h`) could push the pointer back down whenever it reaches the top edge over full-screen Safari. **[doc]** for the API. But:
  - the menu bar would become unreachable by mouse in full-screen Safari;
  - nobody knows whether the reveal fires before the warp;
  - it's a fragile hack.

  **[inferred]** Not recommended.

### Switching between full-screen windows

- **Each full-screen window is its own Space.** Moving between Spaces animates. **[doc]** ([Use apps in full screen](https://support.apple.com/guide/mac-help/use-apps-in-full-screen-mchl9c21d2be/mac), [Work in multiple spaces](https://support.apple.com/guide/mac-help/work-in-multiple-spaces-mh14112/mac))
- **Reduce motion** "customize[s] movement of some elements on the screen—for example, when you open apps, switch between desktops". It doesn't remove the transition. **[doc]** ([Customize onscreen motion](https://support.apple.com/guide/mac-help/mchlc03f57a1/mac)) Non-Apple write-ups say it turns the slide into a crossfade. **[inferred]**
- **Apple publishes no transition durations.** Time them with and without Reduce motion.
- **"You can create up to 16 spaces."** **[doc]** Apple doesn't say whether full-screen Spaces count toward that cap.
- **What it adds up to.** Multi-tab full-screen windows break the rule on every reveal. Avoiding that needs route B, which makes every page a full-screen Space. Then every page switch, every Command Palette jump and every ⌘# is a Space transition, and the page count may hit the cap. [Zero chrome or thin strip?](https://github.com/kfriars/arcfari/issues/9) already rejected everyday full screen for the ⌘# slides alone. **Verdict: no.**

## 4. Hiding the strip (route D)

### D1. Strip above the top of the screen: no

- **The window server would allow it.** It limits positions to ±16,000 ([`setFrameOrigin(_:)`](https://developer.apple.com/documentation/appkit/nswindow/setframeorigin(_:))). **[doc]**
- **Safari's own AppKit wouldn't.** [`constrainFrameRect(_:to:)`](https://developer.apple.com/documentation/appkit/nswindow/constrainframerect(_:to:)) "modifies and returns a frame rectangle so that its top edge lies on a specific screen". It's "invoked automatically … whenever a titled `NSWindow` object is placed onscreen and whenever its size is changed". **[doc]**
  - Only a subclass that overrides it escapes, and Safari's window can't be made to.
- **A third-party test** on macOS 15, 26 and 27 found that AX moves of titled windows to y = 0 were clamped to just below the menu bar (y = 31 on 26 and 27). Only a window that overrides `constrainFrameRect` stayed at y = 0. **[inferred]** ([TuckBar spike](https://github.com/lelanddutcher/TuckBar/issues/6))
- **It wouldn't last anyway.** Even if a plain move slipped through, the next resize, Space change or re-show would put the top edge back on screen. **[doc]**
- **A second display doesn't help.** With a display arranged above the main one, the "hidden" strip would just appear on that display. **[inferred]**

### D2. A helper panel covering the strip: possible, leaky

What it takes:

- An opaque, non-activating `NSPanel` over each Safari window's strip. Arcfari draws whatever it shows: a blank band, or its own thin Toolbar. It hides the strip but doesn't reclaim any space.
- It moves and resizes with the window, driven by AX `kAXWindowMovedNotification` and `kAXWindowResizedNotification`. **[doc]**

What breaks:

- **Ordering.** The panel must sit just above *that* Safari window and below everything else.
  - [`order(_:relativeTo:)`](https://developer.apple.com/documentation/appkit/nswindow/order(_:relativeto:)) takes another window's number. **[doc]** Apple doesn't say whether that works with another app's window. **[inferred]**
  - A `.floating` panel would float over other apps' windows.
  - Hiding the panel while Safari is in the background would expose the tabs of Safari windows left visible behind other apps.
- **Motion.** AX notifications arrive after the fact. The strip, tabs and all, shows during live drags and resizes, zoom, tiling, minimise and restore, and Space changes. **[inferred]**
- **Mission Control and App Exposé** show Safari's windows as Safari draws them, so the tabs show there. **[inferred]**
- **Safari's own buttons get covered:** the window controls, the Profile button, extension buttons and Downloads. Arcfari would have to redraw them and forward clicks with `kAXPressAction` **[doc]**. Extension popups anchor to buttons the user can no longer see.
- **Changing height.** In Separate the strip's height changes whenever the tab bar shows, so the panel has to follow.

**Verdict:** a last resort. It leaks in exactly the places the rule says "ever".

## 5. Small leaks common to every route

Wherever the tabs end up, Safari still has surfaces that show tabs outside a sidebar. Each is opened deliberately, and each can be avoided or given an unused shortcut:

- **Tab Overview** (⇧⌘\\, View › Show Tab Overview). **[doc]**, **[bundle]**
- Topics in the tab row. Turn them off. **[doc]**
- The Start Page's iCloud Tabs and Recently Closed Tabs. **[bundle]**
- History › Recently Closed. **[doc]**

**A question for [How does a Window show no tabs?](https://github.com/kfriars/arcfari/issues/19):** do Arcfari's own **Tab Switcher** previews and the Command Palette's open-tab rows count as "tabs on screen"? They're summoned, transient surfaces drawn by Arcfari, not Safari's chrome.

## Knock-on costs by route

| Route | [How does a Window show one Profile at a time?](https://github.com/kfriars/arcfari/issues/12) | Tab Switcher | Command Palette "switch to an open tab" |
|---|---|---|---|
| A. Vertical Tabs | No change | No change | No change |
| B. One page per window | A Window becomes a stack of page windows per Profile. Many more windows to identify, frame and hide. ⌘\` and Mission Control list every page. ⌘W can bring up the wrong window | Lists page windows in an order Arcfari keeps itself. Switching raises a window | Raises a page window. "New tab" becomes "new window in the Active Profile", which is slower and animated |
| C. Full screen (+ B) | Every page and every Profile swap is a Space transition. Up to 16 Spaces | As B, plus a Space slide per switch | As B, plus a Space slide. Panels need `fullScreenAuxiliary` |
| D2. Cover panel | No change to windows. One cover panel per visible Safari window | No change | No change |

## Out of bounds

These were considered and set aside because they aren't Safari or break [ADR-0001](https://github.com/kfriars/arcfari/blob/main/docs/adr/0001-only-apple-or-this-repo.md):

- **Safari web apps** (File › Add to Dock) have no tabs, but they can't be the daily browser. **[doc]** ([Use Safari web apps on Mac](https://support.apple.com/en-us/104996))
  - Their toolbar is only back, forward, Share and extension buttons.
  - A web app "shares no browsing history, cookies, website data, or settings with Safari", so Safari's Profiles don't apply.
  - "If you need Safari features such as bookmarks or tabs", Apple says to switch to Safari.
  - Each one is built around a single site. **[inferred]**
- **Arcfari's own WKWebView browser.** ADR-0001 would allow it, but it isn't Safari. It would lose Safari's Profiles and their data, and Safari's extensions such as 1Password. The destination is "Safari 27 plus code in this repo".
- **Safari Technology Preview** is a separate app with separate data, and its latest notes (256, 2026-11-04) don't mention Vertical Tabs. **[doc]**

## What this means for Arcfari

- **Only Vertical Tabs keeps Arcfari's design intact.** It's new in Safari 27.3 and, with the sidebar closed, it's the only route that meets the rule without touching the Window model, Tab Switcher or Command Palette. It is literally the rule's exception: tabs in a sidebar you open.
  - It stands or falls on one on-device fact: whether the Mac column can be closed completely.
  - It needs macOS 27.3: beta now, release expected in December by the press, not by Apple.
- **One page per window is the only route that works on today's 27.0.1.** It costs a rework of [How does a Window show one Profile at a time?](https://github.com/kfriars/arcfari/issues/12), the Tab Switcher and the Command Palette, plus brief tab-bar flashes whenever something slips past the settings.
  - It probably also means the extension watching `tabs.onCreated`, which changes [ADR-0002](https://github.com/kfriars/arcfari/blob/main/docs/adr/0002-helper-draws-everything-extension-records-visits.md).
- **Full screen every day and pushing the strip off screen don't work.** The cover panel is a last resort.
- **For [How does a Window show no tabs?](https://github.com/kfriars/arcfari/issues/19) to settle:**
  - **The route.** The recommendation is A, with B as the fallback.
  - **27.3.** Is the macOS 27.3 beta acceptable for the week of exclusive use, or does that week wait for the release?
  - **Arcfari's own surfaces.** Do the Tab Switcher and Command Palette count as "tabs on screen"?
  - **Follow-on edits:**
    - the **Toolbar** glossary entry (no tabs in it under either A or B);
    - [docs/setup/safari.md](https://github.com/kfriars/arcfari/blob/main/docs/setup/safari.md): Vertical and sidebar closed (A), or Separate with Always Show Tab Bar off plus the window settings above (B);
    - the destination text.
- **Work that doesn't depend on the route can go ahead meanwhile:** Visits, Frecency, the Command Palette panel and Profile key handling.

## Open checks (on device, for the user)

Nothing below was run. Each check is read-only, apart from the settings it names, so try them in a throwaway Profile if preferred.

**On macOS 27.3 (beta or release), for route A:**

1. **Turn it on.** Use View › Tab Layout › Vertical (or Settings › Tabs). Is it a third Tab layout next to Separate and Compact?
2. **Close the column.** Can it be closed *completely*, with View › Hide Sidebar, ⇧⌘L or the sidebar button, leaving no icon rail?
   - Does it stay closed in new windows, after relaunch, and in every Profile?
   - Does hovering the left edge bring it back?
3. **Check the top strip.** With the column closed, is anything tab-shaped left in it (a title pill, a tab count)? Where did the Profile button and extension buttons end up?
4. **Full screen.** Does the layout hold there, and is the top-edge reveal tab-free?
5. **Scripting.** Do AppleScript `tabs of window` and the extension's `tabs` APIs behave as before?

**On macOS 27.0.1, for route B and to close out the others:**

6. **One-tab hiding.** Choose Separate, then uncheck View › Always Show Tab Bar.
   - Does the bar hide with one tab?
   - Does it show with two, and hide again after closing back to one (the Safari 26 report says it didn't)?
7. **New pages.** Set "Open pages in tabs instead of windows" to Never and turn off "⌘-click opens a link in a new tab". Then try each of these and note whether it opens a tab or a window:
   - `target="_blank"`, `window.open`, ⌘-click, ⇧⌘-click and middle-click;
   - ⌘-Return in the Smart Search field;
   - a link from another app (for example `open https://example.com` in Terminal);
   - each daily extension's "open settings".
8. **Toolbar row.**
   - Can Customize Toolbar in Separate remove the Smart Search field and the New Tab button?
   - Screenshot the Separate one-tab row and the Compact strip to compare heights.
9. **The 27.0.1 sidebar.** Is "Show Tabs in Sidebar" offered for a window's own tabs, or only for named Tab Groups?
10. **AX clamp.** Move a Safari window's top edge above the top of the screen with one AX (or AppleScript `bounds`) write, then read the position back. Expected: clamped.
11. **Full screen.**
    - Time a switch between two full-screen Safari windows with Reduce motion off and on (a screen recording is enough).
    - What does ⌘N open from a full-screen window?

## Sources

Apple documentation (macOS 27 / Safari 27 versions unless noted):

- Safari release notes: [27.3 beta](https://developer.apple.com/documentation/safari-release-notes/safari-27_3-release-notes) (Vertical Tabs; the `target="_blank"` fix), [27.2](https://developer.apple.com/documentation/safari-release-notes/safari-27_2-release-notes), [27.1](https://developer.apple.com/documentation/safari-release-notes/safari-27_1-release-notes), [27](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes) (`windows.create` `tabId`).
- Safari User Guide:
  - [Change Tabs settings](https://support.apple.com/guide/safari/tabs-ibrw1045/mac)
  - [Use tabs for webpages](https://support.apple.com/guide/safari/use-tabs-for-webpages-sfri11576/mac)
  - [Arrange tabs](https://support.apple.com/guide/safari/arrange-tabs-ibrwbb6e21e4/mac)
  - [Close tabs](https://support.apple.com/guide/safari/close-tabs-ibrw27660e60/mac)
  - [Prevent or create duplicate tabs](https://support.apple.com/guide/safari/limit-or-duplicate-tabs-ibrwecff96b7/mac)
  - [Group tabs](https://support.apple.com/guide/safari/group-tabs-ibrwa2d73908/mac)
  - [Edit and customize Tab Groups](https://support.apple.com/guide/safari/edit-and-customize-tab-groups-ibrwd0cea393/mac)
  - [Pin frequently visited websites](https://support.apple.com/guide/safari/ibrw0495694f/mac)
  - [Customize the Safari browser window](https://support.apple.com/guide/safari/customize-the-safari-window-ibrw1012/mac)
  - [Keyboard shortcuts and gestures](https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac)
- Mac User Guide:
  - [Use apps in full screen](https://support.apple.com/guide/mac-help/use-apps-in-full-screen-mchl9c21d2be/mac)
  - [Change Menu Bar settings](https://support.apple.com/guide/mac-help/change-menu-bar-settings-mchlad96d366/mac)
  - [Work in multiple spaces](https://support.apple.com/guide/mac-help/work-in-multiple-spaces-mh14112/mac)
  - [Customize onscreen motion](https://support.apple.com/guide/mac-help/mchlc03f57a1/mac)
- [Use profiles in Safari on Mac](https://support.apple.com/en-us/105100), [Use Safari web apps on Mac](https://support.apple.com/en-us/104996).
- AppKit and CoreGraphics:
  - [`constrainFrameRect(_:to:)`](https://developer.apple.com/documentation/appkit/nswindow/constrainframerect(_:to:))
  - [`setFrameOrigin(_:)`](https://developer.apple.com/documentation/appkit/nswindow/setframeorigin(_:))
  - [`setFrame(_:display:)`](https://developer.apple.com/documentation/appkit/nswindow/setframe(_:display:))
  - [`order(_:relativeTo:)`](https://developer.apple.com/documentation/appkit/nswindow/order(_:relativeto:))
  - [`NSScreen.visibleFrame`](https://developer.apple.com/documentation/appkit/nsscreen/visibleframe)
  - [`autoHideToolbar`](https://developer.apple.com/documentation/appkit/nsapplication/presentationoptions-swift.struct/autohidetoolbar)
  - [`kAXPositionAttribute`](https://developer.apple.com/documentation/applicationservices/kaxpositionattribute)
  - `CGWarpMouseCursorPosition` in the macOS 27 SDK's `CoreGraphics/CGRemoteOperation.h`
- [Release Notes for Safari Technology Preview 256](https://webkit.org/blog/18602/release-notes-for-safari-technology-preview-256/) (WebKit blog).

Installed Safari 27.0.1 (read-only):

- `/Applications/Safari.app/Contents/Resources/Base.lproj/TabsPreferences.nib` and `MainMenu.nib` (strings).
- `/System/Library/PrivateFrameworks/Safari.framework/Versions/A/Resources/Defaults.plist`, `en.lproj/Localizable.strings` and `Localizable.stringsdict`.
- `Safari.framework`'s `__TEXT,__cstring` section from the dyld shared cache (`dyld_info -section __TEXT __cstring`): preference keys, toolbar identifiers, sidebar item classes.
- `sdef /Applications/Safari.app` (scripting dictionary).

Press and third-party (tagged [inferred] wherever used):

- On Safari 27.3 Vertical Tabs: [MacRumors](https://www.macrumors.com/2026/11/03/ios-27-3-safari/), [Macworld](https://www.macworld.com/article/3273418/apple-finally-brings-vertical-tabs-to-safari-in-surprise-27-3-feature-drop.html), [Gizmodo](https://gizmodo.com/safari-vertical-tabs-mac-ipad-iphone-duo-2000833607), [iDownloadBlog](https://www.idownloadblog.com/2026/11/05/vertical-tabs-safari/), [Switching to Mac](https://www.switchingtomac.com/safari-vertical-tabs-ios-27-3-macos-27-3/) and [iThinkDifferent](https://www.ithinkdiff.com/macos-golden-gate-27-3-public-beta-safari-vertical-tabs/).
- [TuckBar spike: AX moves clamped below the menu bar](https://github.com/lelanddutcher/TuckBar/issues/6) (macOS 15/26/27).
- [Apple Community thread on the Safari 26 tab bar](https://discussions.apple.com/thread/256176551) **[older]**.
