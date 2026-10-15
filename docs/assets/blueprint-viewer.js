(() => {
  'use strict';

  function initialize() {
    const images = document.querySelectorAll('.md-typeset img[src*="assets/blueprints/"][src$=".svg"]');
    for (const [index, image] of [...images].entries()) {
      // Gallery thumbnails remain ordinary navigation links, including without JS.
      if (image.closest('a')) continue;
      const container = document.createElement('figure');
      container.className = 'blueprint-viewer';
      const controls = document.createElement('div');
      controls.className = 'blueprint-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Diagram controls');
      const viewport = document.createElement('div');
      viewport.className = 'blueprint-viewport';
      viewport.id = `blueprint-viewport-${index + 1}`;
      viewport.tabIndex = 0;
      viewport.setAttribute('role', 'region');
      viewport.setAttribute('aria-label', image.alt);
      const canvas = document.createElement('div');
      canvas.className = 'blueprint-canvas';
      const caption = document.createElement('figcaption');
      const help = document.createElement('span');
      help.id = `${viewport.id}-help`;
      help.textContent = 'Drag to pan. Ctrl or ⌘ + wheel to zoom. Arrow keys pan; + / − zoom; 0 fits.';
      viewport.setAttribute('aria-describedby', help.id);
      const status = document.createElement('span');
      status.className = 'blueprint-status';
      status.setAttribute('role', 'status');
      caption.append(status, help);
      const dialog = document.createElement('dialog');
      dialog.className = 'blueprint-dialog';
      dialog.setAttribute('aria-label', image.alt);
      document.body.append(dialog);
      // Native theme shortcuts must not open a competing search layer over this modal.
      dialog.addEventListener('keydown', event => event.stopPropagation());
      let zoom = 1;
      let dragging = null;
      let placeholder = null;
      let ready = false;

      function fitScale() {
        const box = viewport.getBoundingClientRect();
        return Math.min((box.width - 2) / image.naturalWidth, (box.height - 2) / image.naturalHeight);
      }

      function render() {
        const scale = fitScale();
        image.style.width = `${image.naturalWidth * scale * zoom}px`;
        canvas.style.width = `${Math.max(viewport.clientWidth, image.naturalWidth * scale * zoom)}px`;
        canvas.style.height = `${Math.max(viewport.clientHeight, image.naturalHeight * scale * zoom)}px`;
        if ((document.activeElement === out && zoom <= 1) ||
            (document.activeElement === into && zoom >= Math.max(8, 2 / scale))) {
          viewport.focus({ preventScroll: true });
        }
        out.disabled = zoom <= 1;
        into.disabled = zoom >= Math.max(8, 2 / scale);
        status.textContent = `${Math.round(zoom * 100)}% of fit`;
      }

      function changeZoom(next, point) {
        if (!ready) return;
        const box = viewport.getBoundingClientRect();
        const anchor = point || { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        const before = image.getBoundingClientRect();
        const fraction = { x: (anchor.x - before.left) / before.width, y: (anchor.y - before.top) / before.height };
        zoom = Math.max(1, Math.min(Math.max(8, 2 / fitScale()), next));
        render();
        const after = image.getBoundingClientRect();
        viewport.scrollLeft += after.left + fraction.x * after.width - anchor.x;
        viewport.scrollTop += after.top + fraction.y * after.height - anchor.y;
      }

      function fit() {
        if (!ready) return;
        zoom = 1;
        render();
        viewport.scrollTo(0, 0);
      }

      function pan(x, y) {
        viewport.scrollBy({ left: x, top: y, behavior: 'instant' });
      }

      function button(text, label, action) {
        const element = document.createElement('button');
        element.type = 'button';
        element.textContent = text;
        element.setAttribute('aria-label', label);
        element.setAttribute('aria-controls', viewport.id);
        element.title = label;
        element.disabled = true;
        element.addEventListener('click', action);
        controls.append(element);
        return element;
      }

      const out = button('−', 'Zoom out', () => changeZoom(zoom / 1.4));
      const into = button('+', 'Zoom in', () => changeZoom(zoom * 1.4));
      button('Fit', 'Fit diagram', fit);
      button('Read labels', 'Read labels', () => changeZoom(1 / fitScale() * parseFloat(getComputedStyle(document.documentElement).fontSize) / 20));
      button('←', 'Pan left', () => pan(-viewport.clientWidth / 3, 0));
      button('↑', 'Pan up', () => pan(0, -viewport.clientHeight / 3));
      button('↓', 'Pan down', () => pan(0, viewport.clientHeight / 3));
      button('→', 'Pan right', () => pan(viewport.clientWidth / 3, 0));
      const expand = button('Expand', 'Expand diagram', () => {
        if (dialog.open) {
          dialog.close();
          return;
        }
        placeholder = document.createComment('Diagram position');
        container.before(placeholder);
        dialog.append(container);
        dialog.showModal();
        expand.textContent = 'Close';
        expand.setAttribute('aria-label', 'Close diagram');
        expand.title = 'Close diagram';
        fit();
        viewport.focus();
      });
      function restore() {
        if (!placeholder) return;
        placeholder.replaceWith(container);
        placeholder = null;
        expand.textContent = 'Expand';
        expand.setAttribute('aria-label', 'Expand diagram');
        expand.title = 'Expand diagram';
        fit();
        expand.focus();
      }
      dialog.addEventListener('close', restore);
      window.addEventListener('beforeprint', () => {
        if (!dialog.open) return;
        dialog.close();
        restore();
      });
      for (const [text, href] of [['Open SVG', image.src], ['PNG', image.src.replace(/\.svg$/i, '.png')]]) {
        const link = document.createElement('a');
        link.textContent = text;
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener';
        controls.append(link);
      }

      const paragraph = image.parentElement;
      if (paragraph?.tagName === 'P') {
        paragraph.after(container);
        if (paragraph.childElementCount === 1 && !paragraph.textContent.trim()) paragraph.remove();
      } else image.before(container);
      container.append(controls, viewport, caption);
      viewport.append(canvas);
      canvas.append(image);
      image.draggable = false;
      viewport.addEventListener('wheel', event => {
        // Plain wheel/touch scrolling stays native; do not trap page scrolling.
        if (!ready || !(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        changeZoom(zoom * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.008), { x: event.clientX, y: event.clientY });
      }, { passive: false });
      viewport.addEventListener('pointerdown', event => {
        if (!ready || event.pointerType !== 'mouse' || event.button !== 0) return;
        const box = viewport.getBoundingClientRect();
        if (event.clientX >= box.left + viewport.clientLeft + viewport.clientWidth ||
            event.clientY >= box.top + viewport.clientTop + viewport.clientHeight) return;
        event.preventDefault();
        viewport.focus({ preventScroll: true });
        dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging');
      });
      viewport.addEventListener('pointermove', event => {
        if (!dragging || dragging.id !== event.pointerId) return;
        pan(dragging.x - event.clientX, dragging.y - event.clientY);
        dragging.x = event.clientX;
        dragging.y = event.clientY;
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        viewport.addEventListener(name, event => {
          if (dragging?.id !== event.pointerId) return;
          dragging = null;
          viewport.classList.remove('is-dragging');
          if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        });
      }
      viewport.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !ready) return;
        const step = event.shiftKey ? 160 : 60;
        const actions = {
          '+': () => changeZoom(zoom * 1.4), '=': () => changeZoom(zoom * 1.4),
          '-': () => changeZoom(zoom / 1.4), '0': fit, Home: fit,
          ArrowLeft: () => pan(-step, 0), ArrowRight: () => pan(step, 0),
          ArrowUp: () => pan(0, -step), ArrowDown: () => pan(0, step),
        };
        if (!actions[event.key]) return;
        event.preventDefault();
        actions[event.key]();
      });

      function loaded() {
        if (!image.naturalWidth) {
          status.textContent = 'Diagram unavailable. Open the SVG or PNG, or use the source and lab guide below.';
          return;
        }
        ready = true;
        for (const element of controls.querySelectorAll('button')) element.disabled = false;
        fit();
      }
      if (image.complete) loaded();
      else {
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', loaded, { once: true });
      }
      new ResizeObserver(() => {
        if (ready) changeZoom(zoom);
      }).observe(viewport);
    }
  }

  // Full-page navigation owns these observers, listeners and dialog lifetimes.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
