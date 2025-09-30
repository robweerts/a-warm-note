/*! awn.deck.js — Deck builder + weighted order + history navigator (v1.0.1) */
;(function(global){
  'use strict';

  // ========================= [HEADER] =========================
  const NS = 'AWNDeck';
  const RECENT_KEY = 'awn_recent_shown_ids_v1';
  const HIST_PREFIX = 'awn_hist_'; // per lang+sentiment key in sessionStorage

  // ========================= [CONFIG] =========================
  // Pas desgewenst aan
  const DEFAULTS = {
    weightDefault: 1,
    includePinnedFirst: true,
    limit: 50
  };

  // ========================= [UTILS] =========================
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  // Mulberry32 RNG
  function rngFromSeed(seed) {
    let t = seed >>> 0;
    return function() {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ t >>> 15, 1 | t);
      r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  // Hash voor seed op basis van string
  function hashString(s){
    let h = 2166136261;
    for (let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h += (h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);
    }
    return h >>> 0;
  }

  function dailySeed({lang, sentiment, date=new Date()}){
    const y = date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0');
    return hashString(`${y}${m}${d}-${lang}-${sentiment}`);
  }

  // ========================= [RECENCY/COOLDOWN] =========================
  function getRecentMap(){
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)||'{}'); } catch { return {}; }
  }
  function setRecentMap(map){
    localStorage.setItem(RECENT_KEY, JSON.stringify(map));
  }
  function markShown(ids, date=new Date()){
    const recent = getRecentMap();
    const iso = date.toISOString().slice(0,10);
    ids.forEach(id => { recent[id] = iso; });
    setRecentMap(recent);
  }
  function isInCooldown(msg, today){
    const cd = Number(msg.cooldownDays)||0;
    if (!cd) return false;
    const recent = getRecentMap();
    const last = recent[msg.id];
    if (!last) return false;
    const days = Math.floor((today - new Date(last))/86400000);
    return days >=0 && days < cd;
  }

  // ========================= [DATE/TAGS/WEIGHT] =========================
  function isDateValid(msg, today){
    const t = new Date(today.toDateString()); // strip time
    if (msg.startAt && t < new Date(msg.startAt)) return false;
    if (msg.endAt && t > new Date(msg.endAt)) return false;
    return true;
  }

  function computeWeight(msg, today){
    let w = Number(msg.weight ?? DEFAULTS.weightDefault);
    // Voorbeeld-boosts (pas aan naar tags indien aanwezig)
    const m = today.getMonth()+1, d = today.getDate();
    if ((m===2 && d===14) && /valent/i.test(msg.text||'')) w *= 2.0;     // Valentijn
    if ((m===12 && d===31) && /(nieuw|year)/i.test(msg.text||'')) w *= 1.5; // Oud & Nieuw
    return Math.max(0, w);
  }

  // ========================= [WEIGHTED SHUFFLE] =========================
  // Efraimidis–Spirakis weighted random permutation (zonder vervanging)
  function weightedShuffle(items, weightFn, rng=Math.random){
    const keyed = items.map(it => {
      const w = Math.max(0, Number(weightFn(it)) || 0);
      const u = 1 - rng(); // (0,1]
      const k = (w>0) ? Math.pow(u, 1/w) : -Infinity; // w=0 → achteraan
      return {it, k};
    });
    keyed.sort((a,b)=> b.k - a.k);
    return keyed.map(x=>x.it);
  }

  // ========================= [DECK BUILDER] =========================
  function buildDeck(allMessages, opts={}){
    const {
      lang,
      sentiment,
      limit = DEFAULTS.limit,
      seed,
      includePinnedFirst = DEFAULTS.includePinnedFirst
    } = opts;

    const today = new Date();

    // 1) Basisset filteren
    let base = allMessages.filter(m =>
      (!sentiment || m.sentiment === sentiment) &&
      isDateValid(m, today) &&
      !isInCooldown(m, today)
    );

    // 2) Split pinned vs normal
    const pinned = base.filter(m => !!m.pin);
    const normal = base.filter(m => !m.pin);

    // 3) Pinned sorteren op 'order' (laag → hoog)
    pinned.sort((a,b)=> (a.order||0) - (b.order||0));

    // 4) Weighted shuffle voor normale items
    const rng = seed ? rngFromSeed(seed) : Math.random;
    const shuffled = weightedShuffle(normal, m => computeWeight(m, today), rng);

    // 5) maxPerDeck respecteren
    const counts = new Map();
    const enforced = [];
    const pushIfUnderMax = (m)=>{
      const max = Number(m.maxPerDeck) || 1;
      const c  = counts.get(m.id)||0;
      if (c < max) { counts.set(m.id, c+1); enforced.push(m); }
    };

    if (includePinnedFirst) pinned.forEach(pushIfUnderMax);
    shuffled.forEach(pushIfUnderMax);

    // 6) Limit
    return enforced.slice(0, limit);
  }

  // ========================= [HISTORY NAVIGATOR] =========================
  /**
   * HistoryNavigator bewaart een “trail” van bekeken messages,
   * met pointer om terug/vooruit te kunnen. Per (lang+sentiment) in sessionStorage.
   */
  function historyKey(lang, sentiment){
    return `${HIST_PREFIX}${lang}__${sentiment}`;
  }
  function loadHistory(lang, sentiment){
    const k = historyKey(lang, sentiment);
    try {
      return JSON.parse(sessionStorage.getItem(k) || '{"stack":[],"idx":-1}');
    } catch {
      return {stack:[], idx:-1};
    }
  }
  function saveHistory(lang, sentiment, state){
    sessionStorage.setItem(historyKey(lang, sentiment), JSON.stringify(state));
  }

  function HistoryNavigator({lang, sentiment, deck}){
    const state = loadHistory(lang, sentiment);
    const api = {
      lang, sentiment,
      deck: Array.isArray(deck) ? deck.slice() : [],
      state,

      hasPrev(){ return this.state.idx > 0; },
      hasNext(){ return this.state.idx >= 0 && this.state.idx < this.state.stack.length-1; },

      current(){
        if (this.state.idx < 0) return null;
        return this.state.stack[this.state.idx] || null;
      },

      // Navigeer naar vorige bekeken message
      prev(){
        if (!this.hasPrev()) return this.current();
        this.state.idx -= 1;
        saveHistory(this.lang, this.sentiment, this.state);
        return this.current();
      },

      // Navigeer naar volgende (als je eerder terug ging)
      next(){
        if (this.hasNext()){
          this.state.idx += 1;
          saveHistory(this.lang, this.sentiment, this.state);
          return this.current();
        }
        // Geen volgende → pak uit deck (volgende onbeziene)
        const currIds = new Set(this.state.stack.map(m => m.id));
        const nextMsg = this.deck.find(m => !currIds.has(m.id)) || this.deck[0] || null;
        if (nextMsg) this.push(nextMsg, {mark:true, advance:true});
        return this.current();
      },

      // Push nieuwe “gekozene” (bijv. user kiest uit lijst)
      push(msg, {mark=true, advance=true}={}){
        if (!msg) return this.current();
        // Als we niet aan het eind staan, “truncate” tail (zoals browser history)
        if (this.state.idx < this.state.stack.length-1) {
          this.state.stack = this.state.stack.slice(0, this.state.idx+1);
        }
        this.state.stack.push(msg);
        if (advance) this.state.idx = this.state.stack.length-1;
        saveHistory(this.lang, this.sentiment, this.state);
        if (mark && msg.id != null) markShown([msg.id]);
        return this.current();
      },

      // Reset (bijv. sentiment/lang wissel)
      resetWithDeck(newDeck){
        this.deck = Array.isArray(newDeck) ? newDeck.slice() : [];
        this.state.stack = [];
        this.state.idx = -1;
        saveHistory(this.lang, this.sentiment, this.state);
      }
    };
    return api;
  }

  // ========================= [UI HELPERS - OPTIONAL] =========================
  // Bewust klein gehouden: bind Prev/Next knoppen en Swipe op een container.
  function bindPrevNext({ prevBtn, nextBtn, getNav, render }) {
    const onPrev = () => { const nav = getNav(); if (!nav) return;
      const m = nav.prev(); if (m) render(m); };
    const onNext = () => { const nav = getNav(); if (!nav) return;
      const m = nav.next(); if (m) render(m); };
    if (prevBtn) prevBtn.addEventListener('click', onPrev);
    if (nextBtn) nextBtn.addEventListener('click', onNext);
    return { unbind(){
      if (prevBtn) prevBtn.removeEventListener('click', onPrev);
      if (nextBtn) nextBtn.removeEventListener('click', onNext);
    }};
  }

  function bindSwipe({ container, getNav, render, threshold=40, maxOffAxis=60 }) {
    if (!container) return { unbind(){ } };
    let startX=0, startY=0, active=false;
    const onStart = (e)=>{ const t=e.changedTouches[0]; startX=t.clientX; startY=t.clientY; active=true; };
    const onEnd   = (e)=>{ if(!active) return; active=false;
      const t=e.changedTouches[0]; const dx=t.clientX-startX; const dy=t.clientY-startY;
      if (Math.abs(dx)>threshold && Math.abs(dy)<maxOffAxis){
        const nav = getNav(); if (!nav) return;
        const m = (dx<0) ? nav.next() : nav.prev();
        if (m) render(m);
      }
    };
    container.addEventListener('touchstart', onStart, {passive:true});
    container.addEventListener('touchend',   onEnd,   {passive:true});
    return { unbind(){
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchend',   onEnd);
    }};
  }

  // Eén call om alles te koppelen; selectors of elementen toegestaan.
  const UI = {
    attachNav({
      prevSelector='[data-btn-prev]',
      nextSelector='[data-btn-next]',
      swipeSelector='#note',
      getNav,     // function () => navigator
      render      // function (msg) => void
    }) {
      const prevBtn = typeof prevSelector==='string' ? document.querySelector(prevSelector) : prevSelector;
      const nextBtn = typeof nextSelector==='string' ? document.querySelector(nextSelector) : nextSelector;
      const swipeEl = typeof swipeSelector==='string' ? document.querySelector(swipeSelector) : swipeSelector;

      const bindings = [];
      bindings.push(bindPrevNext({ prevBtn, nextBtn, getNav, render }));
      bindings.push(bindSwipe({ container: swipeEl, getNav, render }));

      return { detach(){ bindings.forEach(b=>b?.unbind && b.unbind()); } };
    }
  };

  // ========================= [PUBLIC API] =========================
  const API = {
    // Optioneel: set defaults (nu niet gebruikt, maar handig)
    configure(opts){
      Object.assign(DEFAULTS, opts||{});
    },

    // Bouw deck voor UI
    buildDeckFor({messagesByLang, lang, sentiment, limit}){
      const seed = dailySeed({lang, sentiment});
      const all = (messagesByLang && messagesByLang[lang]) ? messagesByLang[lang] : [];
      return buildDeck(all, {lang, sentiment, limit, seed, includePinnedFirst: true});
    },

    // History navigator (vorige/volgende) voor een bepaald lang+sentiment
    createNavigator({lang, sentiment, deck}){
      return HistoryNavigator({lang, sentiment, deck});
    },

    // Exporteer nuttige helpers
    markShown,
    dailySeed,
    weightedShuffle, // indien je zelf experimenteert
    UI,              // UI helpers: attachNav(), bindPrevNext(), bindSwipe()
  };

  // Attach to window
  global[NS] = API;
})(window);