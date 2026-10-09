import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = path => readFile(new URL('../../'+path, import.meta.url), 'utf8')

test('protected website pages are not embedded as static HTML', async () => {
  const source=await read('app/api/websites/route.ts')
  assert.match(source,/protectedPageShell/)
  assert.match(source,/action==='runtime-page'/)
  assert.match(source,/pageAccessMode\(page\)==='public'\?renderPublishedPage[^:]+:protectedPageShell/)
})

test('protected website access is enforced server-side', async () => {
  const source=await read('app/api/websites/route.ts')
  assert.match(source,/runtimeMember\(site\.id,token\)/)
  assert.match(source,/if\(mode==='role'\)/)
  assert.match(source,/if\(mode==='assigned'\)/)
})

test('agent preserves path traversal protection', async () => {
  const source=await read('agent/src/index.ts')
  assert.match(source,/function safePath/)
  assert.match(source,/Path traversal blocked/)
  assert.match(source,/normalized\.startsWith\('\/'\)/)
})

test('secret comparison uses constant-time comparison where applicable', async () => {
  const source=await read('agent/src/index.ts')
  assert.match(source,/timingSafeEqual/)
})
