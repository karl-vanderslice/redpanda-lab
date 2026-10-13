(() => {
  'use strict';
  // Zensical 0.0.62 defines these helpers before extrahead. Install before its
  // palette and bundle read preferences, so denied storage cannot abort the UI.
  const read = window.__md_get;
  const write = window.__md_set;
  const preferences = new Map();
  const identity = (key, scope) => `${scope.pathname}.${key}`;

  window.__md_get = (key, storage, scope = window.__md_scope) => {
    try {
      const saved = read(key, storage, scope);
      if (saved !== null) return saved;
    } catch {
      // Storage is optional. Current-page choices remain available below.
    }
    return preferences.get(identity(key, scope)) ?? null;
  };

  window.__md_set = (key, value, storage, scope = window.__md_scope) => {
    preferences.set(identity(key, scope), value);
    try {
      write(key, value, storage, scope);
    } catch {
      // Accessing the storage object itself can throw before write's guard.
    }
  };
})();
