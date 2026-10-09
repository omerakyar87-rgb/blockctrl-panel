import { sendEmail } from '@/lib/email'

type Level='info'|'warning'|'error'|'fatal'
type EventInput={level:Level;event:string;message:string;serverId?:string|null;requestId?:string|null;details?:Record<string,unknown>}

const recent=new Map<string,number>()

function safeDetails(details:Record<string,unknown>|undefined){
  if(!details)return undefined
  const out:Record<string,unknown>={}
  for(const [key,value] of Object.entries(details)){
    if(/token|secret|password|authorization|cookie|private.?key/i.test(key)){out[key]='[redacted]';continue}
    out[key]=value
  }
  return out
}

export function operationalEvent(input:EventInput){
  const payload={source:'blockctrl',at:new Date().toISOString(),...input,details:safeDetails(input.details)}
  const line=JSON.stringify(payload)
  if(input.level==='fatal'||input.level==='error')console.error(line)
  else if(input.level==='warning')console.warn(line)
  else console.info(line)
  return payload
}

export async function operationalAlert(input:EventInput & {dedupeKey?:string;dedupeMs?:number}){
  const payload=operationalEvent(input)
  const url=String(process.env.BLOCKCTRL_ALERT_WEBHOOK_URL||'').trim()
  const alertEmail=String(process.env.BLOCKCTRL_ALERT_EMAIL_TO||'').trim()
  const internalDelivered=true
  const key=input.dedupeKey||input.event
  const now=Date.now(),ttl=Math.max(30_000,input.dedupeMs??300_000),last=recent.get(key)??0
  if(now-last<ttl)return {delivered:true,internalDelivered,reason:'deduped',payload}
  recent.set(key,now)
  let webhookDelivered=false
  if(url){
    try{
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000),cache:'no-store'})
      if(!response.ok)throw new Error(`HTTP ${response.status}`)
      webhookDelivered=true
    }catch(error){
      operationalEvent({level:'error',event:'observability.webhook.failed',message:error instanceof Error?error.message:'Alert webhook failed'})
    }
  }
  let emailDelivered=false
  if(alertEmail){
    try{const mail=await sendEmail({to:alertEmail.split(',').map(x=>x.trim()),subject:`[BlockCtrl] ${input.level.toUpperCase()} · ${input.event}`,text:`${input.message}\n\n${JSON.stringify(payload.details??{},null,2)}`,tag:'operational-alert'});emailDelivered=mail.sent}catch(error){operationalEvent({level:'error',event:'observability.email.failed',message:error instanceof Error?error.message:'Alert email failed'})}
  }
  return {delivered:true,internalDelivered,webhookDelivered,emailDelivered,reason:webhookDelivered||emailDelivered?'external-delivered':'internal-log',payload}
}
