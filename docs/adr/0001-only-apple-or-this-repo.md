# Only Apple or this repo at runtime

Arcfari exists because Arc was discontinued, so its runtime may depend only on Safari, Apple-supported macOS APIs (Safari Web Extensions, AppleScript, Accessibility, System Settings keyboard shortcuts), and code in this repo. Raycast, Hammerspoon and Karabiner-Elements are already installed and would be faster routes to several features, but each is another product that could go away; this rule is what keeps that from happening again.

## Considered Options

- **Allow open-source tools (Hammerspoon, Karabiner)**: rejected; "replaceable" still means a rewrite on the day they break.
- **Allow anything, including Raycast**: rejected; it recreates the dependency that caused this project.
