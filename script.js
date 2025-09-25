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
 ========================================================================== */

/* [A] CONFIG & CONSTANTEN --------------------------------------------------- */

const CONFETTI_ENABLED   = true;
const IS_FILE            = (location.protocol === "file:");
const RECENT_LIMIT       = 5;
const PAPER_COLORS       = ["#FFE66D","#FFD3B6","#C5FAD5","#CDE7FF","#FFECB3","#E1F5FE"];
const MOTION = (new URLSearchParams(location.search).get('motion') || 'subtle').toLowerCase(); // 'subtle' | 'normal'
document.documentElement.setAttribute("lang","nl");

/* [A] resolveLang met prioriteit: URL > localStorage > browser > default */
const DEFAULT_LANG = 'nl';

function resolveLang() {
  try {
    const urlLang = new URL(location.href).searchParams.get('lang');
    if (urlLang) return urlLang.trim().toLowerCase();

    const stored = localStorage.getItem('prefLang');
    if (stored) return stored.trim().toLowerCase();

    const nav = (navigator.language || navigator.userLanguage || 'nl').slice(0,2).toLowerCase();
    return nav || DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/* relatief pad werkt in root én submap-deployments */
function messagesPathFor(lang) {
  const ts = Date.now(); // simpele cache-bust
  return `/data/messages.${lang}.json?ts=${ts}`;
}

/* [A+] THEME DETECT & KLEUREN ---------------------------------------------- */
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

/* [B] DOM CACHE & HELPERS --------------------------------------------------- */
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

/* [C] APP-STATE ------------------------------------------------------------- */
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

/* [D] INIT (lifecycle) ------------------------------------------------------ */

function init() {
  // 1) Taal & basis
  STATE.lang = resolveLang();
  document.documentElement.setAttribute('lang', STATE.lang);
  recacheEls();
  wireGlobalUI();
  if (typeof wireLanguagePicker === 'function') wireLanguagePicker();
  wireLangDropdown?.();
  renderLangDropdownUI?.();
  if (window.StickyAvatar && els.coachAvatar) {
  StickyAvatar.mount(els.coachAvatar);
  StickyAvatar.setFromCoach('init'); // startstand
  }

  // 2) Strings → Messages
  ensureStringsLoaded()
    .then(() => {
      if (typeof refreshUIStrings === 'function') refreshUIStrings();
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
      
      // Bewaar ontvangen namen, maar vul géén inputs in bij mid
	  STATE.shared = STATE.shared || { to: '', from: '' };
	  STATE.shared.to   = toVal;
	  STATE.shared.from = fromVal;
	  
	  const isReceivedByMid = !!sharedMid;
	  STATE.useSharedNames = isReceivedByMid;  // <-- NIEUW


	  if (isReceivedByMid) {
  	  if (els.toInput) {
    	  els.toInput.value = '';
    	  els.toInput.placeholder = (typeof i18n === 'function'
      	  ? i18n('to_placeholder')
      	  : 'Voor wie?');
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
        }, 120);                  // > 90ms (interne renderMessage-delay)
       // updateCoach('init');
        return;                   // géén directe message-render in scenario 1
      }

      // 8) Geen welcome → direct renderen via mid/id of anders random
      let msgIdx = null;
      if (sharedMid) {
        msgIdx = STATE.allMessages.findIndex(m => m.id === sharedMid);
      } else if (sharedId) {
        const n = Number(sharedId);
        if (!Number.isNaN(n)) msgIdx = n;
      }

      if (msgIdx != null && msgIdx >= 0 && msgIdx < STATE.allMessages.length) {
        renderMessage({ requestedIdx: msgIdx, wiggle: false });
      } else {
        renderMessage({ newRandom: true, wiggle: false });
      }

	  // 9) Coach-status bijwerken
	  if (isReceivedByMid) {
  	  // In ontvangen-flow: hou de expliciete CTA (niet overschrijven!)
  	  if (!STATE._coachReceivedOnce) {
    	updateCoach('received');
    	STATE._coachReceivedOnce = true;
  	  }
	  } else {
  	  // In alle andere gevallen mag de algemene coach-update
  	  updateCoach(currentCoachState());
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

// PWA: "Installeren" APP knop tonen wanneer toegestaan
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
      await __deferredPrompt.userChoice; // optioneel: { outcome }
    } catch {}
    __deferredPrompt = null;
    btn.remove();
  });
});

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

    /* === ONGEWIJZIGD: jouw normalisatie + sentiments afleiding === */
    const list = Array.isArray(data?.messages) ? data.messages : [];
    STATE.allMessages = list.map(m => ({
      id: m.id || null,
      icon: m.icon || "",
      text: String(m.text || ""),
      sentiments: Array.isArray(m.sentiments) ? m.sentiments : [],
      special_day: m.special_day || null,
      weight: Number.isFinite(m.weight) ? m.weight : 1
    }));

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

/* [F] SENTIMENT-CHIPS (max 10) --------------------------------------------- */
function buildSentimentChips(){
  const row = els.chipRow;
  if (!row) return;
  row.innerHTML = "";

  const activeTheme = getActiveTheme();
  if (activeTheme === THEME.VALENTINE) {
    row.appendChild(makeThemeChip('valentine', 'Valentijn ❤️'));
  } else if (activeTheme === THEME.NEWYEAR) {
    row.appendChild(makeThemeChip('newyear', 'Nieuwjaar ✨'));
  } else if (activeTheme === THEME.EASTER) {
    row.appendChild(makeThemeChip('easter', 'Pasen 🐣'));
  }

  // “Alles” chip
  row.appendChild(makeChip(null, "Alles"));

  // Data-gedreven chips (max 10)
  (STATE.sentiments || []).slice(0,10).forEach(tag => {
    row.appendChild(makeChip(tag, capitalize(tag)));
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
  b.textContent = label;
  b.onclick = () => {
    setActiveFilter({ sentiment: null, special: specialKey });
    scrollChipIntoCenter(b);
  };
  return b;
}

function setActiveFilter({ sentiment=null, special=null }){
  STATE.activeSentiment = sentiment;
  STATE.filterSpecialDay = special;

  // visueel actief
  const row = els.chipRow; if (row){
    [...row.querySelectorAll(".chip")].forEach(c=>{
      const isActive = (c.dataset.type==="special" && c.dataset.value===special) ||
                       ((c.dataset.type||"sentiment")==="sentiment" && (c.dataset.value||"") === (sentiment||""));
      c.classList.toggle("active", !!isActive);
    });
  }

  rebuildDeck(true);
  renderMessage({ newRandom:true, wiggle:true });
}

function makeChip(value, label){
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.setAttribute("role","tab");
  b.dataset.value = value || "";
  b.textContent = label;
  b.onclick = () => {
    STATE.activeSentiment = value;
    activateChip(value);
    rebuildDeck(true);
    renderMessage({ newRandom:true, wiggle:true });
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

/* -------- Affordance helpers (chevrons, hint, autocenter) -------- */
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
      left.style.display = "none";
      right.style.display = "none";
      return;
    }
    left.style.display  = row.scrollLeft > 6 ? "grid" : "none";
    right.style.display = (row.scrollLeft + row.clientWidth) < (row.scrollWidth - 6) ? "grid" : "none";
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


/* [G] DECK & RANDOMISATIE --------------------------------------------------- */
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

/* [H] RENDERING (note & to/from) ------------------------------------------- */
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

function renderMessage({ newRandom=false, requestedIdx=null, wiggle=false } = {}){
  // --- GUARD: oversla initiele auto-render zolang welcome-lock actief is ---
  const now = (window.performance?.now?.() || Date.now());
  if (window._awnWelcomeGuardUntil && now < window._awnWelcomeGuardUntil) {
    return;
  }
  let idx = STATE.currentIdx;
  // 1) Direct aangevraagde index krijgt voorrang
  if (requestedIdx != null) {
    idx = requestedIdx;
  }
  // 2) Nieuwe random (of nog geen index) → gewogen selectie
  else if (newRandom || idx == null) {
    // begin met hele lijst
    let pool = STATE.allMessages;

    // actieve sentiment-filter respecteren (alleen toepassen als er resultaten zijn)
    if (STATE.activeSentiment) {
      const s = STATE.activeSentiment;
      const filtered = pool.filter(m => Array.isArray(m.sentiments) && m.sentiments.includes(s));
      if (filtered.length) pool = filtered;
    }

    // kies gewogen index binnen pool
    let localIdx = null;
    if (typeof pickWeightedIndex === 'function') {
      localIdx = pickWeightedIndex(pool);
    }
    // fallback: normale random als helper ontbreekt of niets teruggeeft
    if (localIdx == null) {
      localIdx = Math.floor(Math.random() * Math.max(pool.length, 1));
    }

    // map terug naar globale index
    const chosen = pool[localIdx];
    idx = STATE.allMessages.indexOf(chosen);
    if (idx < 0) idx = localIdx; // defensieve fallback (zou zelden gebeuren)
  }

  if (idx == null || idx < 0 || idx >= STATE.allMessages.length) {
    if (els.msg)  {
      const fallbackText = "Stuur een warme boodschap naar iemand.";
      els.msg.setAttribute('data-raw', fallbackText);     // bron vastleggen
      els.msg.textContent = personalize(fallbackText);    // consistent via personalize
    }
    if (els.icon) els.icon.textContent  = "💌";
    if (els.note) setPaperLook();
    renderToFrom(); // lijnen toch syncen
    return;
  }

  // 4) State + recent bijwerken
  STATE.currentIdx = idx;
  bumpRecent(idx);

  const { icon, text, sentiments } = STATE.allMessages[idx];

  // 5) Animatie + invullen (altijd from raw-template personaliseren)
  if (els.msg && els.icon){
    els.msg.style.opacity = 0; 
    els.icon.style.opacity = 0;
    const raw = (typeof text === 'string') ? text : '';
    els.msg.setAttribute('data-raw', raw);
    setTimeout(()=>{
      // Her-personaliseren vanaf bron (fix voor Ria → Truus usecase)
      const base = els.msg.getAttribute('data-raw') || raw || '';
      els.msg.textContent  = personalize(base);
      els.icon.textContent = icon || "";
      els.msg.style.opacity = 1; 
      els.icon.style.opacity = 1;
    }, 90);
  }

  // 6) rest van de UI
  if (els.note) setPaperLook();
  renderToFrom();
  renderFromSymbol((sentiments && sentiments[0]) || STATE.activeSentiment || null);

  if (wiggle && !prefersReducedMotion() && els.note){
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
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
      renderMessage({ newRandom:true, wiggle:false });
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
function showWelcomeNote(els) {
  const qp = new URLSearchParams(location.search);
  const isReceivedByMid = qp.has('mid');   // alleen 'mid' bepaalt received
  if (isReceivedByMid) return false;

  // Taal bepalen
  const docLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
  const stateLang = (typeof STATE !== 'undefined' && STATE.lang) ? STATE.lang.toLowerCase() : '';
  const lang = (docLang || stateLang || 'nl').startsWith('en') ? 'en' : 'nl';

  // Copy per taal
  const copy = (lang === 'en')
    ? "Welcome! Pick a feeling above, enter ‘Who for?’ and tap ‘Send’."
    : "Welkom! Selecteer een gevoel hierboven. Kies je berichtje, vul ‘Voor wie?’ en je eigen naam in en klik op ‘Verstuur’.";

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

/* [I] COMPOSE (inputs Voor/Van) -------------------------------------------- */
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

/* [J] PATCH: updateCoach meertalig (zelfde functienaam) */
function updateCoach(state){
  if (!els.coach) return;

  const theme = getActiveTheme();
  const lang  = (STATE?.lang) || resolveLang();
  const isEn  = (lang === 'en');

  // Thematisch openingszinnetje (EN/NL)
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

// Basis-copy (EN/NL), inline zodat we geen extra helper hoeven te introduceren
const copy = isEn ? {
  init:     themedInit || "Pick a feeling, select a message and send your note.",
  toFilled: `Nice! Click <button type="button" class="coach-inline">Send</button> to share your message.`,
  shared:   "Your message has been sent 💛 Make another one?",
  received: "You’ve received a warm note 💛 Keep it? Tap ‘Download’. Send your own? Tap ‘New’.",
  error: "Add who it’s for first 💛"
} : {
  init:     themedInit || "Selecteer een gevoel, blader door de berichtjes en verstuur je note.",
  toFilled: `Mooi! Klik <button type="button" class="coach-inline">Verstuur</button> om je boodschap te delen.`,
  shared:   "Je boodschap is verstuurd 💛 Nog eentje maken?",
  received: "Je hebt een 'a warme note' ontvangen 💛 <br> Zelf iemand verrassen? Klik ‘Kies bericht’.",
  error: "'Vul eerst in voor wie dit is 💛'"
};

  // Render op basis van state (incl. 'received'); fallback = init
  const html = copy[state] || copy.init;
  els.coach.classList?.remove('hidden');   // zeker zichtbaar
  //els.coach.innerHTML = html;              // HTML nodig i.v.m. inline button
  // Render op basis van state
  // nadat je de copy hebt gezet
  els.coach?.classList.remove('hidden');
if (els.coachMsg) els.coachMsg.innerHTML = html;  
if (window.StickyAvatar) StickyAvatar.setFromCoach(state);}

/* [K] SHARE-SHEET (WA/E-mail/Download/Kopieer/Native) ---------------------- */
let __lastFocusEl = null;
function trapFocusIn(el, e){
  const focusables = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function openShareSheet(){
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

/* PATCH: onCopyLink → meertalig prompt + toast */
async function onCopyLink(){
  const url  = buildSharedURL().toString();
  const lang = (STATE?.lang) || resolveLang();

  // mini vertaaltafel (alleen wat we hier nodig hebben)
  const i18n = (lang === 'en')
    ? { prompt: 'Copy link', toast: 'Link copied 📋' }
    : { prompt: 'Kopieer link', toast: 'Link gekopieerd 📋' };

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Fallback prompt (kan in sommige browsers verdwijnen — prima als laatste redmiddel)
    prompt(i18n.prompt, url);
  }

  showToast(i18n.toast);
  closeShareSheet();
}
/* WhatsApp share → gebruikt meertalige whatsapp.js API (shareByWhatsApp) */
function onShareWhatsApp() {
  const lang    = (STATE?.lang) || resolveLang();
  const toName  = (typeof getTo === 'function')   ? getTo()   : '';
  const permalink = (typeof buildSharedURL === 'function')
    ? buildSharedURL().toString()
    : location.href;

  if (typeof window.shareByWhatsApp === 'function') {
    window.shareByWhatsApp({ lang, toName, permalink });
  } else {
    console.warn('[share] shareByWhatsApp() ontbreekt');
  }

showToastI18n('toast.whatsappOpened','WhatsApp geopend 📲');
  celebrate();
  closeShareSheet();
  afterShareSuccess();
}

/* Backwards-compat alias als er nog oude calls bestaan */
window.onShareWhatsApp = onShareWhatsApp;
window.shareViaWhatsApp = onShareWhatsApp;

/* E-mail share → gebruikt je meertalige mail.js API (shareByEmail) */
function onShareEmail() {
  const lang = (STATE?.lang) || resolveLang();
  const toName = (typeof getTo === 'function') ? getTo() : '';
  const fromName = (typeof getFrom === 'function') ? getFrom() : '';

  // Permalink met juiste lang/mid
  const permalink = (typeof buildSharedURL === 'function')
    ? buildSharedURL().toString()
    : location.href;

  if (typeof window.shareByEmail === 'function') {
    window.shareByEmail({ lang, toName, fromName, permalink });
  } else {
    console.warn('[share] shareByEmail() ontbreekt');
  }
showToastI18n('toast.emailOpened','E-mail geopend ✉️');
  celebrate();
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
    celebrate();
  } else {
	showToastI18n('toast.downloadUnavailable','Download niet beschikbaar');  }
	closeShareSheet();
	afterShareSuccess();
}

async function onNativeShare(){
  const shareURL = buildSharedURL().toString();
  if (navigator.share) {
    try {
      await navigator.share({ title:"a warm note", text:"Een warm bericht voor jou 💛", url:shareURL });
	  showToastI18n('toast.shared','Gedeeld 💛');
      celebrate();
    } catch {
      showToastI18n('toast.shareCancelled','Delen geannuleerd');
    }
  } else {
    await onCopyLink();
  }
  closeShareSheet();
}

function onShareMessenger(){
  const url  = buildSharedURL().toString();
  const lang = (STATE?.lang) || resolveLang();
  const i18n = (lang === 'en')
    ? { toast: 'Link to your personal note has been copied. 📋',
        prompt: 'Copy this link and paste it in Messenger:' }
    : { toast: 'Link van jouw persoonlijke bericht is gekopieerd. 📋',
        prompt: 'Kopieer deze link en plak straks in Messenger:' };

  (async () => {
    try { await navigator.clipboard.writeText(url); showToast(i18n.toast); }
    catch { prompt(i18n.prompt, url); }
    closeShareSheet();
    openMessengerHelp();
  })();
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
// Fallback naar QR-afbeelding (extern endpoint)
async function renderWithImg(link){
  const size = 240;
  const url  = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(link)}`;
  const img  = document.getElementById('qr-img');
  const cv   = document.getElementById('qr-canvas');
  if (!img) return false;

  if (cv) cv.style.display = 'none';
  img.style.display = 'block';
  img.onerror = ()=>{ console.warn('QR-afbeelding kon niet laden'); };
  img.src = url;
  return true;
}

// Publieke handler
async function onShareQR(){
  const u = buildSharedURL(); u.searchParams.set('src','qr');
  const link = u.toString();

  openQR();

  try {
    const ok = await renderWithLib(link);
    if (!ok) await renderWithImg(link);
  } catch {
    await renderWithImg(link);
  }

  const dl = document.getElementById('qr-download');
  if (dl){
    dl.replaceWith(dl.cloneNode(true));
    document.getElementById('qr-download').addEventListener('click', ()=>{
      const cv  = document.getElementById('qr-canvas');
      const img = document.getElementById('qr-img');
      if (cv && cv.style.display !== 'none') {
        const a = document.createElement('a');
        a.href = cv.toDataURL('image/png');
        a.download = 'a-warm-note-qr.png';
        document.body.appendChild(a); a.click(); a.remove();
      } else if (img && img.src) {
        window.open(img.src, '_blank', 'noopener');
      }
    }, { once:true });
  }

  const cp = document.getElementById('qr-copy');
  if (cp){
    cp.replaceWith(cp.cloneNode(true));
    document.getElementById('qr-copy').addEventListener('click', async ()=>{
      try { await navigator.clipboard.writeText(link); toast('share.copiedToast','Link gekopieerd 📋'); }
      catch { prompt('Kopieer link:', link); }
    }, { once:true });
  }

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


/* [L] CONFETTI & TOASTS ----------------------------------------------------- */
function celebrate(){
  const qp = new URLSearchParams(location.search);
  const debugForce = qp.get('debug_confetti') === '1';
  if (!CONFETTI_ENABLED) return;
  if (!debugForce && prefersReducedMotion()) return;

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

/*  UTILITIES (URL, shuffle, etc.) --------------------------------------- */

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

/*function getTo(){
  const v = (els.toInput?.value || '').trim();
  if (v) return v;
  // Fallback: ontvangen To uit URL (alleen bij mid)
  const hasMid = (new URLSearchParams(location.search)).has('mid');
  if (hasMid) return (STATE?.shared?.to || '').trim();
  return '';
}

function getFrom(){
  const v = (els.fromInput?.value || '').trim();
  if (v) return v;
  // Fallback: ontvangen From uit URL (alleen bij mid)
  const hasMid = (new URLSearchParams(location.search)).has('mid');
  if (hasMid) return (STATE?.shared?.from || '').trim();
  return '';
}*/
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
  const url = `data/strings.${lang}.json?ts=${Date.now()}`;
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
/* refreshUIStrings: schrijf labels/aria vanuit strings.{lang}.json (HTML-aware) */
function refreshUIStrings() {
  // Topbar – Share-knop: alleen zichtbare label-span updaten
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

  // Topbar – Installeer (PWA)
  // Mogelijke ids/classes; kies wat bij jouw HTML past
  
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

  // voorkeursstructuur: <button><span class="btn-label">…</span></button>
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
  
  // Intro-hint by id
const introHint = document.getElementById('intro-hint');
if (introHint) introHint.textContent = t('intro.hint') || introHint.textContent;

// (optioneel) generiek via data-i18n-key="intro.hint"
document.querySelectorAll('[data-i18n-key="intro.hint"]').forEach(el => {
  el.textContent = t('intro.hint');
});

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

/* [M] Weighted random helper
   - Neemt een lijst van messages (elk met optionele 'weight')
   - weight <= 0 wordt genegeerd; default = 1
   - Retourneert index in de meegegeven lijst (niet de globale index)
*/
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

function throttle(fn, wait){
  let t=0, lastArgs=null;
  return function throttled(...args){
    lastArgs = args;
    if (t) return;
    t = setTimeout(()=>{ t=0; fn.apply(null, lastArgs); lastArgs=null; }, wait);
  };
}

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
/* [M] Weighted random helper
   - Neemt een lijst van messages (elk met optionele 'weight')
   - weight <= 0 wordt genegeerd; default = 1
   - Retourneert index in de meegegeven lijst (niet de globale index)
*/
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
  if (typeof refreshUIStrings === 'function') refreshUIStrings();

  await loadMessages();

  // ⬇️ BELANGRIJK: chips heropbouwen op basis van de nieuwe dataset/taal
  if (typeof buildSentimentChips === 'function') buildSentimentChips();

  // eventueel filters/deck opnieuw opzetten en meteen renderen
  rebuildDeck?.(true);
  updateCoach?.(currentCoachState());
  renderMessage?.({ newRandom: true });
}

els.btnAI && els.btnAI.addEventListener("click", onNewAIClick);

async function onNewAIClick(){
  const lang = STATE?.lang || resolveLang();
  const sentiments = STATE.activeSentiment ? [STATE.activeSentiment] : [];
  const to   = getTo();
  const from = getFrom();
  const day  = getActiveThemeSpecialDay?.() || null; // of haal ‘m uit STATE

  setBusy(true); // optioneel spinner
  try {
    const m = await fetchAIGeneratedMessage({ lang, sentiments, to, from, special_day: day });
    // render als ‘ad-hoc’ message zonder het deck te vervuilen:
    STATE.currentIdx = null; // forceer losse render
    applyMessage({ icon: m.icon, text: m.text, sentiments: m.sentiments || sentiments });
    renderToFrom();
    renderFromSymbol((m.sentiments && m.sentiments[0]) || STATE.activeSentiment || null);
    toast('ai.generated', t?.('ai.generated') || (lang==='en'?'AI message generated ✨':'AI-boodschap gemaakt ✨'));
  } catch(e){
    console.error(e);
    showToast(t?.('ai.failed') || (lang==='en'?'Could not generate message':'Kon geen boodschap genereren'));
  } finally {
    setBusy(false);
  }
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

  const open  = ()=>{
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded','true');
    menu.hidden = false;           // << belangrijk op iOS
  };
  const close = ()=>{
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded','false');
    menu.hidden = true;
  };

  btn.addEventListener('click', (e)=>{
    e.preventDefault();            // << voorkomt form/scroll-quirks
    e.stopPropagation();           // << voorkomt dat doc-handler 'm meteen sluit
    if (wrap.classList.contains('open')) { close(); return; }
    renderLangDropdownUI(); open();
  });

  // kies taal
  menu.addEventListener('click', async (e)=>{
    e.stopPropagation();
    const item = e.target.closest('.lang-item'); if (!item) return;
    const next = item.dataset.lang; if (!next) return;

    const u = new URL(location.href); u.searchParams.set('lang', next);
    history.replaceState({}, '', u.toString());
    localStorage.setItem('prefLang', next);

    if (typeof setLanguage === 'function') await setLanguage(next);
    renderLangDropdownUI(); close();
  });

  // klik buiten + ESC (sluiten)
  document.addEventListener('click', (e)=>{
    if (!wrap.contains(e.target)) close();
  }, { passive: true });

  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') close();
  });

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
  const url = (typeof buildSharedURL === "function" ? buildSharedURL().toString() : location.href);
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
  els.msgrHelp  && els.msgrHelp.addEventListener("click", (e)=>{ if (e.target === els.msgrHelp) closeMessengerHelp(); });
  els.msgrOpen  && els.msgrOpen.addEventListener("click", ()=>{ actuallyOpenMessenger(); closeMessengerHelp(); });
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

  // Coach close + inline "Verstuur"
  els.coachClose && els.coachClose.addEventListener("click", ()=> els.coach.classList.add("hidden"));
  els.coach && els.coach.addEventListener("click", (e)=>{
    if (e.target && e.target.classList.contains("coach-inline")){
      guardShareOrNudge();
    }
  });
}
/* -------------------------- A) SPLASH (overlay) -------------------------- */
(function SplashLiveClone(){
  // Settings
  const MARGINS = { vw: 0.96, vh: 0.86 };
  const LIMITS  = { min: 1.2, max: 3.0 };
  const TIMES   = { hold: 5200, out: 1280 };
  const AUTO_OPEN_ON_MID = true;               // auto-open aan

  const NOTE_SEL = [
    '[data-note-root]', '.note', '.postit', '.note-card', '.noteRoot', 'article.note'
  ];

  // Helpers
  const waitFonts = () =>
    (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(()=>{}) : Promise.resolve();
  const pick = (root, sels) => { for (const s of sels){ const el=root.querySelector(s); if (el) return el; } return null; };
  function findLiveNote(){ return pick(document, NOTE_SEL); }
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
  function computeScale(box){
    const vw = innerWidth * MARGINS.vw;
    const vh = innerHeight * MARGINS.vh;
    const sx = vw / box.width;
    const sy = vh / box.height;
    let s = Math.min(sx, sy);
    if (!isFinite(s) || s <= 0) s = 1;
    if (s < LIMITS.min) s = LIMITS.min;
    if (s > LIMITS.max) s = LIMITS.max;
    return s;
  }
  function makeOverlay(){
    const old = document.querySelector('.splash-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.className = 'splash-overlay';
    const stage = document.createElement('div');
    stage.className = 'splash-stage';
    overlay.appendChild(stage);
    document.body.appendChild(overlay);
    return { overlay, stage };
  }

  async function showSplash(){
    await waitFonts();
    const live = findLiveNote();
    if (!live){ console.warn('[splash] geen live note gevonden'); return; }

    const clone = live.cloneNode(true);                // 1:1 deep clone (alles mee)
    const { overlay, stage } = makeOverlay();
    stage.appendChild(clone);

    requestAnimationFrame(()=>{
      const rect = (stage.firstElementChild || stage).getBoundingClientRect();
      stage.style.setProperty('--splash-scale', String(computeScale(rect)));
      overlay.classList.add('is-in');
    });

    // sluiters (klik buiten / ESC / automatische hold)
    const close = ()=>{
      overlay.classList.remove('is-in');
      setTimeout(()=> overlay.remove(), TIMES.out);
      document.removeEventListener('keydown', onEsc, true);
      window.removeEventListener('resize', onResize, true);
    };
    const onEsc = e => { if (e.key === 'Escape') close(); };
    const onResize = ()=>{
      const rect = (stage.firstElementChild || stage).getBoundingClientRect();
      stage.style.setProperty('--splash-scale', String(computeScale(rect)));
    };

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onEsc, true);
    window.addEventListener('resize', onResize, true);
    setTimeout(close, TIMES.hold);
  }

  // Publiek voor ⤢
  window.openNoteSplash = showSplash;

  // Auto-open bij ?mid=… (precies 1× per sessie/tab)
  function maybeAutoOpenOnce(){
    if (!AUTO_OPEN_ON_MID) return;
    const mid = getMID();
    if (!mid) return;
    const key = `splashShown:${mid}`;
    if (sessionStorage.getItem(key)) return;   // al getoond in deze tab

    Promise.resolve()
      .then(waitFonts)
      .then(()=> new Promise(r => setTimeout(r, 120))) // rustmomentje voor render
      .then(()=>{
        const live = findLiveNote();
        if (!live) return;
        showSplash();
        sessionStorage.setItem(key, '1');
      })
      .catch(()=>{ /* stil falen */ });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', maybeAutoOpenOnce, { once:true });
  } else {
    maybeAutoOpenOnce();
  }
})();

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
      expand.addEventListener('click', ()=> {
        if (typeof window.openNoteSplash === 'function') openNoteSplash();
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

/* === Mobile Boot Intro (lightweight) ===================================== */
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
