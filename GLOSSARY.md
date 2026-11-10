# Arcfari

Arcfari recreates the parts of the Arc browser its user relies on, on top of Safari, so the setup outlives any one browser company.

## Language

**Profile**:
An isolated browsing identity with its own tabs, history, cookies and logins, numbered 1–9 and reached with ⌘ plus its number.
_Avoid_: Space, container, account

**Window**:
What you see as one browser window; it shows one Profile at a time, and switching Profile changes what it shows, not where it is.
_Avoid_: Safari window, space

**Active Profile**:
The Profile a Window is currently showing; each Window has exactly one.
_Avoid_: current space, focused profile

**Toolbar**:
Safari's own strip of extension buttons and downloads, hidden until toggled with ⌘/.
_Avoid_: sidebar, address bar

**Command Palette**:
The floating, centred panel summoned by ⌘T or ⌘L for going to an address, searching, or jumping to an open tab.
_Avoid_: command bar, address bar, omnibox, URL bar

**Inline Completion**:
The rest of what you're typing, filled in by the Command Palette from your own browsing history and accepted with Tab.
_Avoid_: autofill, autocomplete suggestion

**Tab Switcher**:
The strip of miniature tab previews shown while ⌘⌥ is held, in which ←/→ moves a highlight through the Active Profile's tabs and releasing ⌘⌥ goes to the highlighted one.
_Avoid_: alt-tab, tab overview, ctrl-tab

**Frecency**:
How strongly a place in your history is favoured, blending how often and how recently you visited it.
_Avoid_: popularity, rank

**Visit**:
One page you went to in a Profile; the raw material of Frecency. Switching to an open tab is not a Visit.
_Avoid_: hit, history entry

**Typed Visit**:
A Visit you started from the Command Palette, as opposed to one reached by following a link.
_Avoid_: direct visit

**Site**:
An address with no scheme and no `www.`, such as `example.com`; the first thing Inline Completion fills.
_Avoid_: domain, origin
