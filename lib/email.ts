type MailInput={to:string|string[];subject:string;text:string;html?:string;tag?:string}

function addresses(value:string|string[]){return (Array.isArray(value)?value:[value]).map(x=>String(x).trim()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).slice(0,20)}

export function emailConfigured(){
  return Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)
}

export async function sendEmail(input:MailInput){
  const key=String(process.env.RESEND_API_KEY||'').trim(),from=String(process.env.EMAIL_FROM||'').trim(),to=addresses(input.to)
  if(!key||!from)return {sent:false,reason:'not-configured' as const}
  if(!to.length)return {sent:false,reason:'no-valid-recipient' as const}
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify({from,to,subject:input.subject.slice(0,200),text:input.text.slice(0,50_000),...(input.html?{html:input.html.slice(0,100_000)}:{}),...(input.tag?{tags:[{name:'blockctrl',value:input.tag.slice(0,50)}]}:{})}),
    signal:AbortSignal.timeout(8000),
    cache:'no-store',
  })
  const body=await response.text();let data:any={};try{data=body?JSON.parse(body):{}}catch{}
  if(!response.ok){console.error(JSON.stringify({source:'blockctrl',at:new Date().toISOString(),level:'error',event:'email.delivery.failed',status:response.status,tag:input.tag??null}));throw new Error(String(data?.message||`E-posta gönderilemedi (HTTP ${response.status})`))}
  console.info(JSON.stringify({source:'blockctrl',at:new Date().toISOString(),level:'info',event:'email.delivery.sent',id:data?.id??null,recipientCount:to.length,tag:input.tag??null}))
  return {sent:true,id:String(data?.id||'')}
}
