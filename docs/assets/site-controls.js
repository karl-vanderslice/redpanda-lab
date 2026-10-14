(() => {
  const boundSearchHosts = new WeakSet();
  function bindSearch() {
    let found = false;
    for (const host of document.body.children) {
      const root = host.shadowRoot;
      if (!root) continue;
      found = true;
      if (boundSearchHosts.has(host)) continue;
      boundSearchHosts.add(host);
      const trigger = document.querySelector('.md-search__button');
      document.querySelector('[data-md-component="search"]')?.removeAttribute('role');
      host.id ||= 'zensical-search-dialog';
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-label', 'Search');
      host.inert = true;
      trigger?.setAttribute('aria-haspopup', 'dialog');
      trigger?.setAttribute('aria-controls', host.id);
      let wasOpen = false;
      // The pinned widget hides its panel with CSS but leaves its controls focusable.
      const update = () => {
        const input = root.querySelector('input[role="combobox"][placeholder="Search"]');
        if (!input) return;
        root.querySelector('svg.lucide-search')?.closest('button')?.setAttribute('aria-label', 'Search');
        root.querySelector('svg.lucide-list-filter')?.closest('button')?.setAttribute('aria-label', 'Toggle search filters');
        const open = getComputedStyle(input).pointerEvents !== 'none';
        const inside = document.activeElement === host;
        host.inert = !open;
        trigger?.setAttribute('aria-expanded', String(open));
        if (open && !wasOpen && (document.activeElement === trigger || document.activeElement === document.body)) input.focus();
        if (!open && inside) trigger?.focus();
        wasOpen = open;
      };
      new MutationObserver(update).observe(root, { childList: true, attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
      update();
    }
    return found;
  }
  function initialize() {
    // Empty code-line anchors remain hash targets, not invisible keyboard stops.
    for (const anchor of document.querySelectorAll('a[id^="__codelineno-"]')) {
      if (!anchor.textContent.trim()) {
        anchor.tabIndex = -1;
        anchor.setAttribute('aria-hidden', 'true');
      }
    }
    if (!bindSearch()) {
      const observer = new MutationObserver(() => { if (bindSearch()) observer.disconnect(); });
      observer.observe(document.body, { childList: true });
      window.addEventListener('load', () => { if (bindSearch()) observer.disconnect(); }, { once: true });
    }
    for (const label of document.querySelectorAll('.md-header label[for], .md-nav label[for][tabindex]')) {
      const control = document.getElementById(label.htmlFor);
      if (!(control instanceof HTMLInputElement) || (control.type !== 'checkbox' && control.type !== 'radio')) continue;
      // Keep Zensical's native bindings; put focus on the visible action, not its hidden transport input.
      control.tabIndex = -1;
      control.setAttribute('aria-hidden', 'true');
      label.tabIndex = 0;
      label.setAttribute('role', 'button');
      label.removeAttribute('aria-hidden');
      const section = label.textContent.trim() || label.parentElement.querySelector('a')?.textContent.trim();
      const name = label.getAttribute('aria-label') || label.title || control.getAttribute('aria-label') || section;
      if (name) label.setAttribute('aria-label', name);
      label.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
          event.preventDefault();
          event.stopPropagation();
          label.click();
        }
      });
      label.addEventListener('click', () => {
        if (control.name !== '__palette') return;
        requestAnimationFrame(() => {
          const focused = document.activeElement;
          if (focused !== label && focused !== control && focused !== document.body) return;
          for (const next of document.querySelectorAll('.md-header label[for^="__palette_"]')) {
            if (next.getClientRects().length) { next.focus(); break; }
          }
        });
      });
      if (control.type === 'checkbox') {
        const panel = control.id === '__drawer'
          ? document.querySelector('.md-sidebar--primary')
          : label.closest('li')?.querySelector(':scope > nav');
        if (panel) {
          if (!panel.id) panel.id = `${control.id}-panel`;
          label.setAttribute('aria-controls', panel.id);
        }
        const update = () => label.setAttribute('aria-expanded', String(control.checked));
        control.addEventListener('change', update);
        if (control.id === '__drawer') document.addEventListener('keydown', event => {
          if (event.key !== 'Escape' || !control.checked) return;
          event.preventDefault();
          control.click();
          if (label.getClientRects().length) label.focus();
        });
        update();
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
