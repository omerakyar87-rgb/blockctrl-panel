import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import ts from 'typescript'
async function load(path) {
  const source = await readFile(new URL('../../'+path, import.meta.url), 'utf8')
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
  return import('data:text/javascript;base64,'+Buffer.from(result.outputText).toString('base64'))
}
const runtime = await load('agent/src/runtime-optimizer.ts')
const mods = await load('agent/src/optimization-mods.ts')
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'blockctrl-runtime-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const state = join(root, 'private', 'runtime.json'), manifest = join(root, 'private', 'mods.json')
  await writeFile(join(root, 'server.properties'), 'view-distance=16\nsimulation-distance=12\n')
  return { root, state, manifest }
}
test('runtime profiles preserve maximum heap and are accepted by the installed Java', async () => {
  const balanced = runtime.runtimeArguments(4096, 'balanced'), memory = runtime.runtimeArguments(4096, 'memory')
  assert.ok(balanced.includes('-Xmx4096M')); assert.ok(balanced.includes('-Xms2048M'))
  assert.ok(memory.includes('-Xmx4096M')); assert.ok(memory.includes('-Xms512M'))
  await runtime.verifyJavaFlags(balanced); await runtime.verifyJavaFlags(memory)
  await assert.rejects(runtime.verifyJavaFlags(['-XX:ThisOptionDoesNotExist=1']), /desteklemiyor/)
  assert.throws(() => runtime.runtimeArguments(128, 'memory'))
})
test('direct jar profile is reversible and never changes chunk properties', async t => {
  const { root, state } = await fixture(t)
  const original = await readFile(join(root, 'server.properties'), 'utf8')
  await runtime.enableRuntimeOptimization(root, state, 4096, 'balanced')
  const args = await runtime.prepareOptimizedLaunch(root, state, 4096)
  await runtime.markOptimizedLaunch(state, 123, args)
  assert.equal((await runtime.runtimeOptimizationStatus(root, state, 4096, 123)).active, true)
  assert.equal((await runtime.runtimeOptimizationStatus(root, state, 4096, 124)).active, false)
  await runtime.disableRuntimeOptimization(root, state)
  assert.equal(await runtime.prepareOptimizedLaunch(root, state, 4096), null)
  assert.equal(await readFile(join(root, 'server.properties'), 'utf8'), original)
})
test('Forge/NeoForge argument files preserve application flags and restore byte-for-byte', async t => {
  const { root, state } = await fixture(t)
  await writeFile(join(root, 'run.sh'), '#!/bin/sh\njava @user_jvm_args.txt @libraries/net/minecraftforge/forge/unix_args.txt "$@"\n')
  const original = '# custom\r\n-Xms4G\r\n-Xmx4G\r\n-Dfile.encoding=UTF-8\r\n'
  await writeFile(join(root, 'user_jvm_args.txt'), original)
  await runtime.enableRuntimeOptimization(root, state, 4096, 'memory')
  await runtime.prepareOptimizedLaunch(root, state, 4096)
  assert.match(await readFile(join(root, 'user_jvm_args.txt'), 'utf8'), /-Dfile.encoding=UTF-8/)
  assert.equal((await runtime.runtimeOptimizationStatus(root, state, 4096, null)).supported, true)
  await runtime.prepareOptimizedLaunch(root, state, 8192)
  assert.match(await readFile(join(root, 'user_jvm_args.txt'), 'utf8'), /-Xmx8192M/)
  await runtime.disableRuntimeOptimization(root, state)
  assert.equal(await readFile(join(root, 'user_jvm_args.txt'), 'utf8'), original)
})
test('custom collectors, edited launchers and externally edited argument files are rejected', async t => {
  const { root, state } = await fixture(t)
  assert.throws(() => runtime.validateArgumentFile('-XX:+UseZGC'), /Özel/)
  assert.throws(() => runtime.validateArgumentFile('-Xmx4G -Dfoo=bar'), /Özel/)
  await writeFile(join(root, 'run.sh'), 'java @user_jvm_args.txt @libraries/args.txt "$@"\n')
  await writeFile(join(root, 'user_jvm_args.txt'), '-Xmx4G\n')
  await runtime.enableRuntimeOptimization(root, state, 4096, 'balanced')
  await runtime.prepareOptimizedLaunch(root, state, 4096)
  await writeFile(join(root, 'run.sh'), 'JAVA_HOME=/custom java @user_jvm_args.txt\n')
  assert.equal((await runtime.runtimeOptimizationStatus(root, state, 4096, null)).supported, false)
  await assert.rejects(runtime.prepareOptimizedLaunch(root, state, 4096), /Başlatıcı/)
  await writeFile(join(root, 'user_jvm_args.txt'), '-Xmx8G\n')
  await assert.rejects(runtime.disableRuntimeOptimization(root, state), /sonradan/)
})
const version = { id: 'v1', project_id: 'gvQqBUqZ', name: 'Lithium test', version_type: 'release', game_versions: ['1.21.1'], loaders: ['fabric'], date_published: '2026-01-01', dependencies: [], files: [] }
test('mod selection rejects wrong Minecraft/loader, client-only, unstable, required and incompatible dependencies', () => {
  for (const candidate of [
    { ...version, game_versions: ['1.21'] }, { ...version, loaders: ['neoforge'] }, { ...version, version_type: 'beta' },
    { ...version, environment: 'client_only' }, { ...version, dependencies: [{ dependency_type: 'required' }] },
    { ...version, dependencies: [{ dependency_type: 'incompatible' }] },
  ]) assert.equal(mods.selectOptimizationVersion([candidate], version.project_id, 'fabric', '1.21.1'), null)
  assert.equal(mods.selectOptimizationVersion([version], version.project_id, 'fabric', '1.21.1').id, 'v1')
})
test('verified mod install is reversible, does not overwrite user files, and checks modified files on removal', async t => {
  const { root, manifest } = await fixture(t)
  const jar = join(root, 'fixture.jar')
  const zip = new JSZip(); zip.file('fabric.mod.json', JSON.stringify({ id: 'lithium' }))
  await writeFile(jar, await zip.generateAsync({ type: 'nodebuffer' }))
  const content = await readFile(jar), sha512 = createHash('sha512').update(content).digest('hex')
  const file = { filename: 'lithium-test.jar', size: content.length, primary: true, url: 'https://cdn.modrinth.com/data/gvQqBUqZ/versions/v1/lithium-test.jar', hashes: { sha512 } }
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async url => String(url).includes('api.modrinth.com') ? Response.json([{ ...version, files: [file] }]) : new Response(content)
  await mods.installOptimizationMod(root, manifest, 'lithium', 'v1', 'fabric', '1.21.1')
  await assert.rejects(mods.installOptimizationMod(root, manifest, 'lithium', 'v1', 'fabric', '1.21.1'), /zaten/)
  const path = join(root, 'mods', file.filename)
  await writeFile(path, 'edited')
  await assert.rejects(mods.removeOptimizationMod(root, manifest, 'lithium'), /sonradan/)
  await writeFile(path, content)
  await mods.removeOptimizationMod(root, manifest, 'lithium')
  assert.deepEqual(JSON.parse(await readFile(manifest, 'utf8')), [])
  assert.equal(await readFile(join(root, 'server.properties'), 'utf8'), 'view-distance=16\nsimulation-distance=12\n')
})
test('hash mismatch and symlinked mods directories never install downloaded code', async t => {
  const { root, manifest } = await fixture(t)
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async url => String(url).includes('api.modrinth.com') ? Response.json([{ ...version, files: [{ filename: 'lithium.jar', primary: true, size: 3, url: 'https://cdn.modrinth.com/data/gvQqBUqZ/versions/v1/lithium.jar', hashes: { sha512: 'a'.repeat(128) } }] }]) : new Response('bad')
  await assert.rejects(mods.installOptimizationMod(root, manifest, 'lithium', 'v1', 'fabric', '1.21.1'), /SHA-512/)
  const outside = join(root, 'outside'); await mkdir(outside); await symlink(outside, join(root, 'mods'))
  await assert.rejects(mods.installOptimizationMod(root, manifest, 'lithium', 'v1', 'fabric', '1.21.1'), /normal bir/)
})
