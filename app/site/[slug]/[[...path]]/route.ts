import { NextRequest } from 'next/server'

export const runtime='nodejs'
export const dynamic='force-dynamic'

function cleanSlug(value:unknown){
  const slug=String(value??'').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)?slug:''
}
function cleanPage(value:unknown){
  const slug=String(value??'').trim().toLowerCase()
  if(!slug)return ''
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)?slug:''
}
function htmlEscape(value:string){return value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch))}

export async function GET(
  request:NextRequest,
  {params}:{params:Promise<{slug:string;path?:string[]}>},
){
  const route=await params
  const slug=cleanSlug(route.slug)
  const segments=Array.isArray(route.path)?route.path:[]
  if(!slug||segments.length>1)return new Response('Not found',{status:404})
  const pageSlug=cleanPage(segments[0]??'')
  if(segments.length===1&&!pageSlug)return new Response('Not found',{status:404})

  const cfg={slug,pageSlug,basePath:`/site/${slug}`}
  const serialized=JSON.stringify(cfg).replace(/</g,'\\u003c')
  const title=htmlEscape(slug)

  return new Response(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${title} · BlockCtrl</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030b13;color:#eef9ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    .box{width:min(560px,calc(100% - 32px));padding:28px;border:1px solid rgba(56,189,248,.22);border-radius:20px;background:#071827}
    .muted{color:#94a3b8;line-height:1.65}.error{color:#fca5a5}
  </style>
</head>
<body>
  <main class="box"><h1>Website yükleniyor</h1><p id="state" class="muted">BlockCtrl yayın verisi hazırlanıyor.</p></main>
  <script>
  (()=> {
    const CFG=${serialized};
    const state=document.getElementById('state');
    const token=sessionStorage.getItem('blockctrl-site:'+CFG.slug+':token')||'';
    const headers={'content-type':'application/json'};
    if(token)headers.authorization='Bearer '+token;
    fetch('/api/websites',{
      method:'POST',
      headers,
      body:JSON.stringify({action:'runtime-page',site:CFG.slug,pageSlug:CFG.pageSlug,internal:true}),
      cache:'no-store'
    }).then(async response=>{
      const text=await response.text();
      if(response.status===401){
        let payload={};
        try{payload=JSON.parse(text)}catch{}
        const login=String(payload.loginPageSlug||'giris').replace(/[^a-z0-9-]/g,'')||'giris';
        location.replace(CFG.basePath+'/'+login+'/');
        return;
      }
      if(response.status===403){
        state.className='muted error';
        state.textContent='Bu sayfaya erişim yetkiniz yok.';
        return;
      }
      if(!response.ok){
        state.className='muted error';
        state.textContent='Website şu anda yüklenemiyor. HTTP '+response.status;
        return;
      }
      document.open();
      document.write(text);
      document.close();
    }).catch(()=>{
      state.className='muted error';
      state.textContent='Website yayın servisine ulaşılamadı.';
    });
  })();
  </script>
</body>
</html>`,{
    status:200,
    headers:{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store, max-age=0',
      'x-content-type-options':'nosniff',
      'referrer-policy':'strict-origin-when-cross-origin',
    },
  })
}
