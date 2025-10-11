/*! AWN Sticky Avatar v1.0 (standalone) */
;(() => {
  const NS = 'StickyAvatar';
  if (window[NS]) return; // idempotent: niet dubbel registreren

  // --------------------------
  //  CSS (inject once)
  // --------------------------
  const CSS = `
  .awn-avatar{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;
    background:#16160f;border:1px solid #3a3a1a;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  .awn-avatar svg{width:58px;height:58px}

  @keyframes awn-pulse {0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}
  @keyframes awn-float {0%{transform:translateY(0)}50%{transform:translateY(-6px)}100%{transform:translateY(0)}}
  @keyframes awn-wave  {0%{transform:rotate(0)}30%{transform:rotate(-8deg)}60%{transform:rotate(6deg)}100%{transform:rotate(0)}}
  @keyframes awn-shake {0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}
                         40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}

  .awn-anim-pulse{animation:awn-pulse 1400ms ease-in-out infinite}
  .awn-anim-float{animation:awn-float 2600ms ease-in-out infinite}
  .awn-anim-wave {animation:awn-wave 1200ms ease-in-out 1}
  .awn-anim-shake{animation:awn-shake 500ms ease-in-out 1}
  `;
  function injectOnce() {
    if (document.getElementById('awn-sticky-css')) return;
    const s = document.createElement('style');
    s.id = 'awn-sticky-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // --------------------------
  //  SVG generator (faces)
  // --------------------------
  function stickySVG(face='neutral'){
    // Eyes
    const eyesNeutral = `<circle cx="26" cy="28" r="3" fill="#6b4e00"/><circle cx="38" cy="28" r="3" fill="#6b4e00"/>`;
    const eyesWink    = `<circle cx="26" cy="28" r="3" fill="#6b4e00"/><path d="M36 28h4" stroke="#6b4e00" stroke-width="3" stroke-linecap="round"/>`;
    const eyesSad     = `<circle cx="26" cy="28" r="3" fill="#6b4e00"/><circle cx="38" cy="28" r="3" fill="#6b4e00"/>
                         <path d="M22 24c3 2 5 2 8 0" stroke="#6b4e00" stroke-width="2" />`;
    const eyesSurpr   = eyesNeutral; // zelfde ogen, andere mond

    // Mouth
    const mouthNeutral= `<path d="M24 38c4 3 12 3 16 0" stroke="#6b4e00" stroke-width="3" stroke-linecap="round"/>`;
    const mouthSmile  = `<path d="M22 36c6 6 14 6 20 0" stroke="#6b4e00" stroke-width="3" stroke-linecap="round"/>`;
    const mouthSurpr  = `<circle cx="32" cy="36" r="3.2" fill="none" stroke="#6b4e00" stroke-width="3"/>`;
    const mouthSad    = `<path d="M24 40c6 -4 12 -4 16 0" stroke="#6b4e00" stroke-width="3" stroke-linecap="round"/>`;

    const eyes =
      face === 'wink'      ? eyesWink :
      face === 'sad'       ? eyesSad  :
      face === 'surprised' ? eyesSurpr: eyesNeutral;

    const mouth =
      face === 'smile'     ? mouthSmile :
      face === 'surprised' ? mouthSurpr :
      face === 'sad'       ? mouthSad   : mouthNeutral;

    return `
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <!-- Sticky note shape -->
      <path d="M8 10h40l8 8v36a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V10z" fill="#ffe58a" stroke="#e0c25c"/>
      <path d="M56 18h-8a4 4 0 0 1-4-4V6" stroke="#e0c25c"/>
      <path d="M46 42l10-10v10H46z" fill="#fff2b2" stroke="#e0c25c"/>
      <!-- Face -->
      ${eyes}${mouth}
    </svg>`;
  }

  // --------------------------
  //  State + renderer
  // --------------------------
  const state = {
    el: null,
    face: 'neutral',         // neutral | smile | wink | surprised | sad
    anim: 'pulse',           // pulse | float | wave | shake
  };

  function apply() {
    if (!state.el) return;
    // reset & render svg
    state.el.className = 'awn-avatar';
    state.el.innerHTML = stickySVG(state.face);

    // animatie klas toevoegen
    // (wave/shake zijn one-shot; we strippen ze na ~1.3s/0.6s)
    state.el.classList.remove('awn-anim-pulse','awn-anim-float','awn-anim-wave','awn-anim-shake');
    if (state.anim === 'pulse') state.el.classList.add('awn-anim-pulse');
    if (state.anim === 'float') state.el.classList.add('awn-anim-float');
    if (state.anim === 'wave')  {
      state.el.classList.add('awn-anim-wave');
      setTimeout(() => state.el && state.el.classList.remove('awn-anim-wave'), 1300);
    }
    if (state.anim === 'shake') {
      state.el.classList.add('awn-anim-shake');
      setTimeout(() => state.el && state.el.classList.remove('awn-anim-shake'), 600);
    }
  }

  // --------------------------
  //  Public API
  // --------------------------
  const api = {
    mount(targetEl) {
      injectOnce();
      if (!targetEl) { console.warn('[StickyAvatar] mount: no element'); return; }
      state.el = targetEl;
      state.el.setAttribute('role','img');
      state.el.setAttribute('aria-label','Coach avatar');
      apply();
    },
    setFace(face) {
      if (!face) return;
      state.face = face;
      apply();
    },
    setAnim(anim) {
      if (!anim) return;
      state.anim = anim;
      apply();
    },
    setFromCoach(coachState) {
      // Mapping: pas gerust aan je tone/UX aan
      switch (coachState) {
        case 'toFilled':   this.setFace('wink');      this.setAnim('pulse'); break;
        case 'received':   this.setFace('neutral');   this.setAnim('wave');  break;
        case 'shared':     this.setFace('smile');     this.setAnim('float'); break;
        case 'error':      this.setFace('sad');       this.setAnim('shake'); break;
        case 'init':
        default:           this.setFace('neutral');   this.setAnim('pulse'); break;
      }
    },
    destroy() {
      if (state.el) state.el.innerHTML = '';
      state.el = null;
    }
  };

  window[NS] = api;
})();