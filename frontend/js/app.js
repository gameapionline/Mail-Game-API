import { supabase } from "./supabase.js";
import { APP_CONFIG } from "./config.js";

const $=id=>document.getElementById(id);
let user=null;

async function init(){
  const {data}=await supabase.auth.getUser();
  user=data.user;
  if(!user){ $("status").textContent="Please sign in."; return; }
  await loadMail("INBOX");
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
async function loadMail(folder="INBOX"){
  $("status").textContent="Loading...";
  const res=await fetch(APP_CONFIG.API_BASE_URL+"/api/mail?folder="+encodeURIComponent(folder),{headers:await authHeaders()});
  if(!res.ok){$("status").textContent="Unable to load mail yet. Connect the backend first.";return;}
  const data=await res.json(); render(data.messages||[]);
  $("status").textContent="";
}
async function authHeaders(){
  const {data}=await supabase.auth.getSession();
  return {Authorization:"Bearer "+(data.session?.access_token||"")};
}
function render(messages){
  $("mailList").innerHTML=messages.length?messages.map(m=>`<article class="mail-row ${m.is_read?"":"unread"}">
    <button class="star" data-star="${m.id}">${m.is_starred?"★":"☆"}</button>
    <div class="sender">${escapeHtml(m.sender_name||m.sender_email||"Unknown")}</div>
    <div class="subject">${escapeHtml(m.subject||"(No subject)")}</div>
    <div class="date">${m.received_at?new Date(m.received_at).toLocaleDateString():""}</div>
  </article>`).join(""):"<div style='padding:30px;text-align:center'>No messages</div>";
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
$("composeBtn").onclick=()=> $("composeDialog").showModal();
$("closeCompose").onclick=()=> $("composeDialog").close();
$("refreshBtn").onclick=()=>loadMail("INBOX");
$("logoutBtn").onclick=async()=>{await supabase.auth.signOut();location.href="./index.html"};
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");loadMail(b.dataset.folder)});
$("composeForm").onsubmit=async e=>{e.preventDefault();const h=await authHeaders();const r=await fetch(APP_CONFIG.API_BASE_URL+"/api/mail/send",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({to:$("toInput").value,subject:$("subjectInput").value,body:$("bodyInput").value})});$("status").textContent=r.ok?"Message sent.":"Message could not be sent.";if(r.ok){$("composeDialog").close();e.target.reset();}};
init();