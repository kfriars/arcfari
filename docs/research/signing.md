# Signing a self-built Safari extension and helper app

Research for [#4](https://github.com/kfriars/arcfari/issues/4) (map [#1](https://github.com/kfriars/arcfari/issues/1)).
Researched 2026-11-10 against Apple's current documentation. Target machine: macOS 27.0.1, Safari 27.0.1, Xcode 27.2.

**Question.** What is the cheapest signing setup that keeps a locally built Safari Web Extension enabled, and a locally built helper app's macOS permissions granted, across Safari restarts and across rebuilds?

"Provisioning profile" below always means Apple's code-signing file. It never means a Safari Profile in the [GLOSSARY](../../GLOSSARY.md) sense.

## Answer in brief

| Option | Cost | Safari extension across Safari restarts | TCC grants across rebuilds | Verdict |
|---|---|---|---|---|
| Unsigned, or "Sign to Run Locally" (ad hoc) | free | Apple says Safari hides it unless **Allow unsigned extensions** is on, and that setting resets every time Safari quits [1]. Two 2026 third-party reports disagree about ad hoc builds on Safari 26 [15][16]. Nothing has been measured on Safari 27. | **No.** The designated requirement is a cdhash, which changes on every build [5][7] (reproduced below). | Unusable for the helper app |
| **Apple Development, free Personal Team** (Apple Account signed into Xcode) | free | Apple's docs treat signing with a development certificate as what makes an extension "signed" [1]. A third-party test on Safari 26 found it stays enabled across restarts with the toggle off [16]. Not yet confirmed on Safari 27 (see [Still to verify](#still-to-verify-on-safari-27)). | **Yes.** The designated requirement pins the bundle ID plus the certificate's name, not the build [5]. | **Recommended** |
| Apple Development, paid team | $99/yr [12] | Same as above. No documented difference from a Personal Team. | Same as above. | Pays for nothing that Arcfari needs today |
| Developer ID + notarization (paid) | $99/yr | Supported since Safari 18.4 [3]. It is the documented way to run an extension on Macs other than the one that built it [2][3]. | **Yes.** The designated requirement pins the Team ID, so it also survives certificate renewal [5]. | Only worth it for distribution. Notarizing every build slows the rebuild loop. |

**Recommendation.** Sign both the extension's containing app and the helper app with **Apple Development from a free Personal Team**. The paid Apple Developer Program **is not required**. Revisit that only if the Safari 27 check below fails, or if Arcfari ever needs a restricted entitlement (see the watch list).

## 1. Does "Allow unsigned extensions" still reset on quit in Safari 27? Is it workable daily?

**It still resets, and it is not workable for daily use.**

- Apple's current *Running your Safari web extension* page says: "For security purposes, Safari ignores unsigned extensions by default, so your extension won't show up in Safari Extensions preferences." It also says: "The 'Allow unsigned extensions' setting for Safari resets when you quit Safari; set it again the next time you launch Safari." In Safari 17 and later the checkbox is under Settings > Developer, which appears once Settings > Advanced > "Show features for web developers" is on. Turning it on asks for authentication [1].
- In October 2024 an Apple engineer wrote that the option "needs to be rechecked occasionally for security purposes" [8].
- The Safari release notes from 18.4 through 27.3 beta announce no change to this behaviour. The only signing-related entry is 18.4's "Added support for loading Safari Web Extensions that have been Developer ID-signed and notarized" [3]. The WWDC26 Safari extensions session still has developers allow unsigned extensions when testing unsigned code [4].
- The alternative, **Add Temporary Extension…**, is worse: "Safari removes temporary extensions after 24 hours or when you quit Safari" [1].
- **Why it fails daily use:** every Safari quit (an update, a crash, a logout, a restart) silently drops Arcfari's Command Palette and hotkeys until someone re-ticks the box and authenticates. It also does nothing for the helper app's permissions.

*Confirmed for:* Apple's documentation as published today, which is version-neutral after Safari 17. It has not been re-measured on Safari 27.0.1.

## 2. Does a free Apple ID (Personal Team) or "Sign to Run Locally" keep the extension enabled?

**Personal Team: very probably yes. Sign to Run Locally: officially no, and it is ruled out anyway by TCC (section 4).**

- **The official dividing line is a development certificate.** Apple's wording is: "If you're not part of the Apple Developer Program, or if you haven't yet configured a developer identity for your existing Xcode project, your Safari web extension won't be signed with a development certificate. For security purposes, Safari ignores unsigned extensions by default" [1]. Signing into Xcode with a free Apple Account creates a Personal Team, and Xcode manages its certificates [11]. That certificate is an *Apple Development* certificate from the same Apple certificate authority as a paid team's, so Xcode gives it the same kind of designated requirement [5]. Apple's documentation never addresses Personal Teams and Safari directly.
- **Third-party measurement on a recent Safari.** In October 2026 the vimplug project switched its local build to Apple Development signing and reported: "Safari 26 keeps that build enabled across restarts with the toggle off". They added that this holds only "on the Mac that holds it" [16]. That project discusses Program membership only as something not yet funded [16], so the certificate was most likely from a free Personal Team. That is an inference: the project never says so outright.
- **Sign to Run Locally is ad hoc signing** [5]. Apple's docs count it as not signed with a development certificate, so it needs the toggle [1]. Third-party reports conflict:
  - extension.js measured ad hoc builds on Safari 26.5.2 with the toggle off and found that "Safari lists it and runs it". They also say that enabling it once in Settings > Extensions survives Safari restarts [15].
  - vimplug says its ad hoc builds needed the toggle at every launch [16].

  Neither report covers Safari 27, and ad hoc fails the TCC requirement regardless.
- **Rebuilds:** with a stable bundle ID and signature, a rebuild only updates the extension. Apple's flow is "choose Product > Build … As soon as the build completes, your extension updates are ready to use in Safari" [1]. Changing the bundle ID makes Safari treat the extension as new, so it has to be re-enabled [15].
- **Safari Profiles:** in Safari 17 and later, each Safari profile enables extensions separately (Settings > Profiles > *profile* > Extensions) [1]. Arcfari's four Profiles therefore need four one-time enables.

## 3. What does the paid Apple Developer Program change?

The program costs 99 USD a year [12]. For a one-Mac, never-distributed setup it changes little:

- **Developer ID signing and notarization become possible.** Notarization is not available to accounts that only registered for free [11]. A Developer ID Application certificate requires membership, and the Account Holder must create it [13]. Since Safari 18.4, a Developer ID-signed and notarized extension loads without the toggle [3]. Before 18.4, Apple staff said only App Store extensions could [9]. In Apple's distribution guide this is the route for shipping outside the Mac App Store [2]. Arcfari ships nowhere.
- **Notarization exists to satisfy Gatekeeper,** and Gatekeeper applies to software "a user downloads and opens … from outside the App Store" [14]. A locally built app is not downloaded. Notarization is also a network round trip to Apple's notary service on every submission [10], and the 18.4 note covers extensions that are "Developer ID-signed **and notarized**" [3]. For an agent that rebuilds constantly, that cost buys nothing.
- **Steadier identity.** A Developer ID designated requirement checks the Team ID (`certificate leaf[subject.OU]`). An Apple Development one checks the certificate's Common Name, `Apple Development: …` [5]. Developer ID signatures also carry a secure timestamp, so they stay valid after the certificate expires [6].
- **No 7-day limits.** A free Personal Team's App IDs and provisioning profiles expire after 7 days [11]. On macOS this matters only if the app needs a provisioning profile, and an app that claims no restricted entitlements needs none [7]. The Safari extension template in Xcode 27.2 sets only App Sandbox, Hardened Runtime, user-selected read-only files and outgoing network. All of those are unrestricted entitlements [7]. The templates were inspected locally.
- **Switching later costs one re-grant.** Apple Development and Developer ID designated requirements are not compatible, so the first Developer ID build prompts again for every permission [5]. This happens once, not on every build.

## 4. Do the helper app's grants survive rebuilds?

This covers Accessibility, Input Monitoring, Automation and Screen Recording.

**They survive under Apple Development or Developer ID signing. They do not survive under ad hoc signing or no signing.**

- **Mechanism.** TCC records the app's **designated requirement** when the user grants a permission. On every later access it checks that the running code still satisfies that requirement [5]. Apple's DTS engineer, writing in 2026, says the same about all privacy prompts: the remembered choice "relies on your code having a stable code signing identity. If your code is unsigned, or signed ad hoc (Signed to Run Locally in Xcode parlance), the system can't tell that version N+1 of your code is the same as version N" [17]. Elsewhere he puts it more bluntly: "Every time you rebuild, the program get a different signature and TCC thinks it's a different program" [18]. His advice is to use "Apple Development signing for all your code" day to day [19], and not to mix ad hoc and certificate-signed builds under one bundle ID [20].
- **Ad hoc requirement.** Reproduced on this Mac with two trivial builds, both ad hoc signed under the same identifier:

  ```
  build 1: # designated => cdhash H"6f9924083e66e3fbda7a58056a1badcd6cb55ec9"
  build 2: # designated => cdhash H"82ebbe8e76b75e12bccc8ac98f8234fe5f26bf91"
  ```

  Each build is a different program to TCC.
- **Apple Development requirement** [5]:

  ```
  identifier "<bundle id>" and anchor apple generic
    and certificate leaf[subject.CN] = "Apple Development: …"
    and certificate 1[field.1.2.840.113635.100.6.2.1] /* exists */
  ```

  The bundle ID and the certificate's name both stay the same between builds, so grants carry over.
- **All four permissions behave the same way, because they are all TCC services.** `tccutil reset <service> [bundle_id]` clears one app's decision for one service [21]. Two of them have extra quirks that signing does not change:
  - **Automation** (Apple Events): under the Hardened Runtime, the helper needs the Apple Events entitlement. It needs none for events sent to processes "signed with the same team ID" [22].
  - **Screen Recording**: since macOS 15, apps that capture the screen are periodically asked to reconfirm, reportedly monthly. That comes from press coverage of macOS 15 [29], not an Apple document, and it is unverified on macOS 27. It happens whatever the signing.
- **A self-signed certificate** made in Keychain Access would also give the helper a stable designated requirement. Apple says it is useful "during internal testing and development" and valid for little "other than validating the designated requirement of your signed code" [23]. But Safari would almost certainly treat an extension signed that way as unsigned, since its certificate is not issued by Apple (an inference). It solves only half the problem, and the Personal Team is just as free.

## Recommendation

Use **Apple Development signing from a free Personal Team**, with Automatically manage signing in Xcode, for every Arcfari target: the extension's containing app, the extension, and the helper app. Do not join the paid program yet.

### One-time setup (done by the user, not an agent)

1. In Xcode > Settings > Accounts, add an Apple Account. Xcode creates the Personal Team and an Apple Development certificate in the login keychain [11].
2. Set that team on every target, and give each target a fixed bundle ID under one prefix that will never change.
3. Export the Apple Development certificate and its private key (`.p12`) from Keychain Access to a safe place outside the repo. If the key is lost (a new Mac, a reinstall, a keychain reset), Xcode issues a replacement certificate [24]. If the replacement's Common Name differs, every permission has to be granted again.
4. Build and launch the containing app once so Safari registers the extension. Then enable it in **each** Safari Profile (Settings > Profiles > *profile* > Extensions) and grant its website access [1].
5. Launch the helper app as itself and grant Accessibility, Input Monitoring, Screen Recording and Automation once.

After that, agents rebuild with plain `xcodebuild` or Xcode, using the same team.

### What to watch for, so grants and the extension don't reset

- **Never ad hoc sign, or leave the team blank, even once.** Do not set `CODE_SIGN_IDENTITY=-`, and do not pass `CODE_SIGNING_ALLOWED=NO` "to make CI pass". Do not mix ad hoc and Apple Development builds under one bundle ID [20].
- **Never change bundle IDs or teams.** Either one makes a new identity. Safari re-enables from scratch [15], and every TCC grant is lost [5]. Moving later to a paid team or to Developer ID costs one round of re-granting [5].
- **Keep exactly one copy of the app on disk.** An Apple engineer reproduced extensions vanishing from Safari when "several copies of the same app are on the same machine". The fix was to delete old archives and DerivedData copies [25]. A Launch Services analysis found that *Clean Build Folder* leaves stale records which make the extension disappear [26]. So: build into one fixed location, never use *Product > Archive* for this project, and delete an app bundle rather than its parent folder.
- **Launch the helper as its own app,** through `open` / Launch Services or a LaunchAgent, not as a child of Terminal or an agent's shell. TCC charges a child process's access to its "responsible code" [17]. A developer reported that an app started from Terminal was judged by Terminal's grants, not its own, and in reply Apple DTS pointed to that responsible-code mechanism [28]. For a LaunchAgent, set `AssociatedBundleIdentifiers` [17].
- **Make the helper a real `.app` bundle** with its own bundle ID and usage-description strings. Then TCC tracks it by bundle ID and designated requirement [5][17].
- **Avoid restricted entitlements** (keychain sharing, iCloud, push and similar). On a Personal Team they would bring in a provisioning profile that expires after 7 days [7][11]. If an App Group is ever needed for extension and app to share data, use the macOS `<TeamID>.<name>` form, which needs no registration on Apple's developer site [27].
- **If a permission goes stale,** for example its toggle shows on but nothing works, run `tccutil reset Accessibility <bundle-id>` (or the matching service) and grant it again [21].
- **Expect about one re-grant a year.** Apple signing certificates typically last about a year [6]. Whether a renewed Personal Team certificate keeps the same Common Name, and so the same TCC grants, is unverified.

## Still to verify on Safari 27

No local experiment was run, because registering a test extension would change Safari's state. The first build ticket should open with this ten-minute check and record the result here:

1. Create a template "Safari Extension App", signed with the Personal Team, and build and launch it once. With **Allow unsigned extensions off**, confirm the extension is listed and can be enabled.
2. Quit and relaunch Safari. Confirm it is still enabled.
3. Change a line, rebuild, and relaunch Safari. Confirm it is still enabled and running the new code.
4. Grant the containing app (or a stub helper) Accessibility, then rebuild. Confirm `AXIsProcessTrusted()` still returns true.

If step 1 or 2 fails with a Personal Team, the fallback is the paid program with Developer ID signing and notarization, the only setup Apple documents as loading without the toggle [3]. Apple Development signing stays fine for the helper's TCC either way.

## Sources

Apple primary sources were fetched on 2026-11-10 from developer.apple.com, through the JSON behind its documentation pages.

1. Apple, *Running your Safari web extension*: https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension
2. Apple, *Distributing your Safari web extension*: https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension
3. Apple, *Safari 18.4 Release Notes*, Web Extensions (40429283): https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes. Notes for 26.0–26.6 and 27.0–27.3 beta were also checked; none mention signing: https://developer.apple.com/documentation/safari-release-notes
4. Apple, WWDC26 session 216, *Create web extensions for Safari*: https://developer.apple.com/videos/play/wwdc2026/216/
5. Apple, *TN3127: Inside Code Signing: Requirements*: https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
6. Apple, *TN3161: Inside Code Signing: Certificates*: https://developer.apple.com/documentation/technotes/tn3161-inside-code-signing-certificates
7. Apple, *TN3125: Inside Code Signing: Provisioning Profiles*, "Entitlements on macOS": https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles
8. Apple Developer Forums, Apple Systems Engineer (Oct 2024): https://developer.apple.com/forums/thread/765761
9. Apple Developer Forums, Apple Engineer (Mar 2021), "Only Safari Web Extensions distributed through the App Store can be loaded without allowing unsigned extensions": https://developer.apple.com/forums/thread/675233. This was superseded for Developer ID builds by Safari 18.4, per an Apple Systems Engineer in Apr 2025: https://developer.apple.com/forums/thread/782005
10. Apple, *Notarizing macOS software before distribution*: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
11. Apple, *Choosing a Membership* (free vs. Program; Personal Team limits; notarization unavailable to free accounts): https://developer.apple.com/support/compare-memberships/
12. Apple, *Enrollment* ("The Apple Developer Program annual fee is 99 USD"): https://developer.apple.com/support/enrollment/
13. Apple, *Developer ID* ("you must be the Account Holder"): https://developer.apple.com/developer-id/
14. Apple Platform Security, *Gatekeeper and runtime protection in macOS*: https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web
15. Third party: extension.js, *Building Safari extensions* (measured on macOS 26.5.2, Safari 26.5.2, Xcode 26.6): https://extension.js.org/docs/browsers/safari. See also PR #541 (Sep 2026): https://github.com/extension-js/extension.js/pull/541
16. Third party: vimplug PR #16 (Oct 2026, Safari 26): https://github.com/m1ngsama/vimplug/pull/16. Issue #10: https://github.com/m1ngsama/vimplug/issues/10
17. Apple Developer Forums, Quinn "The Eskimo!" (DTS), *On File System Permissions*, revised 2026-09-18: https://developer.apple.com/forums/thread/678819
18. Apple Developer Forums, Quinn (DTS), Apr 2021: https://developer.apple.com/forums/thread/678816
19. Apple Developer Forums, Quinn (DTS), Jan 2023: https://developer.apple.com/forums/thread/723669
20. Apple Developer Forums, Quinn (DTS), May 2023: https://developer.apple.com/forums/thread/730043
21. `man tccutil` (macOS 27.0.1)
22. Apple, *Apple Events Entitlement*: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.automation.apple-events
23. Apple, *Code Signing Guide: Code Signing Tasks* (archived, 2016): https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html
24. Apple Developer Forums, Apple DTS (Aug 2026), on a lost Personal Team private key: https://developer.apple.com/forums/thread/842888
25. Apple Developer Forums, Apple Frameworks Engineer (Jan 2025), accepted answer: https://developer.apple.com/forums/thread/772581
26. Third party: Jeff Johnson (Safari extension developer), Launch Services and Safari extensions, with a Feb 2026 addendum: https://lapcatsoftware.com/articles/2024/12/2.html
27. Apple, *App Groups Entitlement*: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups
28. Apple Developer Forums, *Which application is taken in consideration with TCC*, Quinn (DTS) reply, Nov 2023: https://developer.apple.com/forums/thread/741622
29. Third party (press): TidBITS, *Apple Reduces Excessive Sequoia Permission Requests, Shifts to Monthly* (Aug 2024): https://tidbits.com/2024/08/19/apple-reduces-excessive-sequoia-permission-requests-shifts-to-monthly
