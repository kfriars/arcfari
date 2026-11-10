# The helper draws everything; the extension only records Visits

Arcfari is one non-sandboxed Swift helper app with a thin Safari Web Extension inside it. The helper owns every hotkey, draws the Command Palette and Tab Switcher as native panels, reads and acts on tabs through AppleScript and Accessibility, captures previews, switches Profiles, and keeps each Profile's Visits and the Frecency engine. The extension's only job is recording Visits in its Profile and handing them to the helper, because Safari has no history API and its own history files are private. A Safari extension can't claim ⌘T, ⌘L or ⌘1–9, switch Profiles, see ⌘⌥ released, or draw on the Start Page and blank tabs, so it can't be the centre.

## Considered Options

- **Extension draws the Command Palette as an in-page overlay**: rejected; it can't appear on the Start Page or blank tabs, where ⌘T is most often pressed, nor on internal pages or `file:` pages, and the helper would have to forward each hotkey to the right Profile's extension, which Apple doesn't document.
- **No extension; the helper watches window titles and reads addresses over AppleScript**: rejected; it misses background-tab loads and address changes without a title change, and relies on title changes as an undocumented visit signal.
- **Extension keeps the history store and the helper queries it on each keystroke**: rejected; reaching a particular Profile's extension from the helper is undocumented, so messages only ever flow from the extension to the helper.
