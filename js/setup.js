import { supabase } from "./supabase.js";
import { APP_CONFIG } from "./config.js";

const $=id=>document.getElementById(id);
const steps=[...document.querySelectorAll(".setup-step")];
let currentStep=1;
let user=null;
let profile={};

function showMessage(message){
  $("messageText").textContent=message;
  $("messageBox").hidden=false;
}
function clearMessage(){
  $("messageBox").hidden=true;
  $("messageText").textContent="";
}
function setBusy(on,label=null){
  $("nextBtn").disabled=on;
  $("backBtn").disabled=on;
  $("logoutBtn").disabled=on;
  $("nextBtn").textContent=on?(label||"Saving…"):(currentStep===steps.length?"Finish setup":"Continue");
}
function normalizeUsername(value){
  return value.trim().toLowerCase().replace(/\s+/g,"");
}
function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function showStep(n){
  currentStep=n;
  steps.forEach(s=>s.classList.toggle("active",Number(s.dataset.step)===n));
  $("stepLabel").textContent="Step "+n+" of "+steps.length;
  const percent=Math.round((n/steps.length)*100);
  $("progressPercent").textContent=percent+"%";
  $("progressBar").style.width=percent+"%";
  $("backBtn").hidden=n===1;
  $("nextBtn").textContent=n===steps.length?"Finish setup":"Continue";
  window.scrollTo({top:0,behavior:"smooth"});
  clearMessage();
}
function collectStep(){
  if(currentStep===1){
    const first=$("firstName").value.trim();
    const last=$("lastName").value.trim();
    const display=$("displayName").value.trim();
    if(!first||!last){showMessage("Please enter your first and last name.");return null}
    if(!display){showMessage("Please enter the name you want to use in Game API Mail.");return null}
    return {first_name:first,last_name:last,display_name:display};
  }
  if(currentStep===2){
    const phone=$("phone").value.trim();
    const recovery=$("recoveryEmail").value.trim().toLowerCase();
    const country=$("country").value;
    if(!country){showMessage("Please select your country.");return null}
    if(recovery && !validEmail(recovery)){showMessage("Enter a valid recovery email or leave it empty.");return null}
    if(recovery && recovery===user.email.toLowerCase()){showMessage("Your recovery email should be different from your sign-in email.");return null}
    return {phone:phone||null,recovery_email:recovery||null,country};
  }
  if(currentStep===3){
    const username=normalizeUsername($("mailUsername").value);
    if(username.length<2||username.length>30){showMessage("Your username must be between 2 and 30 characters.");return null}
    if(!/^[a-z0-9](?:[a-z0-9._-]{0,28}[a-z0-9])?$/.test(username)){showMessage("Use only lowercase letters, numbers, dots, hyphens and underscores.");return null}
    return {mail_username:username};
  }
  const theme=document.querySelector('input[name="theme"]:checked')?.value||"dark";
  return {language:$("language").value,timezone:$("timezone").value,theme};
}
async function saveProfile(values,complete=false){
  const payload={id:user.id,...values,profile_completed:complete,updated_at:new Date().toISOString()};
  const {data,error}=await supabase.from("profiles").upsert(payload,{onConflict:"id"}).select().single();
  if(error){
    const m=(error.message||"").toLowerCase();
    if(m.includes("duplicate")||m.includes("unique")) throw new Error("That Game API address is already taken. Please choose another username.");
    throw error;
  }
  profile=data||{...profile,...values};
  return profile;
}
async function authHeaders(){
  const {data,error}=await supabase.auth.getSession();
  if(error) throw error;
  const token=data.session?.access_token;
  if(!token) throw new Error("Your login session has expired. Please sign in again.");
  return {
    Authorization:"Bearer "+token,
    "Content-Type":"application/json"
  };
}
async function provisionMailbox(){
  const response=await fetch(APP_CONFIG.API_BASE_URL+"/api/mailbox/provision",{
    method:"POST",
    headers:await authHeaders(),
    body:JSON.stringify({})
  });

  let body={};
  try{body=await response.json()}catch{}

  if(!response.ok){
    const message=body?.error||body?.message||"We could not create your Game API Mail address.";
    const error=new Error(message);
    error.status=response.status;
    error.code=body?.code||null;
    throw error;
  }

  return body;
}
async function loadProfile(){
  const {data,error}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
  if(error) throw error;
  profile=data||{};
  $("firstName").value=profile.first_name||user.user_metadata?.first_name||"";
  $("lastName").value=profile.last_name||user.user_metadata?.last_name||"";
  $("displayName").value=profile.display_name||user.user_metadata?.full_name||[profile.first_name,profile.last_name].filter(Boolean).join(" ");
  $("phone").value=profile.phone||"";
  $("recoveryEmail").value=profile.recovery_email||"";
  $("country").value=profile.country||"";
  $("mailUsername").value=profile.mail_username||"";
  $("language").value=profile.language||"en";
  $("timezone").value=profile.timezone||"Africa/Lagos";
  const theme=profile.theme||"dark";
  const radio=document.querySelector('input[name="theme"][value="'+theme+'"]');
  if(radio)radio.checked=true;
  $("accountEmail").textContent=user.email||"";
  updateAddress();
}
function updateAddress(){
  const username=normalizeUsername($("mailUsername").value)||"yourname";
  $("addressPreview").textContent=username+"@game-api.online";
}
$("mailUsername").addEventListener("input",updateAddress);
$("closeMessage").onclick=clearMessage;
$("logoutBtn").onclick=async()=>{await supabase.auth.signOut();location.replace("./index.html")};
$("backBtn").onclick=()=>{if(currentStep>1)showStep(currentStep-1)};
$("nextBtn").onclick=async()=>{
  clearMessage();
  const values=collectStep();
  if(!values)return;
  setBusy(true);
  try{
    const complete=currentStep===steps.length;
    await saveProfile(values,complete);

    if(complete){
      setBusy(true,"Creating mailbox…");
      try{
        const result=await provisionMailbox();
        const mailbox=result?.mailbox;
        if(mailbox?.email_address){
          $("nextBtn").textContent="Mailbox created";
        }
      }catch(error){
        console.error("Mailbox provisioning failed:",error);
        await saveProfile({profile_completed:false},false);
        throw new Error(
          error.message||
          "Your profile was saved, but we could not create your Game API Mail address yet."
        );
      }

      location.replace("./app.html");
      return;
    }

    showStep(currentStep+1);
  }catch(error){
    showMessage(error.message||"We could not save your profile. Please try again.");
  }finally{
    setBusy(false);
  }
};
const {data:{user:currentUser}}=await supabase.auth.getUser();
if(!currentUser){
  location.replace("./auth.html");
}else{
  user=currentUser;
  try{
    await loadProfile();
    if(profile.profile_completed){
      location.replace("./app.html");
    }else{
      const resumeStep=profile.mail_username?4:((profile.phone||profile.recovery_email||profile.country)?3:(profile.first_name||profile.last_name||profile.display_name?2:1));
      showStep(resumeStep);
    }
  }catch(error){
    showMessage("We could not load your account profile. Please refresh and try again.");
  }
}
