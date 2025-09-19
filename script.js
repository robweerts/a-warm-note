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
const NL_ONLY_MODE       = true;
const CONFETTI_ENABLED   = true;
const IS_FILE            = (location.protocol === "file:");
const RECENT_LIMIT       = 5;
const PAPER_COLORS       = ["#FFE66D","#FFD3B6","#C5FAD5","#CDE7FF","#FFECB3","#E1F5FE"];
const MOTION = (new URLSearchParams(location.search).get('motion') || 'subtle').toLowerCase(); // 'subtle' | 'normal'
document.documentElement.setAttribute("lang","nl");

/* [A] PATCH A1: language helpers + path builder */
const DEFAULT_LANG = 'nl';

function resolveLang() {
  try {
    const p = new URL(location).searchParams.get('lang');
    return (p && p.trim().toLowerCase()) || DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/* relatief pad werkt in root én submap-deployments */
function messagesPathFor(lang) {
  const ts = Date.now(); // simpele cache-bust
  return `data/messages.${lang}.json?ts=${ts}`;
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

function autoCapitalizeInput(input) {
  if (!input) return;
  input.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val.length > 0) {
      e.target.value = val.charAt(0).toUpperCase() + val.slice(1);
    }
  });
}

function init() {
  recacheEls();
  wireGlobalUI();
  loadMessages()
    .then(() => {
      buildSentimentChips();

      autoCapitalizeInput(els.toInput);
      autoCapitalizeInput(els.fromInput);

      const qp = new URLSearchParams(location.search);
      const toVal = qp.get('to');
      const fromVal = qp.get('from');
      const sharedMid = qp.get('mid');
      const sharedId = qp.get('id');

      if (toVal && els.toInput) els.toInput.value = toVal;
      if (fromVal && els.fromInput) els.fromInput.value = fromVal;

      // Welkomstboodschap of direct renderen
      if (!showWelcomeIfRelevant(els)) {
        let msgIdx = null;
        if (sharedMid) {
          msgIdx = STATE.allMessages.findIndex(m => m.id === sharedMid);
        } else if (sharedId) {
          msgIdx = Number(sharedId);
        }
        if (msgIdx !== null && msgIdx >= 0 && msgIdx < STATE.allMessages.length) {
          renderMessage({ requestedIdx: msgIdx, wiggle: false });
        } else {
          renderMessage({ newRandom: true, wiggle: false });
        }
      }
      updateCoach(currentCoachState());
    })
    .catch((e) => {
      console.error("FOUT in init():", e);
    });
}

// Start pas wanneer DOM klaar is
window.addEventListener("DOMContentLoaded", init);

// PWA: "Installeren" knop tonen wanneer toegestaan
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

/* [E] DATA-LADEN (messages.nl.json + fallback) ------------------------------ */

/* === [E] DATA LOAD ================================== */
/* Purpose: load /data/messages.<lang>.json with NL fallback
   Notes  : - Behoudt jouw IS_FILE → fallbackMessages() gedrag
            - Probeert eerst gewenste taal (?lang=.. of STATE.lang)
            - Valt terug op NL; daarna (globale catch) op fallbackMessages()
            - Werkt met relatieve paden (root én submap compatible)
*/
/* [D] taal kiezen en <html lang> syncen */
STATE.lang = resolveLang();
document.documentElement.setAttribute("lang", STATE.lang);

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
    : (lang) => `data/messages.${lang}.json?ts=${Date.now()}`;

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

/* === ONGEWIJZIGD: ingebouwde fallback =========================== */

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
  let idx = STATE.currentIdx;

  if (requestedIdx != null) {
    idx = requestedIdx;
  } else if (newRandom || idx == null) {
    idx = nextIndex();
  }
  if (idx == null || idx < 0 || idx >= STATE.allMessages.length) {
    if (els.msg) els.msg.textContent  = "Stuur een warme boodschap naar iemand.";
    if (els.icon) els.icon.textContent = "💌";
    if (els.note) setPaperLook();
    return;
  }

  STATE.currentIdx = idx;
  bumpRecent(idx);

  const { icon, text, sentiments } = STATE.allMessages[idx];

  if (els.msg && els.icon){
    els.msg.style.opacity = 0; els.icon.style.opacity = 0;
    setTimeout(()=>{
      els.msg.textContent  = personalize(text);
      els.icon.textContent = icon || "";
      els.msg.style.opacity = 1; els.icon.style.opacity = 1;
    }, 90);
  }
   
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
  const t = toLabel(getTo());
  const f = fromLabel(getFrom());
  if (els.toLine){   els.toLine.textContent   = t; els.toLine.style.display   = t ? "block":"none"; }
  if (els.fromLine){ els.fromLine.textContent = f; els.fromLine.style.display = f ? "block":"none"; }
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
 * Toon een welkomstboodschap voor nieuwe bezoekers,
 * tenzij ze via een directe boodschap (mid/id in URL) komen.
 */
function showWelcomeIfRelevant(els) {
  const qp = new URLSearchParams(location.search);
  const isDirectMessage = qp.has('mid') || qp.has('id');
  const welcomeAlready = sessionStorage.getItem('awn_welcome_shown') === "1";
  const forceWelcome = qp.has('welcome');

  if (isDirectMessage && !forceWelcome) return false;

  if (!welcomeAlready || forceWelcome) {
    if (els.msg)  els.msg.textContent  = "Welkom! Kies een gevoel hierboven, vul ‘Voor wie?’ in en klik op ‘Verstuur’.";
    if (els.icon) els.icon.textContent = "💛";
    if (els.note) els.note.classList.add("note--welcome");
    if (typeof setPaperLook === 'function') setPaperLook();
    if (typeof updateCoach === 'function') updateCoach('init');
    sessionStorage.setItem('awn_welcome_shown','1');
    return true;
  }
  return false;
}

/* [I] COMPOSE (inputs Voor/Van) -------------------------------------------- */
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

/* [J] COACH (microcopy) */
function currentCoachState(){ return getTo() ? "toFilled" : "init"; }
function updateCoach(state){
  if (!els.coach) return;
  const theme = getActiveTheme();
  const themedInit = (theme===THEME.VALENTINE) ? "Fijne Valentijn 💛 Kies een gevoel en verstuur je note." :
                     (theme===THEME.NEWYEAR)   ? "Nieuw begin ✨ Kies een gevoel en verstuur je note." :
                     (theme===THEME.EASTER)    ? "Zacht begin 🐣 Kies een gevoel en verstuur je note." : null;

  const copy = {
    init: themedInit || "Kies een gevoel en verstuur je note.",
    toFilled: `Mooi! Klik <button type="button" class="coach-inline">Verstuur</button> om je boodschap te delen.`,
    shared: "Je boodschap is verstuurd 💛 Nog eentje maken?"
  };

  const html = copy[state] || copy.init;
  const t = els.coach.querySelector(".coach-text");
  if (t) t.innerHTML = html;
  els.coach.classList.remove("hidden");
}

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
async function onCopyLink(){
  const url = buildSharedURL().toString();
  try { await navigator.clipboard.writeText(url); }
  catch { prompt("Kopieer link", url); }
  showToast("Link gekopieerd 📋");
  closeShareSheet();
}
function onShareWhatsApp(){
  const url = buildSharedURL().toString();
  if (typeof window.shareByWhatsApp === "function") {
    window.shareByWhatsApp({ lang:"nl", toName:getTo(), permalink:url });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Voor ${getTo()||"jou"} — omdat jij belangrijk voor me bent. 💛 ${url}`)}`,"_blank","noopener");
  }
  showToast("WhatsApp geopend 📲");
  celebrate();
  closeShareSheet();
  afterShareSuccess();
}
function onShareEmail(){
  const url = buildSharedURL().toString();
  const noteText = els.msg?.textContent || "";
  if (typeof window.shareByEmail === "function") {
    window.shareByEmail({ lang:"nl", toName:getTo(), fromName:getFrom(), noteText, permalink:url });
  } else {
    const subject = encodeURIComponent(getTo() ? `Een warme note voor ${getTo()}` : `Een warme note voor jou`);
    const body = encodeURIComponent(`${getTo()?`Voor ${getTo()},\n\n`:""}${noteText}\n\n${getFrom()?`— van ${getFrom()}`:""}\n\nBekijk de note: ${url}`);
    location.href = `mailto:?subject=${subject}&body=${body}`;
  }
  showToast("E-mail geopend ✉️");
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
    showToast("Afbeelding wordt opgeslagen ⬇️");
    celebrate();
  } else {
    showToast("Download niet beschikbaar");
  }
  closeShareSheet();
  afterShareSuccess();
}
async function onNativeShare(){
  const shareURL = buildSharedURL().toString();
  if (navigator.share) {
    try {
      await navigator.share({ title:"a warm note", text:"Een warm bericht voor jou 💛", url:shareURL });
      showToast("Gedeeld 💛");
      celebrate();
    } catch {
      showToast("Delen geannuleerd");
    }
  } else {
    await onCopyLink();
  }
  closeShareSheet();
}

function onShareMessenger(){
  const url = buildSharedURL().toString();
  (async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link van jouw persoonlijke bericht is gekopieerd. 📋");
    } catch {
      prompt("Kopieer deze link en plak straks in Messenger:", url);
    }
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
      try { await navigator.clipboard.writeText(link); showToast?.('Link gekopieerd 📋'); }
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
function showToast(msg){
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast.__t);
  showToast.__t = setTimeout(()=> els.toast.classList.add("hidden"), 3600);
}

/* [M] UTILITIES (URL, shuffle, etc.) --------------------------------------- */
function getTo(){   return (els.toInput?.value || "").trim(); }
function getFrom(){ return (els.fromInput?.value || "").trim(); }

function toLabel(name){   return name ? `Voor ${name}` : ""; }
function fromLabel(name){ return name ? `Van ${name}` : ""; }

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


/* === [M] UTILITIES ================================ */
/* [M] PATCH 3: share current language
   - Neemt de actieve taal mee in de gedeelde URL
   - Laat overige query params (to/from/mid) intact
*/
function buildSharedURL(){
  const u = new URL(location.href);

  // to/from updaten op basis van huidige compose-waarden
  const to = getTo();
  const from = getFrom();
  to   ? u.searchParams.set("to", to)     : u.searchParams.delete("to");
  from ? u.searchParams.set("from", from) : u.searchParams.delete("from");

  // << PATCH 3: taal uit STATE.lang of resolver >>
  u.searchParams.set(
    "lang",
    (typeof STATE !== "undefined" && STATE.lang) ? STATE.lang : resolveLang()
  );

  // huidige message-id (mid) meesturen als die bekend is
  const idx = STATE.currentIdx;
  if (idx != null && STATE.allMessages[idx] && STATE.allMessages[idx].id) {
    u.searchParams.set("mid", STATE.allMessages[idx].id);
  } else {
    u.searchParams.delete("mid"); // schoon houden wanneer geen selectie
  }

  return u; // elders kun je u.toString() gebruiken indien string nodig is
}

function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

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

/* — Event-wiring (null-safe) ----------------------------------------------- */
function guardShareOrNudge(){
  const to = getTo();
  if (!to) {
    showToast("Vul eerst in voor wie dit is 💛");
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
  els.btnNew   && els.btnNew.addEventListener("click", ()=>{ renderMessage({ newRandom:true, wiggle:true }); showToast("Nieuwe boodschap geladen ✨"); });
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
  const TIMES   = { hold: 4200, out: 280 };
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
  const MIN_SHOW = 1200; // ms — pas aan naar smaak (bijv. 800–1200)
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