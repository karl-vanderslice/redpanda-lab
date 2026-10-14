const root = document.documentElement;
const button = document.getElementById('theme');
const preference = matchMedia('(prefers-color-scheme: dark)');
const storageKey = `redpanda-${location.pathname}-theme`;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
} catch { /* Storage is optional; the page still follows the system. */ }
function label() {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : preference.matches;
  if (button) button.textContent = dark ? 'Use light theme' : 'Use dark theme';
}
button?.addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : preference.matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem(storageKey, root.dataset.theme); } catch { /* Keep the choice on this page. */ }
  label();
});
preference.addEventListener('change', label);
label();
