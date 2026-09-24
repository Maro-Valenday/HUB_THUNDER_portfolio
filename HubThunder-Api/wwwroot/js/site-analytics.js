(() => {
  const trackedLinks = [
    ['.play-button', 'play_war_thunder'],
    ['.projects-button', 'my_projects'],
    ['[data-access-discord]', 'socials'],
    ['.tool-card[href="/tools/draw"]', 'draw_sight'],
    ['.tool-card[href="/tools/image-to-sight"]', 'image_to_sight'],
    ['.tool-card[href="/tools/converter"]', 'sight_converter'],
    ['.tool-card[href="/tools/adaptive-sight"]', 'adaptive_sight']
  ];

  document.addEventListener('DOMContentLoaded', () => {
    const track = (name, data) => { try { window.umami?.track?.(name, data); } catch (_) { } };
    const seen = new WeakSet();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || seen.has(entry.target)) return;
        seen.add(entry.target); observer.unobserve(entry.target);
        const ad = entry.target;
        track(ad.dataset.adFormat + '_ad_impression', { advertiser:ad.dataset.advertiser, context:ad.dataset.adContext });
      });
    }, {threshold:0.5});
    document.querySelectorAll('[data-ad-format]').forEach(ad => observer.observe(ad));
    document.addEventListener('click', event => {
      const ad = event.target.closest('[data-ad-format]');
      if (ad && event.target.closest('a')) track(ad.dataset.adFormat + '_ad_click', {advertiser:ad.dataset.advertiser, context:ad.dataset.adContext});
      if (event.target.closest('[data-access-type="PREMIUM"], [data-access-boosty]')) track('premium_cta_clicked');
    });
    for (const [selector, eventName] of trackedLinks) {
      for (const link of document.querySelectorAll(selector)) {
        link.addEventListener('click', () => {
          try { window.umami?.track?.(eventName); } catch (_) { /* Analytics never blocks navigation. */ }
        }, { passive: true });
      }
    }
  });
})();
