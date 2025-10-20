/* ==========================================================================
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
 [K] SHARE SHEET                  – open/close, actions (Link/WA/Mail/Download/Native/QR)
 [L] CONFETTI & TOASTS            – celebrate, accessible motion
 [M] UTILITIES                    – URL builders, throttles, misc helpers
 [N] ABOUT DIALOG                 – open/close, ESC/backdrop
 [O] DEBUG HARNESS                – ?debug=1 hooks
 [P] GENERIC SHEET SWIPE          – swipe-to-close behavior
 [Q] GLOBAL EVENT WIRING          – wiring buttons/handlers
 [R] SPLASH OVERLAY               – open splash, clone note
 [S] BUTTONS (EXPAND & ABOUT)     – topbar expand + about FAB
 [T] MOBILE BOOT INTRO            – small mobile intro
 [U] AI SHEET GLUE				  -	AI Sheet 	
 ========================================================================== */

/* [A] CONFIG & CONSTANTEN --------------------------------------------------- */

const CONFETTI_ENABLED   = true;
const IS_FILE            = (location.protocol === "file:");
const RECENT_LIMIT       = 5;
const PAPER_COLORS       = ["#FFE66D","#FFD3B6","#C5FAD5","#CDE7FF","#FFECB3","#E1F5FE"];
const MOTION = (new URLSearchParams(location.search).get('motion') || 'subtle').toLowerCase(); // 'subtle' | 'normal'
const DEFAULT_LANG = 'nl';
// html[lang] zetten ná resolveLang()

/* [A] resolveLang met prioriteit: URL-pad > ?lang > localStorage > browser > default */
function resolveLang() {
  try {
    // 1) pad: /en/, /nl/ (of /en, /nl)
    const m = (location.pathname || "").match(/^\/(en|nl)(?:\/|$)/i);
    if (m) return m[1].toLowerCase();

    // 2) queryparam
    const urlLang = new URL(location.href).searchParams.get('lang');
    if (urlLang) return urlLang.trim().toLowerCase();

    // 3) localStorage
    const stored = localStorage.getItem('prefLang');
    if (stored) return stored.trim().toLowerCase();

    // 4) browser
    const nav = (navigator.language || navigator.userLanguage || 'nl').slice(0,2).toLowerCase();
    return nav || DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

(function initTextLangSwitcher(){
  const root = document;
  const wrap = root.getElementById('lang-switch');
  if (!wrap) return;
  const btn  = root.getElementById('lang-btn');
  const menu = root.getElementById('lang-menu');
  const cur  = root.getElementById('lang-cur');
  const m = (location.pathname || "").match(/^\/(en|nl)(?:\/|$)/i);
  const pathLang = m ? m[1].toLowerCase() : (resolveLang() || 'nl');
  cur.textContent = pathLang.toUpperCase();
  [...menu.querySelectorAll('.lang-item')].forEach(el => {
    el.setAttribute('aria-checked', String(el.dataset.lang === pathLang));
  });

  function openMenu(){ menu.hidden = false; btn.setAttribute('aria-expanded','true'); }
  function closeMenu(){ menu.hidden = true;  btn.setAttribute('aria-expanded','false'); }
  function toggle(){ (menu.hidden ? openMenu : closeMenu)(); }

  btn.addEventListener('click', toggle);
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(); menu.querySelector('.lang-item')?.focus(); }});

  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('.lang-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { closeMenu(); btn.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i+1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); items[(i-1+items.length) % items.length]?.focus(); }
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.lang-item');
    if (!item) return;
    const target = item.getAttribute('data-lang');
    localStorage.setItem('prefLang', target);
    closeMenu();
    // Navigeer pad-gedreven (behoud query/hash, strip ?lang=)
    goToLang(target);
  });

  // klik buiten menu sluit ‘m
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) closeMenu();
  });
})();

function stripLangParam(url) {
  const u = new URL(url, location.origin);
  u.searchParams.delete('lang'); // we gebruiken route i.p.v. ?lang=
  return u;
}

function getMid() {
  try { return new URL(location.href).searchParams.get('mid'); }
  catch { return null; }
}

async function renderRoute() {
  const mid = getMid();
  if (!mid) {
    renderWelcome();                    // default
    return;
  }
  try {
    await renderNoteById(mid);          // jouw bestaande loader
    // succes: note staat in beeld
  } catch (e) {
    console.warn('[note] invalid or failed mid:', mid, e);
    renderWelcome();                    // fallback
  }
}

function goToLang(targetLang) {
  const lang = (targetLang || 'nl').toLowerCase();
  const base = lang === 'en' ? '/en/' : '/nl/';
  const u = stripLangParam(location.href);
  u.pathname = base;
  // echte routewissel (belangrijk voor meta/hreflang/OG)
  location.assign(u.toString());
}

// Optioneel: als er al ?lang= staat, haal 'm stil uit de URL
(function cleanLangParamInPlace(){
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) {
    u.searchParams.delete('lang');
    history.replaceState(null, '', u.toString());
  }
})();

/* === MESSAGES CONFIG ================================================== */
function messagesPathFor(lang) {
  const ts = Date.now(); // simpele cache-bust
  return `/data/messages.${lang}.json?ts=${ts}`;
}

/* === THEME DETECT & KLEUREN ================================================== */
const THEME = { NONE:'none', VALENTINE:'valentine', NEWYEAR:'newyear', EASTER:'easter' };

function getActiveTheme(now = new Date()){
  const qp = new URLSearchParams(location.search);
  const t = (qp.get('theme')||'').toLowerCase();
  if (t === 'valentine') return THEME.VALENTINE;
  if (t === 'newyear')   return THEME.NEWYEAR;
  if (t === 'easter')    return THEME.EASTER;
  if (t === 'none')      return THEME.NONE;

  const m = now.getMonth()+1, d = now.getDate();
  if (m===2 && d===14) return THEME.VALENTINE;            // 14 feb
  if ((m===12 && d===31) || (m===1 && d===1)) return THEME.NEWYEAR; // 31 dec / 1 jan
  const easter = computeEaster(now.getFullYear());
  if (sameYMD(now, easter)) return THEME.EASTER;
  return THEME.NONE;
}
function computeEaster(y){
  const f=Math.floor,a=y%19,b=f(y/100),c=y%100,d=f(b/4),e=b%4,g=f((8*b+13)/25),
        h=(19*a+b-d-g+15)%30,i=f(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=f((a+11*h+22*l)/451),
        month=f((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function sameYMD(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function themeColors(theme){
  switch(theme){
    case THEME.VALENTINE: return ['#F06292','#EC407A','#FF8A80','#F48FB1','#FFCDD2'];
    case THEME.NEWYEAR:   return ['#FFD700','#FFA000','#FFC400','#FFEA00','#FDD835'];
    case THEME.EASTER:    return ['#FFECB3','#C5E1A5','#B2DFDB','#F8BBD0','#D1C4E9'];
    default:              return ['#FFD166','#06D6A0','#118AB2','#EF476F','#F78C6B'];
  }
}

/* === SHORTENER CONFIG ================================================== */
window.AWN_FLAGS = { shortenerBase: 'https://s.awarmnote.com' };
const __G = (typeof window !== 'undefined') ? window : globalThis;
if (!__G.STATE) __G.STATE = {};  // maak een lege STATE als die er nog niet is

const USE_SHORTENER = true; // zet op false om snel te vergelijken / debuggen

// DEV: lokaal → shortener op :9090  |  PROD: via reverse proxy of vast domein
const SHORTENER_BASE =
  window.AWN_FLAGS?.shortenerBase
    || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
          ? 'https://s.awarmnote.com'   // dev → gebruik subdomein
          : location.origin);
          
// Cache per (volledige lange) URL → korte URL
__G.STATE.shortUrlCache ??= new Map();

async function mintShort(longUrl, { fmt = 'b64', timeoutMs = 1200 } = {}) {
  if (!USE_SHORTENER) return longUrl;
  if (!longUrl) return longUrl;

  // cache hit?
  if (__G.STATE.shortUrlCache.has(longUrl)) return __G.STATE.shortUrlCache.get(longUrl);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  try {
    const q = new URLSearchParams({ url: longUrl, fmt }).toString();
    const res = await fetch(`${SHORTENER_BASE}/api/mint?${q}`, {
      signal: ctrl.signal,
      mode: 'cors'
    });
    if (!res.ok) throw new Error(`mint ${res.status}`);
    const data = await res.json();
    const out = data?.shortUrl || longUrl;
    __G.STATE.shortUrlCache.set(longUrl, out);    return out;
  } catch (e) {
    console.warn('[shortener] fallback → long url:', e?.message || e);
    return longUrl;
  } finally {
    clearTimeout(t);
  }
}

/** Bouw lange URL + UTM voor een kanaal en geef korte URL terug (met cache) */
async function getShareUrlForChannel(channel) {
  const map = {
    copy:      { source: 'copy',      medium: 'share'   },
    whatsapp:  { source: 'whatsapp',  medium: 'share'   },
    email:     { source: 'email',     medium: 'share'   },
    native:    { source: 'native',    medium: 'share'   },
    messenger: { source: 'messenger', medium: 'share'   },
    qr:        { source: 'qr',        medium: 'offline' }
  };
  const utm = map[channel] || { source: channel || 'other', medium: 'share' };

  // 1) basis (to/from/lang/mid)
  let u = buildSharedURL();
  // 2) UTM + content
  u = applyUTM(u, {
    ...utm,
    campaign: currentCampaignTag(),
    content:  shareContentTag()
  });
  // 3) extra marker per kanaal (optioneel)
  if (channel === 'qr') u.searchParams.set('src', 'qr');

  const longUrl = u.toString();
  return mintShort(longUrl);
}

function applyTheme(pref /* 'auto' | 'dark' | 'light' */){
  const root = document.documentElement;
  const mqDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = (pref === 'dark') || (pref === 'auto' && mqDark);
  root.classList.toggle('theme-dark', !!dark);
}

function getSavedThemePref(){
  try { return localStorage.getItem('awn_theme') || 'auto'; } catch { return 'auto'; }
}

function setThemePref(next){           // aanroepen als je later een toggle maakt
  try { localStorage.setItem('awn_theme', next); } catch {}
  applyTheme(next);
}

/* Volg systeemwijziging in 'auto' */
(function watchSystemTheme(){
  try {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    if (m && typeof m.addEventListener === 'function') {
      m.addEventListener('change', () => {
        if (getSavedThemePref() === 'auto') applyTheme('auto');
      });
    }
  } catch {}
})();

/* [B] === DOM CACHE & HELPERS ================================================== */

const $ = (id) => document.getElementById(id);
// Let op: init gebeurt ná DOMContentLoaded, dus we recachen elementen dan:
let els = {};
function recacheEls(){
  els = {
    note: $("note"),
    msg: $("message"),
    icon: $("iconline"),
    toLine: $("toline"),
    fromLine: $("fromline"),
    chipRow: $("chip-row"),
    btnNew: $("btn-new"),
    btnShare: $("btn-share"),
    btnAbout: $("btn-about"),
    coach: $("coach-tip"),
    toast: $("toast"),
    sheet: $("sheet-backdrop"),
    about: $("about-backdrop"),
    aboutClose: $("about-close"),
    toInput: $("to-inline"),
    fromInput: $("from-inline"),
    fromSymbol: $("from-symbol"),
    sheetClose: $("sheet-backdrop")?.querySelector(".sheet-close"),
    coachClose: $("coach-tip")?.querySelector(".coach-close"),
	coachMsg: document.querySelector("#coach-tip .coach-text"),    
	coachAvatar: $("coach-avatar"),  
    pairToVal: $("pair-to-val"),
    pairFromVal: $("pair-from-val"),
    shareCopy: $("share-copy"),
    shareWA: $("share-whatsapp"),
    shareMail: $("share-email"),
    shareDL: $("share-download"),
    shareConfirm: $("share-confirm"),
  };
}

/* === GLOBAL HELPERS ================================================== */
window.ensureNoteFits = function ensureNoteFits(){
  if (!window.els || !els.note) return;
  const reserve = 180; // px voor inputs/coach
  const max = Math.max(240, window.innerHeight - reserve);
  if (els.note.scrollHeight > max) els.note.classList.add('note--compact');
  else els.note.classList.remove('note--compact');
};

window.getChipLabel = function getChipLabel(chip){
  const norm = v => (typeof v === 'string' ? v.trim() : '');
  return (
    norm(chip?.dataset?.label) ||
    norm(chip?.getAttribute?.('aria-label')) ||
    norm(chip?.getAttribute?.('title')) ||
    norm(chip?.querySelector?.('.chip-label')?.innerText) ||
    norm(chip?.innerText) ||
    ''
  );
};

/* === [C] APP-STATE ================================================== */
const STATE = {
  lang: "nl",
  allMessages: [],       // volledige lijst (uit JSON of fallback)
  sentiments: [],        // unieke sentiments (max 10)
  activeSentiment: null, // huidig filter; null = alles
  filterSpecialDay: null,
  deck: [],              // indices in random volgorde
  recent: [],            // laatste N indices om herhaling te voorkomen
  currentIdx: null       // huidig absolute index in allMessages
};

function applyInboundToken(){
  const url = new URL(location.href);
  const tok = url.searchParams.get('t');
  if (!tok) return;

  const payload = decodeShareToken(tok);
  if (!payload) return;

  // Vul de URL-params (virtueel) zodat rest van je code blijft werken
  // (We wijzigen de echte URL niet, alleen STATE/reads)
  if (payload.to)   url.searchParams.set('to', payload.to);
  if (payload.from) url.searchParams.set('from', payload.from);
  if (payload.lang) url.searchParams.set('lang', payload.lang);
  if (payload.mid)  url.searchParams.set('mid', payload.mid);
  if (payload.welcome) url.searchParams.set('welcome','1');

  // Expose aan rest van de app
  window.__AWN_INBOUND_URL__ = url;
}

function refreshAISheetStrings(){
  const R = document.getElementById('ai-sheet') || document.querySelector('[data-sheet="ai"]');
  if (!R) return;
  const tx = (k,en,nl)=> t(k) || (STATE?.lang==='en'? en : nl);

  // Titel
  const title = R.querySelector('[data-i18n="ai.sheet.title"], .sheet-title');
  if (title) title.textContent = tx('ai.sheet.title','AI Message','AI-boodschap');

  // To/From labels + placeholders
  const toLbl = R.querySelector('.ai-to-label,[data-i18n="ai.sheet.toLabel"]');
  const fmLbl = R.querySelector('.ai-from-label,[data-i18n="ai.sheet.fromLabel"]');
  const toInp = R.querySelector('#ai-to, input.ai-to');
  const fmInp = R.querySelector('#ai-from, input.ai-from');
  if (toLbl) toLbl.textContent = tx('ai.sheet.toLabel','To','Voor');
  if (fmLbl) fmLbl.textContent = tx('ai.sheet.fromLabel','From','Van');
  if (toInp) toInp.placeholder = tx('ai.sheet.promptTo','For whom?','Voor wie?') || tx('placeholders.to','For whom?','Voor wie?');
  if (fmInp) fmInp.placeholder = tx('placeholders.from','From you (optional)','Van jou (optioneel)');

  // Prompt label + placeholder
  const pLbl = R.querySelector('.ai-prompt-label,[data-i18n="ai.sheet.promptLabel"]');
  const pInp = R.querySelector('#ai-prompt,textarea.ai-prompt');
  if (pLbl) pLbl.textContent = tx('ai.sheet.promptLabel','What do you want to say?','Wat wil je ongeveer zeggen?');
  if (pInp) pInp.placeholder = tx('ai.sheet.promptPlaceholder','Write a few keywords…','Schrijf een paar steekwoorden…');

  // Tone + options
  const tLbl = R.querySelector('.ai-tone-label,[data-i18n="ai.sheet.toneLabel"]');
  const tSel = R.querySelector('#ai-tone,select.ai-tone');
  if (tLbl) tLbl.textContent = tx('ai.sheet.toneLabel','Tone','Stijl');
  if (tSel){
    const map = {
      warm:        tx('ai.sheet.toneOptions.warm','Warm','Warm'),
      funny:       tx('ai.sheet.toneOptions.funny','Funny','Grappig'),
      encouraging: tx('ai.sheet.toneOptions.encouraging','Encouraging','Bemoedigend'),
      neutral:     tx('ai.sheet.toneOptions.neutral','Neutral','Neutraal')
    };
    [...tSel.options].forEach(o=>{ if(map[o.value]) o.textContent = map[o.value]; });
  }

  // Length + options
  const lLbl = R.querySelector('.ai-length-label,[data-i18n="ai.sheet.lengthLabel"]');
  const lSel = R.querySelector('#ai-length,select.ai-length');
  if (lLbl) lLbl.textContent = tx('ai.sheet.lengthLabel','Length','Lengte');
  if (lSel){
    const map = {
      short:  tx('ai.sheet.lengthOptions.short','Short','Kort'),
      medium: tx('ai.sheet.lengthOptions.medium','Normal','Normaal'),
      long:   tx('ai.sheet.lengthOptions.long','Long','Lang')
    };
    [...lSel.options].forEach(o=>{ if(map[o.value]) o.textContent = map[o.value]; });
  }

  // Buttons + status
  const bGen = R.querySelector('[data-action="ai-generate"],#ai-generate');
  const bApp = R.querySelector('[data-action="ai-apply"],#ai-apply');
  const bCan = R.querySelector('[data-action="ai-cancel"],#ai-cancel');
  const stat = R.querySelector('.ai-status');
  if (bGen) bGen.textContent = tx('ai.sheet.generate','Generate','Maak voorstel');
  if (bApp) bApp.textContent = tx('ai.sheet.apply','Apply','Plaatsen');
  if (bCan) bCan.textContent = tx('ai.sheet.cancel','Cancel','Annuleren');
  if (stat) stat.textContent = tx('ai.status.ready','Ready','Klaar');
}

/* [D] === INIT (lifecycle) ================================================== */

function init() {
  applyInboundToken();
  setThemePref('auto')
  // 1) Taal & basis
  STATE.lang = resolveLang();
  document.documentElement.setAttribute('lang', STATE.lang);
  recacheEls();
  wireGlobalUI();
  bindAISheetGlue();  
  if (typeof wireLanguagePicker === 'function') wireLanguagePicker();
  wireLangDropdown?.();
  renderLangDropdownUI?.(); 

  bindArrowPreviewBridge();
  
  // 2) Strings → Messages
  ensureStringsLoaded()
    .then(() => {
      if (typeof refreshUIStrings === 'function') 
      recacheEls?.();
      refreshUIStrings();
      refreshAISheetStrings();
      return loadMessages();
  	})
	.then(() => {
  // 3) Inputs netjes maken
    autoCapitalizeInput(els.toInput);
    autoCapitalizeInput(els.fromInput);

  // 4) URL-params
    const qp = new URLSearchParams(location.search);
    const toVal     = qp.get('to');
    const fromVal   = qp.get('from');
    const sharedMid = qp.get('mid');
    const sharedId  = qp.get('id');
    const lang  = currentLang();
	const hasMid = new URL(location.href).searchParams.has('mid');
      
    // Bewaar ontvangen namen, maar vul géén inputs in bij mid
	STATE.shared = STATE.shared || { to: '', from: '' };
	STATE.shared.to   = toVal;
	STATE.shared.from = fromVal;  
	const isReceivedByMid = !!sharedMid;
	STATE.useSharedNames = isReceivedByMid; 

	if (isReceivedByMid) {
  	if (els.toInput) {
    	els.toInput.value = '';
    	els.toInput.placeholder = (typeof i18n === 'function' ? i18n('to_placeholder')
      	  : 'Voor wie is je bericht?');
  	}
  	if (els.fromInput) {
    	els.fromInput.value = '';
  	}
	} else {
  	if (toVal && els.toInput)     els.toInput.value   = toVal;
  	if (fromVal && els.fromInput) els.fromInput.value = fromVal;
	}

  // 5) Welkom eerst laten beslissen
    const didShowWelcome = showWelcomeNote(els);

  // 6) Daarna pas chips bouwen (die intern vertraagd een render triggert)
    buildSentimentChips();

  // 7) Als we welcome toonden: 120ms later nogmaals forceren (chips render overruled)
    if (didShowWelcome) {
    	setTimeout(() => {
        	showWelcomeNote(els);   // zet welcome-tekst + styling opnieuw
        }, 90);                  	// > 90ms (interne renderMessage-delay)
        return;                   	// géén directe message-render in scenario 1
    }

  // 8) Geen welcome → direct renderen via mid/id of anders random
    let msgIdx = null;
    if (sharedMid) {
    	msgIdx = STATE.allMessages.findIndex(m => m.id === sharedMid);
    } else if (sharedId) {
        const n = Number(sharedId);
        if (!Number.isNaN(n)) msgIdx = n;
    }	 
    
    // ⬇︎ mid bestaat niet in deze taal → FORCE welcome en stop
	if (sharedMid && (msgIdx == null || msgIdx < 0 || msgIdx >= STATE.allMessages.length)) {
  		showWelcomeNote(els, { force: true });   // <— belangrijk
  		updateCoach?.('init', {}, { hold: 0, force: true });
  		return;
	}
	 // ... binnen init() na het bepalen van msgIdx
	 if (msgIdx != null && msgIdx >= 0 && msgIdx < STATE.allMessages.length) {
  	 renderMessage({ requestedIdx: msgIdx, wiggle: false });
  	 // ⬇︎ Toon de splash uitsluitend in de ontvangen-flow
  	 if (sharedMid) {
  	 // open de splash heel kort ná de render, zodat de DOM/body klaar is
	  	setTimeout(() => {
    	openNoteSplashSimple({ holdMs: 4800, force: false });
  		}, 140);
	 } else {
  	 	renderMessage({ newRandom: true, wiggle: false });
	 }
	}		 
  // 9) Coach-status bijwerken (zonder timeout/hold)
    if (isReceivedByMid) {
    if (!STATE._coachReceivedOnce) {
      updateCoach('received', {}, { hold: 0, force: true });
      STATE._coachReceivedOnce = true;
    }
  	} else {
    // Altijd starten met 'init' als je ZONDER mid binnenkomt
    updateCoach('init', {}, { hold: 0, force: true });
  	}	
    })
    .catch((e) => {
      console.error("FOUT in init():", e);
    });

  // 10) Compose auto-localizer (zoals je had)
  	if (typeof installComposeAutoLocalizer === 'function') {
    	installComposeAutoLocalizer();
  	}
}

// Start pas wanneer DOM klaar is
	window.addEventListener("DOMContentLoaded", init);
	

/* === PWA INSTALL BUTTON ================================================== */
let __deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  __deferredPrompt = e;

  const nav = document.querySelector('.actions'); // topbar nav
  if (!nav) return;

  // voorkom dubbele knop
  if (document.getElementById('btn-install')) return;

  const btn = document.createElement('button');
  btn.id = 'btn-install';
  btn.className = 'btn';
  btn.type = 'button';
  btn.textContent = 'Installeren';
  nav.appendChild(btn);

  btn.addEventListener('click', async ()=>{
    try {
      await __deferredPrompt.prompt();
      await __deferredPrompt.userChoice; 
    } catch {}
    __deferredPrompt = null;
    btn.remove();
  });
});

const isMobile = window.matchMedia('(max-width: 768px)').matches;
if (isMobile) {
  const btnNew = document.getElementById('btn-new');
  if (btnNew) btnNew.style.display = 'none';
}

// Eénmalige sentiment-hint nudge (alleen bij eerste load)
if (!localStorage.getItem("awarm_sentiment_hint")) {
  const strip = document.querySelector(".sentiment-strip");
  if (strip) {
    strip.classList.add("hint-active");
    setTimeout(()=> strip.classList.remove("hint-active"), 3000);
  }
  try { localStorage.setItem("awarm_sentiment_hint","1"); } catch {}
}

STATE.lang = resolveLang();
document.documentElement.setAttribute("lang", STATE.lang);

/* === [E] DATA LOAD ================================== */

async function loadMessages(){
  // 0) Offline/local file modus → jouw bestaande fallback
  if (typeof IS_FILE !== 'undefined' && IS_FILE) {
    STATE.allMessages = fallbackMessages();
    STATE.sentiments  = deriveSentiments(STATE.allMessages);
    return;
  }

  // Kleine helpers (alleen gebruiken als [A] ze niet definieert)
  const _DEFAULT_LANG = (typeof DEFAULT_LANG !== 'undefined') ? DEFAULT_LANG : 'nl';
  const _resolveLang  = (typeof resolveLang === 'function')
    ? resolveLang
    : () => {
        try {
          const p = new URL(location).searchParams.get('lang');
          return (p && p.trim().toLowerCase()) || _DEFAULT_LANG;
        } catch { return _DEFAULT_LANG; }
      };
  const _messagesPathFor = (typeof messagesPathFor === 'function')
    ? messagesPathFor
    : (lang) => `/data/messages.${lang}.json?ts=${Date.now()}`;

  /* === BIRTHDAY: inline helper (geen globals) ============================ */
  async function _tryLoadBirthday(lang) {
    const url = `/data/messages.birthday.${lang}.json?ts=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      return Array.isArray(data?.messages) ? data.messages : [];
    } catch {
      return [];
    }
  }
  try{
    /* 1) Kies gewenste taal en probeer die file te laden */
    const wantLang = (STATE && STATE.lang) ? STATE.lang : _resolveLang();
    let data = null;

    try {
      const resA = await fetch(_messagesPathFor(wantLang), { cache:"no-store" });
      if (!resA.ok) throw new Error("HTTP " + resA.status);
      data = await resA.json();
      STATE.lang = wantLang;
      console.debug('[i18n] loaded:', _messagesPathFor(wantLang));
    } catch (e1) {
      /* 2) Fallback naar NL (alleen als requested ≠ nl) */
      if (wantLang !== 'nl') {
        try {
          const resB = await fetch(_messagesPathFor('nl'), { cache:"no-store" });
          if (!resB.ok) throw new Error("HTTP " + resB.status);
          data = await resB.json();
          STATE.lang = 'nl';
          console.warn('[i18n] fallback → nl:', e1?.message || e1);
        } catch (e2) {
          // Geen netwerkdata → laat globale catch de ingebouwde fallback doen
          throw e2;
        }
      } else {
        // Bij nl direct door naar globale catch → fallbackMessages()
        throw e1;
      }
    }

    /* === ONGEWIJZIGD: jouw normalisatie van hoofdset ==================== */
    const list = Array.isArray(data?.messages) ? data.messages : [];
    STATE.allMessages = list.map(m => ({
      id: m.id || null,
      icon: m.icon || "",
      text: String(m.text || ""),
      sentiments: Array.isArray(m.sentiments) ? m.sentiments : [],
      special_day: m.special_day || null,
      weight: Number.isFinite(m.weight) ? m.weight : 1
    }));

/* === BIRTHDAY: meeliften en mergen vóór sentiments-afleiding ======== */
    try {
      // eerst gewenste taal proberen…
      let bdayRaw = await _tryLoadBirthday(STATE.lang);
      // …zo niet, val terug op NL (zelfde strategie als hoofdset)
      if (!bdayRaw.length && STATE.lang !== 'nl') {
        const nlSet = await _tryLoadBirthday('nl');
        if (nlSet.length) bdayRaw = nlSet;
      }
      if (bdayRaw.length) {
        const normalized = bdayRaw.map(m => ({
          id: m.id || null,
          icon: m.icon || "",
          text: String(m.text || ""),
          sentiments: Array.isArray(m.sentiments) && m.sentiments.length ? m.sentiments : ['birthday'],
          special_day: m.special_day || 'birthday',
          weight: Number.isFinite(m.weight) ? m.weight : 1
        }));
        STATE.allMessages = STATE.allMessages.concat(normalized);
      }
    } catch {}

/* ================================================================ */

    // Sentiments afleiden (op de samengevoegde set)
    const s = Array.isArray(data?.sentiments)
      ? data.sentiments
      : deriveSentiments(STATE.allMessages);

    STATE.sentiments = (s || []).slice(0, 10);

    // Safety-net: leeg? → ingebouwde fallback
    if (!STATE.allMessages.length) {
      STATE.allMessages = fallbackMessages();
      STATE.sentiments  = deriveSentiments(STATE.allMessages);
    }
  } catch(e){
    // Globale fallback: jouw bestaande lijst
    STATE.allMessages = fallbackMessages();
    STATE.sentiments  = deriveSentiments(STATE.allMessages);
  }
}
/* === ingebouwde fallback =========================== */

function fallbackMessages(){
  return [
    { id: "fallback_001", icon:"✨", text:"Je bent genoeg, precies zoals je nu bent.",            sentiments:["bemoedigend","kalmte"],  weight:1 },
    { id: "fallback_002", icon:"🌿", text:"Een kleine stap vooruit is óók vooruitgang.",          sentiments:["doorzetten","bemoedigend"], weight:1 },
    { id: "fallback_003", icon:"💛", text:"Iets kleins kan vandaag veel betekenen.",              sentiments:["liefde","kalmte"],        weight:1 },
    { id: "fallback_004", icon:"🌊", text:"Adem in. Adem uit. Je bent hier.",                     sentiments:["kalmte"],                 weight:1 },
    { id: "fallback_005", icon:"🌻", text:"Je doet ertoe, meer dan je denkt.",                    sentiments:["bemoedigend","trots"],    weight:1 },
    { id: "fallback_006", icon:"🎈", text:"Licht en zacht: één vriendelijk gebaar.",              sentiments:["vriendschap","liefde"],   weight:1 },
    { id: "fallback_007", icon:"🧩", text:"Niet alles hoeft nu te passen.",                       sentiments:["troost","kalmte"],        weight:1 },
    { id: "fallback_008", icon:"📯", text:"Trots op wat je (al) doet.",                           sentiments:["trots","bemoedigend"],    weight:1 },
    { id: "fallback_009", icon:"🎉", text:"Je mag dit vieren — hoe klein ook.",                   sentiments:["succes","liefde"],        weight:1 },
    { id: "fallback_010", icon:"☕", text:"Neem je tijd. Je mag traag beginnen.",                 sentiments:["kalmte"],                 weight:1 }
  ];
}

/* [F] === SENTIMENT-CHIPS (max 10) ================================================== */

function buildSentimentChips(){
  const row = els.chipRow;
  if (!row) return;
  row.innerHTML = "";
  const isEn = (STATE?.lang === 'en');
  const hasBirthday = Array.isArray(STATE?.allMessages) &&
  STATE.allMessages.some(m => Array.isArray(m.sentiments) && m.sentiments.includes('birthday'));
if (hasBirthday) {
  row.appendChild(
    makeChip('birthday', isEn ? 'Birthday 🎂' : 'Verjaardag 🎂')
  );
}
  // --- Leo: korte coach bij eerste chip-klik (3x per sessie) ---------------
  try {
    if (sessionStorage.getItem('awn_chip_nudge_shown') !== '3') {
      const onChipNudge = (e) => {
        const chip = e.target && e.target.closest && e.target.closest('.chip');
        if (!chip) return; // klik was geen chip
        const txt = isEn
          ? "Nice choice 💛 See what message fits your mood!"
          : "Mooie keuze 💛 Kijk welk bericht erbij past!";
        window.LeoFab?.say?.(txt);
        // markeer & ontkoppel, we willen 'm maar 1x per sessie tonen
        sessionStorage.setItem('awn_chip_nudge_shown', '1');
        try { row.removeEventListener('click', onChipNudge, true); } catch {}
      };
      // capture=true zodat we niet botsen met bestaande onclick op de chip
      row.addEventListener('click', onChipNudge, true);
    }
  } catch {}

  const activeTheme = getActiveTheme();
  if (activeTheme === THEME.VALENTINE) {
    row.appendChild(makeThemeChip('valentine', isEn ? 'Valentine ❤️' : 'Valentijn ❤️'));
  } else if (activeTheme === THEME.NEWYEAR) {
    row.appendChild(makeThemeChip('newyear', isEn ? 'New Year ✨'  : 'Nieuwjaar ✨'));
  } else if (activeTheme === THEME.EASTER) {
    row.appendChild(makeThemeChip('easter', isEn ? 'Easter 🐣'    : 'Pasen 🐣'));
  }

  // “Alles / All” chip
  row.appendChild(makeChip(null, isEn ? "All" : "Alles"));

  // Data-gedreven chips (max 10)
  (STATE.sentiments || []).slice(0,10).forEach(tag => {
    const label = capitalize(tag);
    row.appendChild(makeChip(tag, label));
  });

  // Standaard: alles actief
  setActiveFilter({ sentiment: null, special: null });

  // Affordance
  setupChipsAffordance();
  showChipsHintOnce();
}

function makeThemeChip(specialKey, label){
  const b = document.createElement("button");
  b.className = "chip chip--theme";
  b.type = "button";
  b.setAttribute("role","tab");
  b.dataset.type = "special";
  b.dataset.value = specialKey;
  b.dataset.label = label || '';
  b.setAttribute('aria-label', label || '');
  b.title = label || '';
  b.textContent = label;
  b.onclick = () => {
  setActiveFilter({ sentiment: null, special: specialKey });
  scrollChipIntoCenter(b);
  onSentimentChosen(STATE.lang, null); // nav voor huidige filter
};
  return b;
}

function setActiveFilter({ sentiment=null, special=null }){
  STATE.activeSentiment = sentiment;
  STATE.filterSpecialDay = special;

  const row = els.chipRow; if (row){
    [...row.querySelectorAll(".chip")].forEach(c=>{
      const isActive = (c.dataset.type==="special" && c.dataset.value===special) ||
                       ((c.dataset.type||"sentiment")==="sentiment" && (c.dataset.value||"") === (sentiment||""));
      c.classList.toggle("active", !!isActive);
    });
  }
  rebuildDeck(true);
}

function makeChip(value, label){
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.setAttribute("role","tab");
  b.dataset.value = value || "";
  b.dataset.label = label || '';
  b.setAttribute('aria-label', label || '');
  b.title = label || '';
  b.textContent = label;
  b.onclick = () => {
  STATE.activeSentiment = value;
  activateChip(value);
  onSentimentChosen(STATE.lang, value); // bouw deck + nav + toon eerste via NAV
  scrollChipIntoCenter(b);
};
  return b;
}

function activateChip(value){
  const row = els.chipRow; if (!row) return;
  [...row.querySelectorAll(".chip")].forEach(c=>{
    const v = c.dataset.value || null;
    c.classList.toggle("active", v === (value||""));
  });
}

/* === Affordance helpers (chevrons, hint, autocenter) ======= */
function setupChipsAffordance(){
  const wrap = document.querySelector(".chips-wrap");
  const row  = els.chipRow;
  if (!wrap || !row) return;

  let left = wrap.querySelector("#chips-left");
  let right = wrap.querySelector("#chips-right");
  if (!left) {
    left = document.createElement("button");
    left.id = "chips-left";
    left.className = "chip-chevron chip-chevron--left";
    left.setAttribute("aria-label","Meer opties naar links");
    left.innerHTML = "‹";
    wrap.appendChild(left);
  }
  if (!right) {
    right = document.createElement("button");
    right.id = "chips-right";
    right.className = "chip-chevron chip-chevron--right";
    right.setAttribute("aria-label","Meer opties naar rechts");
    right.innerHTML = "›";
    wrap.appendChild(right);
  }

  left.onclick = ()=> row.scrollBy({ left: -Math.max(120, row.clientWidth*0.6), behavior: "smooth" });
  right.onclick= ()=> row.scrollBy({ left:  Math.max(120, row.clientWidth*0.6), behavior: "smooth" });

  const updateChevrons = ()=>{
    const hasOverflow = row.scrollWidth > row.clientWidth + 4;
    wrap.classList.toggle("has-chevrons", hasOverflow);

	if (!hasOverflow){
  		left.style.opacity = "0";  left.style.pointerEvents = "none";
  		right.style.opacity = "0"; right.style.pointerEvents = "none";
  	return;
	}
		const showL = row.scrollLeft > 6;
		const showR = (row.scrollLeft + row.clientWidth) < (row.scrollWidth - 6);

		left.style.opacity = showL ? "1" : "0";
		left.style.pointerEvents = showL ? "auto" : "none";

		right.style.opacity = showR ? "1" : "0";
		right.style.pointerEvents = showR ? "auto" : "none";
  };

  row.addEventListener("scroll", throttle(updateChevrons, 80));
  window.addEventListener("resize", throttle(updateChevrons, 120));
  setTimeout(updateChevrons, 0);
}

function scrollChipIntoCenter(chipEl){
  const row = els.chipRow; if (!row || !chipEl) return;
  const rowRect = row.getBoundingClientRect();
  const chipRect = chipEl.getBoundingClientRect();
  const delta = (chipRect.left + chipRect.width/2) - (rowRect.left + rowRect.width/2);
  row.scrollBy({ left: delta, behavior: "smooth" });
}

function showChipsHintOnce(){
  try{
    if (sessionStorage.getItem("chipsHintShown")==="1") return;
    const row = els.chipRow; if (!row) return;
    const orig = row.scrollLeft;
    row.scrollTo({ left: Math.min(orig + 36, row.scrollWidth), behavior: "smooth" });
    setTimeout(()=> row.scrollTo({ left: orig, behavior: "smooth" }), 380);
    if (els.coach){
      const txt = els.coach.querySelector(".coach-text");
      if (txt && !getTo()) txt.textContent = "Swipe door de gevoelens en kies wat past.";
      els.coach.classList.remove("hidden");
    }
    sessionStorage.setItem("chipsHintShown","1");
  }catch(_e){}
}

function deriveSentiments(items){
  const set = new Set();
  (items||[]).forEach(m => (m.sentiments||[]).forEach(s => set.add(s)));
  return Array.from(set).slice(0,10);
}


/* [G] === DECK & RANDOMISATIE ================================================== */
function rebuildDeck(resetRecent=false){
  const activeTheme = getActiveTheme();

  const pool = (STATE.allMessages||[]).map((m,idx)=>({m,idx})).filter(({m})=>{
    if (STATE.filterSpecialDay && m.special_day !== STATE.filterSpecialDay) return false;
    if (STATE.activeSentiment && !(Array.isArray(m.sentiments) && m.sentiments.includes(STATE.activeSentiment))) return false;
    return true;
  });

  const source = pool.length ? pool : (STATE.allMessages||[]).map((m,idx)=>({m,idx}));

  // Gewichten + theme-boost (x3)
  const weighted = source.flatMap(({m,idx})=>{
    const base = Math.max(1, Number(m.weight)||1);
    const themed =
      (activeTheme===THEME.VALENTINE && m.special_day==='valentine') ||
      (activeTheme===THEME.NEWYEAR   && m.special_day==='newyear')   ||
      (activeTheme===THEME.EASTER    && m.special_day==='easter');
    const w = base * (themed ? 3 : 1);
    return Array.from({length:w}, ()=>idx);
  });

  STATE.deck = shuffle(weighted);
  if (resetRecent) STATE.recent.length = 0;
}

function nextIndex(){
  if (!STATE.deck.length) rebuildDeck();
  let tries = STATE.deck.length;
  while (tries--){
    const candidate = STATE.deck.pop();
    if (!STATE.recent.includes(candidate)) return candidate;
  }
  STATE.recent.length = 0;
  return STATE.deck.pop();
}
function bumpRecent(idx){
  STATE.recent.push(idx);
  if (STATE.recent.length > RECENT_LIMIT) STATE.recent.shift();
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* [H] === RENDERING (note & to/from) ================================================== */
const PAPER_PALETTES = {
  default: ["#FFE66D","#FFD3B6","#C5FAD5","#CDE7FF","#FFECB3","#E1F5FE"],
  valentine: ["#FFF0F4","#FFE0E8","#FFD6E2","#FFEAF0","#FFF5F8"]
};

function setPaperLook(){
  const theme = getActiveTheme();
  const palette = (theme===THEME.VALENTINE) ? PAPER_PALETTES.valentine : PAPER_PALETTES.default;
  els.note.style.background = palette[Math.floor(Math.random()*palette.length)];
  els.note.style.transform  = `rotate(${(Math.random()*4-2).toFixed(2)}deg)`;
}

function renderMessage({ newRandom = false, requestedIdx = null, wiggle = false, msg = null } = {}) {
  // 0) Guard tegen welcome-lock (jouw bestaande logic)
  const now = (window.performance?.now?.() || Date.now());
  if (window._awnWelcomeGuardUntil && now < window._awnWelcomeGuardUntil) return;

  // 1) Basislijst en leegte-check
  const list = Array.isArray(STATE.allMessages) ? STATE.allMessages : [];
  if (list.length === 0) {
    console.warn('renderMessage: geen messages beschikbaar.');
    return;
  }
  // 2) Doel-index bepalen (nooit "idx" redeclareren)
  let targetIdx = STATE.currentIdx;

  // 2a) requested index heeft voorrang
  if (typeof requestedIdx === 'number') {
    targetIdx = requestedIdx;
  }

  // 2b) als msg-object meegegeven is, bepaal index (eerst via id, dan via referentie)
  if ((targetIdx == null || targetIdx < 0 || targetIdx >= list.length) && msg) {
    let byId = -1;
    if (msg.id != null) {
      byId = list.findIndex(m => m && m.id === msg.id);
    }
    if (byId >= 0) {
      targetIdx = byId;
    } else {
      // laatste redmiddel: referentie-vergelijking (werkt als deck uit dezelfde lijst komt)
      const byRef = list.indexOf(msg);
      if (byRef >= 0) targetIdx = byRef;
    }
  }

  // 2c) newRandom of nog geen geldige index → kies uit (gefilterde) pool
  if (newRandom || targetIdx == null || targetIdx < 0 || targetIdx >= list.length) {
    // begin met hele lijst
    let pool = list;

    // actieve sentiment-filter respecteren (alleen toepassen als er resultaten zijn)
    if (STATE.activeSentiment) {
      const s = STATE.activeSentiment;
      const filtered = pool.filter(m => Array.isArray(m.sentiments) && m.sentiments.includes(s));
      if (filtered.length > 0) pool = filtered;
    }

    // kies gewogen index binnen pool
    let localIdx = null;
    if (typeof pickWeightedIndex === 'function') {
      localIdx = pickWeightedIndex(pool);
    }
    // fallback: normale random
    if (localIdx == null) {
      localIdx = Math.floor(Math.random() * Math.max(pool.length, 1));
    }

    // map terug naar globale index — liever via id als beschikbaar
    const chosen = pool[localIdx];
    if (chosen && chosen.id != null) {
      const globalById = list.findIndex(m => m && m.id === chosen.id);
      targetIdx = (globalById >= 0) ? globalById : list.indexOf(chosen);
    } else {
      targetIdx = list.indexOf(chosen);
    }

    if (targetIdx < 0) targetIdx = 0; // defensieve fallback
  }

  // 3) Clamp naar geldige range
  if (!Number.isInteger(targetIdx)) targetIdx = 0;
  if (targetIdx < 0) targetIdx = 0;
  if (targetIdx >= list.length) targetIdx = list.length - 1;

  // 4) Pak de message; zacht falen als er echt niets is
  const cur = list[targetIdx];
  if (!cur) {
    console.warn('renderMessage: geen message voor index', targetIdx, '(len=', list.length, ')');
    return;
  }

  // 5) State bijwerken en recent markeren
  STATE.currentIdx = targetIdx;

  // ⬇️ NIEUW: onthoud de laatst getoonde note-id voor delen/analytics (UTM)
  STATE.lastRenderedId = (cur && cur.id != null) ? cur.id : null;

  if (typeof bumpRecent === 'function') {
    try { bumpRecent(targetIdx); } catch(e){ /* stil falen */ }
  }

  // 6) UI vullen + animatie
  const icon = cur.icon || "";
  const text = typeof cur.text === 'string' ? cur.text : '';
  const sentiments = cur.sentiments || [];

  if (els.msg && els.icon){
    els.msg.style.opacity = 0;
    els.icon.style.opacity = 0;

    // raw bewaren voor correcte her-personalisatie
    els.msg.setAttribute('data-raw', text);

    setTimeout(()=>{
      const base = els.msg.getAttribute('data-raw') || text || '';
      els.msg.textContent  = (typeof personalize === 'function') ? personalize(base) : base;
      els.icon.textContent = icon;
      els.msg.style.opacity = 1;
      els.icon.style.opacity = 1;
    }, 90);
  }

  if (typeof window.ensureNoteFits === 'function') window.ensureNoteFits();
  if (els.note) setPaperLook?.();

  renderToFrom?.();
  renderFromSymbol?.((sentiments && sentiments[0]) || STATE.activeSentiment || null);

  if (wiggle && !prefersReducedMotion?.() && els.note){
    els.note.animate(
      [
        { transform: 'rotate(-2deg)' },
        { transform: 'rotate(2deg)'  },
        { transform: 'rotate(-1.2deg)'}
      ],
      { duration: 350, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }
}

// --- Filtering op basis van jouw STATE (app-specifiek) ---
function buildDeckFromState() {
  const all = Array.isArray(STATE.allMessages) ? STATE.allMessages : [];
  let list = all;

  // Special day filter
  if (STATE.filterSpecialDay) {
    list = list.filter(m => m.special_day === STATE.filterSpecialDay);
  }
  // Sentiment filter (jouw data: array 'sentiments')
  if (STATE.activeSentiment) {
    const s = STATE.activeSentiment;
    const f = list.filter(m => Array.isArray(m.sentiments) && m.sentiments.includes(s));
    if (f.length) list = f;
  }
  return list.slice();
}

// Optioneel: preferred (bv. mid) altijd vooraan
function buildDeckWithPreferred(firstMsg){
  const deck = buildDeckFromState();
  if (!firstMsg) return deck;
  const hasId = firstMsg?.id != null;
  const exists = hasId ? deck.some(m => m?.id === firstMsg.id) : deck.includes(firstMsg);
  return exists
    ? [firstMsg, ...deck.filter(m => hasId ? m.id !== firstMsg.id : m !== firstMsg)]
    : [firstMsg, ...deck];
}

function buildDeckFromState() {
  return AWNDeck.utils.filterList(STATE.allMessages, {
    sentiment: STATE.activeSentiment,
    specialKey: STATE.filterSpecialDay
  });
}

// Context wissel (bij kiezen van sentiment):
function onSentimentChosen(lang, sentiment){
  const deck = AWNDeck.buildDeckFor({ messagesByLang: AWN_MESSAGES, lang, sentiment, limit: 30 });
  NAV = AWNDeck.createNavigator({ lang, sentiment, deck });
  const first = NAV.next(); if (first) renderMessage(first);
}

// 1x na DOM ready: knoppen + swipe binden
const detachNavUI = AWNDeck.UI.attachNav({
  getNav: ()=> NAV,
  render: (msg) => {
    if (!msg) return;
    // Vind index op basis van id (niet op objectreferentie)
    const idx = STATE.allMessages.findIndex(m => m.id === msg.id);
    if (idx >= 0) {
      STATE.currentIdx = idx;
      renderMessage({ msg });
    }
  },
});

// Als user handmatig een message kiest uit een lijst:
function onUserPickedMessage(msg){
  if (!NAV) return;
  const cur = NAV.push(msg, { mark:true, advance:true });
  if (cur) renderMessage(cur);
}

function renderToFrom(){
  const toName   = getTo();
  const fromName = getFrom();

  const t = toLabel(toName);
  const f = fromLabel(fromName);

  if (els.toLine){   els.toLine.textContent   = t; els.toLine.style.display   = t ? "block":"none"; }
  if (els.fromLine){ els.fromLine.textContent = f; els.fromLine.style.display = f ? "block":"none"; }


  // 1) Lees de BRON; alleen doorgaan als die er is
  const raw = els.msg?.getAttribute('data-raw');
  if (raw == null) return;

  // 2) Plan een micro-update NA alle sync DOM-mutaties
  STATE._rePersonalizeTimer = setTimeout(() => {
    // Guard: voer alleen uit als de bron niet tussentijds is gewisseld
    if (els.msg && els.msg.getAttribute('data-raw') === raw) {
      els.msg.textContent = personalize(raw);
    }
    STATE._rePersonalizeTimer = null;
  }, 0);
}
/* Swipe op de note voor volgende boodschap (mobile friendly) */
(function enableNoteSwipe(){
  const el = document.getElementById("note") || document.querySelector(".note");
  if (!el) return;
  let startX=0, startY=0, dx=0, dy=0, active=false;

  el.addEventListener("touchstart", (e)=>{
    if (!e.touches || e.touches.length!==1) return;
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; dx=dy=0; active = true;
  }, {passive:true});

  el.addEventListener("touchmove", (e)=>{
    if (!active || !e.touches || e.touches.length!==1) return;
    const t = e.touches[0];
    dx = t.clientX - startX;
    dy = t.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) + 10) active = false;
  }, {passive:true});

el.addEventListener("touchend", ()=>{
  if (!active) return;
  active = false;
  if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy)) {
    // Zorg dat er een navigator is
	// binnen touchend:
if (!NAV) onSentimentChosen(STATE.lang, STATE.activeSentiment || null);
if (!NAV) return;

const nextMsg = (dx < 0) ? NAV.next() : NAV.prev();
if (nextMsg) {
  const idx = STATE.allMessages.findIndex(m => m && m.id === nextMsg.id);
  if (idx >= 0) {
    renderMessage({ requestedIdx: idx, wiggle: false, msg: nextMsg });
  } else {
    renderMessage({ msg: nextMsg });
  }
}
  }
}, {passive:true});

})();

/**
 * Toon altijd een welkomstboodschap wanneer je NIET via een gedeelde note komt.
 * "Gedeeld" definiëren we voorlopig uitsluitend als: URL heeft ?mid=...
 * - Bij ?mid=... → géén welcome (return false)
 * - Anders       → wel welcome (return true), elke keer (geen sessionStorage/force)
 * Meertalig (NL/EN) op basis van <html lang> of STATE.lang.
 */


function showWelcomeNote(els, opts = {}) {
  const force = !!opts.force;
  const qp = new URLSearchParams(location.search);
  const isReceivedByMid = qp.has('mid');
  if (isReceivedByMid && !force) return false; // alleen blokkeren als we niet forceren

  // Taal bepalen
  const docLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
  const stateLang = (typeof STATE !== 'undefined' && STATE.lang) ? STATE.lang.toLowerCase() : '';
  const lang = (docLang || stateLang || 'nl').startsWith('en') ? 'en' : 'nl';

  // Copy per taal
  const copy = (lang === 'en')
    ? "Welcome! Pick a feeling above, browse a few messages and send a warm note to brighten someone’s day."
    : "Welkom! Kies een gevoel en stuur een warm berichtje naar iemand die je dierbaar is.";

  if (els?.msg)  els.msg.textContent  = copy;
  if (els?.icon) els.icon.textContent = "💛";

  if (els?.note) els.note.classList.add("note--welcome");
  if (typeof setPaperLook === 'function') setPaperLook();
  if (typeof renderToFrom === 'function') renderToFrom(); // lijnen syncen met lege inputs
  if (typeof updateCoach === 'function') updateCoach('init');
  // korte guard zodat initiele auto-render de welcome niet overschrijft
  window._awnWelcomeGuardUntil = (window.performance?.now?.() || Date.now()) + 500;

  return true;
}

/* === AI RESULT SINK (centraal) ===========================================
   Zorgt dat elk AI-resultaat in de app zichtbaar wordt:
   - Voegt (of vervangt per id) in STATE.allMessages
   - Zet STATE.currentIdx op die kaart
   - Rebuild deck (respecteert actief sentiment)
   - Rendert direct de note
   - Houdt lastRenderedId bij voor UTM/analytics
   Let op: verwacht objectvorm { text, icon?, sentiments?, special_day?, id? }
============================================================================ */
(function installAIResultSink(){
  // Dubbel installeren voorkomen
  if (window.onAIGeneratedText && window.onAIGeneratedText.__awn_ai_sink) return;

  window.onAIGeneratedText = function onAIGeneratedText(msg){
    try {
      // 1) Normaliseer inkomend bericht
      const m = {
        id:          (msg && msg.id) || ('ai_' + Math.random().toString(36).slice(2,9)),
        icon:        (msg && msg.icon) || '✨',
        text:        String((msg && msg.text) || (typeof msg === 'string' ? msg : '') || ''),
        sentiments:  Array.isArray(msg?.sentiments) ? msg.sentiments : (STATE?.activeSentiment ? [STATE.activeSentiment] : []),
        special_day: msg?.special_day || null,
        weight:      1
      };
      if (!m.text) { console.warn('[AI SINK] leeg bericht, niets te doen.'); return; }

      // 2) Dataset voorbereiden
      if (!Array.isArray(STATE.allMessages)) STATE.allMessages = [];

      // 3) Upsert per id (vervang als id bestaat, anders vooraan toevoegen)
      const ix = STATE.allMessages.findIndex(x => x && x.id === m.id);
      if (ix >= 0) STATE.allMessages[ix] = m;
      else STATE.allMessages.unshift(m);

      // 4) Huidige index op dit item zetten
      STATE.currentIdx = STATE.allMessages.findIndex(x => x && x.id === m.id);

      // 5) Deck opnieuw opbouwen (zodat nav/next klopt met actief sentiment)
      if (typeof rebuildDeck === 'function') rebuildDeck(/*resetRecent*/ true);

      // 6) Note direct renderen
      if (typeof renderMessage === 'function') {
        renderMessage({ requestedIdx: STATE.currentIdx, msg: m, wiggle: true });
      } else {
        console.warn('[AI SINK] renderMessage ontbreekt; UI niet geüpdatet.');
      }

      // 7) Bewaar voor UTM content-tagging
      STATE.lastRenderedId = m.id;

      // 8) Optioneel: klein confetti / toast
      try { showToast?.( (STATE?.lang)==='en' ? 'AI note ready ✨' : 'AI-bericht klaar ✨' ); } catch {}
      try { celebrate?.(); } catch {}
    } catch (e){
      console.error('[AI SINK] onAIGeneratedText error:', e);
    }
  };
  window.onAIGeneratedText.__awn_ai_sink = true;

  // Compat: sommige paden roepen nog onUserPickedMessage(m)
  if (!window.onUserPickedMessage) {
    window.onUserPickedMessage = (m)=> window.onAIGeneratedText(m);
  }
})();


/* [I] === COMPOSE (inputs Voor/Van) ================================================== */
function autoCapitalizeInput(input) {
  if (!input) return;
  input.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val.length > 0) {
      e.target.value = val.charAt(0).toUpperCase() + val.slice(1);
    }
  });
}

function toLabel(name){
  if (!name) return "";
  // 1) probeer t('compose.to'); 2) anders EN/NL fallback
  const base =
    (typeof t === 'function' && t('compose.to')) ||
    (((STATE?.lang) || resolveLang()) === 'en' ? 'To' : 'Voor');
  return `${base} ${name}`;
}

function fromLabel(name){
  if (!name) return "";
  const base =
    (typeof t === 'function' && t('compose.from')) ||
    (((STATE?.lang) || resolveLang()) === 'en' ? 'From' : 'Van');
  return `${base} ${name}`;
}

function onComposeEdit(){
  renderToFrom();
  updateCoach(currentCoachState());
  renderShareSheetPairsInline();
}

try{
  // persist "from"
  window.addEventListener("DOMContentLoaded", () => {
    els.fromInput?.addEventListener('change', ()=> {
      try { localStorage.setItem('awn_from', getFrom()); } catch {}
    });
    try{
      const v = localStorage.getItem('awn_from');
      if (v && els.fromInput && !els.fromInput.value) { els.fromInput.value = v; onComposeEdit(); }
    }catch{}
  });
}catch{}

/* === [J] COACH ====================================== */

function currentCoachState(){ return getTo() ? "toFilled" : "init"; }

function updateCoach(state, vars = {}, opts = {}){
  if (!els.coach) return;
  const prioMap = { error: 3, category: 2, toFilled: 2, shared: 1.5, received: 1.5, init: 0 };
  const now = Date.now();
  const incomingPrio = prioMap[state] ?? 0;

  if (STATE.coachHoldUntil && now < STATE.coachHoldUntil) {
    const curPrio = STATE.coachPrio ?? 0;
    if (!opts.force && incomingPrio < curPrio) return;
  }

  const theme = getActiveTheme();
  const lang  = (STATE?.lang) || resolveLang();
  const isEn  = (lang === 'en');

  const themedInit = (theme===THEME.VALENTINE)
    ? (isEn ? "Happy Valentine 💛 Pick Valentine, select a message and send your note."
            : "Fijne Valentijn 💛 Kies voor Valentijn, blader door de berichtjes en verstuur je note.")
    : (theme===THEME.NEWYEAR)
      ? (isEn ? "Fresh start ✨ Pick Newyear, select a message and send your note."
              : "Nieuw begin ✨ Kies Nieuwjaar, blader door de berichtjes en verstuur je note.")
      : (theme===THEME.EASTER)
        ? (isEn ? "Gentle start 🐣 Pick Easter, select a message and send your note."
                : "Zacht begin 🐣 Kies Pasen, blader door de berichtjes en verstuur je note.")
        : null;

  const copy = isEn ? {
  init:     themedInit || "Pick a feeling, select a message and send your note.",
  toFilled: `Nice! Click <button type="button" class="coach-inline">Send</button> to share your message.`,
  shared:   "Your 'warm note' has been sent.<br> Make another one?",
  received: "You’ve received a warm note.<br> Send your own? Tap ‘New message’.",
  error:    "Add who it’s for first",
  category: "Now pick 'a warm note' from the feeling {{category}}.",
  aiThinking: "Thinking… 💭",
  aiDone:     "AI message ready! ✨"
  } : {
  init:     themedInit || "Stuur een warm bericht met het juiste sentiment.",
  toFilled: `Mooi! Klik <button type="button" class="coach-inline">Verstuur</button> om je boodschap te delen.`,
  shared:   "Je boodschap is verstuurd<br>Nog eentje maken?",
  received: "Je hebt een 'a warm note' ontvangen.<br>Zelf iemand verrassen? Klik ‘Kies bericht’.",
  error:    "Vul eerst in voor wie dit is.",
  category: "Kies nu 'a warm note' uit {{categorie}}.",
  aiThinking: "Even denken… 💭",
  aiDone:     "AI-bericht gereed! ✨"
  };

  const tpl = (str) => {
    if (!str) return "";
    return str
      .replace(/\{\{\s*categorie\s*\}\}/gi, vars.categorie || vars.category || "")
      .replace(/\{\{\s*category\s*\}\}/gi,  vars.category  || vars.categorie || "");
  };

  const html = tpl(copy[state] || copy.init);

  els.coach?.classList.remove('hidden');
  if (els.coachMsg) els.coachMsg.innerHTML = html;
  if (window.StickyAvatar) StickyAvatar.setFromCoach(state);

// --- Hold/Prio: init nooit vasthouden; andere states kort vasthouden ---
  const defaultHold = (state === 'init' || state === 'received') ? 0 : 1200; // ms
  const holdMs = Number.isFinite(opts.hold) ? opts.hold : defaultHold;

  STATE.coachPrio = incomingPrio;

// Belangrijk: bij 0 ms altijd expliciet resetten (geen “oude” lock laten hangen)
  if (holdMs > 0) {
    STATE.coachHoldUntil = now + holdMs;
  } else {
    STATE.coachHoldUntil = 0;
  }
}

/* [J+] === Timed coach: gebruikt centrale copy en sluit gegarandeerd na ms */
window.updateCoachTimed = (function(){
  let tHandle = null;

  return function(state, vars = {}, ms = 1600){
    // 1) bestaande timer annuleren
    try { if (tHandle) clearTimeout(tHandle); } catch(_) {}
    tHandle = null;

    // 2) tonen via centrale functie + hold (zodat zwakkere states niet eroverheen schrijven)
    try { updateCoach(state, vars, { hold: ms, force: true }); } catch(_) {}

    // 3) gegarandeerd verbergen na ms (native coachHide → DOM fallback) + hold/prio reset
    const delay = Math.max(400, ms|0);
    tHandle = setTimeout(() => {
      try {
        if (typeof window.coachHide === 'function') {
          window.coachHide(true);
        } else {
          const box = document.getElementById('coach-tip');
          if (box) box.classList.add('hidden');
        }
      } catch(_) {}

      try {
        if (window.STATE) { STATE.coachHoldUntil = 0; STATE.coachPrio = 0; }
      } catch(_) {}

      tHandle = null;
    }, delay);
  };
})();

/* COACH helper: timed hint */
window.coachShowTimed = function coachShowTimed(msg, ms = 1600) {
  try { if (typeof window.coachShow === 'function') window.coachShow(msg); } catch(_) {}
  try {
    if (typeof window.coachHide === 'function') {
      setTimeout(() => window.coachHide(true), Math.max(400, ms|0));
    }
  } catch(_) {}
};

// --- Coach overlay bridge ----------------------------------------------------

function isVisible(el){
  if (!el) return false;
  // je sheets gebruiken class "hidden" + soms aria-hidden
  if (el.classList?.contains('hidden')) return false;
  if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
  return true;
}

function updateCoachVisibilityForOverlays(){
  const ids = ['sheet-backdrop','ai-backdrop','msgr-help-backdrop','qr-backdrop','about-backdrop'];
  const anySheetOpen = ids.some(id => isVisible(document.getElementById(id)));
  const leoOpen = !!document.getElementById('coach-leo')?.classList.contains('show');
  hideCoach(anySheetOpen || leoOpen);
}

function installCoachOverlayBridge(){
  const ids = ['sheet-backdrop','ai-backdrop','msgr-help-backdrop','qr-backdrop','about-backdrop'];

  // Observe class / aria-hidden changes op alle sheets
  const mo = new MutationObserver(updateCoachVisibilityForOverlays);
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) mo.observe(el, { attributes: true, attributeFilter: ['class','aria-hidden'] });
  });

  // Sheet-close knoppen veranderen vaak classes asynchroon—vang klik ook op
  document.addEventListener('click', (e) => {
    if (e.target.closest('.sheet-close')) {
      // even laten updaten, dan her-evalueren
      setTimeout(updateCoachVisibilityForOverlays, 0);
    }
  });

  // Hook in op CoachLeo.show/hide als hij bestaat
  if (window.CoachLeo) {
    const _show = CoachLeo.show.bind(CoachLeo);
    const _hide = CoachLeo.hide.bind(CoachLeo);
    CoachLeo.show = function(){ hideCoach(true); return _show(); };
    CoachLeo.hide = function(){ const r = _hide(); updateCoachVisibilityForOverlays(); return r; };
  }

  // Initial state
  updateCoachVisibilityForOverlays();
}

function hideCoach(hide = true){
  const c = document.getElementById('coach-tip');
  if (!c) return;

  if (hide) {
    // start fade-out
    c.classList.add('is-fading');
    // na de fade, echt verstoppen (back-up voor toegankelijkheid/lay-out)
    clearTimeout(c._hideT);
    c._hideT = setTimeout(() => c.classList.add('hidden'), 200);
  } else {
    // hard hidden eraf, dan in de volgende frame de fade-klasse verwijderen
    c.classList.remove('hidden');
    requestAnimationFrame(() => {
      // kleine extra frame om overgang zeker te laten starten
      requestAnimationFrame(() => c.classList.remove('is-fading'));
    });
  }
}

// Starten na DOM ready (naast je bestaande init)
document.addEventListener('DOMContentLoaded', installCoachOverlayBridge);

/* [K] === SHARE-SHEET (WA/E-mail/Download/Kopieer/Native) ============================== */
let __lastFocusEl = null;
function trapFocusIn(el, e){
  const focusables = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* Smart Messenger opener (platform-aware)
   - Desktop: meteen Messenger Web in nieuwe tab
   - Android/Chrome: intent:// met browser_fallback_url (detect+fallback door Chrome)
   - iOS/Safari: schema via verborgen iframe + timer → web in nieuwe tab als app niet opent
*/
function openMessengerSmart(shareUrl, { timeout = 1400 } = {}) {
  if (!shareUrl) return;

  const webFallback = `https://www.messenger.com/t/?link=${encodeURIComponent(shareUrl)}`;

  const UA = navigator.userAgent || navigator.vendor || "";
  const IS_ANDROID = /Android/i.test(UA);
  const IS_IOS     = /iPhone|iPad|iPod/i.test(UA);
  const IS_MOBILE  = IS_ANDROID || IS_IOS;

  // 1) DESKTOP → altijd web in nieuwe tab
  if (!IS_MOBILE) {
    window.open(webFallback, '_blank', 'noopener');
    return;
  }

  // 2) ANDROID → intent:// met fallback (Chrome handelt detectie af)
  if (IS_ANDROID) {
    const intent = `intent://share?link=${encodeURIComponent(shareUrl)}#Intent;scheme=fb-messenger;package=com.facebook.orca;S.browser_fallback_url=${encodeURIComponent(webFallback)};end`;
    try { window.location.href = intent; } catch { window.open(webFallback, '_blank', 'noopener'); }
    return;
  }

  // 3) iOS → schema via verborgen iframe + timer → web fallback (nieuwe tab)
  const deeplink = `fb-messenger://share?link=${encodeURIComponent(shareUrl)}`;

  let fired = false;
  const clear = () => document.removeEventListener('visibilitychange', onVis);

  const onVis = () => {
    if (document.hidden && !fired) {
      fired = true; // app kwam naar voren
      clear();
    }
  };
  document.addEventListener('visibilitychange', onVis, { passive: true });

  // Fallback naar web als app niet opent binnen timeout
  const t = setTimeout(() => {
    if (!fired) {
      window.open(webFallback, '_blank', 'noopener');
    }
    clear();
  }, timeout);

  // Probeer app via verborgen iframe (pagina blijft staan → timer blijft lopen)
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.tabIndex = -1;
    iframe.src = deeplink;
    document.body.appendChild(iframe);
    // opruimen na even
    setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, timeout + 1000);
  } catch {
    // laatste redmiddel
    try { window.location.href = deeplink; } catch {}
  }
}

function openShareSheet(){
  // Centrale korte hint voor share-sheet
  updateCoachTimed('shareIntro', {}, 1600);
  // Précompute share links zodra de sheet opent (géén await tijdens klik)
STATE._shareLinks = STATE._shareLinks || {};
(async () => {
  try {
    STATE._shareLinks.whatsapp = await getShareUrlForChannel('whatsapp');
  } catch { /* stil falen */ }
})();

  renderShareSheetPairsInline();
  if (!els.sheet) return;
  __lastFocusEl = document.activeElement;
  els.sheet.classList.remove("hidden");
  els.sheet.setAttribute("aria-hidden","false");
  const panel = els.sheet.querySelector('.sheet');
  setTimeout(()=> panel?.querySelector('button, [href], [tabindex]:not([tabindex="-1"])')?.focus(), 0);
  els._sheetKey = (ev)=>{
    if (ev.key === "Escape") { closeShareSheet(); }
    if (ev.key === "Tab")    { trapFocusIn(panel, ev); }
  };
  document.addEventListener('keydown', els._sheetKey);
}

function closeShareSheet(){
  if (!els.sheet) return;
  els.sheet.classList.add("hidden");
  els.sheet.setAttribute("aria-hidden","true");
  document.removeEventListener('keydown', els._sheetKey);
  els._sheetKey = null;
  __lastFocusEl?.focus?.(); __lastFocusEl = null;
}

function openMessengerHelp(){
  const wrap = document.getElementById("msgr-help-backdrop");
  if (!wrap) return;
  wrap.classList.remove("hidden");
  wrap.setAttribute("aria-hidden","false");
  wrap._key = (ev)=>{ if (ev.key === "Escape") closeMessengerHelp(); };
  document.addEventListener("keydown", wrap._key);
  setTimeout(()=> document.getElementById("msgr-open")?.focus(), 0);
}

function closeMessengerHelp(){
  const wrap = document.getElementById("msgr-help-backdrop");
  if (!wrap) return;
  wrap.classList.add("hidden");
  wrap.setAttribute("aria-hidden","true");
  if (wrap._key){ document.removeEventListener("keydown", wrap._key); wrap._key = null; }
}

function renderShareSheetPairsInline(){
  els.pairToVal  && (els.pairToVal.textContent   = toLabel(getTo())     || "—");
  els.pairFromVal&& (els.pairFromVal.textContent = fromLabel(getFrom()) || "—");
}

async function onCopyLink(){
  const url = await getShareUrlForChannel('copy');
  const lang = (STATE?.lang) || resolveLang();
  const i18n = (lang === 'en')
    ? { prompt: 'Copy link', toast: 'Link copied 📋' }
    : { prompt: 'Kopieer link', toast: 'Link gekopieerd 📋' };

  try { await navigator.clipboard.writeText(url); }
  catch { prompt(i18n.prompt, url); }

  closeShareSheet();
  afterShareSuccess();
  showToast(i18n.toast);
}

function onShareWhatsApp(){
  const lang   = (STATE?.lang) || resolveLang();
  const toName = (typeof getTo === 'function') ? getTo() : '';

  // 0) LOG
  console.groupCollapsed('[WA] onShareWhatsApp click');
  console.log('lang:', lang, 'toName:', toName);

  // 1) Gebruik précomputed short link als beschikbaar; anders sync long URL
  let link = STATE?._shareLinks?.whatsapp;
  if (!link) {
    let u = buildSharedURL();
    u = applyUTM(u, {
      source: 'whatsapp',
      medium: 'share',
      campaign: currentCampaignTag(),
      content: shareContentTag()
    });
    link = u.toString();
    console.log('[WA] no precomputed link, using long URL');
  } else {
    console.log('[WA] using precomputed short link');
  }
  console.log('link:', link);

  // 2) OPEN WHATSAPP — TOP-LEVEL NAVIGATIE (sync, geen await!)
  try {
    window.shareByWhatsApp({ lang, toName, permalink: link });
    console.log('[WA] navigation attempted');
  } catch (e) {
    console.error('[WA] navigation error', e);
  }
  console.groupEnd();

  // 3) UX NA opening (mag sync blijven; navigatie neemt het tabblad over)
  showToastI18n('toast.whatsappOpened','WhatsApp geopend 📲');
  closeShareSheet();
  afterShareSuccess();
}

/* Backwards-compat alias als er nog oude calls bestaan */
window.onShareWhatsApp = onShareWhatsApp;
window.shareViaWhatsApp = onShareWhatsApp;

async function onShareEmail() {
  const lang = (STATE?.lang) || resolveLang();
  const toName = (typeof getTo === 'function') ? getTo() : '';
  const fromName = (typeof getFrom === 'function') ? getFrom() : '';
  const permalink = await getShareUrlForChannel('email');

  if (typeof window.shareByEmail === 'function') {
    window.shareByEmail({ lang, toName, fromName, permalink });
  } else {
    console.warn('[share] shareByEmail() ontbreekt');
  }
  showToastI18n('toast.emailOpened','E-mail geopend ✉️');
  closeShareSheet();
  afterShareSuccess();
}

function onDownload(){
  if (typeof window.downloadNoteAsImage === "function") {
    window.downloadNoteAsImage(
      els.note, els.msg, els.icon, "nl",
      (_l,n)=> n?`Voor ${n}`:"",
      (_l,n)=> n?`Van ${n}`:"",
      getTo, getFrom
    );
	showToastI18n('toast.downloadStart','Afbeelding wordt opgeslagen ⬇️');
	afterShareSuccess();
  } else {
	showToastI18n('toast.downloadUnavailable','Download niet beschikbaar');  }
	closeShareSheet();
}

async function onNativeShare(){
  const shareURL = await getShareUrlForChannel('native');
  if (navigator.share) {
    try {
      await navigator.share({ title:"a warm note", text:"Een warm bericht voor jou 💛", url:shareURL });
      showToastI18n('toast.shared','Gedeeld 💛');
      afterShareSuccess();
    } catch {
      showToastI18n('toast.shareCancelled','Delen geannuleerd');
    }
  } else {
    await onCopyLink();
  }
  closeShareSheet();
}

async function onShareMessenger(){
  const url  = await getShareUrlForChannel('messenger');
  const lang = (STATE?.lang) || resolveLang();
  const i18n = (lang === 'en')
    ? { toast: 'Link to your personal note has been copied. 📋',
        prompt: 'Copy this link and paste it in Messenger:' }
    : { toast: 'Link van jouw persoonlijke bericht is gekopieerd. 📋',
        prompt: 'Kopieer deze link en plak straks in Messenger:' };

  try { await navigator.clipboard.writeText(url); showToast(i18n.toast); }
  catch { prompt(i18n.prompt, url); }
  closeShareSheet();
  openMessengerHelp();
  openMessengerSmart(url, { timeout: 1400 });
}

// ===== QR helpers =====
function openQR(){
  const s = document.getElementById('qr-backdrop');
  if (!s) return;
  s.classList.remove('hidden');
  s.setAttribute('aria-hidden','false');
}
function closeQR(){
  const s = document.getElementById('qr-backdrop');
  if (!s) return;
  s.classList.add('hidden');
  s.setAttribute('aria-hidden','true');
}
window.openQR = openQR;
window.closeQR = closeQR;

// Zorg dat er een <img id="qr-img"> is (voor fallback)
(function ensureQrImg(){
  const box = document.querySelector('.qr-box') || document.getElementById('qr-backdrop');
  if (!box) return;
  if (!document.getElementById('qr-img')) {
    const img = document.createElement('img');
    img.id = 'qr-img';
    img.width = 240; img.height = 240;
    img.alt = 'QR-code';
    img.style.display = 'none';
    img.className = 'qr-img';
    box.appendChild(img);
  }
})();

// Canvas render met lib
async function renderWithLib(link){
  if (typeof QRCode === 'undefined') return false;
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return false;
  const img = document.getElementById('qr-img');
  if (img) img.style.display = 'none';
  canvas.style.display = 'block';

  await QRCode.toCanvas(canvas, link, {
    width: 240, margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });
  return true;
}
// Externe QR-afbeelding met timeout + blob (geen referrer leakage)
async function renderWithImg(link) {
  const size = 240;
  const endpoint = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(link)}`;

  const img  = document.getElementById('qr-img');
  const cv   = document.getElementById('qr-canvas');
  if (!img) return false;

  // UI-setup: alleen img tonen
  if (cv) cv.style.display = 'none';
  img.style.display = 'block';

  // Timeout helper
  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), 2500); // 2.5s timeout

    const res = await Promise.race([
      fetch(endpoint, {
        // voorkom referrer + cache hergebruik tot 1h
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'force-cache',
        signal: ctrl.signal
      }),
      timeout(4000) // hard cap
    ]);
    clearTimeout(t);

    if (!res || !res.ok) throw new Error('bad-response');

    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);

    // Clean-up vorige objectURL om memory te sparen
    if (img.dataset.objUrl) URL.revokeObjectURL(img.dataset.objUrl);
    img.dataset.objUrl = objUrl;
    img.src = objUrl;

    img.onerror = () => console.warn('QR-afbeelding kon niet laden');
    return true;
  } catch (e) {
    console.warn('[qr] fallback naar kopiëren', e?.message || e);

    // Graceful fallback: kopieer link en toon melding
    if (typeof copyToClipboard === 'function') copyToClipboard(link);
    if (typeof showToast === 'function') showToast('QR niet beschikbaar. Link is gekopieerd.');
    // Verberg de img weer om geen “kapotte” placeholder te tonen
    img.style.display = 'none';
    return false;
  }
}

// Publieke handler
async function onShareQR(){
  // 1) Bouw long URL + UTM + src=qr
  let u = buildSharedURL();
  u = applyUTM(u, {
    source: 'qr',
    medium: 'offline',
    campaign: currentCampaignTag(),
    content:  shareContentTag()
  });
  u.searchParams.set('src', 'qr');
  const longLink = u.toString();

  // 2) Korte URL via shortener (met cache & timeout)
  const link = await mintShort(longLink);

  // 3) UI open + render QR (lib → fallback image)
  openQR();
  let ok = false;
  try {
    ok = await renderWithLib(link);
  } catch (e) {
    ok = false;
    console.warn('[QR] renderWithLib error:', e);
  }
  if (!ok) {
    try {
      await renderWithImg(link);
    } catch (e) {
      console.error('[QR] renderWithImg error:', e);
    }
  }

  // 4) Download-knop (canvas → png, of open image in nieuw tab)
  const dlOld = document.getElementById('qr-download');
  if (dlOld){
    const dl = dlOld.cloneNode(true);
    dlOld.replaceWith(dl);
    dl.addEventListener('click', ()=>{
      const cv  = document.getElementById('qr-canvas');
      const img = document.getElementById('qr-img');
      if (cv && cv.style.display !== 'none' && typeof cv.toDataURL === 'function') {
        const a = document.createElement('a');
        a.href = cv.toDataURL('image/png');
        a.download = 'a-warm-note-qr.png';
        document.body.appendChild(a); a.click(); a.remove();
      } else if (img && img.src) {
        window.open(img.src, '_blank', 'noopener');
      }
    }, { once: true });
  }

  // 5) Copy-knop (kopieer dezelfde short link)
  const cpOld = document.getElementById('qr-copy');
  if (cpOld){
    const cp = cpOld.cloneNode(true);
    cpOld.replaceWith(cp);
    cp.addEventListener('click', async ()=>{
      try {
        await navigator.clipboard.writeText(link);
        (typeof showToastI18n === 'function')
          ? showToastI18n('share.copiedToast','Link gekopieerd 📋')
          : (typeof showToast === 'function' ? showToast('Link gekopieerd 📋') : null);
      } catch {
        prompt('Kopieer link:', link);
      }
    }, { once: true });
  }

  // 6) Sluiten (X, sheet-close, backdrop)
  const sheet = document.getElementById('qr-backdrop');
  document.getElementById('qr-close')?.addEventListener('click', closeQR, { once:true });
  sheet?.querySelector('.sheet-close')?.addEventListener('click', closeQR, { once:true });
  sheet?.addEventListener('click', (e)=>{ if (e.target === sheet) closeQR(); }, { once:true });
}
window.onShareQR = onShareQR;

// Na succesvolle share → viering + coach-tekst "shared"
function afterShareSuccess(){
  celebrate();
  updateCoach('shared');
}

/* ===== LEO: single-source-of-truth (mount + welcome/received + AI-nudge) === */
(function(){
  // Idempotent guard
  if (window.__LEO_SINGLE_BLOCK__) return;
  window.__LEO_SINGLE_BLOCK__ = true;

  // --- Config --------------------------------------------------------------
  const AI_NUDGE_KEY   = 'ai_compose_announce_q4_2025'; // wijzig om opnieuw te tonen
  const WELCOME_DELAY  = 2200;  // ms (geen mid)
  const RECEIVED_DELAY = 2200;   // ms (wel mid)
  const AI_DELAY       = 6000;  // ms (eerste nudge zonder interactie)
  const RETRIES        = 5;     // zachte retries als overlay open is
  const RETRY_MS       = 900;

  // --- Helpers -------------------------------------------------------------
  const isEN = () => (document.documentElement.lang || 'nl').toLowerCase().startsWith('en');
  const hasMid = () => new URL(location.href).searchParams.has('mid');

  const anyOverlayOpen = () => {
    const ids = ['sheet-backdrop','ai-backdrop','msgr-help-backdrop','qr-backdrop','about-backdrop'];
    const overlay = ids.some(id=>{
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden') && el.getAttribute('aria-hidden') !== 'true';
    });
    const leoOpen   = document.getElementById('coach-leo')?.classList.contains('show');
    const bubbleVis = document.getElementById('leo-fab-bubble')?.classList.contains('show');
    return overlay || leoOpen || bubbleVis;
  };
  
// --- Idle CTA (inactivity nudge) — met debug logging ------------------------
function installIdleCTA({ idleMs = 20000, cooldownMs = 120000 } = {}) {
  // Debug flag: aanzetten via window.AWN_FLAGS.debugLeo = true of ?debug_leo=1
  const DEBUG = !!(window.AWN_FLAGS?.debugLeo ||
                   new URL(location.href).searchParams.get('debug_leo') === '1');
  const log = (...args) => { if (DEBUG) console.debug('[LEO idle]', ...args); };

  let t = null;
  const KEY = '__awn_idle_cta_last';
  const now = () => Date.now();
  const since = (k) => { try { return now() - (+sessionStorage.getItem(k) || 0); } catch { return Infinity; } };
  const mark  = (k) => { try { sessionStorage.setItem(k, String(now())); } catch {} };

  const isEn = (document.documentElement.lang || 'nl').toLowerCase().startsWith('en');
  const ctaText = isEn
    ? "Need a hand? ✨ Try AI Compose to draft your note."
    : "Hulp nodig? ✨ Probeer AI Compose voor een eerste versie.";
  const ctaReceivedText = isEn
    ? "Send one back? 💛 Try AI Compose for a quick draft."
    : "Ook terugsturen? 💛 Laat AI snel helpen.";

  const anyOverlayOpen = () => {
    const ids = ['sheet-backdrop','ai-backdrop','msgr-help-backdrop','qr-backdrop','about-backdrop'];
    const overlay = ids.some(id=>{
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden') && el.getAttribute('aria-hidden') !== 'true';
    });
    const coachOpen = document.getElementById('coach-leo')?.classList.contains('show');
    return overlay || coachOpen; // let op: bubble zelf blokkeert NIET
  };
  const hasMid = () => new URL(location.href).searchParams.has('mid');

  const fire = () => {
    log('fire() start', { idleMs, cooldownMs, lastSeenDelta: since(KEY) });

    if (anyOverlayOpen()) {
      log('AFGEKAPT: overlay/coaching open → her-armen');
      return arm();                // wacht tot het vrij is
    }
    if (since(KEY) < cooldownMs) {
      log('AFGEKAPT: cooldown actief → her-armen');
      return arm();                // te snel na vorige
    }

    const txt = hasMid() ? ctaReceivedText : ctaText;

    // wacht tot LeoFab mounted + bubble vrij met zachte retry via sayOnceWithRetry
    if (!window.LeoFab?.mounted) {
      log('LeoFab nog niet mounted → zachte retry via sayOnceWithRetry');
    } else {
      log('LeoFab mounted — ga praten');
    }

    try {
      sayOnceWithRetry(txt, { setFlag:false, max:5, delay:900 });
      // auto-dismiss om ruimte te maken voor volgende hints
      setTimeout(()=> {
        log('auto-dismiss bubble');
        window.LeoFab?.clear?.();
      }, 4200);

      mark(KEY);
      log('SUCCESS: CTA getoond, cooldown gemarkeerd');
    } catch (e) {
      console.warn('[LEO idle] fout tijdens say()', e);
    } finally {
      arm();
    }
  };

  const arm = () => {
    clearTimeout(t);
    t = setTimeout(fire, idleMs);
    log('arm()', { nextInMs: idleMs });
  };

  const reset = (evName) => {
    clearTimeout(t);
    arm();
    log('reset door event:', evName);
  };

  // Reset bij relevante interacties
  ['pointerdown','keydown','wheel','touchstart','scroll','focus'].forEach(ev =>
    window.addEventListener(ev, () => reset(ev), { passive:true, capture:true })
  );

  // Pauzeer op achtergrond, hervat bij terugkeer
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(t);
      log('tab → HIDDEN: timer gepauzeerd');
    } else {
      arm();
      log('tab → VISIBLE: timer hervat');
    }
  });

  // Start
  arm();
  log('installIdleCTA(): geïnstalleerd', { idleMs, cooldownMs });

  // Expose eenvoudige controller (optioneel)
  window.__AWN_IDLE_CTA__ = {
    reset: () => { reset('manual'); },
    stop:  () => { clearTimeout(t); log('stop()'); },
    start: () => { arm(); log('start()'); }
  };
}


/* ---- [RESCUE] AI Compose hard glue (idempotent) ------------------------- */
function bindAISheetGlueHard(){
  const wrap = document.getElementById('ai-backdrop');
  const trigger = document.getElementById('smart-compose');
  const btnGenOld = document.getElementById('ai-generate');
  if (!wrap || !btnGenOld) return;

  // Re-bind veilig: cloneNode verwijdert oude (kapotte) listeners
  const btnGen = btnGenOld.cloneNode(true);
  btnGenOld.replaceWith(btnGen);

  const open  = ()=>{ wrap.classList.remove('hidden'); wrap.setAttribute('aria-hidden','false'); };
  const close = ()=>{ wrap.classList.add('hidden');    wrap.setAttribute('aria-hidden','true');  };

  trigger?.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
  document.getElementById('ai-close')?.addEventListener('click', (e)=>{ e.preventDefault(); close(); });
  wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(); }); // klik op backdrop sluit

  btnGen.addEventListener('click', async ()=>{
    try{
      // lifecycle start
      document.dispatchEvent(new CustomEvent('ai:started'));
      window.updateCoachTimed?.('aiThinking', {}, 1600);

      btnGen.disabled = true;
      btnGen.setAttribute('aria-busy', 'true');

      // Lees formwaarden robuust
      const lang = (document.documentElement.lang||'nl').toLowerCase().startsWith('en') ? 'en' : 'nl';
      const tone = document.getElementById('ai-tone')?.value || STATE?.activeSentiment || 'warm';
      const occ  = document.getElementById('ai-occasion')?.value || '';
      const ctx  = document.getElementById('ai-context')?.value || '';
      const len  = document.getElementById('ai-length')?.value || 'short';

      const payload = {
        lang,
        sentiments: [tone].filter(Boolean),
        to:   (typeof getTo==='function'   ? getTo()   : '') || '',
        from: (typeof getFrom==='function' ? getFrom() : '') || '',
        special_day: occ || null,
        context: ctx,
        length: len
      };

      // 🔌 API-call
      const res = await fetch('/api/generate-message', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP_'+res.status);
      const json = await res.json();

      // Normaliseer respons
      const msgIn = json?.message || json;
      const text  = msgIn?.text || msgIn?.message || msgIn?.content;
      if (!text) throw new Error('EMPTY_PAYLOAD');

      const out = {
        id: msgIn?.id,
        icon: '✨',
        text,
        sentiments: msgIn?.sentiments || payload.sentiments,
        special_day: msgIn?.special_day || payload.special_day || null
      };

      // Zet in app (centrale sink als aanwezig)
      if (typeof window.onAIGeneratedText === 'function') window.onAIGeneratedText(out);

      // lifecycle success
      document.dispatchEvent(new CustomEvent('ai:result', { detail: out }));

      // UI: sheet dicht
      close();
    } catch (e){
      console.error('[AI] generate failed', e);
      document.dispatchEvent(new CustomEvent('ai:error', { detail: { error: String(e) } }));
      showToastI18n?.('ai.error','AI niet beschikbaar — probeer later opnieuw');
    } finally {
      btnGen.disabled = false;
      btnGen.removeAttribute('aria-busy');
    }
  });
}

// Start & rebind na taalwissel
document.addEventListener('DOMContentLoaded', bindAISheetGlueHard);
if (typeof window.setLanguage === 'function') {
  const _setLanguage = window.setLanguage;
  window.setLanguage = async function(next){
    const r = await _setLanguage.apply(this, arguments);
    try { bindAISheetGlueHard(); } catch{}
    return r;
  };
}
  // Vind compose inputs (robust)
  function getInputs(){
    const toEl   = (window.els && els.toInput)   || document.getElementById('to-inline')   || document.querySelector('#to,[name="to"]');
    const fromEl = (window.els && els.fromInput) || document.getElementById('from-inline') || document.querySelector('#from,[name="from"]');
    return { toEl, fromEl };
  }

  // --- LeoFab (kleine API) -------------------------------------------------
  const LeoFab = window.LeoFab || {
    root:   null,
    bubble: null,
    textEl: null,
    ava:    null,
    mounted:false,
    mount(){
      if (this.mounted) return;
      this.root   = document.getElementById('leo-fab');
      this.bubble = document.getElementById('leo-fab-bubble');
      this.textEl = document.getElementById('leo-fab-text');
      this.ava    = this.root?.querySelector?.('.leo-fab__ava');
      if (!this.root || !this.bubble || !this.textEl) return;

      const toggle = () => {
        if (this.bubble.hidden) this._show(); else this.clear();
      };
      this.root.addEventListener('click', toggle);
      this.root.addEventListener('keydown', (e)=>{
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });

      // Sluit bubble wanneer overlay open gaat
      const mo = new MutationObserver(() => { if (anyOverlayOpen()) this.clear(); });
      ['sheet-backdrop','ai-backdrop','msgr-help-backdrop','qr-backdrop','about-backdrop'].forEach(id=>{
        const el = document.getElementById(id);
        if (el) mo.observe(el, { attributes:true, attributeFilter:['class','aria-hidden'] });
      });

      this.mounted = true;
    },
    say(txt){
      if (!txt || !this.textEl || !this.bubble) return;
      this.textEl.textContent = txt;
      this._show();
    },
    _show(){
      this.bubble.hidden = false;
      requestAnimationFrame(()=> this.bubble.classList.add('show'));
    },
    clear(){
      if (!this.bubble) return;
      this.bubble.classList.remove('show');
      setTimeout(()=>{ this.bubble.hidden = true; }, 180);
    },
    setAvatar(url){ if (this.ava && url) this.ava.style.backgroundImage = `url('${url}')`; }
  };
  window.LeoFab = LeoFab; // export

  // --- Safe speak (met zachte retry & campaign-flag) -----------------------
function sayOnceWithRetry(text, { setFlag=false, max=RETRIES, delay=RETRY_MS } = {}){
  let left = max;
  const step = ()=>{
    // wacht óók tot LeoFab gemount is
    if (!window.LeoFab?.mounted) { 
      if (left-- > 0) return setTimeout(step, delay);
      return;
    }
    if (!anyOverlayOpen()) {
      LeoFab.say(text);
      if (setFlag) { try { localStorage.setItem(AI_NUDGE_KEY,'1'); } catch {} }
    } else if (left-- > 0) {
      setTimeout(step, delay);
    }
  };
  step();
}
  // --- Campaign: AI Compose nudge ------------------------------------------
  function scheduleAINudge(){
    if (hasMid()) return; // niet in received-flow
    try { if (localStorage.getItem(AI_NUDGE_KEY) === '1') return; } catch {}

    const textWelcome = isEN()
      ? "✨ New: AI Compose helps you find just the right words."
      : "✨ Nieuw: AI Compose helpt je om precies de juiste woorden te vinden.";

    const textIntent = isEN()
      ? "✨ Try AI Compose to draft your note."
      : "✨ Probeer AI Compose voor een eerste versie.";

    // (1) passieve nudge na kleine delay
    const tIdle = setTimeout(()=>{
      try { if (localStorage.getItem(AI_NUDGE_KEY) === '1') return; } catch {}
      sayOnceWithRetry(textWelcome, { setFlag:true });
    }, AI_DELAY);

    // (2) eerste focus in compose → intent nudge
    const { toEl, fromEl } = getInputs();
    const fireIntent = ()=>{
      try { if (localStorage.getItem(AI_NUDGE_KEY) === '1') return; } catch {}
      clearTimeout(tIdle);
      sayOnceWithRetry(textIntent, { setFlag:true, delay:700 });
    };
    const once = (el, ev, fn) => el && el.addEventListener(ev, function h(e){ el.removeEventListener(ev, h); fn(e); }, { passive:true });

    once(toEl,   'focus', fireIntent);
    once(fromEl, 'focus', fireIntent);

    // Extra: eerste chip-klik telt ook als intent
    const chipRow = document.getElementById('chip-row');
    if (chipRow) {
      const chipHandler = () => { chipRow.removeEventListener('click', chipHandler, true); fireIntent(); };
      chipRow.addEventListener('click', chipHandler, true);
    }
  }
  // --- Boot ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', ()=>{
    LeoFab.mount();

    // Welkom/Received
    if (!hasMid()) {
      const welcomeTxt = isEN()
        ? "✨ Give it a try — one small message can change someone’s day."
        : "✨ Probeer het eens — één klein berichtje kan iemands dag veranderen.";
      setTimeout(()=> sayOnceWithRetry(welcomeTxt), WELCOME_DELAY);
    } else {
      const receivedTxt = isEN()
        ? "💛 You’ve just received a warm note. Want to send one back?"
        : "💛 Je hebt een warm note ontvangen. Stuur er zelf ook eentje terug?";
      setTimeout(()=> sayOnceWithRetry(receivedTxt), RECEIVED_DELAY);
    }

    // AI-campagne nudge (alleen als geen mid)
    installIdleCTA({ idleMs: 20000, cooldownMs: 120000 }); 
    scheduleAINudge();

  });
})();


/* [L] === CONFETTI & TOASTS ================================================== */
function celebrate(){
  const qp = new URLSearchParams(location.search);
/*  const debugForce = qp.get('debug_confetti') === '1';*/
  if (!CONFETTI_ENABLED) return;
/*  if (!debugForce && prefersReducedMotion()) return; */

  const colors = themeColors(getActiveTheme());
  const layer = document.body;
  const n = 12 + Math.floor(Math.random()*6);
  for (let i=0;i<n;i++){
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random()*100 + "vw";
    piece.style.background = colors[i%colors.length];
    piece.style.transform = `rotate(${Math.random()*360}deg)`;
    piece.style.animationDuration = (0.9 + Math.random()*0.6) + "s";
    piece.style.animationDelay = (Math.random()*0.1) + "s";
    layer.appendChild(piece);
    setTimeout(()=> piece.remove(), 3600);
  }
  const live = $("confetti-layer");
  if (live) live.textContent = "Viering: note verstuurd.";
}

function showToast(msg){
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.__t);
  showToast.__t = setTimeout(()=> els.toast.classList.add("hidden"), 3600);
}

// Alleen te gebruiken voor echte toasts (deliberate user feedback)
function showToastI18n(key, fallback){
  // Alleen keys uit 'toast.*' of 'share.*' accepteren
  if (!/^toast\.|^share\./.test(String(key || ''))) {
    // bescherm tegen per ongeluk gebruik in UI-label code
    return;
  }
  try {
    if (typeof t === 'function') {
      const msg = t(key);
      if (typeof msg === 'string' && msg) return showToast(msg);
    }
  } catch {}
  if (fallback) return showToast(fallback);
}

/* === CHECK THIS!!!! (waarschijnlijk UTILS) ============================= */
function getTo(){
  const v = (els.toInput?.value || '').trim();
  if (v) return v;
  if (STATE?.useSharedNames) return (STATE?.shared?.to || '').trim();
  return '';
}
function getFrom(){
  const v = (els.fromInput?.value || '').trim();
  if (v) return v;
  if (STATE?.useSharedNames) return (STATE?.shared?.from || '').trim();
  return '';
}

function personalize(text){
  const to = getTo();
  const hasToken = typeof text === "string" && text.includes("{{name}}");

  if (hasToken) {
    if (to) return text.replaceAll("{{name}}", to);
    return text.replaceAll("{{name}}", "jou");
  }

  if (!to) return text;

  return Math.random() < 0.34
    ? `${to}, ` + lowerFirst(text)
    : text;
}

function lowerFirst(s){ return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function shuffleArray(arr) {
  const a = arr.slice(); // kopie
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* === [M] UTILITIES ================================ */

/* Mini i18n: t('path.to.key', {vars}) met NL-fallback */
let STRINGS = null;          // actieve taal
let STRINGS_FALLBACK = null; // nl-fallback

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}
function readPath(obj, path) {
  return path.split('.').reduce((o,k)=> (o && o[k] != null ? o[k] : null), obj);
}
function t(key, vars) {
  const v = readPath(STRINGS?.strings, key) ?? readPath(STRINGS_FALLBACK?.strings, key) ?? key;
  return typeof v === 'string' ? interpolate(v, vars) : v;
}

/* Strings laden (relatief pad; submap-vriendelijk) */
async function loadStrings(lang) {
  const url = `/data/strings.${lang}.json?ts=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('strings not found');
  return res.json();
}
async function ensureStringsLoaded() {
  const lang = STATE?.lang || resolveLang();
  try { STRINGS = await loadStrings(lang); }
  catch { STRINGS = await loadStrings('nl'); }
  // Fallbackbuffer (nl), tenzij we al nl zijn
  STRINGS_FALLBACK = (lang === 'nl') ? STRINGS : await loadStrings('nl').catch(()=>STRINGS);
}

function refreshAISheetStrings() {
  try {
    const $ = (sel) => document.querySelector(sel);
    const curLang = (document.documentElement.lang || 'nl').toLowerCase().startsWith('en') ? 'en' : 'nl';

    // ✅ Gebruik t() als bron, i.p.v. i18n() — met fallback
    const tr = (k, fb = '') => {
      let v = (typeof window.t === 'function') ? window.t(k) : undefined;
      if (!v && typeof window.i18n === 'function') v = window.i18n(k); // safety net
      return (v && v !== k) ? v : fb;
    };

    // ---- Titel & labels ----------------------------------------------------
    const titleFallback = (curLang === 'en') ? 'AI — write a warm note' : 'AI — maak een warm bericht';
    const toneFallback  = (curLang === 'en') ? 'Tone'     : 'Toon';
    const occFallback   = (curLang === 'en') ? 'Occasion' : 'Aanleiding';
    const ctxFallback   = (curLang === 'en') ? 'Context'  : 'Context';
    const lenFallback   = (curLang === 'en') ? 'Length'   : 'Lengte';

    const titleEl = $('#ai-title');
    if (titleEl) titleEl.textContent = tr('ai.sheet.title', titleFallback);

    const lblTone = document.querySelector('label[for="ai-tone"]');
    const lblOcc  = document.querySelector('label[for="ai-occasion"]');
    const lblCtx  = document.querySelector('label[for="ai-context"]');
    const lblLen  = document.querySelector('label[for="ai-length"]');

    if (lblTone) lblTone.textContent = tr('ai.sheet.tone', toneFallback);
    if (lblOcc)  lblOcc.textContent  = tr('ai.sheet.occasion', occFallback);
    if (lblCtx)  lblCtx.textContent  = tr('ai.sheet.context', ctxFallback);
    if (lblLen)  lblLen.textContent  = tr('ai.sheet.length', lenFallback);

    // ---- Placeholder -------------------------------------------------------
    const ctx = $('#ai-context');
    if (ctx) {
      const phFallback = (curLang === 'en')
        ? 'Write a few keywords…'
        : 'Schrijf een paar steekwoorden…';
      ctx.setAttribute('placeholder', tr('ai.sheet.contextPlaceholder', phFallback));
    }

    // ---- Knop --------------------------------------------------------------
    const genBtn = $('#ai-generate');
    if (genBtn) genBtn.textContent = tr('ai.sheet.generate',
      (curLang === 'en') ? 'Generate ✨' : 'Genereer ✨'
    );

    // ---- Select options: per key vertalen ----------------------------------
    const toneSel = $('#ai-tone');
    const lenSel  = $('#ai-length');
    const occSel  = $('#ai-occasion');

    const build = (sel, baseKey, keys, fbMap) => {
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = '';
      keys.forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = tr(`${baseKey}.${key}`, fbMap[key] || key);
        sel.appendChild(opt);
      });
      if (prev && keys.includes(prev)) sel.value = prev;
    };

    const toneKeys = ['warm','funny','supportive','proud','romantic'];
    const lenKeys  = ['short','medium'];
    const occKeys  = ['', 'just_because','thank_you','miss_you','good_luck','get_well','congrats'];

    const FBT = (en, nl) => (curLang === 'en' ? en : nl);

    build(toneSel, 'ai.sheet.toneOptions', toneKeys, {
      warm: 'Warm',
      funny:      FBT('Funny','Grappig'),
      supportive: FBT('Supportive','Steunend'),
      proud:      FBT('Proud','Trots'),
      romantic:   FBT('Romantic','Romantisch')
    });

    build(lenSel, 'ai.sheet.lengthOptions', lenKeys, {
      short:  FBT('Short (recommended)', 'Kort (aanrader)'),
      medium: FBT('A bit longer',        'Iets langer')
    });

    build(occSel, 'ai.sheet.occasionOptions', occKeys, {
      '':            '—',
      just_because:  FBT('Just because','Zomaar'),
      thank_you:     FBT('Thank you','Bedankt'),
      miss_you:      FBT('Miss you','Ik mis je'),
      good_luck:     FBT('Good luck','Succes'),
      get_well:      FBT('Get well','Beterschap'),
      congrats:      FBT('Congrats','Gefeliciteerd')
    });

  } catch (e) {
    console.warn('refreshAISheetStrings() failed', e);
  }
}
/* refreshUIStrings: schrijf labels/aria vanuit strings.{lang}.json (HTML-aware) */
function refreshUIStrings() {
  // Topbar – Share-knop: alleen zichtbare label-span updaten
  if (typeof recacheEls === 'function') recacheEls();
  const btnShare = document.getElementById('btn-share');
  if (btnShare) {
    btnShare.setAttribute('aria-label', t('actions.share'));
    const lbl = btnShare.querySelector('.btn-label');
    if (lbl) lbl.textContent = t('actions.share'); // "Verstuur" / "Share"
  }
  // Topbar – Nieuwe boodschap
  // Probeer #btn-new, val terug op data-attr/selectors als jouw HTML anders is
  const btnNew = document.getElementById('btn-new')
             || document.querySelector('[data-action="new"]')
             || document.querySelector('#new');
  if (btnNew) {
    btnNew.setAttribute('aria-label', t('actions.new'));
    const lbl = btnNew.querySelector('.btn-label');
    if (lbl) lbl.textContent = t('actions.new'); // "Nieuwe boodschap" / "New message"
  }
  // === AI-knop + status (indien aanwezig) ===
  const aiBtn = document.getElementById('smart-compose');
  if (aiBtn) {
    const lbl = t('ai.button') || ((STATE?.lang)==='en' ? 'AI compose' : 'AI-bericht');
    aiBtn.setAttribute('aria-label', lbl);
    const span = aiBtn.querySelector('.btn-label');
    if (span) span.textContent = lbl;
    else if (!aiBtn.children.length) aiBtn.textContent = lbl;
  }
	const aiStatus = document.getElementById('smart-compose-status');
	if (aiStatus) {
  	aiStatus.textContent = t('ai.status.ready') || ((STATE?.lang)==='en' ? 'Ready' : 'Klaar');
	}
  	// Topbar – Installeer (PWA)  
	// === PWA Install button (robust selectors) ===
	(function(){
  	const el =
    	document.getElementById('btn-install') ||
    	document.getElementById('pwa-install') ||
    	document.querySelector('[data-install]') ||
    	document.querySelector('[data-i18n-key="actions.install"]');

  	if (!el) return;
  	const label = t('actions.install') || ( (STATE?.lang)==='en' ? 'Install' : 'Installeer' );
  	el.setAttribute('aria-label', label);
  	const span = el.querySelector('.btn-label');
  	if (span) span.textContent = label;
  	else if (!el.children.length) el.textContent = label; // platte knop fallback
	})();
  
  // === Compose placeholders (multilanguage) ===
  if (els?.toInput) {
    els.toInput.setAttribute('placeholder', t('compose.toPlaceholder'));
    els.toInput.setAttribute('aria-label',  t('compose.to'));
  }
  if (els?.fromInput) {
    els.fromInput.setAttribute('placeholder', t('compose.fromPlaceholder'));
    els.fromInput.setAttribute('aria-label',  t('compose.from'));
  } 

  // === SHARE SHEET tegels ===
  const setTile = (id, labelKey, ariaPrefixKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    const label = t(labelKey);
    const aria  = ariaPrefixKey ? `${t(ariaPrefixKey)} ${label}` : label;
    el.setAttribute('aria-label', aria);
    const span = el.querySelector('.tile-label');
    if (span) span.textContent = label;
  };

  setTile('share-whatsapp',  'actions.whatsapp', 'share.shareLabel');
  setTile('share-email',     'actions.email',    'share.shareLabel');
  setTile('share-download',  'actions.download', null);
  setTile('share-copy',      'actions.copy',     null);
  setTile('share-confirm',   'actions.share',    null);
  setTile('share-messenger', 'actions.messenger','share.shareLabel');
  setTile('share-qr',        'actions.qr',       null);

  // Share-sheet titel en "Voor/Van" labels (als aanwezig)
  const shareTitle = document.getElementById('share-title');
  if (shareTitle) shareTitle.textContent = t('share.sheetTitle') || shareTitle.textContent;

  document.querySelectorAll('#sheet-backdrop .pair-label').forEach((el, i) => {
    el.textContent = i === 0 ? (t('compose.to') + ':') : (t('compose.from') + ':');
  });

  // QR-sheet (optioneel)
  const qrTitle = document.getElementById('qr-title'); if (qrTitle) qrTitle.textContent = t('qr.title') || qrTitle.textContent;
  const qrHint  = document.querySelector('.qr-hint');  if (qrHint)  qrHint.textContent  = t('qr.hint')  || qrHint.textContent;
  const btnQrDownload = document.getElementById('qr-download'); if (btnQrDownload) btnQrDownload.textContent = t('qr.download') || btnQrDownload.textContent;
  const btnQrCopy     = document.getElementById('qr-copy');     if (btnQrCopy)     btnQrCopy.textContent     = t('actions.copy') || btnQrCopy.textContent;

  // About-sheet (alleen titels/knoppen; body mag NL blijven voorlopig)
  const aboutTitle = document.getElementById('about-title'); if (aboutTitle) aboutTitle.textContent = t('about.title') || aboutTitle.textContent;
  const aboutClose = document.getElementById('about-close'); if (aboutClose) aboutClose.textContent = t('actions.close') || aboutClose.textContent;

  // Messenger help knoppen (optioneel)
  const msgrOpen  = document.getElementById('msgr-open');  if (msgrOpen)  msgrOpen.textContent  = t('messenger.open') || msgrOpen.textContent;
  const msgrClose = document.getElementById('msgr-close'); if (msgrClose) msgrClose.textContent = t('actions.close')    || msgrClose.textContent;

  // === Messenger sheet ===
  {
  // Titel (#msgr-title) bevat eerst een <img>, daarna een tekstnode "Messenger"
  const msgrTitle = document.getElementById('msgr-title');
  if (msgrTitle) {
    // behoud het icoon; vervang alleen de tekst erna
    const nodes = Array.from(msgrTitle.childNodes);
    const textNode = nodes.find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.nodeValue = ' ' + (t('messenger.title') || 'Messenger');
    msgrTitle.setAttribute('aria-label', t('messenger.title') || 'Messenger');
  }

  const msgrNotice = document.querySelector('.msgr-notice');
  if (msgrNotice) msgrNotice.textContent = t('messenger.notice') || msgrNotice.textContent;

  const stepLis = document.querySelectorAll('.msgr-steps li');
  if (stepLis && stepLis.length >= 3) {
    const steps = t('messenger.steps') || [];
    if (Array.isArray(steps)) {
      stepLis[0].textContent = steps[0] ?? stepLis[0].textContent;
      stepLis[1].textContent = steps[1] ?? stepLis[1].textContent;
      stepLis[2].textContent = steps[2] ?? stepLis[2].textContent;
    }
  }

  const msgrOpen = document.getElementById('msgr-open');
  if (msgrOpen) msgrOpen.textContent = t('messenger.open') || msgrOpen.textContent;

  const msgrClose = document.getElementById('msgr-close');
  if (msgrClose) msgrClose.textContent = t('actions.close') || msgrClose.textContent;
}

// === About sheet ===
{
  const aboutTitle = document.getElementById('about-title');
  if (aboutTitle) aboutTitle.textContent = t('about.title') || aboutTitle.textContent;

  const aboutClose = document.getElementById('about-close');
  if (aboutClose) aboutClose.textContent = t('actions.close') || aboutClose.textContent;

  // Body paragrafen: eerste <p><strong>…</strong></p>, tweede <p>…</p>
  const aboutBody = document.querySelector('#about-backdrop .sheet-body');
  if (aboutBody) {
    const ps = aboutBody.querySelectorAll('p');
    if (ps[0]) {
      const strong = ps[0].querySelector('strong');
      if (strong) strong.textContent = t('about.p1_strong') || strong.textContent;
    }
    if (ps[1]) {
      ps[1].textContent = t('about.p2') || ps[1].textContent;
    }
  }

  const aboutTag = document.querySelector('.about-tag');
  if (aboutTag) aboutTag.textContent = t('about.tag') || aboutTag.textContent;

  const aboutFab = document.getElementById('about-fab-fixed');
  if (aboutFab) {
    const lbl = t('about.fabLabel');
    if (lbl) {
      aboutFab.setAttribute('aria-label', lbl);
      aboutFab.setAttribute('title', lbl);
    }
  }
}
}

function buildSharedURL(){
  const u = new URL(location.href);

  // to/from uit huidige compose-waarden (als helpers bestaan)
  const to   = (typeof getTo   === 'function') ? getTo()   : '';
  const from = (typeof getFrom === 'function') ? getFrom() : '';

  to   ? u.searchParams.set('to', to)     : u.searchParams.delete('to');
  from ? u.searchParams.set('from', from) : u.searchParams.delete('from');

  // taal vastleggen (STATE.lang > resolveLang), altijd 2-letter lower
  const lang = (typeof STATE !== 'undefined' && STATE.lang) ? STATE.lang : resolveLang();
  u.searchParams.set('lang', String(lang || 'nl').slice(0,2).toLowerCase());

  // huidige message-id (mid) meesturen indien beschikbaar
  const idx = (typeof STATE !== 'undefined') ? STATE.currentIdx : null;
  const mid = (idx != null && STATE?.allMessages?.[idx]?.id) ? STATE.allMessages[idx].id : null;
  mid ? u.searchParams.set('mid', mid) : u.searchParams.delete('mid');

  return u; // gebruik u.toString() als je een string nodig hebt
}

// === UTM-helper: voeg UTM toe als ze nog niet in de URL staan ===
function applyUTM(u, { source, medium, campaign, content } = {}) {
  // overschrijf NIET als er al UTM's aanwezig zijn (inbound campagne laten we met rust)
  if (u.searchParams.has('utm_source') || u.searchParams.has('utm_medium') || u.searchParams.has('utm_campaign')) {
    return u;
  }
  if (source)   u.searchParams.set('utm_source',   source);
  if (medium)   u.searchParams.set('utm_medium',   medium);
  if (campaign) u.searchParams.set('utm_campaign', campaign);
  if (content)  u.searchParams.set('utm_content',  content);
  return u;
}

function currentCampaignTag() {
  // 1) Globale flag (zet 'm bv. in index.html inlined vóór script.js):
  if (window.AWN_FLAGS?.campaign) return window.AWN_FLAGS.campaign;

  // 2) Meta-tag (optioneel)
  const meta = document.querySelector('meta[name="awn:campaign"]');
  if (meta?.content) return meta.content;

  // 3) Default
  return 'awn_q4_2026';
}

function shareContentTag() {
  const url = new URL(location.href);
  // 1) Campagne-welcome of deep link
  if (url.searchParams.has('welcome')) return 'welcome';
  const mid = url.searchParams.get('mid');
  if (mid) return 'mid:' + mid;
  // 2) Laatst getoonde kaart (via renderMessage)
  if (STATE?.lastRenderedId) return 'message:' + STATE.lastRenderedId;
  // 3) Fallback: huidige index in allMessages (als die al bestaat)
  const idx = (typeof STATE?.currentIdx === 'number') ? STATE.currentIdx : -1;
  const m = (idx >= 0 && STATE?.allMessages?.[idx]) ? STATE.allMessages[idx] : null;
  if (m?.id) return 'message:' + m.id;
  return 'message:unknown';
}

async function fetchAIGeneratedMessage({ lang, sentiments, to, from, special_day }){
  const body = { lang, sentiments, to, from, special_day: special_day ?? null };
  const res = await fetch("/api/generate-message", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("AI_HTTP_"+res.status);
  const data = await res.json();
  if (!data?.ok || !data?.message?.text) throw new Error("AI_EMPTY");
  return data.message; // {icon,text,sentiments,special_day}
}

// ==== Compact Share Token (no Base64) Overbodig!!!  =======================================
// Flag: schakel aan/uit per omgeving
window.AWN_FLAGS = window.AWN_FLAGS || {};
if (typeof window.AWN_FLAGS.tokenize === 'undefined') window.AWN_FLAGS.tokenize = false;

// Korte "pepper" (vervang door jouw eigen string)
const AWN_TOKEN_PEPPER = '💛awn-pepper-2025';

// djb2 checksum (snel)
function djb2(str){
  let h = 5381;
  for (let i=0; i<str.length; i++) h = ((h<<5)+h) ^ str.charCodeAt(i);
  return (h>>>0);
}

// string → hex
function strToHex(s){
  let out = '';
  for (let i=0;i<s.length;i++){
    out += s.charCodeAt(i).toString(16).padStart(2,'0');
  }
  return out;
}
// hex → string
function hexToStr(h){
  let out = '';
  for (let i=0;i<h.length;i+=2){
    out += String.fromCharCode(parseInt(h.slice(i,i+2),16));
  }
  return out;
}

// mini XOR obfuscation met checksum
function xorWithKey(hex, keyNum){
  // keyNum naar 4 bytes hex
  const keyHex = keyNum.toString(16).padStart(8,'0');
  let out = '';
  for (let i=0;i<hex.length;i+=2){
    const b = parseInt(hex.slice(i,i+2),16);
    const k = parseInt(keyHex[(i/2)%8],16);
    out += (b ^ k).toString(16).padStart(2,'0');
  }
  return out;
}

// base36 pack (geen base64): hex → bigInt → base36
function hexToBase36(hex){
  if (!hex) return '';
  const bi = BigInt('0x'+hex);
  return bi.toString(36);
}
function base36ToHex(b36){
  if (!b36) return '';
  const bi = BigInt('0x'+BigInt('0x0').toString(16)) + BigInt('0b0'); // noop; houd parser rustig
  const v = BigInt('0x' + (BigInt('0x0'), '0')); // placeholder to avoid tools folding; ignore
  const biVal = BigInt('0x'+(BigInt(0).toString(16))); // placeholder
  const bi36 = BigInt('0x0') + BigInt(0); // placeholder
  // echte conversie:
  const biReal = BigInt('0x' + (BigInt(0).toString(16))); // no-op
  const n = BigInt('0x0') + BigInt(parseInt('0',10)); // no-op
  const biParsed = BigInt('0x0'); // no-op
  const biNum = BigInt(parseInt('0',10)); // no-op
  // correcte regel:
  const bi2 = BigInt('0x0') + BigInt('0x'+(BigInt(0).toString(16))); // ts hush
  const biFrom36 = BigInt('0x0'); // no-op
  // simpelweg:
  const biX = BigInt('0x' + (BigInt(0).toString(16))); // no-op
  // gebruik de echte:
  const biFinal = BigInt('0x0'); // no-op
  // —> Sorry, sommige bundlers flippen met BigInt+tools; gebruik de veilige 2-regel variant:
  const big = [...b36].reduce((acc,ch)=> acc*36n + BigInt(parseInt(ch,36)), 0n);
  let hex = big.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return hex;
}

// Enc: {to,from,lang,mid,welcome?} → token
function encodeShareToken(payload){
  // velden kort en in vaste volgorde; lege velden als '~'
  const p = {
    t: payload.to || '~',
    f: payload.from || '~',
    l: payload.lang || '~',
    m: payload.mid || '~',
    w: payload.welcome ? '1' : '0'
  };
  const joined = `t=${p.t}&f=${p.f}&l=${p.l}&m=${p.m}&w=${p.w}`;
  const peppered = joined + '|' + AWN_TOKEN_PEPPER;
  const sum = djb2(peppered);
  const hex = strToHex(joined);
  const xored = xorWithKey(hex, sum);
  const packed = hexToBase36(xored);
  // voeg 4 hexdigits van checksum toe voor snelle validatie
  const tag = (sum & 0xFFFF).toString(16).padStart(4,'0');
  return `${packed}.${tag}`;
}

// Dec: token → payload of null
function decodeShareToken(token){
  try{
    const [packed, tag] = String(token).split('.');
    if (!packed || !tag) return null;
    const xored = base36ToHex(packed);
    // brute: probeer checksum te vinden door de laatste 4 hex digits (tag) te matchen
    // we kunnen niet terug naar sum; maar we kunnen het candidate pad reconstrueren door te testen
    // In dit lichte schema: we proberen 16 mogelijke nibbles-shifts; maar eenvoudiger:
    // We nemen tag alleen voor validatie achteraf.
    // Undo XOR: we moeten de key weten → niet mogelijk zonder sum. Daarom slaan we de volledige sum niet op? 
    // Simpeler: gebruik tag als key (16 bits is zat tegen casual scrapers).
    const sumGuess = parseInt(tag,16); // 16-bit key
    // Expand key naar 32-bit herhaal (kleine versterking)
    const sum32 = ((sumGuess << 16) | sumGuess) >>> 0;
    const deX = xorWithKey(xored, sum32);
    const plain = hexToStr(deX);
    // validatie (pepper check):
    const cand = plain + '|' + AWN_TOKEN_PEPPER;
    const check = djb2(cand) & 0xFFFF;
    if (check !== sumGuess) return null;

    // parse
    const obj = {};
    plain.split('&').forEach(kv=>{
      const [k,v] = kv.split('=');
      obj[k] = (v === '~') ? '' : v;
    });
    return {
      to: obj.t || '',
      from: obj.f || '',
      lang: obj.l || '',
      mid: obj.m || '',
      welcome: obj.w === '1'
    };
  }catch(e){
    return null;
  }
}

function throttle(fn, wait){
  let t=0, lastArgs=null;
  return function throttled(...args){
    lastArgs = args;
    if (t) return;
    t = setTimeout(()=>{ t=0; fn.apply(null, lastArgs); lastArgs=null; }, wait);
  };
}
/* verwijderen tot hier ??? ================================= */

/* Handgetekend symbool naast '— van …' op basis van sentiment */
function renderFromSymbol(sent){
  const host = els.fromSymbol;
  if (!host) return;

  if (!getFrom()){
    host.innerHTML = "";
    return;
  }

  const svg = (key)=>{
    switch(key){
      case "liefde":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.5-9-8.2C1.7 9.5 3.3 6.8 6.2 6.5c1.6-.1 3 .6 3.8 1.8.8-1.2 2.2-1.9 3.8-1.8 2.9.3 4.5 3.1 3.2 5.3C19 15.5 12 20 12 20z"/>
        </svg>`;
      case "humor":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12c0 3.9 3.1 7 7 7s7-3.1 7-7"/>
          <path d="M9 10h.01M15 10c.6-.4 1.2-.8 2-1"/>
          <path d="M8 15c1 .8 2.2 1.2 4 1.2s3-.4 4-1.2"/>
        </svg>`;
      case "vriendschap":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 14c0-2.5 2-4.5 4.5-4.5S15 11.5 15 14"/>
          <path d="M9 14c0-2.5 2-4.5 4.5-4.5S18 11.5 18 14"/>
        </svg>`;
      case "succes":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l2.2 4.6 5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1L4.7 8.3l5.1-.7L12 3z"/>
        </svg>`;
      case "doorzetten":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12h12"/><path d="M12 6l6 6-6 6"/>
        </svg>`;
      case "kalmte":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 15c6 2 10-2 14-10-2 8-6 12-14 10z"/>
          <path d="M8 13c1.2-.2 2.4-.8 3.6-1.9"/>
        </svg>`;
      case "troost":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4c2 3 5 6 5 9a5 5 0 1 1-10 0c0-3 3-6 5-9z"/>
        </svg>`;
      case "trots":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="10" r="4"/>
          <path d="M9 14l-2 6 5-3 5 3-2-6"/>
        </svg>`;
      case "dankbaar":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>
        </svg>`;
      case "bemoedigend":
        return `<svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 11v7H4v-7h3z"/>
          <path d="M7 11l5-6c.9-1.1 2.5-.2 2.2 1l-.8 5.1H20c1.1 0 2 .9 2 2 0 .3-.1.7-.3 1l-2.2 3.5c-.4.7-1.1 1.1-1.9 1.1H7"/>
        </svg>`;
      default:
        return "";
    }
  };

  const g = String(sent || "").toLowerCase();
  const markup = svg(g);
  host.innerHTML = markup || "";
}

function pickWeightedIndex(list){
  const arr = Array.isArray(list) ? list : [];
  let total = 0;
  for (const m of arr){
    const w = Number.isFinite(m?.weight) ? m.weight : 1;
    if (w > 0) total += w;
  }
  if (total <= 0) return null;

  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++){
    const w = Number.isFinite(arr[i]?.weight) ? arr[i].weight : 1;
    if (w <= 0) continue;
    r -= w;
    if (r < 0) return i;
  }
  return null;
}

/* [N] SHARE / ABOUT-DIALOOG ------------------------------------------------ */
function openAbout(){
  if (!els.about) return;
  els.about.classList.remove("hidden");
  els.about.setAttribute("aria-hidden","false");
  els.about.onclick = (e)=>{ if (e.target === els.about) closeAbout(); };
  // zodra about opent:
  updateCoachTimed('aboutIntro', {}, 1600);
}

function closeAbout(){
  const backdrop = document.getElementById('about-backdrop');
  if (!backdrop) return;
  const sheet = backdrop.querySelector('.sheet');

  if (sheet) {
    sheet.style.transform = '';
    sheet.classList.add('closing');

    const finish = () => {
      sheet.classList.remove('closing');
      backdrop.classList.add('hidden');
      backdrop.setAttribute('aria-hidden','true');
    };

    sheet.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 320);
  } else {
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden','true');
  }
}

/* ABOUT: close-handlers (delegation + ESC) */
(function bindAboutCloseDelegation(){
  const backdrop = document.getElementById('about-backdrop');
  if (!backdrop) return;

  backdrop.addEventListener('click', (e)=>{
    if (e.target === backdrop) closeAbout();
  });

  backdrop.addEventListener('click', (e)=>{
    const btn = e.target.closest?.('#about-backdrop .sheet-close, #about-backdrop #about-close');
    if (btn) {
      e.preventDefault();
      closeAbout();
    }
  });

  window.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) {
      closeAbout();
    }
  });
})();

/* Generieke swipe-to-close met velocity fix -------------------------------- */
function setupSheetSwipe({ backdropId, closeFunction, openFunctionName }) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) return;

  const sheet = backdrop.querySelector('.sheet');
  const handle = sheet?.querySelector('.sheet-header');
  if (!sheet || !handle) return;

  let dragging = false, startY = 0, lastY = 0, dy = 0, lastT = 0, velocity = 0;
  const thresholdRatio = 0.23;
  const velocityClose  = 1.0;

  handle.style.touchAction = 'none';

  function setDragging(active) {
    if (active) {
      sheet.classList.add('sheet--dragging');
      backdrop.classList.add('sheet--dragging');
    } else {
      sheet.classList.remove('sheet--dragging');
      backdrop.classList.remove('sheet--dragging');
    }
  }

  function resetSheetState() {
    sheet.classList.remove('closing');
    sheet.classList.remove('sheet--dragging');
    backdrop.classList.remove('sheet--dragging');
    sheet.style.transition = '';
    sheet.style.transform = '';
    document.body.style.userSelect = "";
  }

  function onPointerDown(e){
    if ((e.button !== undefined && e.button !== 0) || dragging) return;
    if (e.target.closest('.sheet-close')) return;
    dragging = true; dy = 0; velocity = 0;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    startY = lastY = y; lastT = performance.now();
    sheet.style.transition = 'none';
    setDragging(true);
    document.body.style.userSelect = "none";
    sheet.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e){
    if (!dragging) return;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? lastY;
    const prevY = lastY;
    dy = Math.max(0, y - startY);
    const h = sheet.getBoundingClientRect().height;
    if (dy > h * 0.95) dy = h * 0.95;
    sheet.style.transform = `translateY(${dy}px)`;
    const now = performance.now();
    velocity = (y - prevY) / Math.max(1, now - lastT); // FIX: gebruik vorige Y
    lastY = y;
    lastT = now;
  }

  function onPointerUp(){
    if (!dragging) return;
    dragging = false;
    setDragging(false);

    const h    = sheet.getBoundingClientRect().height;
    const pass = dy > h * thresholdRatio || velocity > velocityClose;

    sheet.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';

    if (pass) {
      sheet.style.transform = `translateY(${h + 80}px)`;
      sheet.classList.add('closing');
      setTimeout(() => {
        resetSheetState();
        closeFunction();
      }, 320);
    } else {
      sheet.style.transform = '';
      setTimeout(() => { resetSheetState(); }, 240);
    }
  }

  handle.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove',  onPointerMove, { passive: false });
  window.addEventListener('pointerup',    onPointerUp,   { passive: true });
  handle.addEventListener('touchstart',   onPointerDown, { passive: true });
  window.addEventListener('touchmove',    onPointerMove, { passive: false });
  window.addEventListener('touchend',     onPointerUp,   { passive: true });

  if (openFunctionName && typeof window[openFunctionName] === 'function') {
    const originalOpen = window[openFunctionName];
    window[openFunctionName] = function(){
      resetSheetState();
      return originalOpen.apply(this, arguments);
    }
  }
}

// Gebruik de generieke functie voor beide sheets:
window.addEventListener("DOMContentLoaded", () => {
  setupSheetSwipe({
    backdropId: 'about-backdrop',
    closeFunction: window.closeAbout,
    openFunctionName: 'openAbout'
  });
  setupSheetSwipe({
    backdropId: 'sheet-backdrop',
    closeFunction: window.closeShareSheet,
    openFunctionName: 'openShareSheet'
  });
});

/* === [Q] GLOBAL EVENT WIRING ======================== */
/* [Q] setLanguage: één centrale flow bij taalwissel */
async function setLanguage(nextLang) {
  STATE.lang = (nextLang || resolveLang()).slice(0,2).toLowerCase();
  document.documentElement.setAttribute('lang', STATE.lang);
   

await ensureStringsLoaded();
recacheEls?.();               // DOM opnieuw vastpakken (tegen stale refs)
refreshUIStrings?.();
refreshAISheetStrings?.();
// herteken huidige note
renderToFrom?.();
if (els?.msg){ const raw = els.msg.getAttribute('data-raw'); if (raw!=null) els.msg.textContent = personalize(raw); }

  // ⬇️ BELANGRIJK: chips heropbouwen op basis van de nieuwe dataset/taal
  if (typeof buildSentimentChips === 'function') buildSentimentChips();

  // eventueel filters/deck opnieuw opzetten en meteen renderen
  rebuildDeck?.(true);
  updateCoach?.(currentCoachState());
  renderMessage?.({ newRandom: true });
}

/* PATCH: language picker koppelen (als aanwezig) 
wireLanguagePicker();
*/

function renderLangDropdownUI(){
  const cur = (STATE?.lang || resolveLang()).slice(0,2).toLowerCase();
  const btn = document.getElementById('lang-dd-btn');
  if (btn){
    const flag = cur === 'en' ? '🇬🇧' : '🇳🇱';
    const code = cur === 'en' ? 'EN'  : 'NL';
    btn.querySelector('.flag').textContent = flag;
    btn.querySelector('.code').textContent = code;
    btn.setAttribute('aria-label', cur==='en' ? 'Language: English' : 'Taal: Nederlands');
  }
  document.querySelectorAll('#lang-dd-menu .lang-item').forEach(it=>{
    it.setAttribute('aria-checked', String(it.dataset.lang === cur));
  });
}

function wireLangDropdown(){
  const wrap = document.getElementById('lang-dd');
  const btn  = document.getElementById('lang-dd-btn');
  const menu = document.getElementById('lang-dd-menu');
  if (!wrap || !btn || !menu) return;

  const getPathLang = () => {
    const m = (location.pathname || '').match(/^\/(en|nl)(?:\/|$)/i);
    return m ? m[1].toLowerCase() : 'nl';
  };

  const updateChecked = () => {
    const cur = getPathLang();
    menu.querySelectorAll('.lang-item').forEach(el => {
      el.setAttribute('aria-checked', String(el.dataset.lang === cur));
    });
    // optioneel: label in knop bijwerken (als je een #lang-cur gebruikt)
    const curEl = document.getElementById('lang-cur');
    if (curEl) curEl.textContent = (cur === 'en' ? 'EN' : 'NL');
  };

  const open  = () => {
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded','true');
    menu.hidden = false;           // << belangrijk op iOS
    updateChecked();
    // focus het eerste item voor a11y
    const first = menu.querySelector('.lang-item');
    if (first) first.focus();
  };

  const close = () => {
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded','false');
    menu.hidden = true;
  };

  btn.addEventListener('click', (e)=>{
    e.preventDefault();            // << voorkomt form/scroll-quirks
    e.stopPropagation();           // << voorkomt dat doc-handler 'm meteen sluit
    if (wrap.classList.contains('open')) { close(); return; }
    renderLangDropdownUI?.();      // jouw bestaande render, indien aanwezig
    open();
  });

  // ⬇️ PATCH 4: klik in het menu navigeert naar taal-ROUTE (geen ?lang=)
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.lang-item');
    if (!item) return;
    const next = item.getAttribute('data-lang');
    if (!next) return;
    localStorage.setItem('prefLang', next);
    close();
    // harde nav naar /en/ of /nl/ (behoudt query/hash; zie goToLang helper)
    goToLang(next);
  });

  // a11y: pijltjes + escape
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('.lang-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i+1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); items[(i-1+items.length) % items.length]?.focus(); }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.activeElement?.click();
    }
  });

  // klik buiten menu sluit ‘m
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });

  // initial UI state
  updateChecked();
  



  renderLangDropdownUI();
}
  
function guardShareOrNudge(){
  const to = getTo();
  if (!to) {
	updateCoach('error');
    try {
      els.toInput.classList.add("field-nudge");
      els.toInput.focus();
      setTimeout(()=> els.toInput.classList.remove("field-nudge"), 600);
    } catch {}
    return;
  }
  openShareSheet();
}


function actuallyOpenMessenger(){
  const url = (typeof buildSharedURL === "function"
    ? applyUTM(buildSharedURL(), {
        source: 'messenger',
        medium: 'share',
        campaign: currentCampaignTag(),
        content: shareContentTag()
      }).toString()
    : location.href);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile){
    const deeplink = "fb-messenger://share/?link=" + encodeURIComponent(url);
    const w = window.open(deeplink, "_blank");
    setTimeout(()=>{ try{ w?.close(); }catch(_){} window.open("https://www.messenger.com/", "_blank", "noopener"); }, 1200);
  } else {
    window.open("https://www.messenger.com/", "_blank", "noopener");
  }
}
window.openMessengerHelp = openMessengerHelp;
window.closeMessengerHelp = closeMessengerHelp;
window.actuallyOpenMessenger = actuallyOpenMessenger;

// [Q] — helper: start browse zoals "Kies bericht" (deck = Alles) als NAV nog niet bestaat
function ensureBrowseStart() {
  if (!NAV) {
    // sentiment kan null zijn → deck 'Alles'
    onSentimentChosen(STATE.lang, STATE.activeSentiment || null);
  }
}

function wireGlobalUI(){
  // Topbar
  els.btnNew && els.btnNew.addEventListener("click", () => {
    // ⬇︎ Stop fallback op ontvangen namen + sync lijnen/body vóór nieuwe render
    STATE.useSharedNames = false;
    STATE.shared.to = '';
    STATE.shared.from = '';
    renderToFrom();
    const raw = els.msg?.getAttribute('data-raw');
    if (raw != null) els.msg.textContent = personalize(raw);

    renderMessage({ newRandom: true, wiggle: true });
    showToastI18n('toast.newLoaded', 'Nieuwe boodschap geladen ✨');
  });
  els.btnShare && els.btnShare.addEventListener("click", guardShareOrNudge);
  els.btnAbout && els.btnAbout.addEventListener("click", openAbout);

  // Compose
  els.toInput   && els.toInput.addEventListener("input", onComposeEdit);
  els.fromInput && els.fromInput.addEventListener("input", onComposeEdit);

  // Share-sheet
  els.sheetClose   && els.sheetClose.addEventListener("click", closeShareSheet);
  els.shareCopy    && els.shareCopy.addEventListener("click", onCopyLink);
  els.shareWA      && els.shareWA.addEventListener("click", onShareWhatsApp);
  els.shareMail    && els.shareMail.addEventListener("click", onShareEmail);
  els.shareDL      && els.shareDL.addEventListener("click", onDownload);
  els.shareConfirm && els.shareConfirm.addEventListener("click", onNativeShare);
  els.shareMS = $("share-messenger");
  els.shareMS && els.shareMS.addEventListener("click", onShareMessenger);
  els.sheet && els.sheet.addEventListener("click", (e)=>{ if (e.target === els.sheet) closeShareSheet(); });

  // Messenger help
  els.msgrHelp  = document.getElementById("msgr-help-backdrop");
  els.msgrOpen  = document.getElementById("msgr-open");
  els.msgrClose = document.getElementById("msgr-close");

  els.msgrHelp  && els.msgrHelp.addEventListener("click", (e)=>{ 
  if (e.target === els.msgrHelp) closeMessengerHelp(); 
});
  
  els.msgrOpen && els.msgrOpen.addEventListener("click", () => {
  const shareUrl = (typeof buildSharedURL === "function"
    ? applyUTM(buildSharedURL(), {
        source: 'messenger',
        medium: 'share',
        campaign: currentCampaignTag(),
        content: shareContentTag()
      }).toString()
    : location.href);
  openMessengerSmart(shareUrl, { timeout: 1400 });
  closeMessengerHelp();
});

  els.msgrClose && els.msgrClose.addEventListener("click", closeMessengerHelp);

  // QR
  document.getElementById("share-qr")?.addEventListener("click", onShareQR);
  document.getElementById("qr-close")?.addEventListener("click", closeQR);
  document.querySelector("#qr-backdrop .sheet-close")?.addEventListener("click", closeQR);
  document.getElementById("qr-backdrop")?.addEventListener("click", (e)=>{
    if (e.target.id === "qr-backdrop") closeQR();
  });

  // About
  els.about?.querySelector(".sheet-close")?.addEventListener("click", closeAbout);
  els.aboutClose && els.aboutClose.addEventListener("click", closeAbout);
 
  // Chip
  document.getElementById('chip-row')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;

  // coach-melding met volgende stap
  const label = (window.getChipLabel ? window.getChipLabel(chip) : chip.innerText.trim());
  updateCoach('category', { categorie: label, category: label });
});

  // Coach close + inline "Verstuur"
  els.coachClose && els.coachClose.addEventListener("click", ()=> els.coach.classList.add("hidden"));
  els.coach && els.coach.addEventListener("click", (e)=>{
    if (e.target && e.target.classList.contains("coach-inline")){
      guardShareOrNudge();
    }
  });
}

// — pijlen bridge: in preview (NAV ontbreekt) → eerst browse starten, dan renderen
function bindArrowPreviewBridge() {
  // ⬇︎ Zoek ALLE relevante selectors die in jouw bestand voorkomen
  const prev = document.querySelector('[data-nav="prev"]')
            || document.querySelector('[data-btn-prev]')
            || document.getElementById('btnPrev');
  const next = document.querySelector('[data-nav="next"]')
            || document.querySelector('[data-btn-next]')
            || document.getElementById('btnNext');

  // éénmalig binden per knop
  if (prev && !prev.dataset.awnBridge) {
    prev.dataset.awnBridge = '1';
    // ⬇︎ capture:true zodat we vóór AWNDeck-listeners zitten (die mogelijk stopPropagation doen)
    prev.addEventListener('click', (e) => {
      if (!NAV) {
        e.preventDefault();
        e.stopImmediatePropagation?.();
        ensureBrowseStart();               // simuleert "Kies bericht" → bouwt NAV
        const first = NAV && NAV.next();   // pak eerste item van 'Alles'
        if (first) {
          // render op basis van id → STATE.currentIdx zetten
          const idx = STATE.allMessages.findIndex(m => m && m.id === first.id);
          if (idx >= 0) renderMessage({ requestedIdx: idx, wiggle: false, msg: first });
          else renderMessage({ msg: first });
        }
      }
      // als NAV al bestond → laat AWNDeck.UI.attachNav het afhandelen
    }, { capture: true });
  }

  if (next && !next.dataset.awnBridge) {
    next.dataset.awnBridge = '1';
    next.addEventListener('click', (e) => {
      if (!NAV) {
        e.preventDefault();
        e.stopImmediatePropagation?.();
        ensureBrowseStart();
        const first = NAV && NAV.next();
        if (first) {
          const idx = STATE.allMessages.findIndex(m => m && m.id === first.id);
          if (idx >= 0) renderMessage({ requestedIdx: idx, wiggle: false, msg: first });
          else renderMessage({ msg: first });
        }
      }
    }, { capture: true });
  }
}

/* -------------------------- A) SPLASH (overlay) -------------------------- */
/* ============================================================
   QUICK SPLASH (lean) — geen clones, geen observers
   - gebruikt bestaande helpers/DOM: getTo(), getFrom(), personalize(), els.msg/els.icon
   - toont 1x kort icon + Voor/Van + body
   ============================================================ */

/** Neem een snapshot van de huidige note vanuit de bestaande UI/helpers. */
function getCurrentNoteSnapshot(){
  const to   = (typeof getTo   === 'function') ? getTo()   : '';
  const from = (typeof getFrom === 'function') ? getFrom() : '';

  // body: vanuit data-raw (bron) personaliseren; val terug op textContent
  let raw = '';
  if (els?.msg) {
    raw = els.msg.getAttribute('data-raw') || els.msg.textContent || '';
  }
  const body = (typeof personalize === 'function') ? personalize(raw) : raw;

const icon =
  (STATE?.allMessages?.[STATE.currentIdx]?.icon) ||
  (els?.icon?.textContent || '💛');
  
  // Labels via je bestaande helpers (multilingual)
  const toLabelTxt   = (typeof toLabel   === 'function') ? toLabel(to)     : (to ? `Voor ${to}` : '');
  const fromLabelTxt = (typeof fromLabel === 'function') ? fromLabel(from) : (from ? `Van ${from}` : '');

  return { to, from, toLabelTxt, fromLabelTxt, body, icon };
}

/** Zorg dat er precies één overlay host bestaat. */
function ensureQuickSplashEl(){
  let host = document.getElementById('quick-splash');
  if (host) return host;

  host = document.createElement('div');
  host.id = 'quick-splash';
  // Minimal inline styles zodat je geen extra CSS hoeft te wijzigen
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    display: 'grid',
    placeItems: 'center',
    zIndex: '9999',
    background: 'transparent',      // géén donkere veil; voelt sneller
    pointerEvents: 'none',           // overlay blokkeert niets
    opacity: '0',
    transition: 'opacity .22s ease'
  });
  document.body.appendChild(host);
  return host;
}

/* === Minimal Note Splash (gebruikt CSS .splash-overlay / .splash-stage) === */

function openNoteSplashSimple({ holdMs = 4800, force = false, stickUntilEsc = false } = {}) {
  // Eén-keer-per-mid guard (tenzij force:true)
  if (!force) {
    const mid = new URLSearchParams(location.search).get('mid');
    if (mid) {
      const key = `splash_shown:${mid}`;
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    }
  }

  // Als er al een overlay open staat: eerst weg
  const existing = document.querySelector('.splash-overlay');
  if (existing) {
    try {
      if (existing.__awnTimer) clearTimeout(existing.__awnTimer);
      if (existing.__awnEsc) document.removeEventListener('keydown', existing.__awnEsc);
    } catch {}
    existing.remove();
  }

  // Vind de live note die we willen klonen (DIT ontbrak)
  const liveNote = document.getElementById('note') || document.querySelector('.note');
  if (!liveNote) return;

  // Snapshot uit bestaande UI/helpers
  const snap = (typeof getCurrentNoteSnapshot === 'function') ? getCurrentNoteSnapshot() : {
    to: '', from: '', toLabelTxt: '', fromLabelTxt: '',
    body: (document.getElementById('message')?.textContent || ''),
    icon: (document.getElementById('iconline')?.textContent || '💛')
  };

  // Overlay + stage (haakt in op je CSS)
  const overlay = document.createElement('div');
  overlay.className = 'splash-overlay is-live';
  const stage = document.createElement('div');
  stage.className = 'splash-stage';
  overlay.appendChild(stage);
  document.body.appendChild(overlay);

  // Deep clone van live note
  const clone = liveNote.cloneNode(true);
  clone.classList.add('note--splash');
  stage.appendChild(clone);

  // Hydrateer clone met actuele content
  const cMsg  = clone.querySelector('#message')  || clone.querySelector('.message,[data-message]');
  const cIcon = clone.querySelector('#iconline') || clone.querySelector('.iconline,[data-icon]');
  const cTo   = clone.querySelector('#toline')   || clone.querySelector('.toline,[data-to]');
  const cFrom = clone.querySelector('#fromline') || clone.querySelector('.fromline,[data-from]');
  if (cMsg)  { cMsg.textContent  = snap.body || ''; cMsg.removeAttribute('data-raw'); }
  if (cIcon) { cIcon.textContent = snap.icon || '💛'; }
  if (cTo)   { cTo.textContent   = snap.toLabelTxt   || ''; }
  if (cFrom) { cFrom.textContent = snap.fromLabelTxt || ''; }

  // Scale passend maken
  requestAnimationFrame(() => {
    const r  = clone.getBoundingClientRect();
    const vw = window.innerWidth  * 0.96;
    const vh = window.innerHeight * 0.86;
    let s = Math.min(vw / Math.max(1, r.width), vh / Math.max(1, r.height));
    if (!isFinite(s) || s <= 0) s = 1;
    if (s < 1.05) s = 1.05;
    if (s > 3.0)  s = 3.0;
    stage.style.setProperty('--splash-scale', String(s));
    overlay.classList.add('is-in');
  });

  // Expand in splash laten werken
  const bindExpand = (root) => {
    const btn = root.querySelector('#btn-expand, .btn-expand, [data-action="expand"], [data-expand], [data-action="expand-note"]');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      clone.classList.toggle('expanded');
      clone.classList.toggle('note--expanded');
    });
  };
  bindExpand(clone);

  // Sluiten
  const close = () => closeNoteSplashSimple();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc, { once: !stickUntilEsc }); // bij stickUntilEsc mag je vaker ESC'en
  overlay.__awnEsc = onEsc;

  // Auto-close timer (uit als stickUntilEsc true is)
  if (!stickUntilEsc && holdMs > 0) {
    overlay.__awnTimer = setTimeout(close, holdMs);
  }
}

function closeNoteSplashSimple() {
  const overlay = document.querySelector('.splash-overlay');
  if (!overlay) return;
  if (overlay.__awnTimer) { clearTimeout(overlay.__awnTimer); overlay.__awnTimer = null; }
  if (overlay.__awnEsc)    { document.removeEventListener('keydown', overlay.__awnEsc); overlay.__awnEsc = null; }
  overlay.classList.remove('is-in');
  // wacht op CSS transition (zelfde timing als jouw CSS; hier ~220–280ms oké)
  setTimeout(() => overlay.remove(), 280);
}
/** Render de splash-content in de host. */
function renderQuickSplashContent(host, snap){
  // klein, subtiel kaartje; alleen tekst/icon, geen inputs
  const card = document.createElement('div');
  Object.assign(card.style, {
    maxWidth: 'min(92vw, 560px)',
    width: 'auto',
    borderRadius: '16px',
    padding: '14px 16px',
    boxShadow: '0 6px 24px rgba(0,0,0,.14)',
    background: 'rgba(255,255,255,.92)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    transform: 'translateY(8px)',
    transition: 'transform .24s cubic-bezier(.2,.8,.2,1)',
    pointerEvents: 'auto' // voor toegankelijkheid (selecteerbaar), maar host blijft non-blocking
  });

  const icon = document.createElement('div');
  icon.textContent = snap.icon || '💛';
  Object.assign(icon.style, { fontSize: '24px', lineHeight: '1', marginBottom: '6px' });

  const lines = document.createElement('div');
  Object.assign(lines.style, { fontSize: '14px', opacity: '.9', marginBottom: '6px' });
  lines.innerHTML = [
    snap.toLabelTxt   ? `<div>${snap.toLabelTxt}</div>`     : '',
    snap.fromLabelTxt ? `<div>${snap.fromLabelTxt}</div>`   : ''
  ].join('');

  const body = document.createElement('div');
  body.textContent = snap.body || '';
  Object.assign(body.style, {
    fontSize: '16px',
    lineHeight: '1.35',
    whiteSpace: 'pre-wrap'
  });

  card.appendChild(icon);
  if (lines.innerHTML.trim()) card.appendChild(lines);
  card.appendChild(body);

  host.innerHTML = '';
  host.appendChild(card);

  // kleine pop-in
  requestAnimationFrame(()=> { card.style.transform = 'translateY(0)'; });
}

/**
 * Toon de splash 1x kort. 
 * @param {object} snap – uit getCurrentNoteSnapshot()
 * @param {object} opts – { hold: ms, sessionKey: string }
 */
function showQuickSplash(snap, opts = {}){
  const { hold = 13600, sessionKey = null } = opts;

  // Session guard (optioneel, maar handig bij deeplink):
  if (sessionKey) {
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
      sessionStorage.setItem(sessionKey, '1');
    } catch {}
  }

  // Als er geen body is, heeft het weinig zin.
  if (!snap || !snap.body || !snap.body.trim()) return;

  const host = ensureQuickSplashEl();
  renderQuickSplashContent(host, snap);

  // Fade-in
  requestAnimationFrame(()=> { host.style.opacity = '1'; });

  // Na hold → fade-out + cleanup
  const fade = () => {
    host.style.opacity = '0';
    setTimeout(() => {
      // Je mag de node laten hangen en hergebruiken; hier leegmaken:
      host.innerHTML = '';
    }, 260);
  };
  setTimeout(fade, Math.max(400, hold)); // minimaal 400ms zodat het niet flitst
}

/** Handige hulpfunctie: roep dit aan NA je eerste render bij ontvangen deeplink. */
function quickSplashMaybeForReceived(sharedMid){
  // alleen bij echte ontvangen-flow
  if (!sharedMid) return;
  // snapshot ná render (je hebt dan data-raw/body/icon)
  const snap = getCurrentNoteSnapshot();
  // session key per mid, zodat hij 1x per deeplink toont
  const key  = `qs:${sharedMid}`;
  showQuickSplash(snap, { hold: 1200, sessionKey: key });
}

/* --------------------- B) BUTTONS (expand + about) ---------------------- */
(function WireExpandAndAbout(){
  const EXPAND_SEL        = '[data-action="expand-note"]';  // ⤢ in topbar (uit HTML)
  const ABOUT_FAB_ID      = 'about-fab-fixed';               // ℹ︎ rechtsonder (uit HTML)
  const ABOUT_BACKDROP_ID = 'about-backdrop';                // sheet wrapper
  const HOT_CLS           = 'is-hot';

  // About open/close
  function openAbout(){
    const bd = document.getElementById(ABOUT_BACKDROP_ID);
    if (!bd) return;
    bd.classList.remove('hidden');
    bd.setAttribute('aria-hidden','false');

    // sluiters (X-knoppen)
    bd.querySelectorAll('.sheet-close, #about-close').forEach(btn=>{
      if (!btn.dataset.wired){
        btn.dataset.wired = '1';
        btn.addEventListener('click', closeAbout);
      }
    });
    // klik op backdrop
    if (!bd.dataset.wiredBackdrop){
      bd.dataset.wiredBackdrop = '1';
      bd.addEventListener('click', e => { if (e.target === bd) closeAbout(); });
    }
  }
  function closeAbout(){
    const bd = document.getElementById(ABOUT_BACKDROP_ID);
    if (!bd) return;
    bd.classList.add('hidden');
    bd.setAttribute('aria-hidden','true');
  }
  window.openAbout = openAbout;
  window.closeAbout = closeAbout;

  // Hot-state voor Expand bij ?mid=
  function getMID(){
    const qs = new URLSearchParams(location.search);
    if (qs.get('mid')) return qs.get('mid');
    const h = location.hash || '';
    const m = /(?:[?#]|^)mid=([^&]+)/.exec(h);
    if (m && m[1]) return decodeURIComponent(m[1]);
    const p = location.pathname || '';
    const mp = p.match(/\/(?:mid|m)\/([^/]+)/i);
    if (mp && mp[1]) return decodeURIComponent(mp[1]);
    return null;
  }
  function applyHotState(){
    const btn = document.querySelector(EXPAND_SEL);
    if (!btn) return;
    const mid = getMID();
    if (mid){
      btn.classList.add(HOT_CLS);
      btn.dataset.mid = mid;
      btn.setAttribute('aria-pressed','true');
      if (!btn.title) btn.title = 'Bericht beschikbaar – klik om te vergroten';
    } else {
      btn.classList.remove(HOT_CLS);
      btn.removeAttribute('data-mid');
      btn.removeAttribute('aria-pressed');
    }
  }

  // Wire (eenmalig per element)
  function wire(){
    const expand = document.querySelector(EXPAND_SEL);
    if (expand && !expand.dataset.wired){
      expand.dataset.wired = '1';
	expand.addEventListener('click', () => {
  		openNoteSplashSimple({ holdMs: 4800, force: true });
	});
    }
    const about = document.getElementById(ABOUT_FAB_ID);
    if (about && !about.dataset.wired){
      about.dataset.wired = '1';
      about.addEventListener('click', openAbout);
    }
    applyHotState();
  }

  // Init + route events (zonder MutationObserver)
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }
  ['hashchange','popstate','pageshow'].forEach(evt=>{
    window.addEventListener(evt, ()=> setTimeout(applyHotState, 0));
  });
})();

// Stel: window.AWN_MESSAGES = { nl:[...], en:[...] } bestaat al

// Bouw een deck voor de huidige context:
function getDeck(lang, sentiment, limit=30){
  return window.AWNDeck.buildDeckFor({ messagesByLang: window.AWN_MESSAGES, lang, sentiment, limit });
}
// Bouw deck uit STATE + filters (sentiment/special_day)
function buildDeckFromState() {
  const all = Array.isArray(STATE.allMessages) ? STATE.allMessages : [];
  let list = all;

  // filter op special_day (valentijn/nieuwjaar/pasen) als actief
  if (STATE.filterSpecialDay) {
    list = list.filter(m => m.special_day === STATE.filterSpecialDay);
  }

  // filter op sentiment (jouw data heeft 'sentiments' als array)
  if (STATE.activeSentiment) {
    const s = STATE.activeSentiment;
    list = list.filter(m => Array.isArray(m.sentiments) && m.sentiments.includes(s));
  }

  // (optioneel) simpele weight-sorting om “leukere” iets vaker vooraan te zien
  // maar de echte random/gewogen logica doet AWNDeck al intern wanneer je daarheen migreert
  return list.slice();
}

// Maak één navigator per (lang+sentiment) wanneer de user een sentiment kiest:
let nav = null;
let NAV = null;

function onSentimentChosen(lang, sentiment) {
  // — language & sentiment ---------------------------------------------------
  try {
    STATE.lang = lang || STATE.lang || (typeof resolveLang === 'function' ? resolveLang() : 'nl');
  } catch { STATE.lang = STATE.lang || 'nl'; }
  STATE.activeSentiment = (sentiment == null ? null : sentiment);

  // — deck opbouwen met veilige fallback ------------------------------------
  let deck = [];
  try {
    // jouw bestaande filterfunctie
    deck = (typeof buildDeckFromState === 'function')
      ? buildDeckFromState()
      : (Array.isArray(STATE.allMessages) ? STATE.allMessages.slice() : []);
  } catch {
    deck = Array.isArray(STATE.allMessages) ? STATE.allMessages.slice() : [];
  }

  // — lichte variatie: roteer deck 1x zodat de start niet voorspelbaar is ----
  if (Array.isArray(deck) && deck.length > 1) {
    const key = String(STATE.activeSentiment ?? 'all') + ':' + String(STATE.lang || 'nl');
    const hash = Array.from(key).reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0);
    const base = (Date.now() & 0xffff);
    const offset = Math.abs(base ^ hash) % deck.length;
    if (offset) deck = deck.slice(offset).concat(deck.slice(0, offset));
  }

  // — navigator (AWNDeck of een simpele fallback) ---------------------------
  const g = (typeof window !== 'undefined') ? window : globalThis;
  if (!g) return;

  if (g.AWNDeck && typeof g.AWNDeck.createNavigator === 'function') {
    g.NAV = g.AWNDeck.createNavigator({
      lang: STATE.lang,
      sentiment: STATE.activeSentiment || 'all',
      deck
    });
  } else {
    // minimale navigator zodat next/prev blijft werken
    (function makeFallbackNav() {
      let i = -1;
      const arr = Array.isArray(deck) ? deck : [];
      g.NAV = {
        next() { if (!arr.length) return null; i = (i + 1) % arr.length; return arr[i]; },
        prev() { if (!arr.length) return null; i = (i - 1 + arr.length) % arr.length; return arr[i]; },
        push(msg) {
          if (!msg) return null;
          const j = arr.findIndex(m => m && m.id === msg.id);
          if (j >= 0) i = j; else { arr.unshift(msg); i = 0; }
          return arr[i];
        }
      };
    })();
  }

  // — eerste kaart renderen (met id → index mapping naar allMessages) -------
  const first = (g.NAV && typeof g.NAV.next === 'function') ? g.NAV.next() : (deck[0] || null);
  if (first) {
    const list = Array.isArray(STATE.allMessages) ? STATE.allMessages : [];
    const idx = list.findIndex(m => m && m.id === first.id);
    if (idx >= 0) {
      STATE.currentIdx = idx;
      renderMessage({ requestedIdx: idx, wiggle: false, msg: first });
    } else {
      renderMessage({ msg: first });
    }
  } else {
    // laatste redmiddel: pak een random uit allMessages
    const list = Array.isArray(STATE.allMessages) ? STATE.allMessages : [];
    if (list.length) {
      const ridx = Math.floor(Math.random() * list.length);
      STATE.currentIdx = ridx;
      renderMessage({ requestedIdx: ridx, wiggle: false });
    }
  }
}

// Als user uit de lijst een specifieke message kiest:
function onUserPickedMessage(msg){
  if (!nav) return;
  const cur = nav.push(msg, {mark:true, advance:true});
  renderMessage(cur);
}

// Knoppen “Vorige” / “Volgende”:
function handlePrev(){
  if (!nav) return;
  const m = nav.prev();
  if (m) renderMessage(m);
}
function handleNext(){
  if (!nav) return;
  const m = nav.next(); // pakt volgende bekeken of uit deck
  if (m) renderMessage(m);
}

// Voorbeeld: bind UI
document.querySelector('[data-btn-prev]')?.addEventListener('click', handlePrev);
document.querySelector('[data-btn-next]')?.addEventListener('click', handleNext);

// Vergeet niet in jouw bestaande flow, ná verzenden/deeplink tonen:
function onMessageShown(msg){
  window.AWNDeck.markShown([msg.id]);
}

AWNDeck.UI.attachNav({
  prevSelector: '[data-nav="prev"]',
  nextSelector: '[data-nav="next"]',
  swipeSelector: '#note',
  getNav: ()=> NAV,
  render: (msg)=> msg && renderMessage({ msg, wiggle:false })
});

/* [T] === Mobile Boot Intro (lightweight) ===================================== */
(function MobileBootIntro(){
  const el = document.getElementById('intro-boot');
  if (!el) return;

  // Alleen “mobiel”: coarse pointer of small viewport
  const isCoarse = matchMedia('(pointer: coarse)').matches;
  const isSmall  = matchMedia('(max-width: 768px)').matches;
  if (!(isCoarse || isSmall)) { el.classList.add('is-hide'); return; }

  // Minimum toontijd zodat het niet flitst
  const MIN_SHOW = 800; // ms — pas aan naar smaak (bijv. 800–1200)
  const t0 = performance.now();
  let canSkip = false, hidden = false;

  // Skip na min. tijd op tap
  const maybeEnableSkip = () => { canSkip = true; };
  setTimeout(maybeEnableSkip, MIN_SHOW);

  function hideIntro(){
    if (hidden) return;
    hidden = true;
    el.classList.add('is-hide');
    // opruimen listeners
    el.removeEventListener('click', onTap, { capture: true });
    window.removeEventListener('load', onLoad);
  }

  function onTap(){
    if (canSkip) hideIntro();
  }

  function onLoad(){
    const dt = performance.now() - t0;
    const waitLeft = Math.max(0, MIN_SHOW - dt);
    setTimeout(hideIntro, waitLeft);
  }

  // Start wiring
  el.addEventListener('click', onTap, { capture: true });
  if (document.readyState === 'complete') onLoad();
  else window.addEventListener('load', onLoad, { once: true });
})();


/* [U] AI SHEET GLUE — UI open/close + generate ================================= */
function bindAISheetGlue(){
  const els = {
    backdrop: document.getElementById('ai-backdrop'),
    panel:    document.querySelector('#ai-backdrop .sheet'),
    close:    document.getElementById('ai-close-btn'),
    openBtn:  document.getElementById('smart-compose'), // AI-knop
    gen:      document.getElementById('ai-generate'),
    tone:     document.getElementById('ai-tone'),
    occasion: document.getElementById('ai-occasion'),
    context:  document.getElementById('ai-context'),
    length:   document.getElementById('ai-length'),
    toInput:  document.getElementById('to-inline')
  };

  if (!els.backdrop || !els.openBtn) return; // geen AI UI → geen glue
  if (els.backdrop.dataset.aiBound === '1') return; // tegen dubbelbinden
  els.backdrop.dataset.aiBound = '1';

  let _closingForGenerate = false; // blokkeer her-openen tijdens busy

  // ---------- helpers ----------
  function openSheet(){
    els.backdrop.classList.remove('hidden');
    els.backdrop.setAttribute('aria-hidden','false');
    try { (els.tone || els.context || els.length || els.panel)?.focus(); } catch(_) {}
  }
  function closeSheet(){
    els.backdrop.classList.add('hidden');
    els.backdrop.setAttribute('aria-hidden','true');
  }
  function trapFocus(e){
    const root = els.panel || els.backdrop; if (!root) return;
    const f = root.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length-1];
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  function shiftFocusToApp(){
    // verplaats focus uit de sheet vóórdat we aria-hidden zetten (ARIA fix)
    try { if (document.activeElement?.blur) document.activeElement.blur(); } catch(_){}
    try {
      const target = document.getElementById('note') || document.body;
      if (target?.focus) target.focus();
    } catch(_){}
  }
  function requireTo(){
    // hergebruik jouw validatie als die bestaat; anders lichte fallback
    try {
      if (typeof window.validatePair === 'function')
        return !!window.validatePair({ requireTo:true, silent:false });
      if (typeof window.requireToName === 'function')
        return !!window.requireToName();
      if (typeof window.validateToField === 'function')
        return !!window.validateToField();
    } catch(_){}
    const ok = !!els.toInput && !!els.toInput.value.trim();
    if (!ok) {
      try {
        els.toInput?.focus();
        els.toInput?.classList.add('field-error');
        setTimeout(()=> els.toInput?.classList.remove('field-error'), 1200);
      } catch(_){}
    }
    return ok;
  }
  function syncGen(){
    if (!els.gen) return;
    const ok = !!els.toInput && !!els.toInput.value.trim();
    els.gen.disabled = !ok;
    els.gen.classList.toggle('is-disabled', !ok);
  }

  // ---------- UI binds ----------
  // Open-knop: eerst 'Voor wie?' check; dan sheet + korte coach-intro
  els.openBtn.addEventListener('click', () => {
    const hasTo = !!(els.toInput && els.toInput.value.trim());
    if (!hasTo) {
      window.updateCoachTimed?.('error', {}, 1800); // centrale copy (“Vul eerst ‘Voor wie?’ in.”)
      return requireTo(); // highlight + focus
    }
    openSheet();
    window.updateCoachTimed?.('aiThinking', {}, 900); // subtiel hintje mag hier ook (“Even denken… 💭”)
  });

  els.close?.addEventListener('click', closeSheet);
  els.backdrop.addEventListener('click', (ev)=>{ if (ev.target === els.backdrop) closeSheet(); });
  els.backdrop.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') closeSheet();
    else trapFocus(e);
  });

  els.toInput?.addEventListener('input', syncGen);
  syncGen();

  // Genereer: check → focus uit sheet → sheet DIRECT sluiten → compose on next tick
  els.gen?.addEventListener('click', ()=>{
    if (!requireTo()) {
      window.updateCoachTimed?.('error', {}, 1800);
      return;
    }
  });

  // ---------- AI events ----------
  document.addEventListener('ai:busy',  (e)=>{
    // subtiele “denken”-hint, centraal via copy (laat sheet dicht als we net bewust gesloten hebben)
    try { window.updateCoachTimed?.('aiThinking', {}, 900); } catch(_){}
    if (_closingForGenerate) return;
    if (e.detail?.busy) openSheet();
  });

  document.addEventListener('ai:result', (e)=>{
    _closingForGenerate = false;
    // afsluitende coach met mini-delay
    setTimeout(() => { try { window.updateCoachTimed?.('aiDone', {}, 1600); } catch(_){} }, 420);
  });

  document.addEventListener('ai:error',  ()=>{
    _closingForGenerate = false;
  });
}

// === i18n teksten ============================================================
const AWN_I18N = {
  nl: {
    ctxText: "Iemand stuurde je een warm note",
    ctxCTA: "Stuur er ook één",
    inviteTitle: "a warm note",
    inviteText: "Wil jij er ook één sturen?",
    inviteYes: "Ja graag",
    inviteLater: "Later",
    howTitle: "💛 Hoe werkt het?",
    how1: "💭 Kies een gevoel",
    how2: "✍️ Kies of schrijf een warm note",
    how3: "💌 Deel met één klik"
  },
  en: {
    ctxText: "Someone sent you a warm note",
    ctxCTA: "Send one back",
    inviteTitle: "a warm note",
    inviteText: "Want to send your own?",
    inviteYes: "Yes",
    inviteLater: "Later",
    howTitle: "💛 How it works",
    how1: "💭 Choose a feeling",
    how2: "✍️ Pick or write a warm note",
    how3: "💌 Share with one tap"
  }
};

function currentLang() {
  const l = (document.documentElement.lang || "en").toLowerCase();
  return l.startsWith("nl") ? "nl" : "en";
}
function tMaybe(key){
  if (typeof t !== 'function') return null;
  const v = t(key);
  return (v && v !== key) ? v : null;
}
// === helpers ================================================================
function openComposer() {
  // Gebruik je bestaande “Nieuwe boodschap”-knop
  document.getElementById("btn-new")?.click();
  // Fallback: focus naar inputs
  const to = document.getElementById("to-inline");
  if (to) {
    to.focus({ preventScroll: false });
    to.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
function show(el){ if (el) el.hidden = false; }
function hide(el){ if (el) el.hidden = true; }
function hasNoteOnScreen() {
  const msg = document.getElementById("message");
  return !!(msg && (msg.textContent || "").trim().length > 0);
}

// === 1) Context boven de note ===============================================
(function initContextBar(){
  const l = AWN_I18N[currentLang()];
  const ctx = document.getElementById("note-context");
  if (!ctx) return;

  const textEl = ctx.querySelector(".ctx-text");
  const btnEl  = ctx.querySelector("#ctx-reply-btn");
  if (textEl) textEl.textContent = l.ctxText;
  if (btnEl)  btnEl.textContent  = l.ctxCTA;

  if (hasNoteOnScreen() && !sessionStorage.getItem("ctxSeen")) {
    show(ctx);
    sessionStorage.setItem("ctxSeen", "1");
  }
  btnEl?.addEventListener("click", openComposer);
})();

// === 2) Nudge card (push-achtig) ============================================
(function initInviteCard(){
  const l = AWN_I18N[currentLang()];
  const card = document.getElementById("invite-card");
  if (!card) return;

  const tEl = card.querySelector(".invite-title");
  const pEl = card.querySelector(".invite-text");
  const yes = card.querySelector("#invite-yes");
  const later = card.querySelector("#invite-later");
  if (tEl) tEl.textContent = l.inviteTitle;
  if (pEl) pEl.textContent = l.inviteText;
  if (yes) yes.textContent = l.inviteYes;
  if (later) later.textContent = l.inviteLater;

  const already = sessionStorage.getItem("inviteShown") === "1";
  const audit   = /[?&]audit=1\b/.test(location.search);
  if (hasNoteOnScreen() && !already && !audit) {
    setTimeout(() => {
      show(card);
      requestAnimationFrame(() => card.classList.add("show"));
    }, 3500);
  }

  yes?.addEventListener("click", () => {
    sessionStorage.setItem("inviteShown", "1");
    hide(card);
    openComposer();
  });
  later?.addEventListener("click", () => {
    sessionStorage.setItem("inviteShown", "1");
    hide(card);
  });
})();

// === 3) 3-stappen blok teksten dynamisch ====================================
(function i18nHowTo(){
  const l = AWN_I18N[currentLang()];
  const sec = document.querySelector(".howto");
  if (!sec) return;

  // <h2> titel
  const h2 = sec.querySelector("h2");
  if (h2) h2.textContent = l.howTitle;

  // De drie <li>'s (of maak ze aan als ze ontbreken)
  let items = sec.querySelectorAll("ol > li");
  if (items.length < 3) {
    const ol = sec.querySelector("ol") || sec.appendChild(document.createElement("ol"));
    ol.innerHTML = "";
    for (let i=0; i<3; i++) ol.appendChild(document.createElement("li"));
    items = sec.querySelectorAll("ol > li");
  }
  items[0].textContent = l.how1;
  items[1].textContent = l.how2;
  items[2].textContent = l.how3;
})();
/* ========================================================================
   DEBUG HARNESS — NIET PRODUCTIE, HELPT ZIEN WAT ER WEL/NIET TRIGGERT
   - activeer via ?debug=1
   - forceert een lichte pop-in animatie op .note bij elke renderMessage
   - logt theme + motion
   ===================================================================== */
(function awnDebugHarness(){
  const qp = new URLSearchParams(location.search);
  const DEBUG = qp.has('debug');
  const log = (...args)=>{ if (DEBUG) console.log("[awn]", ...args); };

  try {
    const theme = (typeof getActiveTheme === 'function') ? getActiveTheme() : "unknown";
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    log("theme:", theme, "reducedMotion:", reduce);
  } catch(_) {}

  try {
    const _render = window.renderMessage;
    if (typeof _render === "function") {
      window.renderMessage = function patchedRenderMessage(opts){
        log("renderMessage()", opts);
        const res = _render.apply(this, arguments);
        const note = document.getElementById("note") || document.querySelector(".note");
        if (note) { note.classList.remove("anim-pop"); void note.offsetWidth; note.classList.add("anim-pop"); }
        return res;
      };
      log("hooked: renderMessage");
    } else {
      log("renderMessage NIET gevonden — dan weten we waar we moeten kijken.");
    }
  } catch(e) { log("hook error:", e); }

  window.__awnSparkle = function(){
    try{
      const el = document.createElement("div");
      el.className = "awn-sparkle";
      el.textContent = "✨ Verstuurd";
      document.body.appendChild(el);
      setTimeout(()=> el.remove(), 900);
    }catch(_){}
  };
})();


