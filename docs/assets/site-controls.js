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
      // Wide layouts use the search button; narrow layouts use the header label action.
      const triggers = [...document.querySelectorAll('.md-search__button, .md-header label[for="__search"] .label-action')];
      document.querySelector('[data-md-component="search"]')?.removeAttribute('role');
      host.id ||= 'zensical-search-dialog';
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-label', 'Search');
      host.setAttribute('aria-modal', 'true');
      host.inert = true;
      for (const trigger of triggers) {
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', host.id);
      }
      const style = document.createElement('style');
      // The pinned shadow widget fades breadcrumbs and filter captions below readable contrast.
      style.textContent = `
        menu[class], #zensical-search-filters h4 { color: var(--doc-muted); }
        #zensical-search-filters h4 { opacity: 1; }
      `;
      root.append(style);
      let wasOpen = false;
      const backgroundInert = new Map();
      // The pinned overlay lets Tab leave the page instead of wrapping inside it.
      root.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented || !wasOpen) return;
        const controls = [...root.querySelectorAll('a[href], button, input, [tabindex]')]
          .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && !control.closest('[inert]') && control.getClientRects().length);
        const boundary = event.shiftKey ? controls[0] : controls.at(-1);
        if (!boundary || root.activeElement !== boundary) return;
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0]).focus();
      });
      // The pinned widget hides its panel with CSS but leaves its controls focusable.
      const update = () => {
        const input = root.querySelector('input[placeholder="Search"]');
        if (!input) return;
        // Results are document links, not options in a combobox listbox.
        input.setAttribute('role', 'searchbox');
        input.setAttribute('aria-label', 'Search documentation');
        root.querySelector('svg.lucide-search')?.closest('button')?.setAttribute('aria-label', 'Search');
        const filterButton = root.querySelector('svg.lucide-list-filter')?.closest('button');
        filterButton?.setAttribute('aria-label', 'Toggle search filters');
        const open = getComputedStyle(input).pointerEvents !== 'none';
        if (open && !wasOpen) {
          for (const child of document.body.children) {
            if (child === host) continue;
            backgroundInert.set(child, child.inert);
            child.inert = true;
          }
        } else if (!open && wasOpen) {
          for (const [child, inert] of backgroundInert) child.inert = inert;
          backgroundInert.clear();
        }
        host.inert = !open;
        for (const trigger of triggers) trigger.setAttribute('aria-expanded', String(open));
        const filterTitle = [...root.querySelectorAll('h3')].find(heading => heading.textContent === 'Filters');
        const filters = filterTitle?.parentElement?.parentElement;
        if (filters) {
          filters.id ||= 'zensical-search-filters';
          filterTitle.id ||= `${filters.id}-title`;
          filters.tabIndex = 0;
          filters.setAttribute('role', 'region');
          filters.setAttribute('aria-labelledby', filterTitle.id);
          // Zensical 0.0.62 uses "d" to collapse this panel by width and opacity only.
          const expanded = !filters.classList.contains('d');
          filters.inert = !expanded;
          filterButton?.setAttribute('aria-controls', filters.id);
          filterButton?.setAttribute('aria-expanded', String(expanded));
        }
        if (open && !wasOpen) input.focus();
        if (!open && wasOpen) {
          // The narrow header toggle stays checked after the widget closes itself.
          const toggle = document.getElementById('__search');
          if (toggle) toggle.checked = false;
          triggers.find(trigger => trigger.getClientRects().length)?.focus();
        }
        wasOpen = open;
      };
      new MutationObserver(update).observe(root, { childList: true, attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
      update();
    }
    return found;
  }
  function initialize() {
    // Copy feedback is a status, not a modal dialog.
    document.querySelector('.md-dialog')?.setAttribute('role', 'status');
    // The pinned theme gives breadcrumbs the same landmark name as the primary navigation.
    document.querySelector('.md-path')?.setAttribute('aria-label', 'Breadcrumb');
    // Native code toolbars repeat a landmark; distinguish their controls.
    for (const [index, nav] of document.querySelectorAll('.md-code__nav').entries()) {
      nav.setAttribute('aria-label', `Code block ${index + 1} controls`);
    }
    // Code and table regions need keyboard scrolling, including after text enlargement.
    for (const code of document.querySelectorAll('.md-code__content')) code.tabIndex = 0;
    for (const [index, table] of document.querySelectorAll('.md-typeset__scrollwrap').entries()) {
      const caption = table.querySelector('caption')?.textContent.trim();
      table.tabIndex = 0;
      table.setAttribute('role', 'region');
      table.setAttribute('aria-label', caption ? `${caption} (table ${index + 1})` : `Table ${index + 1}`);
    }
    // Empty code-line anchors remain hash targets, not invisible keyboard stops.
    for (const anchor of document.querySelectorAll('a[id^="__codelineno-"]')) {
      if (!anchor.textContent.trim()) {
        anchor.tabIndex = -1;
        anchor.setAttribute('aria-hidden', 'true');
      }
    }
    // The pinned annotation index contains only a CSS-generated number.
    const annotations = document.querySelectorAll('.md-annotation');
    for (const annotation of annotations) {
      const number = annotation.querySelector('[data-md-annotation-id]')?.getAttribute('data-md-annotation-id');
      const tooltip = annotation.querySelector('[role="tooltip"]');
      if (!number || !tooltip?.id) continue;
      annotation.setAttribute('aria-label', `Code annotation ${number}`);
      annotation.setAttribute('aria-describedby', tooltip.id);
      annotation.querySelector('.md-annotation__index')?.setAttribute('aria-label', `Link to code annotation ${number}`);
      // Keep Escape dismissal on the stable trigger, not a recycled native tooltip node.
      const resetDismissal = () => annotation.removeAttribute('data-lab-tooltip-dismissed');
      annotation.addEventListener('focusin', resetDismissal);
      annotation.addEventListener('pointerdown', resetDismissal);
    }
    if (annotations.length) window.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const tooltips = document.querySelectorAll('.md-annotation[data-md-visible]:not([data-lab-tooltip-dismissed]) [role="tooltip"]');
      if (!tooltips.length) return;
      // Dismiss the popup without moving focus away from its annotation.
      for (const tooltip of tooltips) tooltip.closest('.md-annotation').setAttribute('data-lab-tooltip-dismissed', '');
      event.preventDefault();
    });
    // The empty backdrop is a pointer target, not a named navigation control.
    document.querySelector('.md-overlay')?.removeAttribute('aria-label');
    for (const label of document.querySelectorAll('.md-header label[for], .md-nav label[for][tabindex], .md-sidebar--secondary .md-sidebar-button[for]')) {
      const control = document.getElementById(label.htmlFor);
      if (!(control instanceof HTMLInputElement) || (control.type !== 'checkbox' && control.type !== 'radio')) continue;
      // Preserve native label/input bindings, but put button semantics on a valid inner element.
      control.tabIndex = -1;
      control.setAttribute('aria-hidden', 'true');
      const action = document.createElement('span');
      action.className = 'label-action';
      action.tabIndex = 0;
      action.setAttribute('role', 'button');
      action.append(...label.childNodes);
      label.append(action);
      label.removeAttribute('tabindex');
      label.removeAttribute('role');
      label.removeAttribute('aria-hidden');
      const section = label.textContent.trim() || label.parentElement.querySelector('a')?.textContent.trim();
      const name = label.getAttribute('aria-label') || label.title || control.getAttribute('aria-label') || (control.id === '__toc' ? 'On this page' : section);
      label.removeAttribute('aria-label');
      if (name) action.setAttribute('aria-label', name);
      action.addEventListener('keydown', event => {
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
          if (focused !== action && focused !== control && focused !== document.body) return;
          for (const next of document.querySelectorAll('.md-header label[for^="__palette_"] .label-action')) {
            if (next.getClientRects().length) { next.focus(); break; }
          }
        });
      });
      if (control.type === 'checkbox') {
        const toc = control.id === '__toc' ? label.closest('.md-sidebar--secondary') : null;
        const panel = control.id === '__drawer'
          ? document.querySelector('.md-sidebar--primary')
          : toc ? toc.querySelector('.md-sidebar__inner') : label.closest('li')?.querySelector(':scope > nav');
        const sidebar = control.id === '__drawer' ? panel : toc;
        if (panel) {
          if (!panel.id) panel.id = `${control.id}-panel`;
          action.setAttribute('aria-controls', panel.id);
        }
        const update = () => {
          const expanded = sidebar ? getComputedStyle(sidebar).position !== 'fixed' || control.checked : control.checked;
          action.setAttribute('aria-expanded', String(expanded));
          // The pinned theme hides disclosures by opacity, offscreen position or height alone.
          if (panel) {
            if (!expanded && panel.contains(document.activeElement)) action.focus();
            panel.inert = !expanded;
          }
        };
        control.addEventListener('change', update);
        if (control.id === '__drawer' || toc) (toc || document).addEventListener('keydown', event => {
          if (event.key !== 'Escape' || event.defaultPrevented || !control.checked) return;
          // Search handles Escape later at window level; do not close its background drawer.
          if (event.composedPath().some(target => boundSearchHosts.has(target))) return;
          event.preventDefault();
          event.stopPropagation();
          control.click();
          if (document.activeElement !== action && action.getClientRects().length) action.focus();
        });
        if (sidebar) window.addEventListener('resize', update);
        update();
      }
    }
    if (!bindSearch()) {
      const observer = new MutationObserver(() => { if (bindSearch()) observer.disconnect(); });
      observer.observe(document.body, { childList: true });
      window.addEventListener('load', () => { if (bindSearch()) observer.disconnect(); }, { once: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
