import { supabase } from "./supabase.js";
import { APP_CONFIG } from "./config.js";

const $=id=>document.getElementById(id);
let user=null;
let profile=null;
let currentFolder="INBOX";
let allMessages=[];
let selectedIds=new Set();
let toastTimer=null;

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function initials(value){
  return String(value||"U").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"U";
}
function toast(message){
  const el=$("toast");el.textContent=message;el.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3600);
}
function setStatus(message){$("status").textContent=message||"";}
async function checkProfile(){
  const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(error){console.error(error);setStatus("We could not check your profile. Refresh the page to try again.");return false}
  profile=data;
  if(!profile?.profile_completed){location.replace("./setup.html");return false}
  return true;
}
async function authHeaders(){
  const {data}=await supabase.auth.getSession();
  return {Authorization:"Bearer "+(data.session?.access_token||"")};
}
async function init(){
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user){location.replace("./auth.html");return}
  user=data.user;
  if(!await checkProfile())return;
  const display=profile.display_name||[profile.first_name,profile.last_name].filter(Boolean).join(" ")||user.email?.split("@")[0]||"there";
  $("welcomeText").textContent="Welcome back, "+display+". Here’s what’s happening in your inbox.";
  $("profileBtn").textContent=initials(display);
  $("profileBtn").title=display+" · "+(user.email||"");
  $("connectionLabel").textContent="Profile ready";
  $("connectionLabel").style.color="#6ee7b7";
  if(profile.theme==="light")document.body.classList.add("light-theme");
  await loadMail("INBOX");
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
function emptyState(folder){
  const title=folder==="INBOX"?"Your inbox is clear":folder==="STARRED"?"No starred messages":folder==="SENT"?"No sent messages":folder==="DRAFTS"?"No drafts yet":"Trash is empty";
  const copy=folder==="INBOX"?"When someone emails your Game API Mail address, the message will appear here.":folder==="STARRED"?"Star important messages to find them quickly here.":folder==="SENT"?"Messages you send will be listed here.":folder==="DRAFTS"?"Save a draft and come back to it whenever you're ready.":"Deleted messages will appear here while they're in Trash.";
  return `<div class="mail-empty"><div class="empty-art"><svg viewBox="0 0 48 48"><rect x="6" y="11" width="36" height="26" rx="5"/><path d="m8 14 16 12 16-12M7 34l11-10M41 34 30 24"/></svg></div><h2>${title}</h2><p>${copy}</p>${folder==="INBOX"?'<button class="empty-compose" id="emptyComposeBtn">Compose your first email</button>':""}</div>`;
}
async function loadMail(folder=currentFolder){
  currentFolder=folder;
  selectedIds.clear();updateSelectionUi();
  setStatus("Loading messages…");
  $("mailList").innerHTML="";
  const titleMap={INBOX:"Inbox",STARRED:"Starred",SENT:"Sent",DRAFTS:"Drafts",TRASH:"Trash"};
  $("pageTitle").textContent=titleMap[folder]||"Inbox";
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.folder===folder));
  try{
    const res=await fetch(APP_CONFIG.API_BASE_URL+"/api/mail?folder="+encodeURIComponent(folder),{headers:await authHeaders()});
    if(res.status===401){await supabase.auth.signOut();location.replace("./auth.html");return}
    if(!res.ok)throw new Error("backend");
    const data=await res.json();
    allMessages=Array.isArray(data.messages)?data.messages:[];
    $("backendNote").hidden=true;
    $("connectionLabel").textContent="Connected";
    $("connectionLabel").style.color="#6ee7b7";
    renderMessages();
    setStatus("");
  }catch(error){
    console.warn("Mail backend unavailable",error);
    allMessages=[];
    $("mailList").innerHTML=emptyState(folder);
    const note=$("backendNote");note.hidden=false;
    $("connectionLabel").textContent="Backend pending";
    $("connectionLabel").style.color="#ffad72";
    setStatus("Your account is ready.");
    $("resultCount").textContent="0 messages";
    const emptyBtn=$("emptyComposeBtn");if(emptyBtn)emptyBtn.onclick=()=>openCompose();
  }
}
function renderMessages(){
  const q=$("searchInput").value.trim().toLowerCase();
  const messages=allMessages.filter(m=>!q||[m.sender_name,m.sender_email,m.subject,m.body_preview].some(v=>String(v||"").toLowerCase().includes(q)));
  $("resultCount").textContent=messages.length+" message"+(messages.length===1?"":"s");
  if(!messages.length){$("mailList").innerHTML=emptyState(currentFolder);const b=$("emptyComposeBtn");if(b)b.onclick=openCompose;return}
  $("mailList").innerHTML=messages.map(m=>`<article class="mail-row ${m.is_read?"":"unread"}" data-message="${escapeHtml(m.id)}"><input type="checkbox" class="message-check" data-select="${escapeHtml(m.id)}" aria-label="Select message"><button class="star ${m.is_starred?"starred":""}" data-star="${escapeHtml(m.id)}" aria-label="Toggle star">${m.is_starred?"★":"☆"}</button><div class="sender">${escapeHtml(m.sender_name||m.sender_email||"Unknown sender")}</div><div class="subject">${escapeHtml(m.subject||"(No subject)")}</div><div class="date">${m.received_at?escapeHtml(new Date(m.received_at).toLocaleDateString()):""}</div></article>`).join("");
  $("mailList").querySelectorAll("[data-select]").forEach(el=>el.onchange=()=>{el.checked?selectedIds.add(el.dataset.select):selectedIds.delete(el.dataset.select);updateSelectionUi()});
  $("mailList").querySelectorAll("[data-star]").forEach(el=>el.onclick=async e=>{e.stopPropagation();await messageAction("star",{id:el.dataset.star,is_starred:!allMessages.find(m=>String(m.id)===el.dataset.star)?.is_starred})});
  $("mailList").querySelectorAll("[data-message]").forEach(el=>el.onclick=e=>{if(e.target.closest("button,input"))return;toast("Message reading will be available when the mail backend supports message details.")});
}
function updateSelectionUi(){
  $("markReadBtn").disabled=selectedIds.size===0;
  $("deleteBtn").disabled=selectedIds.size===0;
  $("selectionLabel").textContent=selectedIds.size?selectedIds.size+" selected":"All messages";
  $("selectAll").checked=allMessages.length>0&&selectedIds.size===allMessages.length;
}
async function messageAction(action,payload){
  try{
    const res=await fetch(APP_CONFIG.API_BASE_URL+"/api/mail/"+action,{method:"POST",headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify(payload)});
    if(!res.ok)throw new Error("action");
    toast(action==="star"?"Star updated.":action==="delete"?"Message deleted.":"Messages updated.");
    await loadMail(currentFolder);
  }catch{toast("This action will work when the mail backend endpoint is connected.")}
}
function openCompose(){$("composeDialog").showModal();$("toInput").focus()}
$("composeBtn").onclick=openCompose;
$("closeCompose").onclick=()=>$("composeDialog").close();
$("refreshBtn").onclick=()=>loadMail(currentFolder);
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");
$("settingsBtn").onclick=()=>location.href="./setup.html";
$("profileBtn").onclick=()=>location.href="./setup.html";
$("helpBtn").onclick=()=>toast("Game API Mail help: account setup and profile are available from Settings & profile.");
$("compactToggle").onclick=()=>document.body.classList.toggle("compact");
$("searchInput").addEventListener("input",renderMessages);
$("selectAll").onchange=()=>{
  if($("selectAll").checked)allMessages.forEach(m=>selectedIds.add(String(m.id)));
  else selectedIds.clear();
  renderMessages();updateSelectionUi();
};
$("markReadBtn").onclick=()=>messageAction("read",{ids:[...selectedIds]});
$("deleteBtn").onclick=()=>messageAction("delete",{ids:[...selectedIds]});
$("logoutBtn").onclick=async()=>{await supabase.auth.signOut();location.replace("./index.html")};
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{$("sidebar").classList.remove("open");loadMail(b.dataset.folder)});
$("saveDraftBtn").onclick=()=>toast("Draft saving will be available when the mail backend is connected.");
$("composeForm").onsubmit=async e=>{
  e.preventDefault();
  const send=$("composeForm").querySelector('[type="submit"]');send.disabled=true;send.textContent="Sending…";
  try{
    const res=await fetch(APP_CONFIG.API_BASE_URL+"/api/mail/send",{method:"POST",headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify({to:$("toInput").value,subject:$("subjectInput").value,body:$("bodyInput").value})});
    if(!res.ok)throw new Error("send");
    $("composeDialog").close();e.target.reset();toast("Message sent successfully.");await loadMail(currentFolder);
  }catch{toast("Sending is not available until the mail backend is connected. Your message has not been sent.")}
  finally{send.disabled=false;send.innerHTML='<svg viewBox="0 0 24 24"><path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z"/></svg>Send message'}
};
supabase.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT")location.replace("./auth.html")});
init();
