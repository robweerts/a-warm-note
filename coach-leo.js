(function (global) {
  const state = {
    mounted: false,
    lang: 'en',
    avatar: '',
    position: 'bottom', // 'top' | 'bottom'
    variant: 'welcome',  // 'welcome' | 'received' | 'ai'
    oncePerSession: true,
    autoShowDelay: 0,
    messages: { en: {}, nl: {} },
    onPrimary: null,
    onSecondary: null,
  };

  function el(html){
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function build(){
    if (document.getElementById('coach-leo')) return;

    const root = el(`
      <div id="coach-leo" class="${state.position}">
        <div class="leo-card" role="dialog" aria-live="polite">
          <div class="leo-ava" style=""></div>
          <div class="leo-body">
            <div class="leo-name">Leo</div>
            <div class="leo-lines"></div>
            <div class="leo-cta">
              <button class="btn btn-primary" type="button"></button>
              <button class="btn" type="button"></button>
            </div>
          </div>
          <button class="leo-close" aria-label="Close">✕</button>
        </div>
      </div>
    `);
    document.body.appendChild(root);

    // avatar
    const ava = root.querySelector('.leo-ava');
    if (state.avatar) ava.style.backgroundImage = `url('${state.avatar}')`;

    // teksten
    applyTexts();

    // events
    root.querySelector('.leo-close').addEventListener('click', hide);
    const [primaryBtn, secondaryBtn] = root.querySelectorAll('.leo-cta .btn');
    primaryBtn.addEventListener('click', () => { hide(); state.onPrimary?.(); });
    secondaryBtn.addEventListener('click', () => { hide(); state.onSecondary?.(); });

    state.mounted = true;
  }

  function applyTexts(){
    const dict = state.messages[state.lang] || state.messages.en || {};
    const root = document.getElementById('coach-leo');
    if (!root) return;

    root.querySelector('.leo-name').textContent = dict.name || 'Leo';

    const linesEl = root.querySelector('.leo-lines');
    linesEl.innerHTML = '';
    (dict.lines || []).forEach(line => {
      const p = document.createElement('p');
      p.textContent = line;
      linesEl.appendChild(p);
    });

    const [primaryBtn, secondaryBtn] = root.querySelectorAll('.leo-cta .btn');
    primaryBtn.textContent  = dict.primary  || (state.lang==='nl'?'Maak een warme note':'Create a warm note');
    secondaryBtn.textContent= dict.secondary|| (state.lang==='nl'?'✨ Probeer AI Compose':'✨ Try AI Compose');
  }

  function show(){
    if (state.oncePerSession && sessionStorage.getItem('coach-leo-shown') === '1') return;
    if (!state.mounted) build();
    const root = document.getElementById('coach-leo');
    root?.classList.add('show');
    sessionStorage.setItem('coach-leo-shown', '1');
  }

  function hide(){
    document.getElementById('coach-leo')?.classList.remove('show');
  }

  // === Public API ============================================================
  const CoachLeo = {
    init(opts = {}){
      state.lang = (opts.lang || state.lang).toLowerCase().startsWith('nl') ? 'nl' : 'en';
      state.avatar = opts.avatar || state.avatar;
      state.position = opts.position || state.position;
      state.variant = opts.variant || state.variant;
      state.oncePerSession = opts.oncePerSession ?? state.oncePerSession;
      state.autoShowDelay = Number(opts.autoShowDelay || state.autoShowDelay);
      state.messages = opts.messages || state.messages;
      state.onPrimary = opts.onPrimary || state.onPrimary;
      state.onSecondary = opts.onSecondary || state.onSecondary;

      build();

      if (state.autoShowDelay > 0) {
        setTimeout(() => show(), state.autoShowDelay);
      }
    },
    show, hide,
    setLanguage(lang){
      state.lang = (lang || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en';
      applyTexts();
    },
    setVariant(v){
      state.variant = v; // future: per variant andere teksten/stijl
    },
    setMessages(msgs){
      state.messages = { ...state.messages, ...msgs };
      applyTexts();
    },
    setAvatar(url){
      state.avatar = url;
      const ava = document.querySelector('#coach-leo .leo-ava');
      if (ava) ava.style.backgroundImage = `url('${url}')`;
    }
  };

  global.CoachLeo = CoachLeo;
})(window);
