(() => {
  'use strict';

  function initialize() {
    const images = document.querySelectorAll('.md-typeset img[src*="assets/blueprints/"][src$=".svg"]');
    for (const [index, image] of [...images].entries()) {
      const container = document.createElement('div');
      container.className = 'blueprint-viewer';
      const controls = document.createElement('div');
      controls.className = 'blueprint-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Diagram view');
      const viewport = document.createElement('div');
      viewport.className = 'blueprint-viewport';
      viewport.id = `blueprint-viewport-${index + 1}`;
      viewport.tabIndex = 0;
      viewport.setAttribute('role', 'region');
      viewport.setAttribute('aria-label', `${image.alt}. Scroll to explore the diagram.`);
      const status = document.createElement('span');
      status.className = 'blueprint-status';
      status.setAttribute('role', 'status');

      const buttons = ['Fit width', 'Read labels'].map((text, choice) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.disabled = true;
        button.setAttribute('aria-controls', viewport.id);
        button.setAttribute('aria-pressed', String(choice === 0));
        controls.append(button);
        button.addEventListener('click', () => {
          const detailed = choice === 1;
          container.dataset.view = detailed ? 'detail' : 'fit';
          buttons[0].setAttribute('aria-pressed', String(!detailed));
          buttons[1].setAttribute('aria-pressed', String(detailed));
          status.textContent = detailed
            ? 'Scroll the diagram. Arrow keys work when the diagram has focus.'
            : 'Fit to page width.';
        });
        return button;
      });

      const vector = document.createElement('a');
      vector.href = image.src;
      vector.textContent = 'Open SVG';
      vector.target = '_blank';
      vector.rel = 'noopener';
      const raster = document.createElement('a');
      raster.href = image.src.replace(/\.svg$/i, '.png');
      raster.textContent = 'PNG';
      controls.append(vector, raster);
      container.dataset.view = 'fit';
      const paragraph = image.parentElement;
      if (paragraph?.tagName === 'P') {
        paragraph.after(container);
        if (paragraph.childElementCount === 1 && !paragraph.textContent.trim()) paragraph.remove();
      } else image.before(container);
      container.append(controls, status, viewport);
      viewport.append(image);

      function loaded() {
        if (!image.naturalWidth) {
          status.textContent = 'Diagram unavailable. The source and lab guide remain below.';
          return;
        }
        // rem keeps labels responsive to text enlargement, not just viewport zoom.
        container.style.setProperty('--blueprint-detail-width', `${image.naturalWidth * 0.9 / 16}rem`);
        for (const button of buttons) button.disabled = false;
        status.textContent = 'Fit to page width.';
      }
      if (image.complete) loaded();
      else {
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', loaded, { once: true });
      }
    }
  }

  // This site uses full-page navigation, not Zensical instant navigation.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
