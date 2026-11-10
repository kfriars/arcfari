# How can a native helper control Safari's windows, tabs and Profiles?

Research for [#5](https://github.com/kfriars/arcfari/issues/5), part of map [#1](https://github.com/kfriars/arcfari/issues/1). Written 2026-11-10.

**Environment checked:** macOS 27.0.1 (26A434), Safari 27.0.1 (22625.1.29.11.28), Xcode with the macOS 27 / 27.2 SDKs. Under [ADR-0001](../adr/0001-only-apple-or-this-repo.md), everything below uses only Safari, Apple-supported macOS APIs and Swift code in this repo. Private SPI is flagged wherever it would otherwise come up.

**Method.** I read Safari 27.0.1's own scripting dictionary (`sdef /Applications/Safari.app`), its bundle resources (`MainMenu.nib`, localized strings, App Intents metadata), the macOS 27 SDK headers, Apple's developer docs (pulled as DocC JSON), the Safari and macOS release notes up to 27.3 beta, Apple Support articles, and Apple-staff answers on the Developer Forums. Nothing was run against Safari: no `osascript`, no AX calls, no permission prompts. Every behavioural claim about Safari therefore comes from documentation or static inspection, and the spike list at the end says what to try first.

**Terms.** The glossary's *Window* is the illusion the user sees. The thing that implements it is a **per-Profile Safari window**: a real `NSWindow` owned by Safari that belongs to exactly one Profile. *Helper* means Arcfari's native Swift app.

**Confidence tags** used below:

- **[27]**: confirmed by inspecting Safari 27.0.1, the macOS 27 SDK, or Apple pages that cover macOS/Safari 27.
- **[Doc]**: current Apple API documentation that names no version.
- **[Old]**: confirmed only for older macOS or Safari versions.
- **[Unverified]**: an inference or a third-party report. It needs a hands-on spike.

---

## Short answers

| Question | Answer |
|---|---|
| **Scripting** | Safari 27's dictionary covers windows, tabs and URLs. A helper can read and set a tab's URL, create tabs (`make new tab`), select a tab (`current tab` is writable), close tabs, and read or set a window's `bounds`, `index` (front-to-back order), `miniaturized` and `visible`. **No Profile is exposed**: no window, tab or document property mentions one. Safari's App Intents don't expose one either. **[27]** |
| **Accessibility** | AX can set window frames, raise windows, minimize them, and press menu items such as **File › New [Profile] Window**. That item is the only documented way to open a window for a given Profile. AX has no Profile attribute, so a window's Profile must be inferred, most likely from its title. Reportedly Safari prefixes the title with the Profile name and an em dash; that report is for Safari 26.6 and is **[Unverified]** on 27. Neither AX nor scripting can remove Safari's windows from ⌘\` or Mission Control. A helper can only take a window off-screen, by minimizing it or, possibly, by setting `visible` to false. |
| **Keys** | Yes. An **active `CGEventTap`** sees ⌘T, ⌘L, ⌘1–9, ⌘⌥←/→ and ⌘/ before Safari does, and returning `NULL` drops the event. It can be a session tap gated on "Safari is frontmost", or a tap scoped to Safari's process with `tapCreateForPid`. The tap needs Input Monitoring, and for an active (modifying) tap the Accessibility pane too. Carbon `RegisterEventHotKey` also swallows ⌘-combos and needs no documented TCC permission, but it can't see ⌘⌥ being released. NSEvent global monitors can only observe, never swallow. App Shortcuts can move Safari's own menu shortcuts out of the way but cannot hand keys to the helper. |
| **Snapshots** | Yes, for whatever a Safari window is currently drawing, which is its current tab. Use ScreenCaptureKit: `SCContentFilter(desktopIndependentWindow:)` plus `SCScreenshotManager`, or an `SCStream` for a live preview. This needs Screen Recording permission. Apple publishes no latency or CPU figures. Background tabs aren't drawn, so their previews must be last-seen snapshots, which is what the map already plans. |
| **Links from other apps** | Apple's doc says they open "in the profile used most recently", unless Settings › Websites › **Open Links With Profile** names a Profile for that site. A helper can't change the rule. It can lean on it by keeping the Active Profile's window frontmost, or take full control by registering as the default browser and forwarding each link into the right window by AppleScript. |

---

## 1. Scripting: Safari 27's dictionary

Safari's `Info.plist` sets `NSAppleScriptEnabled = Yes` and `OSAScriptingDefinition = Safari.sdef`. **[27]**

The sdef pulls in the Cocoa Standard Suite (`/System/Library/ScriptingDefinitions/CocoaStandard.sdef`) and adds a small "Safari suite". **[27]** Together they give the following.

### What's exposed

**window**: Standard Suite plus Safari's extension.

| Property / element | Access | Notes |
|---|---|---|
| `name` | r | Window title (`NSWindow.title`). |
| `id` | r | "The unique identifier of the window" (`uniqueID`). Whether it equals the window server's `CGWindowID` is **[Unverified]**. |
| `index` | **rw** | Front-to-back order. Setting it reorders the window (`NSWindow.orderedIndex`, "zero-based position… among all visible application windows"). |
| `bounds` | **rw** | Frame rectangle. |
| `miniaturized` | **rw** | Minimize or restore (`setIsMiniaturized:`). |
| `visible` | **rw** | Maps to `NSWindow.setIsVisible:` in AppKit's `NSWindowScripting.h`. See [§2 Hiding](#hiding-and-keeping-windows-out-of--and-mission-control). |
| `zoomed` | rw | |
| `current tab` | **rw** | Safari extension. Setting it selects a tab. |
| `tabs` | element | Safari extension (`orderedTabViewItems`). |
| `document` | r | The window's front document. |

**tab**: Safari suite.

| Property | Access | Notes |
|---|---|---|
| `URL` | **rw** | Setting it navigates the tab. |
| `name` | r | Page title. |
| `index` | r | Left-to-right position. |
| `visible` | r | Whether the tab is the one showing. |
| `source`, `text` | r | Page HTML and text. |
| `pid` | r, *hidden* | PID of the tab's WebContent process. |

**document**: `URL` (rw), `source`, `text`, `name`.

**Commands:** `make` (new `tab` / `document`), `close` (tab or window), `move`, `do JavaScript`, `search the web`, `add reading list item`, `show bookmarks`. A few hidden commands (`dispatch message to extension`, `show extensions preferences`, `sync all plist to disk`) are locked behind access groups such as `com.apple.Safari.dispatch-message-to-extension` and `com.apple.private.Safari.sync-plist`. These are Apple-internal, so treat them as unavailable. **[27]**

### Is a window's Profile exposed? No.

- **Scripting.** No class in the Safari suite or the Standard Suite has a Profile, Tab Group or private-browsing property. **[27]**
- **App Intents (Shortcuts).** I checked Safari's App Intents metadata (`SafariSwift.framework/…/Metadata.appintents/extract.actionsdata`). `CreateNewWindow` takes only `isPrivate`, and `WindowEntity` exposes only `title`, `tabs` and `isPrivate`. `ProfileEntity` (just a `title`) is used only by the Focus filter "Set Profile or Tab Group" (`OpenTabGroupForFocus`). Other intents include "Show Window" and "Move Tabs to Window". None of them opens a window for a given Profile. In any case, a helper can reach App Intents only through the Shortcuts app. **[27]**

### What a helper can do with it

These follow from the dictionary. The exact Safari 27 behaviour of each still wants a quick check.

```applescript
-- create, select, navigate, close (window id N is an existing per-Profile Safari window)
tell application "Safari"
  set t to make new tab at end of tabs of window id N with properties {URL:"https://example.com"}
  set current tab of window id N to t
  set URL of current tab of window id N to "https://example.org"
  close tab 3 of window id N
  set bounds of window id N to {x1, y1, x2, y2}
  set index of window id N to 1          -- bring to front within Safari
  set miniaturized of window id N to true
end tell
```

- **A tab made inside window N should belong to N's Profile**, because each Safari window belongs to exactly one Profile. **[Unverified]** It's a strong inference, but confirm it.
- **Which Profile `make new document` opens a window in is unknown.** Don't rely on it. Use the menu item instead (see [§2](#opening-a-window-for-a-given-profile)). **[Unverified]**
- **`do JavaScript` is gated by Safari's "Allow JavaScript from Apple Events" setting.** Safari 27 has the confirmation strings for it, including a Touch ID prompt. Window and tab control doesn't need it. **[27]**
- **Performance.** Each property read is an Apple Event round trip. Fetch in bulk (`URL of every tab of window id N`, `name of every tab of window id N`) rather than tab by tab. This is engineering advice, not from a doc.

### Permissions for scripting

- **Automation › Safari** (TCC Apple Events consent). The first event sent to Safari prompts for it. `AEDeterminePermissionToAutomateTarget(…, askUserIfNeeded: false)` checks without prompting (`AE.framework/Headers/AppleEvents.h`, macOS 10.14+). **[27]**
- **`NSAppleEventsUsageDescription`** in the helper's `Info.plist`. Apple: "This key is required if your app uses APIs that send Apple events." **[Doc]**
- With the Hardened Runtime: the **`com.apple.security.automation.apple-events`** entitlement. **[Doc]**
- **No App Sandbox.** Apple lists "Sending Apple Events to arbitrary apps" and "Use of accessibility APIs in assistive apps" as incompatible with App Sandbox. That's fine for a personal, non-App Store helper. **[Doc]**
- From Swift: `SBApplication` (Scripting Bridge, dynamic), `NSAppleScript`, or hand-built `NSAppleEventDescriptor`s. **[Doc]**

---

## 2. Accessibility

AX (`AXUIElement.h`) gives a trusted helper the same window-level control a person has. The relevant pieces, all in the macOS 27 SDK headers **[27]**, are:

- `AXUIElementCreateApplication(pid)`, then `kAXWindowsAttribute`, `kAXFocusedWindowAttribute`, `kAXMainWindowAttribute` and `kAXMenuBarAttribute`.
- Per window: `kAXTitleAttribute`, `kAXPositionAttribute` and `kAXSizeAttribute`. The header says windows "should offer" writable position and size. `kAXMinimizedAttribute` is writable, `kAXMainAttribute` is writable, `kAXRaiseAction` raises, and `kAXPressAction` presses buttons and menu items.
- App level: `kAXHiddenAttribute` (hide or unhide all of Safari) and `kAXFrontmostAttribute`.
- Notifications through `AXObserverCreate`: `kAXWindowCreatedNotification`, `kAXWindowMovedNotification`, `kAXWindowResizedNotification`, `kAXFocusedWindowChangedNotification` and `kAXTitleChangedNotification`. The helper can keep sibling windows in sync without polling.

### Telling which Profile a window belongs to

The public AX headers have no Profile attribute **[27]**. Three signals are available:

1. **The window title.** A third-party tool tested on macOS and Safari 26.6 reports that, with more than one Profile, "Safari prefixes each window title with the profile name and an em dash (U+2014)". It adds that there's no prefix with a single Profile, and that private windows don't match ([goreckim/safari-profile](https://github.com/goreckim/safari-profile)). The title is readable three ways: `kAXTitleAttribute`, AppleScript `name`, and `SCWindow.title`. **[Unverified]** on 27, and a page whose own title starts with "Name — " would be misread.
2. **The Toolbar's Profile button.** Apple: "the Safari toolbar shows a button with the name, symbol, and color of the currently used profile" ([Use profiles in Safari on Mac](https://support.apple.com/en-us/105100)). AX should see it as a button, but the minimal-chrome goal (#2, #9) may hide it. **[Doc]** for its existence; reading it through AX is **[Unverified]**.
3. **Bookkeeping.** The helper knows which Profile it asked for when it pressed "New [Profile] Window" and can remember the new window. That memory is lost when Safari relaunches, so (1) is still needed to re-identify windows.

### Opening a window for a given Profile

- Apple documents three ways: the **File** menu ("choose New [Profile] Window from the File menu"), the Toolbar Profile button's menu, and, per Safari 27's own strings, the **Dock menu** (`"Item in dock menu to open a profile window" = "New %@ Window"`). [105100](https://support.apple.com/en-us/105100) **[Doc]**, strings **[27]**.
- From the helper: walk `kAXMenuBarAttribute` → File → New Window → "New … Window", then `AXUIElementPerformAction(item, kAXPressAction)`. The third-party report gives the path as **File › New Window › New ⟨Profile⟩ Window** on Safari 26.6 **[Unverified]**. Titles are localized: the English format is `New %@ Window`.
- AppleScript and App Intents offer no Profile-aware window creation (see §1). **[27]**

### Frames and raising

- Set frames with AX `kAXPositionAttribute`/`kAXSizeAttribute`, or with AppleScript `bounds`. **[27]** (header, sdef)
- Raise one window with AX `kAXRaiseAction` plus `NSRunningApplication.activate(options:)`, or with AppleScript `set index of window id N to 1`. **[Doc]**

### Hiding, and keeping windows out of ⌘\` and Mission Control

- **Which windows ⌘\`, Mission Control and the Window menu include is decided by the window's owner.** Those are `NSWindow.collectionBehavior` (`.ignoresCycle`, `.transient`, `.participatesInCycle`, …) and `isExcludedFromWindowsMenu`. They're properties of Safari's own `NSWindow`s, and no AX attribute or scripting property exposes them. **A helper cannot opt Safari's windows out.** **[Doc]** for the APIs; "no external route" comes from the full list of AX attribute constants and the sdef. **[27]**
- **The only escape is to take a window off-screen.**
  - **Minimize** (`kAXMinimizedAttribute` = true, or AppleScript `miniaturized`). Works **[27]** (writable per header and sdef). But it animates into the Dock and leaves a Dock tile, which makes it a poor fit for an instant ⌘# swap.
  - **`visible` = false** (AppleScript only). It goes through AppKit's `setIsVisible:` (`NSWindowScripting.h`) **[27]**, presumably ordering the window out. Community reports from 2014 say this hid a Safari window and removed it from the Window menu, and one said it closed the window ([MacScripter](https://www.macscripter.net/t/how-to-script-safari-to-bring-to-front-and-focus-on-a-specific-window/68198)) **[Old]**. If it hides cleanly on Safari 27 and survives session restore, sibling per-Profile windows could sit fully hidden, and ⌘\`, Mission Control and the Window menu would show only the Active Profile. **This is the single most valuable thing to spike.**
  - **Hide the whole app** (`kAXHiddenAttribute`, `NSRunningApplication.hide()`). This hides every Safari window, so it doesn't help.
- **Fallback: stack sibling windows at the same frame and raise the Active one.** It works with everything above, but the stack shows up in ⌘\`, Mission Control, the Window menu and the Dock menu. That's the leak the map already accepts.

### Joining AX, scripting and ScreenCaptureKit windows

- AX has **no public** way to get a window's `CGWindowID`. The usual `_AXUIElementGetWindow` is private SPI, so ADR-0001 rules it out. Apple engineers on accessibility-dev said in 2006–2008 that there was no good public route, and I found nothing newer **[Old]**.
- Join on what the APIs share. AX has `(title, frame)`, AppleScript has `(id, name, bounds)`, and `SCWindow` has `(windowID, title, frame)`. Stacked windows share a frame, so **title is the discriminator**. If AppleScript `id` turns out to equal `CGWindowID` **[Unverified]**, it joins scripting to ScreenCaptureKit exactly, and only the AX side needs title matching.

### Permission for AX

**Accessibility** (Privacy & Security › Accessibility). `AXIsProcessTrustedWithOptions` checks it and can prompt. AX doesn't work in an App Sandbox (Quinn, DTS: "It's not possible for a sandboxed app to use the Accessibility privilege", [forum 780626](https://developer.apple.com/forums/thread/780626), Apr 2025). **[Doc]**

---

## 3. Keys: seeing and swallowing ⌘T, ⌘L, ⌘1–9, ⌘⌥←/→, ⌘/

### Safari's defaults these replace

- Apple's macOS 27 Safari shortcuts page lists ⌘L "Select the Smart Search field", ⌘1–⌘8 "Select one of your first eight tabs", ⌘9 "Select your last tab", and ⌘\` "Switch to another Safari window". It doesn't list ⌘⌥←/→ ([Safari keyboard shortcuts](https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac)). **[27]**
- ⌘T and ⌘/ belong to the menu items "New Tab" and "Show Status Bar" (both titles are in Safari 27's `MainMenu.nib`). **[27]**

### Routes

| Route | Sees keys before Safari? | Can swallow? | Scope | Permission |
|---|---|---|---|---|
| **Active `CGEventTap`** (`options: .defaultTap`) at `.cgSessionEventTap` or `.cgAnnotatedSessionEventTap` | Yes | **Yes.** Callback returns `NULL` "if the event passed in is to be deleted" ([CGEventTapCallBack](https://developer.apple.com/documentation/coregraphics/cgeventtapcallback)) | System-wide. Gate on `NSWorkspace.shared.frontmostApplication` being Safari | Input Monitoring (ListenEvent), plus PostEvent, which shows in the **Accessibility** pane. See below |
| **Active per-process tap**: `CGEvent.tapCreateForPid(pid:…)` (macOS 10.11+) | Yes, only events routed to Safari | Yes | Naturally "only while Safari has key focus" | Same as above |
| Listen-only `CGEventTap` (`.listenOnly`) | Yes | No ("a passive listener receives events but cannot modify or divert them") | System-wide | Input Monitoring |
| `NSEvent.addGlobalMonitorForEvents` | Copies, delivered **asynchronously** | **No** ("you cannot modify or otherwise prevent the event from being delivered") | Other apps | Accessibility ("Key-related events may only be monitored if… trusted for accessibility") |
| `NSEvent.addLocalMonitorForEvents` | Helper's own events only | Yes (return `nil`) | The helper's own panels (Command Palette, Tab Switcher) | None |
| Carbon `RegisterEventHotKey` | Yes, for the registered combos | Yes: the combo goes to the registrant | Global. Register on Safari activation and unregister on deactivation via `NSWorkspace.didActivateApplicationNotification` / `didDeactivateApplicationNotification` | None documented |
| App Shortcuts (System Settings › Keyboard › Keyboard Shortcuts › App Shortcuts) | n/a | Only re-binds **Safari's own menu items**, matched by exact title | Safari | None |

Sources: [tapCreate](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate(tap:place:options:eventsofinterest:callback:userinfo:)), [tapCreateForPid](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreateforpid(pid:place:options:eventsofinterest:callback:userinfo:)), [CGEventTapOptions](https://developer.apple.com/documentation/coregraphics/cgeventtapoptions), [addGlobalMonitorForEvents](https://developer.apple.com/documentation/appkit/nsevent/addglobalmonitorforevents(matching:handler:)), [addLocalMonitorForEvents](https://developer.apple.com/documentation/appkit/nsevent/addlocalmonitorforevents(matching:handler:)), [frontmostApplication](https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication), `CGEvent.h` and `CarbonEvents.h` in the macOS 27 SDK, and [Create keyboard shortcuts for apps](https://support.apple.com/guide/mac-help/create-keyboard-shortcuts-for-apps-mchlp2271/mac). **[27]/[Doc]**

### Which permission an event tap needs

- **Quinn (DTS), March 2026** gives the mapping ([forum 820594](https://developer.apple.com/forums/thread/820594)):
  - "`PostEvent` — This controls the ability to post UI events". "`ListenEvent` — This controls the ability to monitor UI events on a system-wide basis, for example, with a CG event tap".
  - "Both `PostEvent` and `Accessibility` map to Accessibility. `ListenEvent` maps to Input Monitoring."
  - Footnote: `NSEvent.addGlobalMonitorForEvents` "isn't gated by this privilege, but rather requires the `Accessibility` privilege."
- Quinn's January 2026 answer ([forum 811443](https://developer.apple.com/forums/thread/811443)) names `CGPreflightListenEventAccess` / `CGRequestListenEventAccess` as the Input Monitoring checks. `CGPreflightPostEventAccess` / `CGRequestPostEventAccess` are the matching PostEvent pair (`CGEvent.h`, macOS 10.15+).
- **For an active (modifying) tap:** a September 2026 report on macOS 27 ([forum 844416](https://developer.apple.com/forums/thread/844416)) shows WindowServer checking **both `kTCCServicePostEvent` and `kTCCServiceListenEvent`** for a `.defaultTap`. So plan to grant **Input Monitoring and Accessibility**. The map already allows both. **[Unverified]** as an exact rule, since no Apple doc states it.
- The `CGEvent.h` header comment still says key events need "access for assistive devices". It predates the macOS 10.15 TCC split. **[Old]**

### Hazards and limits

- **Tap timeouts.** If the callback is slow, the system disables the tap and sends `tapDisabledByTimeout` (or `tapDisabledByUserInput`). The helper must re-enable it with `CGEvent.tapEnable`, and should keep the callback tiny: decide, return, then do the work on another queue. **[Doc]**
- **Revoking permission mid-tap.** The forum 844416 report (macOS Sequoia, Tahoe and 27) says revoking Accessibility while an active tap runs froze keyboard and mouse input system-wide until restart. Apple asked for a bug report (FB24619068), and there's no documented fix. Don't toggle the permission while the helper runs. **[Unverified]**, a single report.
- **Secure Event Input.** When any process enables secure input, as password fields do, "stop passing keyboard events to any intercept process", which covers `CGEventTapCreate` ([TN2150](https://developer.apple.com/library/archive/technotes/tn2150/_index.html), 2007, archived) **[Old]**. So in a Safari password field, ⌘T and ⌘L will reach Safari. Whether Carbon hot keys still fire there is **[Unverified]**.
- **Carbon hot keys.** `RegisterEventHotKey` is still declared, without a deprecation tag, in the macOS 27 SDK's `CarbonEvents.h`, as available "in version 10.0 and later" **[27]**.
  - macOS 15.0 refused combos whose only modifiers were Option and/or Shift. An Apple Frameworks Engineer said this was intentional, to curb key-logging, then reported it lifted in 15.2 beta 2 ([forum 763878](https://developer.apple.com/forums/thread/763878)). That doesn't affect ⌘-combos.
  - A hot key reports press and release of its key, not of modifiers, so it **can't detect ⌘⌥ being let go** for the Tab Switcher.
- **Tab Switcher release detection.** Two options:
  - Use the same event tap with `flagsChanged` in its mask.
  - Make the Tab Switcher a **non-activating panel** (`NSWindow.StyleMask.nonactivatingPanel`: "does not activate the owning app"). Once it's key it gets its own `flagsChanged` events through a local monitor, and Safari stays the active app. Spike it. **[Doc]**
- **App Shortcuts can't override.** Apple: if the combination "is already used by another command… the new shortcut won't work". Its use is the other way round: give Safari's "New Tab", "Open Location…" and "Show Status Bar" other shortcuts so ⌘T, ⌘L and ⌘/ do nothing in Safari even if the helper misses a key. ⌘1–9 tab selection may not be a menu item at all **[Unverified]**, so the tap is still needed. **[27]**
- **Extension shortcuts.** Safari 26 added Web Extension commands in the menu bar with user-customizable shortcuts ([Safari 26 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes)). Whether one can take ⌘T belongs to #3.
- **No permission needed** to tell whether Safari is frontmost: `NSWorkspace.frontmostApplication` and its activation notifications. **[Doc]**

---

## 4. Snapshots for Tab Switcher previews

### API (all in the macOS 27 SDK) **[27]**

- `SCShareableContent.excludingDesktopWindows(_:onScreenWindowsOnly:)` returns `SCWindow`s with `windowID` (the `CGWindowID`), `frame`, `title`, `owningApplication`, `isOnScreen` and `isActive`.
- `SCContentFilter(desktopIndependentWindow:)`: "captures only the specified window".
- `SCScreenshotManager.captureImage(contentFilter:configuration:)` (macOS 14+) takes a one-shot image. The newer `captureScreenshot(contentFilter:configuration:)` with `SCScreenshotConfiguration` is macOS 26+.
- `SCStream` gives a live stream, useful for the current tab's live preview.
- `SCStreamConfiguration` options:
  - `width`/`height`/`scalesToFit` capture straight at thumbnail size.
  - `ignoreShadowsSingleWindow` drops the window shadow.
  - `ignoreGlobalClipSingleWindow`: "single window captures that are partially off the screen will not be clipped".
- `CGWindowListCreateImage` is `SCREEN_CAPTURE_OBSOLETE(10.5,14.0,15.0)` in `CGWindow.h`, so it isn't an option.

### What can be captured

- **Only what the Safari window is drawing.** That's its current tab, so a window capture is a preview of that tab only. Other tabs need last-seen snapshots taken while each was current, which is what the map already plans. **[Doc]** for window capture; "background tabs aren't rendered" is how browsers work rather than a Safari doc.
- **Occluded windows.** A desktop-independent window filter captures the window's own content regardless of what covers it. That's the documented point of the filter, though the doc doesn't spell out occlusion. **[Doc]/[Unverified]**
- **Minimized or ordered-out windows** (`isOnScreen == false`): whether capture still returns content is **[Unverified]**. Assume it doesn't, and snapshot before hiding.

### Cost

- Apple publishes **no latency, CPU or memory figures**. WWDC23 ["What's new in ScreenCaptureKit"](https://developer.apple.com/videos/play/wwdc2023/10136/) only says the screenshot API lets you "efficiently grab an image". **[Doc]**
- Expected shape: an async, GPU-backed capture scaled to thumbnail size on each tab change, plus one low-frame-rate `SCStream` (`minimumFrameInterval`) while the Tab Switcher is open.
- Cache `SCShareableContent` and refresh it on window changes rather than for every capture. Apple warns that building system-window dictionaries for `CGWindowListCopyWindowInfo` "is a relatively expensive operation", and the same caution likely applies here.
- Measure all of this in the spike.

### Permission

- **Screen Recording** (System Settings › Privacy & Security › Screen & System Audio Recording) and **`NSScreenCaptureUsageDescription`** ([ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)). **[27]**
- **Recurring confirmation.** Since macOS 15 there are periodic re-confirmation alerts for screen capture.
  - The macOS 15 release notes tie them to "deprecated APIs for content capture" and say "Developers need to migrate to ScreenCaptureKit and SCContentSharingPicker".
  - The 15.1 notes add: "Users will see fewer dialogs if they regularly use apps in which they have already acknowledged and accepted the risks" ([macOS 15](https://developer.apple.com/documentation/macos-release-notes/macos-15-release-notes), [15.1](https://developer.apple.com/documentation/macos-release-notes/macos-15_1-release-notes)).
  - Press reports from 2024 say ScreenCaptureKit apps that skip the picker also got monthly prompts. The macOS 26 and 27 release notes say nothing more.
  - So expect an occasional "allow again" prompt. Whether it still recurs on 27 is **[Unverified]**.
  - The Persistent Content Capture entitlement that avoids it is for VNC apps only, by request to Apple ([doc](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.persistent-content-capture)).
- **Alternative without Screen Recording:** a Safari Web Extension's `tabs.captureVisibleTab` (the visible tab only). That's #3's territory.

---

## 5. Links from other apps

- **Safari's rule**, from Apple's [Use profiles in Safari on Mac](https://support.apple.com/en-us/105100) (published 2025-12-05, version-agnostic) **[Doc]**:
  - "By default, links from outside of Safari open in the profile used most recently."
  - Per-site override: Settings › Websites › **Open Links With Profile** opens a link "in the profile you chose for that website, unless the website is already open in another profile". It "works only with links opened from outside of Safari, such as links in Mail, Messages, the Finder, or other apps".
- Safari 27.0.1 still carries these strings ("Open Links With Profile", "Choose a profile to always open links with:"). **[27]**
- Safari 27 also has a Focus filter, "Set Profile or Tab Group" ("Sets a Profile or Tab Group to be used during this Focus"), with an option to "Allow opening external links in your Focus Tab Group". A helper can't switch Focus modes through a public API, so it doesn't help here. **[27]**
- The Safari 27, 27.1, 27.2 and 27.3-beta release notes mention no change to Profiles or link routing. **[27]**

**Ways a helper can influence it:**

1. **Lean on "most recently used".** If the Active Profile's per-Profile Safari window is always the one in front, outside links should land in that Profile, which is what the map wants.
   - It's **[Unverified]** what "used most recently" means exactly: the last focused window? Does a hidden window count? Test it.
   - Don't set any per-site Open Links With Profile rules.
   - Whether a link becomes a new tab or a new window is Safari's tab-opening setting. The map wants a new tab.
2. **Become the default browser** and forward each link. Register the helper for `http`/`https` with `NSWorkspace.setDefaultApplication(at:toOpenURLsWithScheme:)`, which asks the user for consent ([doc](https://developer.apple.com/documentation/appkit/nsworkspace/setdefaultapplication(at:toopenurlswithscheme:completion:))). Then run `make new tab … of window id N` in the front Window.
   - It gives exact control and needs only Automation. **[Doc]**
   - Costs: the helper must launch fast on a cold link, and Safari is no longer the default browser, so expect Safari's "make default" nags.
   - Keep it as the fallback if (1) proves unreliable.

---

## What this means for Arcfari

| Capability | Verdict | How | Permission |
|---|---|---|---|
| **Identify** per-Profile windows | Yes, with a caveat | Title prefix "⟨Profile⟩ — …" through AX, AppleScript or SCK, plus the helper's own bookkeeping. No API names the Profile | Accessibility, or Automation |
| **Create** a window for a Profile | Yes | AX press of File › New Window › "New ⟨Profile⟩ Window" (localized `New %@ Window`) | Accessibility |
| **Arrange** (frame, order, raise) | Yes | AX position/size/raise, or AppleScript `bounds`/`index`. AX observers keep siblings in sync | Accessibility, or Automation |
| **Hide** inactive Profiles' windows | Partly | Minimize works but is slow and visible. `visible = false` may hide properly (**spike**). Otherwise stack windows at the same frame | Automation (`visible`) / Accessibility (minimize) |
| Keep them out of **⌘\` / Mission Control / Window and Dock menus** | Only by hiding them | Safari owns `collectionBehavior`, and there's no external API | n/a |
| **Tabs** (list, open, select, navigate, close) | Yes | AppleScript on `window id N` | Automation |
| **Intercept hotkeys** only while Safari is frontmost | Yes | Active `CGEventTap` (a per-pid tap on Safari, or a session tap gated on frontmost app). Carbon hot keys as an option for the ⌘-combos | Input Monitoring + Accessibility |
| **Tab Switcher** ⌘⌥ release | Yes | `flagsChanged` in the same tap, or a key non-activating panel with a local monitor | (same) |
| **Previews** | Yes, for current tabs | ScreenCaptureKit window capture, thumbnail-sized, on tab change | Screen Recording |
| **Links from other apps** to the Active Profile | Probably free | Keep the Active Profile's window frontmost. Default-browser forwarding is the fallback | none / Automation |

**Overall:** the helper must be a **non-sandboxed**, Developer ID or locally signed Swift app (#4 covers signing). It needs **Accessibility, Input Monitoring, Automation › Safari and Screen Recording**, all of which the map allows. No private API is required, *provided* windows are matched by title and frame rather than through `_AXUIElementGetWindow`.

---

## Biggest unknowns, for a hands-on spike (in priority order)

1. **`set visible of window id N to false` on Safari 27.** Does it hide the window cleanly (out of ⌘\`, Mission Control and the Window/Dock menus)? Does `true` bring it back on the current Space at the same frame? Do its tabs keep their state? Does Safari's session restore bring hidden windows back, and in which state? If all yes, the Window illusion becomes nearly leak-free.
2. **Window titles carry the Profile prefix on Safari 27**, in every state: blank page, start page, while loading, with each Toolbar/tab-bar layout from #2 and #9. Is the separator always " — "?
3. **The exact AX path and behaviour of "New ⟨Profile⟩ Window".** Is it under File › New Window? Does it work while Safari is in the background? What do ⌘N and `make new document` do in a Profile window?
4. **Active event tap on Safari 27.** Do `tapCreateForPid` and a session tap both see and drop ⌘T, ⌘L, ⌘1–9, ⌘⌥←/→ and ⌘/ before Safari's menus? Which TCC entries does creating each one actually prompt for? How do they behave in password fields (secure input)? Compare with `RegisterEventHotKey`.
5. **Join keys.** Does AppleScript `id of window` equal `SCWindow.windowID` / `kCGWindowNumber`?
6. **ScreenCaptureKit cost and coverage.** Latency and CPU of a thumbnail `captureImage` of a Safari window. Does it work for occluded, minimized and ordered-out windows? Does a Screen Recording re-prompt still recur on 27?
7. **"Profile used most recently" for outside links.** Is it the last focused window, and does a hidden window change it? Does the link become a new tab in the front window under Safari's tab settings?
8. **A tab made with `make new tab` in window N lands in N's Profile.** Expected, but confirm.
9. **Spaces and full screen.** Swapping per-Profile windows when the user has several Spaces, or is in full screen, where each window is its own Space. Probably limit the illusion to normal windows.

---

## Sources

**Local (Safari 27.0.1 / macOS 27 SDK, read-only)**
- `sdef /Applications/Safari.app`, and `/System/Library/ScriptingDefinitions/CocoaStandard.sdef`.
- `/Applications/Safari.app/Contents/Info.plist`; `…/Resources/Base.lproj/MainMenu.nib` (menu titles).
- `/System/Library/PrivateFrameworks/Safari.framework/…/en.lproj/Localizable.strings` (Profile, Dock menu and Apple Events strings).
- `/System/Library/PrivateFrameworks/SafariSwift.framework/…/Metadata.appintents/extract.actionsdata` and `AppIntents.strings`.
- macOS 27 SDK headers: `HIServices/AXAttributeConstants.h`, `AXActionConstants.h`, `AXNotificationConstants.h`, `AXUIElement.h`; `CoreGraphics/CGEvent.h`, `CGWindow.h`; `ScreenCaptureKit/SCShareableContent.h`, `SCStream.h`, `SCScreenshotManager.h`; `AppKit/NSWindowScripting.h`; `AE/AppleEvents.h`; `HIToolbox/CarbonEvents.h`.

**Apple documentation**
- [AXUIElement.h](https://developer.apple.com/documentation/applicationservices/axuielement_h) · [AXIsProcessTrustedWithOptions](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions) · [AXUIElementPerformAction](https://developer.apple.com/documentation/applicationservices/1462091-axuielementperformaction) · [AXUIElementSetAttributeValue](https://developer.apple.com/documentation/applicationservices/1460434-axuielementsetattributevalue)
- [CGEvent.tapCreate](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreate(tap:place:options:eventsofinterest:callback:userinfo:)) · [tapCreateForPid](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreateforpid(pid:place:options:eventsofinterest:callback:userinfo:)) · [CGEventTapOptions](https://developer.apple.com/documentation/coregraphics/cgeventtapoptions) · [CGEventTapCallBack](https://developer.apple.com/documentation/coregraphics/cgeventtapcallback) · [CGPreflightListenEventAccess](https://developer.apple.com/documentation/coregraphics/cgpreflightlisteneventaccess()) · [tapDisabledByTimeout](https://developer.apple.com/documentation/coregraphics/cgeventtype/tapdisabledbytimeout)
- [NSEvent global monitor](https://developer.apple.com/documentation/appkit/nsevent/addglobalmonitorforevents(matching:handler:)) · [local monitor](https://developer.apple.com/documentation/appkit/nsevent/addlocalmonitorforevents(matching:handler:)) · [NSWorkspace.frontmostApplication](https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication) · [didActivateApplicationNotification](https://developer.apple.com/documentation/appkit/nsworkspace/didactivateapplicationnotification) · [setDefaultApplication(at:toOpenURLsWithScheme:)](https://developer.apple.com/documentation/appkit/nsworkspace/setdefaultapplication(at:toopenurlswithscheme:completion:))
- [NSWindow.CollectionBehavior](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct) · [setIsVisible(_:)](https://developer.apple.com/documentation/appkit/nswindow/setisvisible(_:)) · [orderedIndex](https://developer.apple.com/documentation/appkit/nswindow/orderedindex) · [orderOut(_:)](https://developer.apple.com/documentation/appkit/nswindow/orderout(_:)) · [nonactivatingPanel](https://developer.apple.com/documentation/appkit/nswindow/stylemask-swift.struct/nonactivatingpanel)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit) · [SCScreenshotManager](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager) · [SCContentFilter(desktopIndependentWindow:)](https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(desktopindependentwindow:)) · [SCWindow](https://developer.apple.com/documentation/screencapturekit/scwindow) · [Persistent Content Capture entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.persistent-content-capture) · [WWDC23 10136](https://developer.apple.com/videos/play/wwdc2023/10136/)
- [Scripting Bridge / SBApplication](https://developer.apple.com/documentation/scriptingbridge/sbapplication) · [Apple Events entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.automation.apple-events) · [NSAppleEventsUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsappleeventsusagedescription) · [Protecting user data with App Sandbox](https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox)
- Release notes: [Safari 27](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes) (and 27.1, 27.2, 27.3 beta) · [Safari 26](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes) · [Safari 17](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes) · [macOS 27](https://developer.apple.com/documentation/macos-release-notes/macos-27-release-notes) · [macOS 15](https://developer.apple.com/documentation/macos-release-notes/macos-15-release-notes) · [macOS 15.1](https://developer.apple.com/documentation/macos-release-notes/macos-15_1-release-notes)
- [TN2150: Using Secure Event Input Fairly](https://developer.apple.com/library/archive/technotes/tn2150/_index.html) (2007, archived)

**Apple Support (macOS 27 versions where noted)**
- [Use profiles in Safari on Mac](https://support.apple.com/en-us/105100) · [Safari keyboard shortcuts](https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac) (macOS 27) · [Create keyboard shortcuts for apps](https://support.apple.com/guide/mac-help/create-keyboard-shortcuts-for-apps-mchlp2271/mac) (macOS 27) · [Profiles settings](https://support.apple.com/guide/safari/ibrwdb3d0e93/mac) (macOS 27)

**Apple Developer Forums (Apple staff answers)**
- [820594](https://developer.apple.com/forums/thread/820594): Quinn, Mar 2026, PostEvent / ListenEvent / Accessibility mapping
- [811443](https://developer.apple.com/forums/thread/811443): Quinn, Jan 2026, event taps use Input Monitoring
- [780626](https://developer.apple.com/forums/thread/780626): Quinn, Apr 2025, Accessibility not available to sandboxed apps
- [28605](https://developer.apple.com/forums/thread/28605?answerId=712736022#712736022): Quinn, May 2022, Input Monitoring for CGEventTap since 10.15
- [759424](https://developer.apple.com/forums/thread/759424): DTS, Jul 2024, event taps need Input Monitoring and can't stop system shortcuts
- [763878](https://developer.apple.com/forums/thread/763878): Frameworks Engineer, Sep/Nov 2024, `RegisterEventHotKey` Option/Shift restriction
- [844416](https://developer.apple.com/forums/thread/844416): Sep 2026 report (macOS 27), active tap and Accessibility revocation hang

**Third-party (flagged as unverified wherever used)**
- [goreckim/safari-profile](https://github.com/goreckim/safari-profile): window-title Profile prefix and the "New ⟨Profile⟩ Window" menu path, tested on Safari 26.6
- [MacScripter thread 68198](https://www.macscripter.net/t/how-to-script-safari-to-bring-to-front-and-focus-on-a-specific-window/68198): `visible` and `index` on Safari windows, 2014
