import assert from 'node:assert/strict'

const base=(process.env.E2E_BASE_URL||'').replace(/\/$/,'')
const requireReady=['1','true','yes'].includes(String(process.env.E2E_REQUIRE_READY||'').toLowerCase())

if(!base) {
  console.log('E2E_BASE_URL tanımlı değil; preview smoke testi atlandı.')
  process.exit(0)
}

async function request(path,init){
  const response=await fetch(base+path,{redirect:'manual',...init})
  const text=await response.text()
  let json=null
  try{json=text?JSON.parse(text):null}catch{}
  return {response,text,json}
}

for(const path of ['/','/__blockctrl-e2e-not-found__']){
  const {response}=await request(path)
  assert.ok(response.status<500,`${path} sunucu hatası döndürdü: ${response.status}`)
}

{
  const {response,json}=await request('/api/health')
  assert.ok([200,503].includes(response.status),`/api/health beklenmeyen durum: ${response.status}`)
  assert.equal(json?.service,'blockctrl-panel','Health endpoint BlockCtrl servis kimliğini döndürmedi')
  assert.ok(['ok','degraded','error'].includes(json?.status),'Health status geçersiz')
  assert.ok(json?.database&&json?.migration&&json?.agent&&json?.auth,'Health alt kontrolleri eksik')

  if(requireReady){
    assert.equal(response.status,200,`Production health 200 dönmeli; gelen: ${response.status}`)
    assert.notEqual(json?.readiness?.status,'blocked',`Production readiness blocked: ${JSON.stringify(json?.readiness?.blockers||[])}`)
    assert.equal(json?.database?.status,'ok','Production database hazır değil')
    assert.equal(json?.migration?.status,'ok','Production migration seviyesi hazır değil')
    assert.equal(json?.auth?.status,'ok','Production Supabase auth yapılandırması hazır değil')
  }
}

for(const path of ['/api/server-actions?serverId=00000000-0000-0000-0000-000000000000','/api/security?serverId=00000000-0000-0000-0000-000000000000']){
  const {response}=await request(path,{headers:{accept:'application/json'}})
  assert.equal(response.status,401,`${path} anonim istekte 401 dönmeli; gelen: ${response.status}`)
}

console.log(`Production/preview E2E smoke checks passed: ${base}${requireReady?' (readiness required)':''}`)
