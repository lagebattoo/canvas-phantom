/*
 * Derived from the visibility/focus portion of the inspected Canvas Crack 1.0.0
 * ch-premium.js. Source hash and changes: ../SOURCE-NOTES.md and ../DIFF_FILE.patch.
 * v0.1.1 restores Canvas Hack's Element listener registration filter.
 * v0.1.3 adds Crack 1.0.0 lifecycle-registration and removal-call filtering.
 * No enumeration or deletion of pre-existing page listeners is performed.
 */
(() => {
  "use strict";
  const KEY = "__CANVAS_LOCAL_FOCUS_V1__";
  if (globalThis[KEY]) {
    globalThis[KEY].setEnabled(globalThis.__CANVAS_LOCAL_FOCUS_DEFAULT__ === true);
    return;
  }
  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  const nativeDefine = Object.defineProperty;
  const nativeDescriptor = Object.getOwnPropertyDescriptor;
  const properties = {visibilityState:"visible", hidden:false, webkitVisibilityState:"visible", webkitHidden:false, mozHidden:false, msHidden:false};
  const events = ["focus","blur","visibilitychange","webkitvisibilitychange","mozvisibilitychange","msvisibilitychange"];
  // Same candidate list as Canvas Hack 1.9.1 Element.prototype.addEventListener.
  const elementEvents = ["focus","focusin","focusout","blur","visibilitychange","webkitvisibilitychange","mozvisibilitychange","msvisibilitychange"];
  const lifecycleEvents = ["pagehide","pageshow"];
  // Exact Crack removal list, not the broader Hack/Ninja Element add list.
  const removalEvents = [...events,...lifecycleEvents];
  const patches = new Map();
  const methodPatches = [];
  let blockedLifecycleRegistrations = 0, blockedRemovals = 0, blockedPageRegistrations = 0;
  let elementPatch = null, blockedRegistrations = 0;
  let enabled = false, suppressed = 0, errors = [], listeners = false;
  const early = document.readyState === "loading";
  const eligible = () => /^(https?:|about:|data:|blob:|filesystem:)$/.test(location.protocol);
  let requested = globalThis.__CANVAS_LOCAL_FOCUS_DEFAULT__ === true;
  function problem(message) { if (!errors.includes(message)) errors = [...errors.slice(-7), message]; }
  function patch(key, value) {
    try {
      const before = nativeDescriptor(document,key);
      nativeDefine(document,key,{value,writable:true,enumerable:before?.enumerable ?? false,configurable:true});
      patches.set(key,{before,value});
    } catch { problem("属性未接管：" + key); }
  }
  function intercept(event) {
    // Page-level dispatch handling is unchanged. Elements use the sample's
    // registration-time filter below, rather than a new dispatch-time policy.
    if (enabled && (event.target === window || event.target === document)) {
      suppressed++;
      event.stopImmediatePropagation();
    }
  }
  function patchElementListeners() {
    const before = nativeDescriptor(Element.prototype,"addEventListener");
    const previous = Element.prototype.addEventListener;
    const replacement = function addEventListener(type,listener,options) {
      if (enabled && (elementEvents.includes(type) || lifecycleEvents.includes(type))) {
        blockedRegistrations++;
        if (lifecycleEvents.includes(type)) blockedLifecycleRegistrations++;
        return;
      }
      return previous.call(this,type,listener,options);
    };
    try {
      nativeDefine(Element.prototype,"addEventListener",{value:replacement,writable:true,enumerable:before?.enumerable??false,configurable:true});
      elementPatch = {before,replacement};
    } catch { problem("元素监听方法未接管：addEventListener"); }
  }
  function restoreElementListeners() {
    if (!elementPatch) return;
    const {before,replacement} = elementPatch;
    try {
      if (nativeDescriptor(Element.prototype,"addEventListener")?.value !== replacement) problem("恢复冲突：Element.addEventListener");
      else if (before) nativeDefine(Element.prototype,"addEventListener",before);
      else delete Element.prototype.addEventListener;
    } catch { problem("元素监听方法恢复失败"); }
    elementPatch = null;
  }
  function patchMethod(owner,key,types,label,kind) {
    const before = nativeDescriptor(owner,key), previous = owner[key];
    const replacement = function(type,listener,options) {
      if (enabled && types.includes(type)) {
        if (kind === "remove") blockedRemovals++;
        else { blockedPageRegistrations++; if(lifecycleEvents.includes(type)) blockedLifecycleRegistrations++; }
        return;
      }
      return previous.call(this,type,listener,options);
    };
    try {
      nativeDefine(owner,key,{value:replacement,writable:true,enumerable:before?.enumerable??false,configurable:true});
      methodPatches.push({owner,key,before,replacement,label,kind});
    } catch { problem("监听方法未接管："+label); }
  }
  function patchLifecycleAndRemoval() {
    for (const [owner,label] of [[Window.prototype,"Window"],[Document.prototype,"Document"]])
      patchMethod(owner,"addEventListener",removalEvents,label+".addEventListener","page");
    // Hack/Ninja put an eight-name filter directly on both objects. Retain
    // v0.1.3 lifecycle filtering as an explicit additive difference.
    for (const [owner,label] of [[window,"window"],[document,"document"]])
      patchMethod(owner,"addEventListener",[...elementEvents,...lifecycleEvents],label+".addEventListener","entry");
    for (const [owner,label] of [[Window.prototype,"Window"],[Document.prototype,"Document"],[Element.prototype,"Element"]])
      patchMethod(owner,"removeEventListener",removalEvents,label+".removeEventListener","remove");
  }
  function restoreMethods() {
    for (const p of methodPatches.splice(0).reverse()) {
      try {
        if (nativeDescriptor(p.owner,p.key)?.value !== p.replacement) problem("恢复冲突："+p.label);
        else if (p.before) nativeDefine(p.owner,p.key,p.before);
        else delete p.owner[p.key];
      } catch { problem("监听方法恢复失败："+p.label); }
    }
  }
  function state() {
    const elementInterception = !!elementPatch && nativeDescriptor(Element.prototype,"addEventListener")?.value === elementPatch.replacement;
    const owned = kind => methodPatches.filter(p=>p.kind===kind&&nativeDescriptor(p.owner,p.key)?.value===p.replacement).length;
    const pageRegistrationInterception = owned("page")===2;
    const directEntryInterception = owned("entry")===2;
    const lifecycleInterception = elementInterception && pageRegistrationInterception && directEntryInterception;
    const removalInterception = owned("remove")===3;
    let effective = false;
    try { effective = enabled && lifecycleInterception && removalInterception && document.hidden === false && document.visibilityState === "visible" && typeof document.hasFocus === "function" && document.hasFocus() === true; }
    catch { problem("页面属性读取异常"); }
    return {enabled,eligible:eligible(),early,suppressed,patched:[...patches.keys()],errors:[...errors],
      effective,elementInterception,lifecycleInterception,removalInterception,pageRegistrationInterception,directEntryInterception,blockedRegistrations,
      blockedLifecycleRegistrations,blockedRemovals,blockedPageRegistrations,
      restoreNeedsReload:!enabled&&(blockedRegistrations>0||blockedPageRegistrations>0||blockedLifecycleRegistrations>0||blockedRemovals>0)};
  }
  function setEnabled(value) {
    requested = value === true;
    const next = requested && eligible();
    if (next === enabled) return state();
    if (next) {
      enabled = true; errors = [];
      for (const [key,value] of Object.entries(properties)) if (key in document) patch(key,value);
      patch("hasFocus", function hasFocus() { return true; });
      patchElementListeners();
      patchLifecycleAndRemoval();
      for (const target of [window,document]) for (const event of events)
        nativeAdd.call(target,event,intercept,true);
      listeners = true;
    } else {
      enabled = false;
      if (listeners) for (const target of [window,document]) for (const event of events)
        nativeRemove.call(target,event,intercept,true);
      listeners = false;
      restoreMethods();
      restoreElementListeners();
      for (const [key,{before,value}] of patches) {
        try {
          const current = nativeDescriptor(document,key);
          // A later script may own this property now. Do not overwrite its change.
          if (!current || !Object.is(current.value,value)) { problem("恢复冲突：" + key); continue; }
          if (before) nativeDefine(document,key,before);
          else delete document[key];
        } catch { problem("恢复失败：" + key); }
      }
      patches.clear();
    }
    return state();
  }
  nativeDefine(globalThis,KEY,{value:Object.freeze({setEnabled,state}),configurable:true});
  const routeChanged = () => setEnabled(requested);
  nativeAdd.call(window,"popstate",routeChanged);
  if (window.navigation) nativeAdd.call(window.navigation,"currententrychange",routeChanged);
  setEnabled(globalThis.__CANVAS_LOCAL_FOCUS_DEFAULT__ === true);
})();
