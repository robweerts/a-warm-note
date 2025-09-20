// scripts/annotate-i18n-phase1.mjs
// Non-destructive annotator + tiny i18n patch (messages.{lang}.json only).
// Input : ./script.js
// Output: ./script.annotated.js

import fs from 'fs';

const INPUT  = './script.js';
const OUTPUT = './script.annotated.js';

const exists = fs.existsSync(INPUT);
if (!exists) {
  console.error(`❌ Not found: ${INPUT}`);
  process.exit(1);
}
let src = fs.readFileSync(INPUT, 'utf8');

// ---------- [0] Insert top-level section index (A…T) if not present ----------
if (!src.includes('=== SECTION INDEX (A…T) ===')) {
  const header = `/* ==========================================================================
   === SECTION INDEX (A…T) ===
   [A] CONFIG & CONSTANTS           – toggles, paths, defaults
   [A+] THEME & COLORS              – theme detection (Valentine/NewYear/Easter)
   [B] DOM CACHE & HELPERS          – cache elements & micro-helpers
   [C] APP STATE                    – central state (lang, messages, filters, deck)
   [D] INIT (LIFECYCLE)             – bootstrap: wiring, load, welcome, first render
   [E] DATA LOAD                    – fetch messages.<lang>.json (fallback to nl)
   [F] SENTIMENT CHIPS              – build chips, filter handlers
   [G] DECK & RANDOMIZATION         – weighted pool, anti-repeats
   [H] RENDERING                    – note/paper render, wiggle, swipe-next
   [I] COMPOSE                      – inputs To/From, localStorage for "From"
   [J] COACH                        – microcopy states
   [K] SHARE SHEET                  – open/close, share actions (Link/WA/Mail/Download/Native/QR)
   [L] CONFETTI & TOASTS            – celebrate, accessible motion
   [M] UTILITIES                    – URL builders, throttles, misc helpers
   [N] ABOUT DIALOG                 – open/close, ESC/backdrop
   [O] DEBUG HARNESS                – ?debug=1 hooks
   [P] GENERIC SHEET SWIPE          – swipe-to-close behavior
   [Q] GLOBAL EVENT WIRING          – wiring buttons/handlers
   [R] SPLASH OVERLAY               – open splash, clone note
   [S] BUTTONS (EXPAND & ABOUT)     – topbar expand + about FAB
   [T] MOBILE BOOT INTRO            – small mobile intro
   ========================================================================== */\n\n`;
  src = header + src;
}

// ---------- [1] Add [A] CONFIG header near the very top ----------
if (!src.includes('[A] CONFIG & CONSTANTS')) {
  src = src.replace(
    /(^)/,
    `/* === [A] CONFIG & CONSTANTS =============================== */
/* Purpose: central toggles & defaults (keep NL as default in Phase 1) */
/* Notes  : i18n Phase 1 adds DEFAULT_LANG + resolveLang() only        */
`
  );
}

// ---------- [1.1] Inject DEFAULT_LANG + resolveLang() if missing ----------
if (!/const\s+DEFAULT_LANG\s*=/.test(src)) {
  src = src.replace(
    /\/\*\s*=== \[A\] CONFIG & CONSTANTS[\s\S]*?\*\//,
    (m) => `${m}\nconst DEFAULT_LANG = 'nl';\nfunction resolveLang(){\n  try {\n    const p = new URL(location).searchParams.get('lang');\n    return (p && p.trim().toLowerCase()) || DEFAULT_LANG;\n  } catch { return DEFAULT_LANG; }\n}\n`
  );
}

// ---------- [A+] THEME header ----------
if (!src.includes('[A+] THEME & COLORS')) {
  src = src.replace(
    /(\n)/,
    `\n/* === [A+] THEME & COLORS ================================ */
/* Purpose: date/url-driven theme selection + color palettes   */\n`
  );
}

// ---------- [B] DOM CACHE header (attempt near DOMContentLoaded or cache funcs) ----------
src = src.replace(
  /(document\.addEventListener\(['"]DOMContentLoaded['"].*?\{)/s,
  (m) => `/* === [B] DOM CACHE & HELPERS ========================== */
/* Purpose: cache important DOM nodes into a single object     */
${m}`
);

// ---------- [C] APP STATE header ----------
src = src.replace(
  /(const\s+STATE\s*=\s*\{)/,
  (m) => `/* === [C] APP STATE ==================================== */
/* Purpose: central state (lang, messages, filters, deck, etc.)*/
${m}`
);

// ---------- [D] INIT (try to tag main init function or DOMContentLoaded block) ----------
src = src.replace(
  /(DOMContentLoaded['"].*?\{)/,
  (m) => `/* === [D] INIT (LIFECYCLE) ============================= */
/* Purpose: bootstrap wiring, load data, welcome, first render */
${m}`
);

// ---------- [E] DATA LOAD header & i18n fetch patch ----------
// 1) annotate the block where messages.nl.json is fetched
if (!src.includes('[E] DATA LOAD')) {
  // Try to find fetch to messages.nl.json and prepend header
  src = src.replace(
    /(fetch\((['"])(?:\.\/)?\/?data\/messages\.nl\.json\2[^\)]*\))/,
    (m) => `/* === [E] DATA LOAD ================================== */
/* Purpose: load /data/messages.<lang>.json with NL fallback   */
/* Patch  : Phase 1 → dynamic lang path                       */
${m}`
  );
}
// 2) Replace static path with dynamic lang
if (/data\/messages\.nl\.json/.test(src)) {
  src = src.replace(
    /fetch\((['"])(?:\.\/)?\/?data\/messages\.nl\.json\1(\?[^'"]*)?\s*,?\s*\{?[^)]*\)?\)/g,
    // Generic replacement: compute lang and add cache-bust
    `fetch(\`/data/messages.\${(typeof STATE!=='undefined' && STATE.lang) ? STATE.lang : resolveLang()}.json?ts=\${Date.now()}\`, { cache: 'no-store' })`
  );
}

// Ensure STATE.lang is set when loading
if (!src.includes('STATE.lang')) {
  // Try to set after the first successful fetch/parse of messages
  src = src.replace(
    /(await\s+fetch\([^\)]*\)\s*\.then\([^\)]*\)|await\s*response\.json\(\)|const\s+data\s*=\s*await\s*.*?json\(\);)/,
    (m) => `${m}\n/* [E] Set active lang after successful load */\ntry { STATE.lang = resolveLang(); } catch {}`
  );
}

// ---------- [F] SENTIMENT CHIPS header ----------
src = src.replace(
  /(function\s+buildSentimentChips\s*\(|buildSentimentChips\s*=\s*\()/,
  (m) => `/* === [F] SENTIMENT CHIPS ============================== */
/* Purpose: build chips + handlers; labels stay NL in Phase 1  */
${m}`
);

// ---------- [G] DECK & RANDOMIZATION header ----------
src = src.replace(
  /(function\s+rebuildDeck\s*\(|rebuildDeck\s*=\s*\()/,
  (m) => `/* === [G] DECK & RANDOMIZATION ======================== */
/* Purpose: weighted pool, anti-repeat                         */
${m}`
);

// ---------- [H] RENDERING header ----------
src = src.replace(
  /(function\s+renderMessage\s*\(|renderMessage\s*=\s*\()/,
  (m) => `/* === [H] RENDERING ================================== */
/* Purpose: note/paper, message+icon, wiggle, swipe-next       */
${m}`
);

// ---------- [I] COMPOSE header ----------
src = src.replace(
  /(function\s+wireCompose\s*\(|wireCompose\s*=\s*\()/,
  (m) => `/* === [I] COMPOSE ==================================== */
/* Purpose: inputs To/From, localStorage for "From"            */
${m}`
);

// ---------- [J] COACH header ----------
src = src.replace(
  /(function\s+updateCoach\s*\(|updateCoach\s*=\s*\()/,
  (m) => `/* === [J] COACH ====================================== */
/* Purpose: microcopy states                                   */
${m}`
);

// ---------- [K] SHARE SHEET header ----------
src = src.replace(
  /(function\s+openShareSheet\s*\(|openShareSheet\s*=\s*\()/,
  (m) => `/* === [K] SHARE SHEET ================================ */
/* Purpose: open/close, actions (Link/WA/Mail/Download/Native) */
${m}`
);

// ---------- [L] CONFETTI & TOASTS header ----------
src = src.replace(
  /(function\s+celebrate\s*\(|celebrate\s*=\s*\()/,
  (m) => `/* === [L] CONFETTI & TOASTS ========================== */
/* Purpose: celebrate & toasts                                  */
${m}`
);

// ---------- [M] UTILITIES header + buildSharedURL lang patch ----------
if (!src.includes('[M] UTILITIES')) {
  src = src.replace(
    /(function\s+buildSharedURL\s*\(|buildSharedURL\s*=\s*\()/,
    (m) => `/* === [M] UTILITIES ================================ */
/* Purpose: url builders, throttles, misc helpers              */
${m}`
  );
}

// Patch buildSharedURL to write current lang instead of hardcoded nl
src = src.replace(
  /(searchParams\.set\(['"]lang['"]\s*,\s*['"]nl['"]\)\s*;)/g,
  `searchParams.set('lang', (typeof STATE!=='undefined' && STATE.lang) ? STATE.lang : resolveLang());`
);

// Also patch common variants like "...?lang=nl"
src = src.replace(
  /([?&]lang=)nl\b/g,
  `$1\${(typeof STATE!=='undefined' && STATE.lang) ? STATE.lang : resolveLang()}`
);

// ---------- [N] ABOUT DIALOG header ----------
src = src.replace(
  /(function\s+openAbout\s*\(|openAbout\s*=\s*\()/,
  (m) => `/* === [N] ABOUT DIALOG =============================== */
/* Purpose: open/close about with ESC/backdrop                 */
${m}`
);

// ---------- [O] DEBUG HARNESS header ----------
src = src.replace(
  /(function\s+enableDebug\s*\(|enableDebug\s*=\s*\()/,
  (m) => `/* === [O] DEBUG HARNESS ============================== */
/* Purpose: ?debug=1 logging                                   */
${m}`
);

// ---------- [P] GENERIC SHEET SWIPE header ----------
src = src.replace(
  /(function\s+wireSheetSwipe\s*\(|wireSheetSwipe\s*=\s*\()/,
  (m) => `/* === [P] GENERIC SHEET SWIPE ======================== */
/* Purpose: swipe-to-close for sheets                          */
${m}`
);

// ---------- [Q] GLOBAL EVENT WIRING header ----------
src = src.replace(
  /(function\s+wireGlobalUI\s*\(|wireGlobalUI\s*=\s*\()/,
  (m) => `/* === [Q] GLOBAL EVENT WIRING ======================== */
/* Purpose: bind buttons/handlers                              */
${m}`
);

// ---------- [R] SPLASH OVERLAY header ----------
src = src.replace(
  /(function\s+openNoteSplash\s*\(|openNoteSplash\s*=\s*\()/,
  (m) => `/* === [R] SPLASH OVERLAY ============================= */
/* Purpose: clone note in overlay                              */
${m}`
);

// ---------- [S] BUTTONS (EXPAND & ABOUT) header ----------
src = src.replace(
  /(function\s+wireTopbarButtons\s*\(|wireTopbarButtons\s*=\s*\()/,
  (m) => `/* === [S] BUTTONS (EXPAND & ABOUT) =================== */
/* Purpose: topbar expand + about FAB                          */
${m}`
);

// ---------- [T] MOBILE BOOT INTRO header ----------
src = src.replace(
  /(function\s+mobileBootIntro\s*\(|mobileBootIntro\s*=\s*\()/,
  (m) => `/* === [T] MOBILE BOOT INTRO ========================== */
/* Purpose: small mobile intro                                 */
${m}`
);

// ---------- [Final] write output ----------
fs.writeFileSync(OUTPUT, src, 'utf8');
console.log(`✅ Annotated and patched → ${OUTPUT}
- Non-destructive: original left untouched
- Added [A…T] headers where patterns matched
- i18n Phase 1: dynamic messages.<lang>.json + share lang`);
