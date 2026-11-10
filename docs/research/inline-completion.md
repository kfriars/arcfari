# How should Inline Completion rank and complete URLs?

Research for [#7](https://github.com/kfriars/arcfari/issues/7), part of map [#1](https://github.com/kfriars/arcfari/issues/1). Researched 2026-11-10.

**Sources.** Code links point at pinned revisions read on 2026-11-10:

- Chromium `main` @ [`f7daeeb8`](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28), committed 2026-11-10.
- Firefox `main` @ [`5d45f3e2`](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/), committed 2026-11-10. I read it from the official `mozilla-firefox/firefox` repository and link it on searchfox.

Constants can change in later commits. "Changed since I last knew it" notes mark what has moved. All examples use `example.com`. No local browsing data was used.

---

## The answer in brief

- **Chromium (and so Arc's engine).** Inline completion goes to the best history match. Its default is the highest-relevance match that is *allowed to be default*.
  - The HistoryURL provider inlines a URL only if it has been **typed**: once is enough for a bare host, a deeper URL needs two.
  - When the best match is a deep page, it first offers a **shorter version**. That can be the bare host, even one never visited, or a visited prefix with at least ⅓ as many visits. This is what gives Chrome its "site first" feel.
  - The HistoryQuick provider scores history as *topicality × frequency × specificity*. Frequency is a recency-weighted sum over the 10 most recent visits, and a typed visit is worth 1.5 untyped ones.
  - Since recently, Chrome on desktop also reorders URL results with an on-device ML model **by default**. Chrome's exact current order can't be reproduced from source, but its inputs can.
- **Firefox.** Firefox's autofill completes the **origin** (the site) when the input has no `/`. It completes **up to the next `/`** once the input has a path.
  - Origins need a typed visit in the last 90 days and a frecency at or above the median origin's.
  - Page frecency has been rewritten. It is now an exponential decay with a **30-day half-life** over the 10 most recent visits: weight 100 for typed visits and bookmarks, 50 for other visits, 20 for redirects, doubled for "interesting" visits.
  - Firefox stores frecency as **the day the score will decay to 1**, so it never needs a background decay job.
- **Recommendation for Arcfari.** Use Firefox's decay formula (constants below) with **typed** meaning "the navigation came from the Command Palette".
  - Rank the site step and the segment step by the **sum of Frecency of the pages under each candidate step**.
  - Only complete a *site* that has a typed visit in the last 90 days or at least 4 visits, so Enter doesn't hijack searches.
  - The palette shows one default row, then open tabs, then history by Frecency, then search suggestions.
- **Search suggestions.** Use Kagi `https://kagisuggest.com/api/autosuggest?q=` for the Personal Profile. Kagi documents it, it needs no auth, and it returns OpenSearch JSON.
  - Use Google `https://www.google.com/complete/search?client=firefox&q=` for the other Profiles. It is undocumented, but it is what Firefox ships today. It needs no auth and returns OpenSearch JSON.
  - Neither publishes rate limits.

---

## 1. Chromium's omnibox

Arc is Chromium-based, but its Command Bar is Arc's own code. Arc is closed source, and its help centre doesn't document how the Command Bar ranks (see §3). Chromium is therefore the closest primary source for "how Arc's engine does it".

### 1.1 Two history providers

Chromium's omnibox merges matches from several providers, each assigning a *relevance* score on one shared scale. The two history providers are:

- **HistoryURL provider (HUP).** It handles inline completion of URLs and the "what you typed" match. It runs a synchronous first pass on an in-memory database so inline completion doesn't flicker or change when you type fast and press Enter ([history_url_provider.h](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.h), header comment).
- **HistoryQuick provider (HQP).** It does word-based matching over URLs and titles and supplies most history rows ([history_quick_provider.cc](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_quick_provider.cc)).

### 1.2 HUP: how candidates are found and sorted

- **Prefix matching ignores scheme and `www.`.** HUP looks up `prefix + input` for each prefix in a fixed list: `http://www.`, `https://www.`, `ftp://www.`, `http://`, `https://`, `ftp://`, and the empty prefix ([url_prefix.cc#58](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/url_prefix.cc#58)). The lookup is an indexed range scan, `url >= ? AND url < ?`, ordered by `typed_count DESC, visit_count DESC, last_visit_time DESC` ([url_database.cc#395](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/history/core/browser/url_database.cc#395)).
- **Low-quality rows are culled.** A row survives only if `typed_count ≥ 1` **or** `visit_count ≥ 4` **or** it was last visited in the past **3 days** ([url_database.cc#915](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/history/core/browser/url_database.cc#915)). Result pages of the default search engine are also dropped ([history_url_provider.cc#1033](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#1033)).
- **Sort order** ([`CompareHistoryMatch`, history_url_provider.cc#62](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#62)) applies these tests in turn:
  1. Typed at all beats never typed.
  2. An *innermost* match (one made after the scheme and `www.`) beats a non-innermost one. So typing `w` prefers `wellsfargo.com` over `www.google.com`.
  3. A higher `typed_count` wins.
  4. If both were typed exactly once, a host-only URL beats a page inside it.
  5. A higher `visit_count` wins.
  6. A more recent visit wins.
  7. URL alphabetical order breaks remaining ties.

### 1.3 HUP: what may be inlined, and "site first"

- **The typed gate.** A history match may be inline-completed only if `typed_count ≥ 1` *and* (`typed_count > 1` *or* it is host-only). In the source's words: "We set a higher bar for these long URLs because it's less likely that users will want to visit them again" ([history_url_provider.cc#235](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#235)).
- **Shorter suggestion first.** Before inlining, `PromoteOrCreateShorterSuggestion` tries to swap the best match for a shorter URL ([history_url_provider.cc#967](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#967)):
  - The best match is reduced to its **bare host** while the input still fits inside the host ([`ConvertToHostOnly`, #249](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#249)). The host is suggested even if never visited: "if the user visited `http://example.com/asdf` once, we'll suggest `http://example.com/` even if they've never been to it."
  - Otherwise it looks for the **shortest visited URL between the input and the best match** with at least `(visits − 1) / 3 + 1` visits, i.e. about ⅓ as many ([#1005](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#1005)).
  - This is not segment-by-segment completion. Past the host, Chromium jumps to the shortest *visited* prefix URL, however many segments that is.
- **Fixed score bands.** The inlined match gets **1413** ([#279](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#279)), against **1300** for "search what you typed" ([search_provider.h#73](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/search_provider.h#73)).
  - A typed URL therefore beats searching the input, and an untyped one doesn't.
  - "URL what you typed" gets 1203 and an unvisited intranet host 1403. Other HUP rows get 900 + n, each scored one below the previous ([#822](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#822)).
- **Demotion of stale rows** (non-inlined rows only). Counts decay with a **30-day half-life** ([`GetDefaultHUPScoringParams`, omnibox_field_trial.cc#214](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/omnibox_field_trial.cc#214); [`CalculateRelevanceUsingScoreBuckets`, history_url_provider.cc#134](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/history_url_provider.cc#134)):
  - The decayed typed count is capped through `1.0:1413, 0.97:1390, 0.93:1360, 0.85:1340, 0.72:1320, 0.50:1250, 0.0:1203`.
  - Never-typed URLs are also capped by decayed visit count through `4.0:790, 0.5:590, 0.0:100`.

### 1.4 HQP: the frequency-and-recency score

[scored_history_match.cc](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/scored_history_match.cc):

- **Final score.** `topicality × frequency × specificity` is mapped piecewise-linearly through buckets `0.0:550, 1:625, 9.0:1300, 90.0:1399`. HQP can never reach HUP's 1413 ([#921](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/scored_history_match.cc#921), [#988](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/scored_history_match.cc#988)).
- **Frequency** sums, over the **10** most recent visits, `value × recency(days ago)` ([#860](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/scored_history_match.cc#860)).
  - A visit's `value` is **1.5** if typed, 1 otherwise, and 10 if bookmarked ([omnibox_field_trial.cc#357](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/omnibox_field_trial.cc#357), [#372](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/omnibox_field_trial.cc#372)).
  - Recency is a piecewise-linear table ([#83](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/scored_history_match.cc#83)): 1.0 up to 4 days, 0.7 at 14 days, 0.5 at 31, 0.3 at 90. It drops to 0.2 just after 90 days and falls to 0.1 at 365.
- **Topicality** rewards term matches at word starts. A hostname match at a word start scores highest, mid-word matches count only in the host, and a single-term host match is about 1.0.
- **Specificity** is 3 / 2.5 / 2 / 1.5 when 1 / 2 / 3 / 4 pages match the input, and 1 otherwise ([omnibox_field_trial.cc#389](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/omnibox_field_trial.cc#389)).
- **Inlining.** HQP can inline a match only if the input is a single term and the match begins right after one of the URL prefixes ([#226](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/scored_history_match.cc#226)).
- **Ties** fall back to HUP's ordering: typed, innermost, typed count, host-only, visits, recency ([#376](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/scored_history_match.cc#376)).

### 1.5 Shortcuts (learned "typed text → chosen URL")

Chromium also remembers what you picked for what you typed. Its score is `sqrt(typed_len / (shortcut_len − 10)) × 0.5^(weeks_since_use / min(0.8 + 0.2·hits, 5)) × 1199`, boosted to 1414 for the top shortcut ([shortcuts_provider.cc#110](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/shortcuts_provider.cc#110)). This lets `ex` jump straight to a deep page you keep choosing, which goes against the map's "site first", so it is not recommended for Inline Completion.

### 1.6 What Enter does

- **The default match.** After sorting, the highest-relevance match that is *allowed to be default* is rotated to the top ([autocomplete_result.cc#381](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/autocomplete_result.cc#381), [`FindTopMatch` #1274](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/autocomplete_result.cc#1274)). Its `inline_autocompletion` is the grey text, and Enter navigates to it.
- **Default eligibility** ([`SetAllowedToBeDefault`, autocomplete_match.cc#2006](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/autocomplete_match.cc#2006)). A match with inline text can't be default when the input carries `prevent_inline_autocomplete`. Trailing whitespace in the input is also handled specially.
- **Stability.** The previous default is kept when it still matches, so the completion doesn't jump while you type ([autocomplete_result.cc#381](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/autocomplete_result.cc#381), `default_match_to_preserve`).
- **Result count.** At most 8 results on desktop ([autocomplete_result.cc#135](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/autocomplete_result.cc#135)).

### 1.7 What counts as "typed" in Chromium

- **Picking a URL match counts.** An omnibox match navigates with transition `TYPED` unless its provider says otherwise ([autocomplete_match.h#984](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/autocomplete_match.h#984)). So picking a history row or an inline completion also counts as typed.
- **Increment rule.** `typed_count` goes up only on a new navigation whose core type is `TYPED` and that isn't a redirect, or `KEYWORD_GENERATED` ([`IsTypedIncrement`, history_backend.cc#355](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/history/core/browser/history_backend.cc#355)).
- **Retention.** History older than **90 days** is deleted ([history_backend.h#211](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/history/core/browser/history_backend.h#211)).

### 1.8 Changed since I last knew it

- **ML reranking is on by default.** `kMlUrlScoring` is now **enabled by default on every platform except Android** ([omnibox_features.cc#429](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/common/omnibox_features.cc#429)).
  - After the heuristics run, Chrome runs a downloaded model over each URL match's signals: typed count, visit count, time since last visit, shortcut hits, host-only, URL length, and others.
  - It then **reassigns the existing relevance scores** in model order ([autocomplete_controller.cc#2564](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/autocomplete_controller.cc#2564)).
  - The model isn't in the source tree, so Chrome's exact current ordering can't be reproduced. The heuristics above are still the explainable baseline and the source of the scores being reshuffled.
- **Search engine definitions moved.** Prepopulated engines now live in the separate `external/search_engines_data` repository, pinned in `DEPS`.

---

## 2. Firefox

### 2.1 Page frecency (current algorithm)

This lives in [`CalculateFrecencyFunction::BuildFrecencySQL`, SQLFunctions.cpp#560](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/SQLFunctions.cpp#560), with defaults in [StaticPrefList.yaml#18075](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/modules/libpref/init/StaticPrefList.yaml#18075).

- **Sampling.** It takes the **10** most recent visits (`places.frecency.pages.numSampledVisits`). Downloads, framed links and **reloads** are ignored ([#626](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/SQLFunctions.cpp#626)).
- **Per-visit weight** ([#657](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/SQLFunctions.cpp#657)):

  | Visit | Weight | If "interesting" |
  |---|---|---|
  | Typed (not from a search, not sponsored, not a redirect), or bookmark | `highWeight` **100** | `veryHighWeight` **200** |
  | Any other non-redirect visit (link etc.) | `mediumWeight` **50** | `highWeight` **100** |
  | Redirect source, embed, sponsored | `lowWeight` **20** | (no boost) |

  - A redirect *target* takes the visit type of its source.
  - A visit is "interesting" when it falls within 2 minutes of a recorded interaction with ≥ **60 s** view time, or ≥ **20 s** view time with ≥ **50** key presses (`places.frecency.pages.interactions.*`).
- **Decay.** λ = ln 2 / **30 days** (`places.frecency.pages.halfLifeDays`). Each sample is decayed relative to the most recent sample.
- **Score.**

  ```
  score = ( Σ weightᵢ · e^(−λ·(ref − dayᵢ)) ) / n · max(visit_count, n)
  ```

  This is the average decayed weight of the sampled visits times the page's total visit count.
- **Stored value** ([#717](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/SQLFunctions.cpp#717)): `frecency = ref_day + ln(score) / λ`. This is the day (counted from 1970) on which the score will have decayed to 1, so stored values can be compared directly without decaying them. The `moz_places.frecency` column holds exactly this ([PlacesFrecencyRecalculator.sys.mjs#273](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/PlacesFrecencyRecalculator.sys.mjs#273)).
- **Changed since I last knew it.** The old bucket algorithm is gone from both the SQL and the default prefs:
  - It used age buckets (`places.frecency.firstBucketCutoff` …), per-transition bonuses such as `typedVisitBonus`, and a separate daily decay.
  - Older write-ups of "Firefox frecency" (MDN, wiki) describe the removed algorithm.
  - An `alternative` variant with identical defaults sits behind `places.frecency.pages.alternative.featureGate` (off).

### 2.2 Origin frecency and origin autofill

- **Origin frecency** ([PlacesFrecencyRecalculator.sys.mjs#328](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/PlacesFrecencyRecalculator.sys.mjs#328)) is `AVG(page frecency) × COUNT(distinct days with a typed visit)`, over typed visits in the last **90 days** (`places.frecency.originsCutOffDays`, [#58](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/PlacesFrecencyRecalculator.sys.mjs#58)). An origin with no typed visit in that window gets 1.0.
  - *Inference from the code:* page frecency is a day number (about 20,400 in late 2026) and varies little between pages. In practice, then, origin frecency is dominated by **how many distinct days you typed that site in the last 90**.
- **Autofill threshold** ([#369](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/PlacesFrecencyRecalculator.sys.mjs#369)). It is the largest frecency in the lower half (`NTILE(2)`, [`BUCKETS = 2`](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/PlacesFrecencyRecalculator.sys.mjs#88)) of origins with frecency > 1, which is roughly the median. It defaults to 2.
- **When the input looks like an origin** (no `/` except a trailing one), autofill picks one origin ([`originQuery`, UrlbarProviderAutofill.sys.mjs#157](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#157); dispatch at [#1210](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#1210)):
  1. Its host must start with the input, or `www.` + input.
  2. It is grouped by **host without `www.`**, and frecency is summed across `http`/`https`/`www.` variants.
  3. It must have a recent typed visit and a summed frecency ≥ threshold, or be bookmarked.
  4. Candidates are ordered by summed frecency, then own frecency, bookmarks, then `https` first ([#218](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#218)).
- **`www.` handling.** Typing `exam` shows `example.com/` but loads `https://www.example.com/` when that is the real host ([#958](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#958)).
- **Single-token rule.** Autofill only runs for a single token with no spaces ([#459](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#459)).

### 2.3 URL autofill "to the next slash"

- **Candidate.** When the input contains a path, the candidate is the single highest-frecency page on that host (or `www.`host) whose prefix-stripped URL starts with the input, with exact matches first ([#291](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#291)).
- **Floor.** The page's frecency must exceed `pageFrecencyThreshold(90, 0, true)`, a synthetic "bookmarked 90 days ago" score ([#31](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#31); [`nsNavHistory::CalculateFrecency`, nsNavHistory.cpp#1747](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/nsNavHistory.cpp#1747)).
- **Truncation** ([#996](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#996)). The fill stops at the next `/`, *including* the slash:
  > `http://mozilla.org/foo/bar/baz` will be autofilled to: `mozilla.org/f[oo/]`, `mozilla.org/foo/b[ar/]`, `mozilla.org/foo/bar/b[az]`
- **Case.** The part the user typed keeps their case ([#1038](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarProviderAutofill.sys.mjs#1038)).

### 2.4 Typed visits, adaptive history, prefs

- **Every address-bar load counts as typed.** `UrlbarUtils.addToUrlbarHistory` calls `markPageAsTyped` ([UrlbarParentController.sys.mjs#1282](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarParentController.sys.mjs#1282), [UrlbarUtils.sys.mjs#99](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarUtils.sys.mjs#99)). That includes picked history rows, not just hand-typed URLs.
- **Adaptive history** (input → picked URL, Firefox's analogue of Chromium's Shortcuts) exists, but its autofill is **off by default** (`browser.urlbar.autoFill.adaptiveHistory.enabled = false`, [UrlbarPrefs.sys.mjs#69](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarPrefs.sys.mjs#69)). `use_count` becomes `use_count × 0.9 + 1` on each pick and decays by × 0.975 daily ([UrlbarUtils.sys.mjs#62](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarUtils.sys.mjs#62), [PlacesFrecencyRecalculator.sys.mjs#26](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/toolkit/components/places/PlacesFrecencyRecalculator.sys.mjs#26)).
- **When autofill is skipped.** Firefox doesn't autofill after a deletion, a paste, or undo/redo ([UrlbarInputBase.mjs#5671](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/content/UrlbarInputBase.mjs#5671)).
- **Other prefs.**
  - `browser.urlbar.autoFill = true` ([#65](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarPrefs.sys.mjs#65)).
  - Backspacing an autofill away 3 times blocks it for 2 days (`autoFill.backspaceThreshold`, [#77](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarPrefs.sys.mjs#77)).

### 2.5 Result layout

- At most **10** rows (`maxRichResults`, [#259](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarPrefs.sys.mjs#259)).
- Exactly **one** heuristic row first: autofill, else "visit"/"search" fallback ([#904](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarPrefs.sys.mjs#904)).
- Then search suggestions and a general group **ordered by frecency** ([#945](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarPrefs.sys.mjs#945)). Suggestions come first by default (`showSearchSuggestionsFirst = true`, [#513](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/browser/components/urlbar/UrlbarPrefs.sys.mjs#513)).

---

## 3. Arc

Arc's Command Bar is closed source, and I found no Arc documentation of how it ranks or completes. Arc's help centre (`resources.arc.net`) returns HTTP 403 to automated fetches, so this rests on a web search of its pages, which turned up only release notes. No primary source describes Arc's algorithm.

Arc is built on Chromium, so its profiles are expected to hold Chromium-format `History` databases. The import ticket should confirm the schema locally (§5.6).

---

## 4. Safari constraints that shape the recommendation

From MDN browser-compat-data @ [`07c65951`](https://github.com/mdn/browser-compat-data/tree/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/api); Apple doesn't publish a per-property support table.

- **No `history` API in Safari Web Extensions.** Every member is `version_added: false` ([history.json](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/api/history.json)). Arcfari can't read Safari's history or typed counts through the extension, so it must record its own visits.
- **`webNavigation.onCommitted` exists (Safari 14+) but without `transitionType` or `transitionQualifiers`** ([webNavigation.json](https://github.com/mdn/browser-compat-data/blob/07c659514f0e1f528b16146f07778537d9178d5b/webextensions/api/webNavigation.json)). Safari won't say whether a visit was typed, a link, or a reload.
  - Arcfari doesn't need it to: it **knows which navigations it started from the Command Palette**.
  - That is the same definition Chromium (§1.7) and Firefox (§2.4) use.

---

## 5. Recommendation for Arcfari

### 5.1 History fields (per Profile)

Arcfari keeps one record per **page**. A page's *key* is its URL with the scheme and the leading `www.` removed, the host lowercased, and the `#fragment` dropped; for example, `example.com/admin/users?tab=2`.

| Field | Why |
|---|---|
| `key` | Prefix matching ignores `https://` and `www.` (both browsers do this; §1.2, §2.2). |
| `url` | The full URL last navigated, with its real scheme and host (`https://www.example.com/...`). Enter goes here. |
| `title` | History rows match and display titles. |
| `visitCount` | Total counted visits (the `max(visit_count, n)` term). |
| `typedCount` | Counted visits that came from the Command Palette. |
| `lastVisit`, `lastTypedVisit` | Feed the site eligibility rule (§5.3). |
| `recentVisits` | The 10 most recent counted visits as `(time, typed: Bool)`. These are the samples. |
| `frecency` | Stored value `F` (Double, days since 1970). It is derived, and recomputed only when this page gets a visit. |

**Recording a visit.**

- **What counts.** Every main-frame `webNavigation.onCommitted` in the Active Profile's tabs counts as one visit.
- **Typed.** A visit is typed when the Command Palette started that navigation: Enter on an Inline Completion, an address, or a history row. Clicked links, links from other apps, and new-window opens are *not* typed.
- **What doesn't count:**
  - Non-`http(s)` URLs.
  - A commit of the same URL as the tab's previous commit. Treat it as a reload, as Firefox ignores reloads.
  - The Profile's own search-result pages (`kagi.com/search?…`, `google.com/search?…`). Chromium culls default-engine result pages from history matches.
- **Redirects.** Server redirects commit only the final URL, so redirect sources are never stored. That makes Firefox's "redirect = low weight" moot.

### 5.2 Frecency formula

This is Firefox's current page formula (§2.1) without the interaction bonus.

```
λ = ln 2 / 30            (per day; 30-day half-life)
wᵢ = 100 if typed, else 50
S  = ( Σ_{10 most recent visits} wᵢ · e^(−λ · (now − tᵢ)) ) / n · max(visitCount, n)
F  = now + ln(S) / λ     (store this; days since 1970, as a Double)
S(t) = e^(λ · (F − t))   (current score at any later time t)
```

- **No background decay job.** Ordering by `F` is ordering by current score for every page at once. A throwaway check confirmed the order is unchanged 100 days later.
- **Calibration.** One typed visit today scores **100**. One link visit 30 days ago scores **25**.
- **Prefix score.** The score of a site or path segment is the **sum of `S(now)` over the pages under it**.
  - Firefox does the same when it sums an origin's frecency across `http`/`https`/`www.`.
  - The sum means "how often and how recently you went *anywhere under* this", which is what choosing a site or segment means.
- **Left out for v1.** Firefox's "interesting visit" bonus (200/100 for ≥ 60 s viewing) needs view-time tracking. It can be added later without changing the stored format.

### 5.3 Completion rule (site first, then next segment)

1. **Normalise the input.** Trim it, match case-insensitively, then strip a leading `http://` or `https://`, then `www.`.
   - Offer Inline Completion only when the input is non-empty, has no whitespace (Firefox's single-token rule), and the caret is at the end.
   - Don't offer it right after a deletion, a paste, or undo/redo; wait for the next typed character. This is Firefox's rule (§2.4).
2. **Find candidates.** Candidates are pages whose `key` starts with the normalised input. If the input contains no `/`, this is the **site step**. Keep only pages on an **eligible site**, where a site is a host without `www.`:
   - a typed visit in the last **90 days** (Firefox origin rule; Chromium's host gate `typed_count ≥ 1`), **or**
   - at least **4** visits with the latest in the last 90 days (Chromium's `visit_count ≥ 4` significance limit).

   This floor exists because Enter goes to the completed address. Without it, a site visited once by accident would hijack a search. The path step has no floor: an input containing `/` is already clearly an address.
3. **Work out each candidate's step.** Take the rest of its key after the input:
   - skip any leading boundary characters (`/`, `?`, `#`),
   - then take characters up to, but not including, the next boundary.
   - If nothing remains, as for a site's root page, that page offers no step.
   - Step text = input + that.
4. **Rank the steps.** Group candidates by step and score each step by the sum of its pages' `S(now)`. Pick the highest, breaking ties by the shorter step, then alphabetically.
5. **Display.** Keep the user's typed characters as typed and show the rest of the step as Inline Completion. If the user keeps typing characters that match it, keep the same completion without re-ranking; Chromium preserves the default match the same way.
6. **Tab** accepts the shown completion, puts the caret at the end, and the next Tab takes the next step.
7. **Enter** goes to the address shown:
   - If a page's `key` equals the shown text (ignoring a trailing `/`), use that page's recorded `url`.
   - For a site, use the scheme and host of the site's highest-Frecency page plus `/`.
   - Otherwise use `https://` + the shown text, with `www.` restored when the site's pages use it. Firefox restores `www.` the same way.

Checked against the map with `example.com` data in a throwaway script:

| Typed | Shown |
|---|---|
| `ex` | `example.com` |
| `example.com` | `example.com/admin` |
| `example.com/a` | `example.com/admin` |
| `example.com/admin` | `example.com/admin/users` |
| `https://www.ex` | `example.com` |

How this differs from the two browsers:

- It stops **before** the slash (`example.com/admin`), as the map specifies, where Firefox includes it (`admin/`).
- It ranks **segments by summed Frecency**, where Firefox takes the single best page and Chromium the shortest visited prefix.

### 5.4 Command Palette result order

Show at most 10 rows (Firefox shows 10, Chromium desktop 8). Only one row is the default, and it is what Enter does, as in both browsers.

1. **Default row.**
   - The Inline Completion's address, if there is one.
   - Else "Go to `<input>`" if the input looks like an address (a scheme, or a dot and no spaces).
   - Else "Search Kagi" (Personal) or "Search Google" (other Profiles) for `<input>`.
2. **Open tabs** of the Active Profile that match: up to 3, ordered by the Frecency of their URL. Picking one switches to it.
3. **History**: up to 4 pages, by page Frecency. Every input term must match at a word start in the `key` or the `title`, as in Chromium HQP's word-start rule. Skip pages already shown as the default row or an open tab.
4. **Search suggestions**: whatever rows remain, up to 4, in the engine's order, dropping one identical to the input.

Show local rows at once and add suggestions when they arrive, never changing the default row. Chromium's synchronous first pass exists to keep Enter predictable in exactly this way.

Putting history before suggestions is a choice for a history-heavy user. Firefox's default is the reverse, and it's one constant to flip after the week of use.

### 5.5 Search suggestions

**Endpoints:**

| Profile | Endpoint |
|---|---|
| Personal | `GET https://kagisuggest.com/api/autosuggest?q=<terms>` |
| The other Profiles | `GET https://www.google.com/complete/search?client=firefox&q=<terms>` |

Both return OpenSearch Suggestions JSON. Read element `[1]` as the list of completions. Details are in §6.

**Request rules:**

- **Throttle.** Wait at least 100 ms between requests (Chromium's default, [omnibox_field_trial.cc#559](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/omnibox_field_trial.cc#559)). Cancel the request in flight when the input changes, and ignore a response whose element `[0]` isn't the current input.
- **Don't send URL-like input.** Never send input containing `/`, `?`, `@`, a `:port`, or a scheme.
  - Chromium won't send https paths, queries, ports or usernames because they "may reveal private information" ([`IsQueryPotentiallyPrivate`, search_provider.cc#828](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/omnibox/browser/search_provider.cc#828)).
  - This rule also keeps the addresses you type from going to Google or Kagi.
- **No cookies.** Send no cookies, e.g. an ephemeral session. Both endpoints work without them, and Kagi built `kagisuggest.com` so that login cookies aren't sent.

### 5.6 Seeding from Arc

This is input for the "Arc history import" ticket.

- **Where the data is.** Arc profiles should use Chromium's `History` SQLite schema (confirm locally):
  - `urls(id, url, title, visit_count, typed_count, last_visit_time, hidden)`
  - `visits(url → urls.id, visit_time, from_visit, transition, visit_duration, …)` ([visit_database.cc#146](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/components/history/core/browser/visit_database.cc#146))
- **Times.** They are microseconds since 1601-01-01 UTC ([sql/statement.cc](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/sql/statement.cc) `ColumnTime`). Convert with `unix_seconds = visit_time / 1e6 − 11644473600`.
- **Which visits to keep** ([page_transition_types.h#40](https://chromium.googlesource.com/chromium/src/+/f7daeeb80087f64ee108b65a5f106b603e9ddd28/ui/base/page_transition_types.h#40)):
  - Keep visits with the `CHAIN_END` bit `0x20000000` set. Those are final destinations, matching what Safari's `onCommitted` gives.
  - Drop visits whose core type `transition & 0xFF` is 3 or 4 (subframes) or 8 (reload).
  - Mark a visit **typed** when its core type is 1 (`TYPED`) or 10 (`KEYWORD_GENERATED`), mirroring `IsTypedIncrement`.
- **Then replay.** Feed the kept visits through §5.1–5.2 in time order.
- **Coverage.** Chromium keeps **90 days** of visits by default, so the seed covers at most about three months. That is plenty with a 30-day half-life.
- **Open question for that ticket.** Nothing says whether Arc's Command Bar records its navigations as `TYPED`. Check locally with `SELECT COUNT(*) FROM urls WHERE typed_count > 0;`, and never post the output. If it is zero, the seed has no typed signal. The "≥ 4 visits" branch of §5.3 still makes frequent sites completable, and typed visits build up from Arcfari use.

---

## 6. Search suggestion endpoints in detail

Tested 2026-11-10 with the query `weather`, a Safari-like User-Agent, and no cookies.

### Kagi (Personal Profile)

- **Endpoint.** `GET https://kagisuggest.com/api/autosuggest?q={searchTerms}`
- **Documented by Kagi.**
  - Kagi's help page lists both `https://kagi.com/api/autosuggest?q=%s` and, for Privacy Pass, `https://kagisuggest.com/api/autosuggest?q=%s` ([setting-default.md, "Custom Use"](https://github.com/kagisearch/kagi-docs/blob/6f7cb573b371dff4bf50647ba863c98a2cb6a4cd/docs/kagi/getting-started/setting-default.md); published at help.kagi.com/kagi/getting-started/setting-default.html).
  - The Privacy Pass page says the `kagisuggest.com` domain "prevents browsers from automatically sending your Kagi login cookies with autosuggest requests" ([privacy-pass.md](https://github.com/kagisearch/kagi-docs/blob/6f7cb573b371dff4bf50647ba863c98a2cb6a4cd/docs/kagi/privacy/privacy-pass.md)).
  - Kagi's own `https://kagi.com/opensearch.xml` declares `kagisuggest.com/api/autosuggest` as its `application/x-suggestions+json` URL.
  - Chromium's prepopulated Kagi engine uses the same URL ([prepopulated_engines.json#217](https://chromium.googlesource.com/external/search_engines_data/+/5dc9f1afd38a8ac2b26b1972eb4fc1bbd5754e8c/definitions/prepopulated_engines.json#217)).
- **Response.** `200`, `content-type: application/json`, `cache-control: no-store`. The body is `["weather",["weather channel","weather radar", …]]` (10 completions): the [OpenSearch Suggestions](https://github.com/dewitt/opensearch/blob/master/mediawiki/Specifications/OpenSearch/Extensions/Suggestions/1.1/Draft%201.wiki) `[query, completions]` form. `kagi.com/api/autosuggest` returned the same.
- **Auth.** None; it worked without cookies or a token.
- **Rate limits.** Not documented.
- **Reliability.** Kagi documents it for manual browser setup and ships it in its OpenSearch file. It is stable as far as a public, documented URL goes, with no SLA.

### Google (all other Profiles)

- **Endpoint.** `GET https://www.google.com/complete/search?client=firefox&q={searchTerms}`
- **Not documented by Google.** Google publishes no public suggest API. This is the base and `client` Firefox ships today ([search-config-v2.json#2524](https://searchfox.org/firefox-main/rev/5d45f3e29ea97028031d29a53666028d6305bf93/services/settings/dumps/main/search-config-v2.json#2524)). Firefox also adds a `channel` parameter, which is Firefox's own and should be left out.
  - Chromium's own request is richer: `{google:baseSuggestURL}{google:suggestPath}?…client={google:suggestClient}&xssi=t&q=…&sugkey=…` ([prepopulated_engines.json#181](https://chromium.googlesource.com/external/search_engines_data/+/5dc9f1afd38a8ac2b26b1972eb4fc1bbd5754e8c/definitions/prepopulated_engines.json#181)). It is meant for Chrome.
- **Response.** `200`, `content-type: text/javascript; charset=UTF-8`.
  - The body is `["weather",["weather","weather today","weather tomorrow", …],[],{"google:suggestsubtypes":[…]}]` (10 completions): the same OpenSearch form plus a Google extension object.
  - `client=chrome` adds `google:suggestrelevance` and suggestion types.
  - `client=safari` returns a different nested shape.
  - Completions were localised to the requester's approximate location, an observed behaviour that Google doesn't document.
- **Auth.** None.
- **Rate limits.** Not published.
- **Reliability.** It is undocumented and can change without notice, but Firefox depends on it in its current release config. Treat failures as "no suggestions" and fail silently.

---

## 7. Notes for later

- **Glossary gaps** for `domain-modeling`:
  - **site**: a host without `www.`, the unit of the first Tab step.
  - **typed visit**: a visit started from the Command Palette.

  Both are used above but aren't in `GLOSSARY.md`.
- **Left out deliberately.**
  - Learned "input → picked page" ranking (Chromium Shortcuts, Firefox adaptive history) would let `ex` jump past the site. That contradicts the map's site-first behaviour.
  - Chromium's fixed score bands (1413/1300/1203) exist to merge many providers. Arcfari has a fixed row order, so a single Frecency score is enough.
- **No conflict with ADR-0001.** Everything here is code in this repo plus two HTTP endpoints of the Profiles' own search engines.
