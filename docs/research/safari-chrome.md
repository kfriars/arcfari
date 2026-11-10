# How little chrome can Safari 27 show?

Research for [#2](https://github.com/kfriars/arcfari/issues/2) (map [#1](https://github.com/kfriars/arcfari/issues/1)). Checked 2026-11-10 against Safari 27.0.1 (bundle build 22625.1.29.11.28) on macOS 27.0.1.

**Method.** I used two kinds of primary source:

1. Apple's own documentation: the Safari User Guide and Mac User Guide (both now serve the macOS 27 versions), the Safari and macOS release notes, and the AppKit reference.
2. Read-only inspection of the installed Safari 27.0.1:
   - the main-menu and Tabs-settings nibs in `/Applications/Safari.app/Contents/Resources/Base.lproj/`;
   - Safari's string tables and `Defaults.plist` in `/System/Library/PrivateFrameworks/Safari*.framework/`;
   - the preference-key strings that Safari's code carries in the macOS dyld shared cache.

I did not launch Safari, change any setting, or run AppleScript, so nothing here was observed on screen. Claims are tagged as follows:

- **[doc]**: stated in Apple documentation for macOS 27.
- **[bundle]**: read from the Safari 27.0.1 bundle.
- **[older]**: only confirmed for an older Safari.
- **[inferred]**: my reading of the evidence, still to be checked in a prototype.

**Vocabulary.** "Safari's toolbar" (Apple's term) means the whole strip at the top of the window. Arcfari's **Toolbar** ([GLOSSARY](../../GLOSSARY.md)) is the extension buttons and downloads inside that strip. The distinction matters below.

## Short answers

| Question | Answer |
|---|---|
| Which tab layouts exist? | Exactly two: **Separate** and **Compact**. Safari 27 adds no new layout. |
| What stays visible in Compact? | One strip holding the window controls, the tabs (the active tab is the Smart Search field) and any toolbar items you keep. Apple publishes no height. |
| Can the toolbar, tab bar or title bar be hidden in a normal window? | **No** for Safari's toolbar: no menu item, setting or supported `defaults` key does it. The **tab bar** can be removed by choosing Compact, or hidden in Separate when a window has only one tab. There is no separate **title bar**; it is merged into the toolbar. |
| In full screen, can the toolbar stay hidden and appear on hover? | **Yes.** Turn off View › Always Show Toolbar in Full Screen. The toolbar then hides and slides back in, together with the menu bar, when the pointer reaches the top of the screen. |
| Is there a Show/Hide Toolbar menu item to bind ⌘/ to? | **No.** The only toolbar-visibility item is **View › Always Show Toolbar in Full Screen**, which has no shortcut and can be bound to ⌘/ in App Shortcuts. Nothing else in Safari's menus uses ⌘/; it belongs to Show/Hide Status Bar only. |
| Does hovering the top edge reveal anything in a normal window? | Nothing from Safari, because nothing is hidden. Only the macOS menu bar appears, and only if it is set to auto-hide on the desktop. |

## 1. Tab layouts

- Safari › Settings › Tabs › Tab layout offers only **Separate** ("Tabs remain in the tab bar, below the toolbar") and **Compact** ("Tabs move up to the toolbar. The active tab is the Smart Search field."). **[doc]** ([Change Tabs settings](https://support.apple.com/guide/safari/tabs-ibrw1045/mac), macOS 27 guide)
- The Tabs settings nib holds exactly two layout buttons, `separateTabLayoutButton` and `compactTabLayoutButton`, captioned "Show tabs in a separate tab bar under the toolbar." and "Show tabs in the toolbar. The active tab is the Smart Search field." **[bundle]** (`TabsPreferences.nib`)
- The choice is stored in the preference `ShowStandaloneTabBar`, which defaults to `true` (Separate). **[bundle]** (`Safari.framework/…/Resources/Defaults.plist`)
- None of the Safari 27, 27.1, 27.2 or 27.3 beta release notes, nor the macOS 27 "what's new" page, mentions any change to Safari's window chrome. **[doc]** ([Safari release notes](https://developer.apple.com/documentation/safari-release-notes), [What's new in macOS 27](https://support.apple.com/en-us/127257))

**What the most compact layout keeps on screen.** Compact is a single strip, because Safari has no separate title-bar row in either layout. It contains:

- the window controls (traffic lights);
- the tabs, with the active tab acting as the Smart Search field;
- whatever toolbar items are left after View › Customize Toolbar: Sidebar, Back/Forward, extension buttons, Share, New Tab, Tab Overview, Downloads and so on.

Most items can be Command-dragged out of the toolbar. Back/Forward, Sidebar, Home, History and Downloads can only be removed through Customize Toolbar. **[doc]** ([Customize the Safari browser window](https://support.apple.com/guide/safari/customize-the-safari-window-ibrw1012/mac))

Apple doesn't document removing the tabs or the Smart Search field, so treat them as fixed. **[inferred]**

Optional extra rows, all off by default **[bundle]** (`Defaults.plist`):

- the Favorites bar (View › Show Favorites Bar, ⇧⌘B; `ShowFavoritesBar-v2` = `false`);
- the status bar at the bottom of the window (View › Show Status Bar, ⌘/; `ShowStatusBar` = `false`);
- the sidebar (⇧⌘L).

"Show color in tab bar" tints the strip with the page's background colour. That makes it less visible without making it smaller. **[doc]**

**Height.** Apple publishes no pixel height for either layout, and AppKit's toolbar styles are described only qualitatively ([`NSWindow.ToolbarStyle`](https://developer.apple.com/documentation/appkit/nswindow/toolbarstyle-swift.enum)). Compact is one row and Separate is two (toolbar plus tab bar). Measure the exact height with a screenshot in the prototype.

**Toolbar items are saved per Profile.** Safari keeps a separate toolbar configuration for each Profile and layout (`ProfileCompactTabBarBrowserToolbarIdentifier-v3-<id>` and similar). Trimming the toolbar has to be done once in every Profile. **[bundle]** (toolbar identifier strings in Safari's code)

## 2. Hiding the toolbar, tab bar or title bar in a normal window

**Safari's toolbar cannot be hidden in a normal window.**

- *Menu item.* The View menu has no Hide Toolbar or Show Toolbar item. The main-menu nib doesn't contain one (its View menu has Customize Toolbar…, Show Status Bar, Show Sidebar, Show Downloads, Show Tab Bar and Always Show Toolbar in Full Screen). Safari's string tables have no "Hide Toolbar" or "Show Toolbar" string, and neither does Safari's code. The only copies of those strings in the shared cache belong to SwiftUI and UIKit/Catalyst. **[bundle]**
  - The generic Mac User Guide says apps may offer View › Hide Toolbar ([Customize toolbars](https://support.apple.com/guide/mac-help/customize-toolbars-mchlb294260e/mac)). Safari's own guide only documents hiding the toolbar in full screen ([Customize the Safari browser window](https://support.apple.com/guide/safari/customize-the-safari-window-ibrw1012/mac)). **[doc]**
- *Setting.* No setting in Safari Settings hides the toolbar. **[doc]**, **[bundle]**
- *`defaults` key.* Safari's preference keys related to chrome are:
  - `ShowStandaloneTabBar` (the layout);
  - `AlwaysShowTabBar`;
  - `AutoShowToolbarInFullScreen` (full screen only);
  - `ShowStatusBar`, `ShowStatusBarInFullScreen` and `ShowOverlayStatusBar`;
  - `ShowFavoritesBar-v2`;
  - `OrderedToolbarItemIdentifiers` and `ExtensionsToolbarConfiguration` (which items appear, and in what order);
  - `HideToolbarTrackerCount`, which by its name is a counter rather than a switch.

  None of them hides the toolbar in a normal window. AppKit's own autosaved visibility flag (`TB Is Shown`) exists only in AppKit's part of the shared cache, not in Safari's code. Writing it into Safari's sandboxed preferences would be an unsupported hack that I have not tested. **[bundle]**
- *Extensions and pages.* Nothing in the Safari 27 Web Extensions notes touches window chrome. **[doc]** Pages can't even read the chrome's state: Safari 27 made `window.toolbar.visible`, `statusbar.visible` and `menubar.visible` return static values. **[doc]** (Safari 27 release notes, Web API: "Fixed window bar visibility properties (`toolbar.visible`, `statusbar.visible`, `menubar.visible`) to return static values…")

**The tab bar can be hidden in two ways:**

- Choose **Compact**, which removes the tab bar row entirely. **[doc]**
- In **Separate**, uncheck View › Always Show Tab Bar. The bar then hides while the window has only one tab. **[bundle]**: the menu item is in the nib (placeholder title "Show Tab Bar"), wired to `toggleAlwaysShowTabBar:`. Safari's code pairs the title string "Always Show Tab Bar" with the preference `AlwaysShowTabBar`. The single-tab behaviour, and the item being greyed out when there are several tabs, is **[older]**: reported by users of Safari 26 in [Apple Community threads](https://discussions.apple.com/thread/256176551), not documented by Apple.

**There is no separate title bar.** The window controls sit in the toolbar strip in both layouts. **[inferred]**: Apple describes the layouts only as toolbar plus tab bar, and no title-bar item exists in the menus or settings. A normal window can never show less than one strip.

## 3. Full screen

- In full screen, View › **Always Show Toolbar in Full Screen** decides whether the toolbar stays visible. **[doc]** ([Customize the Safari browser window](https://support.apple.com/guide/safari/customize-the-safari-window-ibrw1012/mac))
  - In the nib it is a plain toggle with no shortcut, wired to `toggleLocationBar:`. **[bundle]**
  - Its preference is `AutoShowToolbarInFullScreen`. **[bundle]**
- When the item is off, AppKit's full-screen behaviour applies: "the window toolbar is detached from window and hides and shows with autoHidden menuBar" ([`NSApplication.PresentationOptions.autoHideToolbar`](https://developer.apple.com/documentation/appkit/nsapplication/presentationoptions-swift.struct/autohidetoolbar)). **[doc]**
  - The menu bar in full screen appears when you "move the pointer to … the top of the screen" ([Use apps in full screen](https://support.apple.com/guide/mac-help/use-apps-in-full-screen-mchl9c21d2be/mac)). **[doc]**
  - So yes: the toolbar can stay hidden and appear on hover. That gives **zero chrome**, with no menu bar and no Dock either.
- This depends on System Settings › Menu Bar › "Automatically hide and show the menu bar" being **In Full Screen Only** or **Always**. The other choices are On Desktop Only and Never. **[doc]** ([Change Menu Bar settings](https://support.apple.com/guide/mac-help/change-menu-bar-settings-mchlad96d366/mac), macOS 27) If it is set to Never, the menu bar never hides, and the toolbar presumably stays visible with it. **[inferred]**
- Still to check on screen **[inferred]**:
  - whether a Separate tab bar and the Favorites bar slide away together with the toolbar;
  - how the status bar behaves (it has its own full-screen preference, `ShowStatusBarInFullScreen`).
- Ways to enter full screen **[doc]**:
  - ⌃⌘F: View › Enter Full Screen in the nib **[bundle]**, and the system-wide "Use or stop using the app in full screen" ([Mac keyboard shortcuts](https://support.apple.com/en-us/102650));
  - the green window button.

  Apple's Safari shortcut list also gives **Esc** for "Exit full-screen view" ([Safari keyboard shortcuts](https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac)).
- What else full screen brings:
  - each full-screen Window gets its own Space;
  - window switching animates between Spaces;
  - anything Arcfari puts on screen natively (the Command Palette or Tab Switcher as a native panel) must use [`NSWindow.CollectionBehavior.fullScreenAuxiliary`](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct/fullscreenauxiliary) to appear over it ("The window displays on the same space as the full screen window"). **[doc]**

## 4. A Toolbar menu item for ⌘/, and what's on ⌘/ today

- **No Show/Hide Toolbar item exists** (see §2), so ⌘/ can't toggle Safari's toolbar in a normal window through App Shortcuts.
- **The one usable item is View › Always Show Toolbar in Full Screen.** It has no default shortcut and a fixed title, which makes it a clean App Shortcuts target. **[bundle]**
- **What sits on ⌘/ today.** In Safari's main menu only **View › Show Status Bar** (its title flips to "Hide Status Bar") uses ⌘/. No other item in the nib uses the key. Help is on ⇧⌘/ (⌘?). **[bundle]**
  - System-wide, Apple's shortcut list gives ⌘/ only to Finder's status bar ("Hide or show the status bar in Finder windows"). **[doc]** ([Mac keyboard shortcuts](https://support.apple.com/en-us/102650))
- **Rebinding.** In System Settings › Keyboard › Keyboard Shortcuts › App Shortcuts, a shortcut can only be attached to an existing menu command. The title has to match exactly. "If your shortcut already belongs to another command… your new shortcut won't work." **[doc]** ([Create keyboard shortcuts for apps](https://support.apple.com/guide/mac-help/create-keyboard-shortcuts-for-apps-mchlp2271/mac)) So first move "Show Status Bar" and "Hide Status Bar" to another key. Then give "Always Show Toolbar in Full Screen" ⌘/.
- **Unverified risk.** Some websites bind ⌘/ themselves (for example, to show their shortcut help). Whether a page can take ⌘/ before Safari's menu does needs testing in the prototype. **[inferred]**

## 5. Hovering the top edge of a normal window

Safari hides nothing in a normal window, so there is nothing to reveal. The toolbar is always visible (§2). **[doc]**, **[bundle]** Safari's documentation describes no hover-reveal outside full screen.

The only top-edge reveal is the **macOS menu bar**, and only when it auto-hides on the desktop ("Always" or "On Desktop Only"). **[doc]** ([Change Menu Bar settings](https://support.apple.com/guide/mac-help/change-menu-bar-settings-mchlad96d366/mac)) With the menu bar hidden, a window can probably use that top band too. That saves the menu-bar height, but it hides no Safari chrome. **[inferred]**

## What this means for Arcfari

- **Zero chrome isn't reachable in a normal window** with anything ADR-0001 allows. Safari gives a normal window at least one strip: Compact layout, with the window controls and the tabs/Smart Search field.
- **The fallback the map already names is real.** Use Compact and remove every toolbar item that isn't needed, in every Profile (the configuration is saved per Profile). Keep the Favorites bar, status bar and sidebar off. Optionally turn on "Show color in tab bar" so the strip blends into the page.
- **Zero chrome is reachable in full screen**, with no code:
  - Safari full screen, plus "Always Show Toolbar in Full Screen" off, plus menu bar auto-hide set to In Full Screen Only or Always.
  - The top strip, menu bar and Dock all disappear and come back on hover at the top edge.
  - The cost: every Window becomes its own Space.
- **⌘/ in full screen** works today through App Shortcuts:
  1. Move Show/Hide Status Bar off ⌘/.
  2. Bind ⌘/ to View › Always Show Toolbar in Full Screen.
  3. The Toolbar is then hidden (shown on hover) until ⌘/ pins it, and ⌘/ again un-pins it. This matches the glossary's "hidden until toggled with ⌘/".
- **⌘/ in a normal window** has nothing to toggle. Safari's toolbar, and with it Arcfari's Toolbar (extension buttons and downloads), is always visible. The only other routes would be driving Customize Toolbar through Accessibility scripting, or writing unsupported `defaults` keys and relaunching Safari. Both are fragile and neither is a real toggle. I wouldn't build either.
- **The decision this hands to the map:** either accept full screen as the everyday mode, or accept Compact as the floor and let ⌘/ do nothing in a normal window. A middle option: bind ⌘/ in normal windows to something else, such as entering full screen.
- **Notes for other tickets:**
  - The Command Palette and Tab Switcher must appear over full-screen Spaces (`fullScreenAuxiliary`).
  - Esc is documented as "Exit full-screen view", so the Command Palette has to consume Esc itself.

## Still to verify in a prototype

1. The pixel height of the Compact strip.
2. Whether the tabs or Smart Search field can be removed in Customize Toolbar. Apple doesn't say.
3. Whether a Separate tab bar and the Favorites bar hide and reveal together with the toolbar in full screen.
4. Whether "Always Show Toolbar in Full Screen" is enabled, and does anything, outside full screen.
5. Whether a web page can capture ⌘/ before Safari's menu.
6. What happens when ⌘N is pressed in a full-screen Window: does it open a new full-screen Space or a normal window?

## Related findings for other tickets

- **⌘1–9.** "Use ⌘-1 through ⌘-9 to switch tabs" is a Tabs setting (preference `Command1Through9SwitchesTabs`, default on). Turning it off frees those keys for Profile switching. **[doc]**, **[bundle]**
- **Profiles from Shortcuts.** Safari 27 ships an App Intent titled **"Set Profile or Tab Group"** (`OpenTabGroupForFocus`). It is worth checking for Profile switching. **[bundle]** (`SafariSwift.framework/…/Metadata.appintents`)

## Sources

Apple documentation (macOS 27 versions unless noted):

- Safari User Guide: [Customize the Safari browser window](https://support.apple.com/guide/safari/customize-the-safari-window-ibrw1012/mac), [Change Tabs settings](https://support.apple.com/guide/safari/tabs-ibrw1045/mac), [Keyboard shortcuts and gestures](https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac).
- Mac User Guide: [Customize toolbars](https://support.apple.com/guide/mac-help/customize-toolbars-mchlb294260e/mac), [Use apps in full screen](https://support.apple.com/guide/mac-help/use-apps-in-full-screen-mchl9c21d2be/mac), [Change Menu Bar settings](https://support.apple.com/guide/mac-help/change-menu-bar-settings-mchlad96d366/mac), [Create keyboard shortcuts for apps](https://support.apple.com/guide/mac-help/create-keyboard-shortcuts-for-apps-mchlp2271/mac).
- [Mac keyboard shortcuts](https://support.apple.com/en-us/102650); [What's new in macOS 27](https://support.apple.com/en-us/127257).
- Release notes: [Safari 27](https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes), [27.1](https://developer.apple.com/documentation/safari-release-notes/safari-27_1-release-notes), [27.2](https://developer.apple.com/documentation/safari-release-notes/safari-27_2-release-notes), [27.3 beta](https://developer.apple.com/documentation/safari-release-notes/safari-27_3-release-notes), [macOS 27](https://developer.apple.com/documentation/macos-release-notes/macos-27-release-notes).
- WebKit blog: [News from WWDC26: WebKit in Safari 27 beta](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/), [WebKit Features for Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/). Neither covers Safari's window chrome.
- AppKit: [`autoHideToolbar`](https://developer.apple.com/documentation/appkit/nsapplication/presentationoptions-swift.struct/autohidetoolbar), [`fullScreenAuxiliary`](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct/fullscreenauxiliary), [`NSWindow.ToolbarStyle`](https://developer.apple.com/documentation/appkit/nswindow/toolbarstyle-swift.enum), [`toggleToolbarShown(_:)`](https://developer.apple.com/documentation/appkit/nswindow/toggletoolbarshown(_:)).

Installed Safari 27.0.1 (read-only):

- `/Applications/Safari.app/Contents/Resources/Base.lproj/MainMenu.nib`: menu titles, actions and key equivalents, decoded from the NIBArchive format.
- `/Applications/Safari.app/Contents/Resources/Base.lproj/TabsPreferences.nib`: the tab layout options.
- `/System/Library/PrivateFrameworks/Safari.framework/Versions/A/Resources/Defaults.plist` and `en.lproj/Localizable.strings`.
- `/System/Library/PrivateFrameworks/SafariSwift.framework/Versions/A/Resources/` (App Intents strings and metadata).
- Safari's preference-key and toolbar-identifier strings in the dyld shared cache (`/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld/`).

Secondary, used only as corroboration for older Safari: [Apple Community thread on the Safari 26 tab bar](https://discussions.apple.com/thread/256176551).
