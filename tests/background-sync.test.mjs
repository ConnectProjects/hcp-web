import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

// Run with: node --experimental-vm-modules --test tests/*.test.mjs
const root = new URL('../', import.meta.url)
const SESSION = { writerName: 'Norman Robichaud', user: { name: 'Norman Robichaud' } }
const tick = () => new Promise(resolve => setImmediate(resolve))

function makeHarness({ visibilityState = 'visible', webLockHeld = false } = {}) {
  const context = vm.createContext({
    Date,
    setInterval: () => 1,
    clearInterval: () => {},
    document: { visibilityState },
    navigator: webLockHeld
      ? { locks: { request: async (_name, _opts, fn) => fn(null) } }
      : {},
  })

  context.query = () => [{ tech_id: 't1', name: 'Norman', folder_name: 'Norman' }]
  context.readLock = () => null
  context.autoImportClean = async () => ({ results: [] })

  const modules = new Map()
  async function load(path) {
    if (modules.has(path)) return modules.get(path)

    let source
    if (path === 'masterdb2/db/db.js') {
      source = 'export const query = (...a) => globalThis.query(...a)\n' +
               'export const readLock = (...a) => globalThis.readLock(...a)'
    } else if (path === 'masterdb2/db/import-packet.js') {
      source = 'export const autoImportClean = (...a) => globalThis.autoImportClean(...a)'
    } else {
      source = await readFile(new URL(path, root), 'utf8')
    }

    const mod = new vm.SourceTextModule(source, { context, identifier: path })
    modules.set(path, mod)
    await mod.link((specifier, parent) => {
      const resolved = new URL(specifier, new URL(parent.identifier, root))
      return load(resolved.pathname.slice(root.pathname.length))
    })
    return mod
  }

  return { context, load }
}

async function loadModule(options) {
  const harness = makeHarness(options)
  const mod = await harness.load('masterdb2/db/background-sync.js')
  await mod.evaluate()
  return { ns: mod.namespace, ...harness }
}

function nextResult(ns) {
  let off
  const promise = new Promise(resolve => {
    off = ns.subscribe(value => { off(); resolve(value) })
  })
  return promise
}

test('clean packets are committed automatically', async () => {
  const { ns, context } = await loadModule()
  let captured = null
  context.autoImportClean = async (techs, writer) => {
    captured = { techs, writer }
    return { results: [{ tech: 'Norman', filename: 'visit.json', ok: true, imported: 2 }] }
  }

  const done = nextResult(ns)
  ns.startAutoImport(SESSION, { intervalMs: 60_000 })
  const result = await done

  assert.equal(captured.writer, 'Norman Robichaud')
  assert.equal(captured.techs.length, 1)
  assert.equal(result.results[0].ok, true)
  assert.equal(result.error, null)
  ns.stopAutoImport()
})

test('ambiguous packets stay skipped and are surfaced as review items', async () => {
  const { ns, context } = await loadModule()
  context.autoImportClean = async () => ({
    results: [{ tech: 'Norman', filename: 'visit.json', skipped: true,
                reason: 'Location not resolved: Yorkton' }],
  })

  const done = nextResult(ns)
  ns.startAutoImport(SESSION, { intervalMs: 60_000 })
  const result = await done

  assert.equal(result.results[0].skipped, true)
  assert.equal(result.results[0].ok, undefined)
  assert.match(result.results[0].reason, /Location not resolved/)
  ns.stopAutoImport()
})

test('a second cycle cannot start while one is in flight', async () => {
  const { ns, context } = await loadModule()
  let calls = 0
  let resolveClean
  context.autoImportClean = () => {
    calls++
    return new Promise(resolve => { resolveClean = resolve })
  }

  const done = nextResult(ns)
  ns.startAutoImport(SESSION, { intervalMs: 60_000 })
  await tick()
  await ns.refreshNow()
  await tick()

  assert.equal(calls, 1)
  resolveClean({ results: [] })
  await done
  ns.stopAutoImport()
})

test('hidden tabs do not import; becoming visible runs one cycle', async () => {
  const { ns, context } = await loadModule({ visibilityState: 'hidden' })
  let calls = 0
  context.autoImportClean = async () => { calls++; return { results: [] } }

  ns.startAutoImport(SESSION, { intervalMs: 60_000 })
  await tick()
  assert.equal(calls, 0)

  context.document.visibilityState = 'visible'
  const done = nextResult(ns)
  await ns.refreshNow()
  await done

  assert.equal(calls, 1)
  ns.stopAutoImport()
})

test('errors are captured in state and a later retry works', async () => {
  const { ns, context } = await loadModule()
  context.autoImportClean = async () => { throw new Error('disk unavailable') }

  const done = nextResult(ns)
  ns.startAutoImport(SESSION, { intervalMs: 60_000 })
  const failed = await done

  assert.match(failed.error, /disk unavailable/)
  assert.equal(failed.results.length, 0)

  context.autoImportClean = async () => ({ results: [{ ok: true, imported: 1 }] })
  const retried = nextResult(ns)
  await ns.refreshNow()
  const ok = await retried

  assert.equal(ok.error, null)
  assert.equal(ok.results[0].imported, 1)
  ns.stopAutoImport()
})

test('a fresh lock held by another writer skips the cycle', async () => {
  const { ns, context } = await loadModule()
  context.readLock = () => ({ owner: 'Heather', stale: false })
  let calls = 0
  context.autoImportClean = async () => { calls++; return { results: [] } }

  ns.startAutoImport(SESSION, { intervalMs: 60_000 })
  await tick()

  assert.equal(calls, 0)
  assert.equal(ns.getLastResult(), null)
  ns.stopAutoImport()
})

test('a held Web Lock skips the cycle', async () => {
  const { ns, context } = await loadModule({ webLockHeld: true })
  let calls = 0
  context.autoImportClean = async () => { calls++; return { results: [] } }

  ns.startAutoImport(SESSION, { intervalMs: 60_000 })
  await tick()

  assert.equal(calls, 0)
  ns.stopAutoImport()
})
