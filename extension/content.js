(() => {
  "use strict";
  if (globalThis.__CANVAS_LOCAL_UI_V1__) return;
  const C=CanvasLocalCore;
  const topFrame=window===window.top;
  let frames=[];
  let cfg=C.normalize(), scopeAllowed=false, focusState={}, host, shadow, poll, panelOpen=false, disposed=false;
  let uiError="", busy=false, x=null, y=20;
  const cleaner=CanvasLocalCleaner.createCleaner(document,()=>renderStatus());
  function pageState() { return {settings:cfg,scopeAllowed,topFrame,cleaner:cleaner.state(),focus:focusState,toolbar:!!host,error:uiError}; }
  async function request(message) {
    const result=await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw Error(result?.error||"扩展未响应");
    return result;
  }
  function text(id,value) {
    const el=shadow?.getElementById(id);
    if (el && el.textContent!==String(value)) el.textContent=String(value);
  }
  function renderStatus() {
    if (!shadow) return;
    const s=cleaner.state();
    for (const [id,key] of [["master","enabled"],["focus","focus"],["clean","cleaner"]]) {
      const el=shadow.getElementById(id);
      el.setAttribute("aria-pressed",String(cfg[key]));
      el.classList.toggle("on",cfg[key]&&(id==="master"||cfg.enabled));
      el.disabled=busy||(id!=="master"&&!cfg.enabled);
    }
    text("f-state",focusState.enabled?(focusState.effective?"已启用 · 当前属性符合预期":"已启用 · 存在冲突"):"已关闭");
    text("f-events",focusState.suppressed??0);
    text("f-registrations",focusState.blockedRegistrations??0);
    text("f-lifecycle",focusState.blockedLifecycleRegistrations??0);
    text("f-removals",focusState.blockedRemovals??0);
    text("f-page-registrations",focusState.blockedPageRegistrations??0);
    text("f-frames",frames.length?frames.filter(f=>f.focus?.injected).length+" / "+frames.length:"待查询");
    text("f-frame-active",frames.filter(f=>f.focus?.enabled&&f.focus?.effective).length);
    text("f-early",focusState.early?"页面早期加载":"晚于页面加载；刷新后可更早接入");
    text("c-state",s.enabled?"已启用":"已关闭");
    text("c-count",s.retained);
    text("c-restored",s.restored);
    text("note",uiError || [...(focusState.errors||[]),...s.errors,
      ...(focusState.restoreNeedsReload?["焦点处理已关闭；保存输入并刷新页面，可重建此前被过滤的监听注册和移除操作"]:[]),
      ...(s.orphaned?["页面已替换 "+s.orphaned+" 个恢复位置"]:[]),
      ...(s.capped?["达到 500 个保留节点上限"]:[])].join("；") || "仅本地处理 · 计数不是防检测保证");
    shadow.getElementById("panel").hidden=!cfg.panel||!panelOpen;
    shadow.getElementById("status").hidden=!cfg.panel;
    shadow.getElementById("status").setAttribute("aria-expanded",String(cfg.panel&&panelOpen));
  }
  async function change(key,value) {
    if (busy) return;
    busy=true;renderStatus();
    try { const result=await request({type:"SET_FLAG",key,value}); cfg=result.settings; uiError=""; }
    catch(error) { uiError=error.message; }
    finally { busy=false;renderStatus(); }
  }
  function place() {
    if (!host) return;
    const width=shadow.querySelector(".bar").getBoundingClientRect().width;
    x=Math.max(8,Math.min(x??innerWidth-width-20,Math.max(8,innerWidth-width-8)));
    y=Math.max(8,Math.min(y,Math.max(8,innerHeight-70)));
    host.style.left=x+"px";host.style.top=y+"px";
    const p=shadow.getElementById("panel");
    p.style.maxHeight=Math.max(100,innerHeight-y-75)+"px";
  }
  function mount() {
    if (host || !document.documentElement) return;
    host=document.createElement("div");
    host.id="canvas-local-assistant";
    Object.assign(host.style,{position:"fixed",zIndex:"2147483646",left:"20px",top:"20px",pointerEvents:"none"});
    shadow=host.attachShadow({mode:"open"});
    // Static template only: no page data is interpolated as HTML.
    shadow.innerHTML=`
<style>
:host{all:initial;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#e5edf7;font-size:12px}
*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #66e0d0;outline-offset:2px}
.bar{display:flex;align-items:center;gap:5px;padding:7px;background:#142031;border:1px solid #42566e;border-radius:15px;box-shadow:0 8px 30px #00102044;pointer-events:auto;width:max-content;max-width:calc(100vw - 16px)}
button{border:0;border-radius:9px;background:#253347;color:#d7e5f4;padding:8px}
button.on{background:#185f57;color:#bdfff0}button:disabled{opacity:.5}
#grip{touch-action:none;cursor:grab;color:#91a9bd;padding:5px}.brand{font-weight:800;color:#77e9d2;padding:0 4px}
#panel{pointer-events:auto;position:absolute;right:0;top:55px;width:min(320px,calc(100vw - 16px));overflow:auto;background:#fff;color:#172c43;border:1px solid #d6e1e9;border-radius:15px;box-shadow:0 12px 36px #00102033;padding:17px}
[hidden]{display:none!important}h2{font-size:15px;margin:0 0 15px}.row{display:flex;justify-content:space-between;gap:15px;padding:7px 0;border-bottom:1px solid #edf1f5}.small{font-size:11px;color:#64758a;line-height:1.7}#note{margin-top:13px;color:#465e74;overflow-wrap:anywhere}
</style>
<div class="bar" role="toolbar" aria-label="Canvas Phantom 页面功能">
<button id="grip" aria-label="拖动工具栏；方向键移动" title="拖动；方向键移动">⠿</button><span class="brand" title="Canvas Phantom · 幻影">CP</span>
<button id="master" aria-label="总开关">总开关</button>
<button id="focus" aria-label="焦点处理">焦点</button>
<button id="clean" aria-label="隐藏文本清理">清理</button>
<button id="status" aria-controls="panel" aria-label="状态面板">状态</button>
<button id="hide" aria-label="隐藏工具栏；可在插件弹窗重新开启">×</button>
</div>
<section id="panel" hidden aria-label="实时运行状态">
<h2>Canvas Phantom · 运行状态</h2>
<div class="row"><span>焦点处理</span><strong id="f-state"></strong></div>
<div class="row"><span>已拦截页面事件</span><strong id="f-events">0</strong></div>
<div class="row"><span>已拦截元素监听注册</span><strong id="f-registrations">0</strong></div>
<div class="row"><span>已拦截生命周期注册</span><strong id="f-lifecycle">0</strong></div>
<div class="row"><span>已拦截监听移除调用</span><strong id="f-removals">0</strong></div>
<div class="row"><span>已拦截页面监听注册</span><strong id="f-page-registrations">0</strong></div>
<div class="row"><span>已接入 / 可查询文档</span><strong id="f-frames">待查询</strong></div>
<div class="row"><span>焦点状态符合预期的文档</span><strong id="f-frame-active">0</strong></div>
<p id="f-early" class="small"></p>
<div class="row"><span>隐藏文本清理</span><strong id="c-state"></strong></div>
<div class="row"><span>当前保留待恢复节点</span><strong id="c-count">0</strong></div>
<div class="row"><span>关闭后已恢复节点</span><strong id="c-restored">0</strong></div>
<p id="note" class="small" role="status"></p>
</section>`;
    document.documentElement.append(host);
    const action=(id,fn)=>shadow.getElementById(id).addEventListener("click",event=>{if(event.isTrusted) fn();});
    action("master",()=>change("enabled",!cfg.enabled));
    action("focus",()=>change("focus",!cfg.focus));
    action("clean",()=>change("cleaner",!cfg.cleaner));
    action("hide",()=>change("toolbar",false));
    action("status",async()=>{
      panelOpen=!panelOpen;renderStatus();
      if (panelOpen) try {focusState=(await request({type:"FOCUS_STATUS"})).focus;frames=(await request({type:"FRAME_STATUS"})).frames;renderStatus();}
      catch(error) {uiError=error.message;renderStatus();}
    });
    const grip=shadow.getElementById("grip");
    let drag;
    grip.addEventListener("pointerdown",event=>{
      if (!event.isTrusted || event.button!==0) return;
      drag={dx:event.clientX-x,dy:event.clientY-y};grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener("pointermove",event=>{
      if (!drag) return;
      x=event.clientX-drag.dx;y=event.clientY-drag.dy;place();
    });
    grip.addEventListener("pointerup",()=>{drag=null;});
    grip.addEventListener("pointercancel",()=>{drag=null;});
    grip.addEventListener("keydown",event=>{
      const deltas={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]};
      if (!deltas[event.key]||!event.isTrusted) return;
      event.preventDefault();x+=deltas[event.key][0];y+=deltas[event.key][1];place();
    });
    place();renderStatus();
  }
  function unmount() { host?.remove();host=null;shadow=null; }
  function apply(settings,allowed,focus) {
    cfg=C.normalize(settings);scopeAllowed=allowed;
    if (focus) focusState=focus;
    cleaner.setEnabled(scopeAllowed&&cfg.enabled&&cfg.cleaner);
    if (topFrame&&scopeAllowed&&cfg.toolbar) mount(); else unmount();
    renderStatus();
  }
  const onResize=()=>place();
  window.addEventListener("resize",onResize);
  async function onRoute() {
    if (!C.frameAllowed(location.href)) { apply(cfg,false); return; }
    try {const result=await request({type:"PAGE_READY"});apply(result.settings,true,result.focus);}
    catch(error) {uiError=error.message;renderStatus();}
  }
  window.addEventListener("popstate",onRoute);
  window.navigation?.addEventListener("currententrychange",onRoute);
  function onMessage(message,sender,respond) {
    if (sender.id!==chrome.runtime.id) return;
    if (message?.type==="APPLY_SETTINGS") {
      if(message.frames)frames=message.frames;
      apply(message.settings,message.scopeAllowed,message.focus);respond({ok:true});return;
    }
    if (message?.type==="GET_PAGE_STATE") {respond(pageState());return;}
  }
  chrome.runtime.onMessage.addListener(onMessage);
  function dispose() {
    disposed=true;clearInterval(poll);cleaner.setEnabled(false);unmount();
    window.removeEventListener("resize",onResize);
    window.removeEventListener("popstate",onRoute);
    window.navigation?.removeEventListener("currententrychange",onRoute);
    try {chrome.runtime.onMessage.removeListener(onMessage);} catch {}
  }
  globalThis.__CANVAS_LOCAL_UI_V1__=Object.freeze({state:pageState,dispose});
  async function start() {
    try {
      const result=await request({type:"PAGE_READY"});
      apply(result.settings,C.frameAllowed(location.href),result.focus);
      poll=setInterval(async()=>{
        if (disposed || document.hidden || !panelOpen || !cfg.panel || !host) return;
        try { focusState=(await request({type:"FOCUS_STATUS"})).focus;frames=(await request({type:"FRAME_STATUS"})).frames;renderStatus(); }
        catch(error) {uiError=error.message;renderStatus();}
      },2000);
    } catch(error) { uiError=error.message; }
  }
  start();
})();
