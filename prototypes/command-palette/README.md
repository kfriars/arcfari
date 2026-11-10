# Command Palette prototype (throwaway)

This prototype is for [What should the Command Palette look and feel like?](https://github.com/kfriars/arcfari/issues/10). It lives only on branch `prototype/command-palette` and is never merged: the real palette is a native panel in the Swift helper ([ADR-0002](../../docs/adr/0002-helper-draws-everything-extension-records-visits.md)).

The prototype answers one question: **what should the Command Palette look like, and how should typing in it feel?** It runs the Inline Completion and ranking recommended in [How should Inline Completion rank and complete URLs?](https://github.com/kfriars/arcfari/issues/7) on your own Arc history, inside a fake Safari Window.

## Run

```sh
bun prototypes/command-palette/serve.ts             # your Arc history (read from a temp copy)
bun prototypes/command-palette/serve.ts --sample    # made-up history
# add --offline to stop Kagi / Google suggestions being fetched
open -a Safari http://localhost:4917
```

Arc's `History` and `Favicons` files are copied to `$TMPDIR/arcfari-palette-PROTOTYPE-wipe-me` and read there, never in the repo. The only network traffic is the search suggestion requests for what you type: Kagi for ⌘1, Google for the rest.

## Keys

A web page can't claim ⌘T or ⌘L, so the prototype uses stand-in keys:

- **T** stands in for ⌘T and **L** for ⌘L.
- **1–9**, or **ctrl+1–9** while the palette is open, stand in for ⌘1–9.
- **←/→** while the palette is closed changes variant.
- **?** opens the Why panel and **S** shows the Start Page behind the palette.

Inside the palette:

| Key | What it does |
|---|---|
| **Tab** | Takes one completion step |
| **→** or **End** | Accepts the completion |
| **↑/↓** | Picks a row |
| **Enter** | Goes |
| **Esc** | Closes and changes nothing |

## Variants (`?variant=A|B|C`)

| | A · Spotlight | B · Sectioned | C · Address |
|---|---|---|---|
| Field | Big, 24 pt | Medium, Profile chip on the left | Monospace, Profile caption above |
| Completion | Selected text | Selected text | Ghost text with a `tab` hint |
| Rows | One flat list, title — url | Grouped under headers, two lines | Url first, title on the right, dense |
| Profile | Dot + name at the right of the field | Chip + colour bar on the selected row | Coloured top edge, glow and selection |
| Empty ⌘T | Just the field | Open tabs | Top sites as tiles |

## Bottom bar

- **Tab drills down**: off by default. When it's on, accepting a step with Tab offers the next step straight away (`ex` ⇥ `example.com` ⇥ `/admin`). When it's off, the next step waits until you type, so a bare site never gets a path added until you type `/`.
- **Suggestions first**: puts search suggestions above history, which is Firefox's order.
- **Live suggestions**: fetches suggestions from Kagi or Google.

**Why?** shows how the completion was chosen: each step it considered, its summed Frecency, and whether it passed the Site floor. It also shows each row's score and the time ranking took.
