/*
 * Reuses the original Canvas assignment selector and aria-hidden span candidate.
 * Unlike the original, this verifies visual invisibility and retains original nodes.
 */
(() => {
  const SCOPE = '#content-wrapper .description.user_content.enhanced[data-resource-type="assignment.body"], .quiz_description.user_content, .question .question_text';
  const EXEMPT = "button,a,input,textarea,select,label,[contenteditable=true],[role=math],math,mjx-container,.MathJax,svg";
  function createCleaner(doc = document, onChange = () => {}) {
    const view = doc.defaultView, saved = new Map();
    let enabled = false, observer, timer = null, total = 0, restored = 0, orphaned = 0, scans = 0, capped = false;
    let errors = [];
    function state() { return {enabled,retained:saved.size,total,restored,orphaned,scans,capped,errors:[...errors]}; }
    function publish() { onChange(state()); }
    function hidden(el) {
      const css = view.getComputedStyle(el);
      return css.display === "none" || ["hidden","collapse"].includes(css.visibility) || Number(css.opacity) === 0 || el.hidden;
    }
    function candidate(el) {
      return el.matches('span[aria-hidden="true"]') && !!el.textContent.trim() && !el.closest(EXEMPT)
        && !el.querySelector("a,button,input,select,textarea,svg,img,math,mjx-container,[contenteditable=true]")
        && hidden(el);
    }
    function scan() {
      timer = null;
      if (!enabled || !doc.documentElement) return;
      scans++;
      for (const [marker] of saved) if (!marker.isConnected) { saved.delete(marker); orphaned++; }
      try {
        for (const scope of doc.querySelectorAll(SCOPE)) {
          for (const el of scope.querySelectorAll('span[aria-hidden="true"]')) {
            if (!el.isConnected || !candidate(el)) continue;
            if (saved.size >= 500) { capped = true; break; }
            const marker = doc.createComment("canvas-local:restore");
            el.replaceWith(marker);
            saved.set(marker,el); total++;
          }
        }
      } catch { errors = [...errors.slice(-7),"DOM 清理异常"]; }
      publish();
    }
    function schedule() { if (enabled && timer === null) timer = view.setTimeout(scan,60); }
    function setEnabled(value) {
      if ((value === true) === enabled) return state();
      enabled = value === true;
      if (enabled) {
        errors = []; capped = false;
        observer = new view.MutationObserver(records => {
          const relevant = records.some(record => {
            const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
            if (target?.closest(SCOPE)) return true;
            return [...record.addedNodes,...record.removedNodes].some(node => node.nodeType === 1 && (node.matches(SCOPE) || node.querySelector(SCOPE)));
          });
          if (relevant) schedule();
        });
        observer.observe(doc,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["aria-hidden","style","class","hidden"]});
        scan();
      } else {
        observer?.disconnect(); observer = null;
        if (timer !== null) view.clearTimeout(timer);
        timer = null;
        for (const [marker,el] of saved) {
          try {
            if (marker.isConnected) { marker.replaceWith(el); restored++; }
            else orphaned++;
          } catch { orphaned++; errors = [...errors.slice(-7),"节点恢复失败"]; }
        }
        saved.clear(); publish();
      }
      return state();
    }
    return Object.freeze({setEnabled,state,scan});
  }
  globalThis.CanvasLocalCleaner = Object.freeze({createCleaner,SCOPE});
})();
