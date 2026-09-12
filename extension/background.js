importScripts("core.js");
const C = CanvasLocalCore;
const IDS = ["canvas-local-main","canvas-local-ui"];
let queue = Promise.resolve();
function serialize(job) { const run = queue.then(job); queue = run.catch(()=>{}); return run; }
async function config() { return C.normalize((await chrome.storage.local.get("settings")).settings); }
function extensionPage(sender) { return sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL("")); }
async function register(cfg) {
  const matches = [...C.MATCHES];
  const existing = await chrome.scripting.getRegisteredContentScripts({ids:IDS});
  const shared={matches,excludeMatches:["https://chromewebstore.google.com/*","https://chrome.google.com/webstore/*"],runAt:"document_start",allFrames:true,matchOriginAsFallback:true,persistAcrossSessions:true};
  const definitions = [
    {...shared,id:IDS[0],js:[cfg.enabled&&cfg.focus?"focus-on.js":"focus-off.js","focus-engine.js"],world:"MAIN"},
    {...shared,id:IDS[1],js:["core.js","cleaner.js","content.js"],world:"ISOLATED"}
  ];
  for (const def of definitions) {
    if (existing.some(x=>x.id===def.id)) await chrome.scripting.updateContentScripts([def]);
    else await chrome.scripting.registerContentScripts([def]);
  }
}
async function focus(tabId,cfg,readOnly=false,documentId=null) {
  const results = await chrome.scripting.executeScript({
    target:documentId?{tabId,documentIds:[documentId]}:{tabId,allFrames:true},world:"MAIN",
    func:(value,readOnly)=>{
      try {
        const engine=globalThis.__CANVAS_LOCAL_FOCUS_V1__;
        return engine ? {injected:true,...(readOnly?engine.state():engine.setEnabled(value))} : {injected:false,enabled:false,effective:false,errors:["请保存输入后刷新页面以加载焦点引擎"]};
      } catch { return {enabled:false,effective:false,errors:["焦点引擎存在页面脚本冲突，请刷新后重试"]}; }
    },args:[cfg.enabled&&cfg.focus,readOnly]
  });
  return results.map(({frameId,documentId,result})=>({frameId,documentId,focus:result}));
}
async function refreshTabs(before,after) {
  let updated=0,skipped=0;
  const tabs=await chrome.tabs.query({url:[...C.MATCHES]});
  for (const tab of tabs) {
    if (!C.allowed(tab.url)) continue;
    try {
      const frames=await focus(tab.id,after);
      for (const frame of frames) {
        if(!frame.focus?.injected){skipped++;continue;}
        try {
          await chrome.tabs.sendMessage(tab.id,{type:"APPLY_SETTINGS",settings:after,scopeAllowed:true,focus:frame.focus,frames:frame.frameId===0?frames:undefined},{documentId:frame.documentId});
          updated++;
        } catch {skipped++;}
      }
    } catch { skipped++; }
  }
  return {updated,skipped};
}
async function save(before,next) {
  // Register first: a failed API call must not persist an unregistered policy.
  await register(next);
  await chrome.storage.local.set({settings:next});
  return {settings:next,delivery:await refreshTabs(before,next)};
}
async function handle(message,sender) {
  if (sender.id!==chrome.runtime.id || !message || typeof message.type!=="string") throw Error("无效扩展消息");
  const cfg=await config(), isUI=extensionPage(sender);
  const isContent=!!sender.tab && Number.isInteger(sender.frameId) && typeof sender.documentId==="string" && C.frameAllowed(sender.url);
  if (!isUI&&!isContent) throw Error("消息不是已接入的网页文档");
  switch(message.type) {
    case "GET_CONFIG": return {settings:cfg};
    case "GET_PAGE": {
      if (!isUI || !Number.isInteger(message.tabId)) throw Error("无效页面请求");
      const tab=await chrome.tabs.get(message.tabId);
      if (!C.allowed(tab.url,cfg)) return {eligible:false};
      try {
        const frames=await focus(tab.id,cfg,true),top=frames.find(f=>f.frameId===0);
        if(!top?.focus?.injected)return {eligible:true,needsReload:true,frames};
        return {eligible:true,focus:top.focus,frames,page:await chrome.tabs.sendMessage(tab.id,{type:"GET_PAGE_STATE"},{documentId:top.documentId})};
      } catch { return {eligible:true,needsReload:true}; }
    }
    case "PAGE_READY":
    case "FOCUS_STATUS":
      if (!isContent) throw Error("需要已授权页面");
      {
        // documentId prevents a stale request from targeting a new document
        // that reused the same frameId during navigation.
        const frames=await focus(sender.tab.id,cfg,message.type==="FOCUS_STATUS",sender.documentId);
        return {settings:cfg,focus:frames[0]?.focus};
      }
    case "FRAME_STATUS": {
      if(!isContent||sender.frameId!==0)throw Error("需要顶层文档");
      return {frames:await focus(sender.tab.id,cfg,true)};
    }
    case "SET_FLAG":
      if (!C.FLAGS.includes(message.key) || typeof message.value!=="boolean") throw Error("开关参数错误");
      return save(cfg,{...cfg,[message.key]:message.value});
    default: throw Error("未知消息类型");
  }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  serialize(()=>handle(message,sender)).then(data=>respond({ok:true,...data}),error=>respond({ok:false,error:String(error.message).slice(0,160)}));
  return true;
});
async function startup() { const cfg=await config(); await register(cfg); await chrome.storage.local.set({settings:cfg}); }
chrome.runtime.onInstalled.addListener(()=>serialize(startup).catch(error=>console.error("[Canvas Local] 注册失败",error.message)));
chrome.runtime.onStartup.addListener(()=>serialize(startup).catch(error=>console.error("[Canvas Local] 启动失败",error.message)));
