/* Local configuration; no remote endpoints or account state. */
(() => {
  const DEFAULTS = Object.freeze({schemaVersion:2, enabled:true, focus:true, cleaner:true, toolbar:true, panel:true});
  const MATCHES = Object.freeze(["http://*/*","https://*/*"]);
  const FLAGS = Object.freeze(["enabled","focus","cleaner","toolbar","panel"]);
  function originOf(value) {
    try {
      const u = new URL(value);
      if (u.username || u.password) return null;
      if (!["https:","http:"].includes(u.protocol)) return null;
      return u.origin;
    } catch { return null; }
  }
  function normalize(raw = {}) {
    const out = {...DEFAULTS};
    if (!raw || typeof raw !== "object") return out;
    for (const key of FLAGS) if (typeof raw[key] === "boolean") out[key] = raw[key];
    return out;
  }
  function allowed(url) {
    try { const u = new URL(url); return !!originOf(url) && u.hostname!=="chromewebstore.google.com" && !(u.hostname==="chrome.google.com"&&u.pathname.startsWith("/webstore")); }
    catch { return false; }
  }
  // Fallback documents are injected by Chrome only when their initiator matches.
  function frameAllowed(url) { return allowed(url) || /^(?:about:(?:blank|srcdoc)(?:[?#]|$)|data:|blob:|filesystem:)/.test(url||""); }
  globalThis.CanvasLocalCore = Object.freeze({DEFAULTS,FLAGS,MATCHES,normalize,originOf,allowed,frameAllowed});
})();
