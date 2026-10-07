import { supabase } from "./supabase.js";
import { APP_CONFIG } from "./config.js";

const $=id=>document.getElementById(id);
let user=null;
let profile=null;
let currentFolder="INBOX";
let allMessages=[];
let selectedIds=new Set();
let toastTimer=null;

const SIDEBAR_ITEMS=[
 {folder:"INBOX",label:"Inbox",className:"inbox",icon:`<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></svg>`},
 {folder:"STARRED",label:"Starred",className:"starred",icon:`<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>`},
 {folder:"SENT",label:"Sent",className:"sent",icon:`<svg viewBox="0 0 24 24"><path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z"/><path d="M10.1 13.9 15 9"/></svg>`},
 {folder:"DRAFTS",label:"Drafts",className:"drafts",icon:`<svg viewBox="0 0 24 24"><path d="M4 4h11l5 5v11H4z"/><path d="M14 4v6h6M8 15h8M8 18h6"/></svg>`},
 {folder:"TRASH",label:"Trash",className:"trash",icon:`<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>`}
];
function renderSidebar(){
 const root=$("sidebarContent"); if(!root)return;
 const display=profile?.display_name||[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||user?.email?.split("@")[0]||"Account";
 root.innerHTML=`<div class="sidebar-content">
 <div class="sidebar-brandline"><div class="mini-mark"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></div><div><strong>Game API Mail</strong><span>PRIVATE MAIL WORKSPACE</span></div></div>
 <button id="composeBtn" class="dynamic-compose"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Compose</button>
 <div class="dynamic-section-title">MAILBOX</div><nav class="dynamic-nav">${SIDEBAR_ITEMS.map(x=>`<button class="dynamic-nav-item ${x.className}" data-folder="${x.folder}"><span class="nav-icon">${x.icon}</span><span class="nav-label">${x.label}</span><b class="nav-count" data-count-for="${x.folder}"></b></button>`).join("")}</nav>
 <div class="dynamic-divider"></div>
 <button id="settingsBtn" class="dynamic-nav-item settings"><span class="nav-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2 2-2 1.2-2.2-1.2a7 7 0 0 1-1.4.6L14.7 21h-2.8l-.4-2.6a7 7 0 0 1-1.4-.6l-2.2 1.2-2-2 1.2-2.2a7 7 0 0 1-.6-1.4L4 13v-2.8l2.6-.4a7 7 0 0 1 .6-1.4L6 6.2l2-2 2.2 1.2a7 7 0 0 1 1.4-.6L12 2h2.8l.4 2.6a7 7 0 0 1 1.4.6l2.2-1.2 2 2-1.2 2.2a7 7 0 0 1 .6 1.4l2.6.4v2.8l-2.6.4a7 7 0 0 1-.6 1.4Z"/></svg><span class="nav-label">Settings & profile</span></button>
 <div class="dynamic-sidebar-bottom"><div class="dynamic-account-card"><div class="dynamic-account-head"><div class="dynamic-account-avatar">${initials(display)}</div><div class="dynamic-account-copy"><strong>${escapeHtml(display)}</strong><span>${escapeHtml(user?.email||"")}</span></div></div><div class="dynamic-status"><i></i> Account ready</div></div>
 <div class="dynamic-storage"><div class="dynamic-storage-row"><span>Mailbox status</span><span id="connectionLabel">Ready</span></div><div class="dynamic-storage-track"><i></i></div></div><div class="dynamic-footer"><span>Game API Mail</span><span>v1</span></div></div></div>`;
   root.querySelectorAll("[data-folder]").forEach(b=>b.onclick=()=>{ $("sidebar").classList.remove("open"); loadMail(b.dataset.folder); });
 updateSidebarActive();
}
function updateSidebarActive(){document.querySelectorAll(".dynamic-nav-item[data-folder]").forEach(b=>b.classList.toggle("active",b.dataset.folder===currentFolder));}
function updateSidebarCounts(){const unread=allMessages.filter(m=>!m.is_read).length;document.querySelectorAll("[data-count-for]").forEach(e=>e.textContent="");const e=document.querySelector('[data-count-for="INBOX"]');if(e&&unread)e.textContent=unread>99?"99+":unread;}

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

  if(profile.theme==="light")document.body.classList.add("light-theme");
  renderSidebar();
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
  updateSidebarActive();
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
    updateSidebarCounts();
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
    updateSidebarCounts();
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
  $("mailList").querySelectorAll("[data-message]").forEach(el=>el.onclick=async e=>{if(e.target.closest("button,input"))return;await openMessage(el.dataset.message)});
}
async function openMessage(id){
  try{
    setStatus("Opening message…");
    const res=await fetch(APP_CONFIG.API_BASE_URL+"/api/mail/"+encodeURIComponent(id),{headers:await authHeaders()});
    if(res.status===401){await supabase.auth.signOut();location.replace("./auth.html");return}
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data?.error||"Message could not be opened.");
    const m=data.message;
    const body=String(m?.body_text||m?.preview||"");
    const sender=escapeHtml(m?.sender_name||m?.sender_email||"Unknown sender");
    const email=escapeHtml(m?.sender_email||"");
    const subject=escapeHtml(m?.subject||"(No subject)");
    const date=m?.received_at?new Date(m.received_at).toLocaleString():"";
    const dialog=$("messageDialog");
    if(dialog){
      const title=$("messageDialogTitle"),meta=$("messageDialogMeta"),content=$("messageDialogBody");
      if(title)title.innerHTML=subject;
      if(meta)meta.innerHTML=sender+(email?" &lt;"+email+"&gt;":"")+(date?" · "+escapeHtml(date):"");
      if(content)content.textContent=body;
      dialog.showModal();
    }else{
      toast(body?body.slice(0,180):"Message opened.");
    }
    await loadMail(currentFolder);
  }catch(error){console.error(error);toast(error.message||"Could not open this message.");}
  finally{setStatus("");}
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
$("closeCompose").onclick=()=>$("composeDialog").close();
$("closeMessageDialog").onclick=()=>{const d=$("messageDialog");if(d?.open)d.close()};
$("closeMessageDialogBottom").onclick=()=>{const d=$("messageDialog");if(d?.open)d.close()};
$("replyMessageBtn").onclick=()=>{
  const subject=$("messageDialogTitle")?.textContent||"";
  const meta=$("messageDialogMeta")?.textContent||"";
  const match=meta.match(/<([^>]+)>/);
  const sender=match?.[1]||"";
  const d=$("messageDialog");if(d?.open)d.close();
  openCompose();
  if(sender)$("toInput").value=sender;
  $("subjectInput").value=subject.startsWith("Re:")?subject:"Re: "+subject;
  $("bodyInput").focus();
};
$("refreshBtn").onclick=()=>loadMail(currentFolder);
$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");
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
