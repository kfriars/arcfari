# Safari setup

What to set by hand in Safari 27 for Arcfari. Arcfari doesn't apply or enforce any of it. Decided in [Zero chrome or thin strip?](https://github.com/kfriars/arcfari/issues/9).

Arcfari is designed for normal windows in the Compact layout. The Toolbar ([GLOSSARY](../../GLOSSARY.md)) is the only chrome and is always on screen. Full screen still works, with the Toolbar hidden until the pointer reaches the top edge.

## Once, for all of Safari

Safari › Settings:

- **Tabs › Tab layout:** Compact.
- **Tabs › Show color in tab bar:** on, so the Toolbar takes on the page's colour.
- **Tabs › Use ⌘-1 through ⌘-9 to switch tabs:** off. Those keys belong to Profiles.
- **General › Safari opens with:** All windows from last session.

View menu:

- **Always Show Toolbar in Full Screen:** off. The item is greyed out in a normal window, so enter full screen with ⌃⌘F, uncheck it, then leave full screen with ⌃⌘F.

System Settings › Menu Bar:

- **Automatically hide and show the menu bar:** leave it on In Full Screen Only (the macOS default) or Always. The full-screen reveal on hover needs one of the two.

## In each Profile

Safari saves the Toolbar layout separately for each Profile, so open a window in every Profile and repeat these steps:

- **View › Customize Toolbar…:** drag out every item except the Profile button and that Profile's extension buttons (1Password, uBlock Origin Lite, Dark Reader).
  - If Safari only offers the Profile button together with the Sidebar button, keep both.
  - Leave Downloads out. Safari adds it by itself while the downloads list has items.
- **View:** hide the Favorites bar (⇧⌘B), the status bar (⌘/) and the sidebar (⇧⌘L).

## Without a button

| To reach | Use |
|---|---|
| Back / Forward | ⌘[ / ⌘], or a two-finger swipe |
| New tab, search, go to an address | ⌘T or ⌘L (Command Palette) |
| Tab Overview | ⇧⌘\ |
| Sidebar | ⇧⌘L |
| Downloads | its button, shown while the list has items; ⌥⌘L works only while the button is there |
| Extension commands | Edit › Extension Actions; rebind in Settings › Extensions › (extension) › Shortcuts. 1Password's popup is ⇧⌘X |

## Record at first setup

- Whether the Profile button can stay without the Sidebar button.
