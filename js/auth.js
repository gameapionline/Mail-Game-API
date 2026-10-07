import { supabase } from "./supabase.js";

const $=id=>document.getElementById(id);
const loginView=$("loginView");
const signupView=$("signupView");
const messageBox=$("messageBox");
const messageText=$("messageText");
const loading=$("loading");

function showMessage(message,type="error"){
  messageText.textContent=message;
  messageBox.hidden=false;
  messageBox.classList.toggle("success",type==="success");
}
function clearMessage(){
  messageBox.hidden=true;
  messageText.textContent="";
  messageBox.classList.remove("success");
}
function setLoading(on){
  loading.hidden=!on;
  document.querySelectorAll("button,input").forEach(el=>{
    if(el.id!=="closeMessage")el.disabled=on;
  });
}
function showLogin(){
  clearMessage();
  loginView.hidden=false;
  signupView.hidden=true;
  document.title="Game API Mail — Sign in";
}
function showSignup(){
  clearMessage();
  loginView.hidden=true;
  signupView.hidden=false;
  document.title="Game API Mail — Create account";
}
function friendlyError(error){
  const m=(error?.message||"").toLowerCase();
  if(m.includes("invalid login credentials"))return"Incorrect email or password. Please try again.";
  if(m.includes("email not confirmed"))return"Please confirm your email address before signing in.";
  if(m.includes("user already registered"))return"An account with this email already exists. Try signing in instead.";
  if(m.includes("password"))return"Your password does not meet the required security rules.";
  if(m.includes("rate limit"))return"Too many attempts. Please wait a little and try again.";
  if(m.includes("network"))return"Network error. Check your internet connection and try again.";
  return error?.message||"Something went wrong. Please try again.";
}
function validEmail(email){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function passwordScore(p){
  let score=0;
  if(p.length>=8)score++;
  if(/[a-z]/.test(p)&&/[A-Z]/.test(p))score++;
  if(/\d/.test(p))score++;
  if(/[^A-Za-z0-9]/.test(p))score++;
  return score;
}
function updateStrength(){
  const p=$("signupPassword").value,score=passwordScore(p);
  $("strengthBar").style.width=(score*25)+"%";
  $("strengthText").textContent=!p?"Use 8+ characters":score<=1?"Weak password":score===2?"Fair password":score===3?"Good password":"Strong password";
}
async function routeAfterAuth(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data:profile,error}=await supabase.from("profiles").select("profile_completed").eq("id",user.id).maybeSingle();
  if(error){
    showMessage("Signed in, but we could not check your account setup. Please try again.");
    return;
  }
  if(profile?.profile_completed){
    window.location.replace("./app.html");
  }else{
    window.location.replace("./setup.html");
  }
}
async function google(){
  clearMessage();
  setLoading(true);
  const {error}=await supabase.auth.signInWithOAuth({
    provider:"google",
    options:{redirectTo:window.location.origin+window.location.pathname}
  });
  if(error){
    setLoading(false);
    showMessage(friendlyError(error));
  }
}

$("showSignup").onclick=showSignup;
$("showLogin").onclick=showLogin;
$("backToLogin").onclick=showLogin;
$("closeMessage").onclick=clearMessage;

document.querySelectorAll(".password-toggle").forEach(btn=>{
  btn.onclick=()=>{
    const input=$(btn.dataset.target);
    input.type=input.type==="password"?"text":"password";
  };
});
$("signupPassword").addEventListener("input",updateStrength);

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  clearMessage();
  const email=$("loginEmail").value.trim().toLowerCase();
  const password=$("loginPassword").value;
  if(!validEmail(email)){showMessage("Enter a valid email address.");return}
  if(!password){showMessage("Enter your password.");return}
  setLoading(true);
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error){
    setLoading(false);
    showMessage(friendlyError(error));
    return;
  }
  await routeAfterAuth();
});

$("signupForm").addEventListener("submit",async e=>{
  e.preventDefault();
  clearMessage();
  const first=$("signupFirstName").value.trim();
  const last=$("signupLastName").value.trim();
  const email=$("signupEmail").value.trim().toLowerCase();
  const password=$("signupPassword").value;
  const confirm=$("signupConfirm").value;

  if(!first||!last){showMessage("Enter your first and last name.");return}
  if(!validEmail(email)){showMessage("Enter a valid email address.");return}
  if(password.length<8){showMessage("Your password must be at least 8 characters.");return}
  if(password!==confirm){showMessage("The passwords do not match.");return}

  setLoading(true);
  const {data,error}=await supabase.auth.signUp({
    email,
    password,
    options:{
      data:{
        first_name:first,
        last_name:last,
        full_name:(first+" "+last).trim()
      },
      emailRedirectTo:window.location.origin+window.location.pathname
    }
  });
  setLoading(false);

  if(error){
    showMessage(friendlyError(error));
    return;
  }

  if(data.session){
    window.location.replace("./setup.html");
    return;
  }

  showLogin();
  showMessage("Account created. Check your email to confirm your account. After confirmation, sign in and we will take you to account setup.","success");
});

$("forgotPassword").onclick=async()=>{
  clearMessage();
  const email=$("loginEmail").value.trim().toLowerCase();
  if(!validEmail(email)){
    showMessage("Enter your email address first, then choose Forgot password.");
    return;
  }
  setLoading(true);
  const {error}=await supabase.auth.resetPasswordForEmail(email,{
    redirectTo:window.location.origin+window.location.pathname
  });
  setLoading(false);
  if(error){
    showMessage(friendlyError(error));
    return;
  }
  showMessage("If an account uses that email, a password reset link has been sent.","success");
};

$("googleLogin").onclick=google;
$("googleSignup").onclick=google;

const {data:{session}}=await supabase.auth.getSession();
if(session)await routeAfterAuth();

supabase.auth.onAuthStateChange((event,newSession)=>{
  if((event==="SIGNED_IN"||event==="INITIAL_SESSION")&&newSession){
    setTimeout(()=>routeAfterAuth(),0);
  }
});
