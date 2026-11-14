import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const initSqlJs = require('../masterdb2/vendor/sql-wasm.js')
const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const generator = fileURLToPath(new URL('../masterdb2/tools/create-synthetic-qa.mjs', import.meta.url))
const wasm = fileURLToPath(new URL('../masterdb2/vendor/sql-wasm.wasm', import.meta.url))

test('synthetic Windows QA generator creates an isolated and reusable test workspace', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'hcp-web-qa-'))
  const workspace = join(temporaryRoot, 'workspace')

  try {
    await execFileAsync(process.execPath, [generator, workspace], {
      cwd: repoRoot,
    })

    const marker = await readFile(join(workspace, 'SYNTHETIC-QA-ONLY.txt'), 'utf8')
    assert.match(marker, /All records are fictional/)

    const SQL = await initSqlJs({ locateFile: () => wasm })
    const db = new SQL.Database(await readFile(join(workspace, 'db', 'masterdb.sqlite')))

    const count = table => db.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]
    assert.equal(count('users'), 2)
    assert.equal(count('techs'), 1)
    assert.equal(count('companies'), 1)
    assert.equal(count('locations'), 1)
    assert.equal(count('employees'), 3)
    assert.equal(count('classification_rules'), 6)
    assert.equal(count('counsel_templates'), 6)
    assert.deepEqual(
      db.exec('SELECT name, role FROM users ORDER BY name')[0].values,
      [
        ['Windows QA Office', 'super_admin'],
        ['Windows QA Technician', 'aud_tech'],
      ]
    )
    db.close()

    await assert.rejects(
      execFileAsync(process.execPath, [generator, workspace], { cwd: repoRoot }),
      /Refusing to replace existing QA database/
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})
