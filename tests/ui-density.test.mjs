import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('desktop UI uses compact controls and page spacing tokens', async () => {
  const css = await source('masterdb2/app.css')
  assert.match(css, /--control-h:\s+34px/)
  assert.match(css, /--control-h-sm:\s+28px/)
  assert.match(css, /--page-x:\s+1\.25rem/)
  assert.match(css, /--sidebar-w:\s+196px/)
})

test('small screens retain touch-sized controls and single-column workspaces', async () => {
  const css = await source('masterdb2/app.css')
  assert.match(css, /@media \(max-width: 680px\)/)
  assert.match(css, /--control-h:\s+44px/)
  assert.match(css, /--control-h-sm:\s+40px/)
  assert.match(css, /\.workspace-grid\s*\{\s*grid-template-columns:\s*1fr/)
})

test('dashboard uses the shared dense workspace layout', async () => {
  const dashboard = await source('masterdb2/screens/dashboard.js')
  assert.match(dashboard, /class="screen-body workspace-grid"/)
  assert.doesNotMatch(dashboard, /grid-template-columns:1fr 1fr/)
})

test('dashboard processes clean returned results only while owning the Office lock', async () => {
  const dashboard = await source('masterdb2/screens/dashboard.js')
  const resultProcessor = await source('masterdb2/db/import-packet.js')
  assert.match(dashboard, /lock = await readLock\(\)/)
  assert.match(dashboard, /lock\.owner === session\.writerName/)
  assert.match(dashboard, /if \(ownsLock && techs\.length\)/)
  assert.match(dashboard, /await autoImportClean\(techs, session\.writerName\)/)
  assert.match(dashboard, /Ambiguous records remain untouched for review/)
  assert.match(resultProcessor, /if \(_autoImportInFlight\) return _autoImportInFlight/)
  assert.match(resultProcessor, /\.finally\(\(\) => \{ _autoImportInFlight = null \}\)/)
})

test('login surfaces filesystem lock failures instead of silently opening read-only', async () => {
  const login = await source('masterdb2/screens/login.js')
  assert.match(login, /if \(!\(e instanceof StoreLockError\)\)/)
  assert.match(login, /Could not start a writable Office session/)
  assert.doesNotMatch(login, /catch \{ \/\* StoreLockError handled in dashboard \*\//)
})

test('primary workflows use visit and results language instead of file-transfer language', async () => {
  const officeApp = await source('masterdb2/app.js')
  const results = await source('masterdb2/screens/import.js')
  const visits = await source('techtool2/screens/tt-inbox.js')
  const testFlow = await source('techtool2/screens/tt-test.js')
  const schedule = await source('techtool2/screens/tt-schedule.js')
  const officeSchedule = await source('masterdb2/screens/schedule.js')
  const location = await source('masterdb2/screens/location.js')

  assert.match(officeApp, /name: 'import',\s+label: 'Results'/)
  assert.doesNotMatch(results, /<h1>Import<\/h1>|Auto-import all|Back to inbox|Pre-import snapshot/)
  assert.doesNotMatch(visits, /<h1>Inbox<\/h1>|Inbox is empty|No packets waiting/)
  assert.doesNotMatch(testFlow, />Submit Packet|>Add worker to packet|← Inbox/)
  assert.doesNotMatch(schedule, />Open packet|Imported into MasterDB|will import this/)
  assert.doesNotMatch(officeSchedule, /Packet detail|Cancel Packet|row\('File'/)
  assert.doesNotMatch(location, /Generate Packet|Write to Outbox|Packet written|<th>File<\/th>/)
})

test('Field test form preserves the assigned worker occupation values', async () => {
  const testFlow = await source('techtool2/screens/tt-test.js')
  assert.match(testFlow, /slot\.empEdits\?\.job_title\s+\?\? emp\?\.job_title/)
  assert.match(testFlow, /slot\.empEdits\?\.occupation_code\s+\?\? emp\?\.occupation_code/)
})
