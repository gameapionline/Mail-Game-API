require("dotenv").config();
const express=require("express");
const cors=require("cors");
const nodemailer=require("nodemailer");
const {createClient}=require("@supabase/supabase-js");
const {ImapFlow}=require("imapflow");
const {simpleParser}=require("mailparser");
const webpush=require("web-push");

const app=express();
app.use(cors());
app.use(express.json({limit:"10mb"}));

const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
if(process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY){
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT||"mailto:mail@game-api.online",process.env.WEB_PUSH_PUBLIC_KEY,process.env.WEB_PUSH_PRIVATE_KEY);
}
function auth(req,res,next){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Unauthorized"});
  req.token=h.slice(7); next();
}
async function getUser(req){
  const {data,error}=await supabase.auth.getUser(req.token);
  if(error||!data.user) throw new Error("Invalid session");
  return data.user;
}
const smtp=()=>nodemailer.createTransport({
  host:process.env.HOSTINGER_SMTP_HOST,
  port:Number(process.env.HOSTINGER_SMTP_PORT),
  secure:String(process.env.HOSTINGER_SMTP_SECURE)==="true",
  auth:{user:process.env.HOSTINGER_EMAIL,pass:process.env.HOSTINGER_EMAIL_PASSWORD}
});
app.get("/health",(req,res)=>res.json({ok:true,service:"Game API Mail"}));

app.get("/api/mail",auth,async(req,res)=>{
  try{
    const user=await getUser(req);
    const {data:box}=await supabase.from("mailboxes").select("id").eq("email_address",process.env.HOSTINGER_EMAIL).maybeSingle();
    if(!box)return res.json({messages:[]});
    let q=supabase.from("messages").select("*").eq("mailbox_id",box.id).order("received_at",{ascending:false}).limit(100);
    if(req.query.folder==="INBOX")q=q.is("folder_id",null);
    const {data,error}=await q;
    if(error)throw error;
    res.json({messages:data||[],user_id:user.id});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/mail/send",auth,async(req,res)=>{
  try{
    const user=await getUser(req);
    const {to,cc,bcc,subject="",body=""}=req.body||{};
    if(!to)return res.status(400).json({error:"Recipient required"});
    await smtp().sendMail({from:`${process.env.HOSTINGER_EMAIL} (Game API Mail)`,to,cc,bcc,subject,text:body});
    res.json({ok:true,user_id:user.id});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post("/api/push/subscribe",auth,async(req,res)=>{
  try{
    const user=await getUser(req);
    const s=req.body;
    const {error}=await supabase.from("push_subscriptions").upsert({user_id:user.id,endpoint:s.endpoint,p256dh:s.keys?.p256dh,auth_key:s.keys?.auth,user_agent:req.headers["user-agent"]},{onConflict:"user_id,endpoint"});
    if(error)throw error; res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
});

async function syncInbox(){
  const client=new ImapFlow({host:process.env.HOSTINGER_IMAP_HOST,port:Number(process.env.HOSTINGER_IMAP_PORT),secure:String(process.env.HOSTINGER_IMAP_SECURE)==="true",auth:{user:process.env.HOSTINGER_EMAIL,pass:process.env.HOSTINGER_EMAIL_PASSWORD}});
  await client.connect(); const lock=await client.getMailboxLock("INBOX");
  try{
    for await(const msg of client.fetch({seen:false},{source:true,uid:true,envelope:true})){
      const parsed=await simpleParser(msg.source);
      const from=parsed.from?.value?.[0];
      const {data:box}=await supabase.from("mailboxes").select("id").eq("email_address",process.env.HOSTINGER_EMAIL).maybeSingle();
      if(!box)continue;
      const {data:inserted}=await supabase.from("messages").upsert({mailbox_id:box.id,provider_uid:String(msg.uid),message_id:parsed.messageId||null,sender_name:from?.name||null,sender_email:from?.address||null,subject:parsed.subject||"",body_text:parsed.text||"",body_html:parsed.html||null,preview:(parsed.text||"").slice(0,180),received_at:parsed.date||new Date(),is_read:false,has_attachments:(parsed.attachments||[]).length>0},{onConflict:"mailbox_id,provider_uid"}).select("id").maybeSingle();
      if(inserted?.id){
        const recipients=(parsed.to?.value||[]).map(x=>({message_id:inserted.id,recipient_type:"to",name:x.name||null,email:x.address}));
        if(recipients.length)await supabase.from("message_recipients").upsert(recipients,{onConflict:"message_id,recipient_type,email"});
      }
    }
  }finally{lock.release();await client.logout();}
}
app.post("/api/sync",async(req,res)=>{try{await syncInbox();res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.listen(Number(process.env.PORT)||10000,()=>console.log("Game API Mail backend running"));