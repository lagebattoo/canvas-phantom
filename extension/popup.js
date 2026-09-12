const C=CanvasLocalCore;
let cfg=C.normalize(),tab,origin;
const $=id=>document.getElementById(id);
async function request(message) {
  const result=await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw Error(result?.error||"后台暂未响应");
  return result;
}
function status(message,error=false) {
  $("status").textContent=message;document.querySelector(".readout").classList.toggle("error",error);
}
function render() {
  for (const key of C.FLAGS) $(key).checked=cfg[key];
  const eligible=C.allowed(tab?.url);
  $("origin").textContent=origin||"当前是 Chrome 内部页面或非网页标签";
  $("site-state").textContent=!eligible?"当前页不适用":cfg.enabled?"自动运行已开启":"总开关已关闭";
  $("reload").disabled=!eligible;
  $("site-hint").textContent=!eligible?"Chrome 内部页、扩展商店等浏览器保护页面不接入。":cfg.enabled?"普通网页自动接入，无需逐站点添加。设置开启不等于所有框架已成功接入，请查看下方实际状态。":"核心处理已关闭，保留各子开关设置。";
}
for (const key of C.FLAGS) $(key).addEventListener("change",async()=>{
  const input=$(key);input.disabled=true;
  try {
    const result=await request({type:"SET_FLAG",key,value:input.checked});
    cfg=result.settings;render();
    status(result.delivery?.skipped?"设置已保存。部分文档尚未接入或已导航，请保存内容后刷新。":"设置已保存，并已通知当前可访问的网页文档。");
  } catch(error) {render();status(error.message,true);}
  finally {input.disabled=false;}
});
$("reload").addEventListener("click",async()=>{
  if (!tab?.id) return;
  if (!confirm("刷新可能丢失尚未保存的输入。确认已保存，继续刷新？")) return;
  await chrome.tabs.reload(tab.id);window.close();
});
async function start() {
  try {
    [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    origin=C.originOf(tab?.url);
    cfg=(await request({type:"GET_CONFIG"})).settings;render();
    if (!C.allowed(tab?.url)) {status("开关已保存；当前页不适用，普通网页按总开关自动运行。");return;}
    const result=await request({type:"GET_PAGE",tabId:tab.id});
    if (result.needsReload) status("此页尚未接入。请保存内容后刷新本页。");
    else status("顶层焦点："+(result.focus?.enabled?(result.focus.effective?"已开启":"存在冲突"):"已关闭")+"；已接入 "+result.frames.filter(f=>f.focus?.injected).length+" / 可查询 "+result.frames.length+" 个文档。");
  } catch(error) {status(error.message,true);}
}
start();
