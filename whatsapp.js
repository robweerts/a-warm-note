(function () {
  'use strict';

  const __enc = (typeof window.enc === 'function')
    ? window.enc
    : (s) => encodeURIComponent(String(s ?? ''));

  const __messageFor = (typeof window.messageFor === 'function')
    ? window.messageFor
    : (lang, toName, permalink) => {
        const base = (lang === 'en')
          ? `A warm note for ${toName || 'you'} 💛`
          : `Een warm bericht voor ${toName || 'jou'} 💛`;
        return `${base}\n${permalink}`;
      };

  window.shareByWhatsApp = function shareByWhatsApp({ lang = 'en', toName = '', permalink = '' } = {}) {
    const effectiveLink = permalink || window.location.href;
    const text = __messageFor(lang, toName, effectiveLink);
    const url  = `https://wa.me/?text=${__enc(text)}`;

    // Device detectie
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)
                  || (navigator.userAgentData && navigator.userAgentData.mobile)
                  || !!navigator.standalone;

    // --- Top-level navigatie via tijdelijke <a> ---
    try {
      const a = document.createElement('a');
      a.href = url;
      a.rel = isMobile ? 'external' : 'noopener noreferrer';
      a.target = isMobile ? '_self' : '_blank'; // mobiel native handoff, desktop nieuw tab
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    } catch (e) {
      // Fallbacks
      try { if (isMobile) { window.location.href = url; return; } } catch {}
      try { window.open(url, isMobile ? '_self' : '_blank', 'noopener'); return; } catch {}
      alert(effectiveLink); // laatste redmiddel
    }
  };
})();