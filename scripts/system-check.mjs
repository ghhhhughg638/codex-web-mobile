import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'

const root = new URL('..', import.meta.url).pathname
const home = await mkdtemp(join(tmpdir(), 'codex-web-system-home-'))
const bin = await mkdtemp(join(tmpdir(), 'codex-web-system-bin-'))
const port = 39000 + Math.floor(Math.random() * 500)
const password = 'system-test-password'
const codexPath = join(bin, 'codex')
const codexHome = join(home, '.codex')
const fakeCodex = `#!/usr/bin/env node
const readline = require('node:readline')
let nextTurn = 1
const threads = new Map()
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, message) => send({ jsonrpc: '2.0', id, error: { code: -32000, message } })
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let request
  try { request = JSON.parse(line) } catch { return }
  const id = request.id
  const method = request.method
  const params = request.params || {}
  if (method === 'initialize') return reply(id, {})
  if (method === 'model/list') return reply(id, { data: [{ id: 'fake-model', model: 'fake-model', displayName: 'Fake Model', description: 'Test model', hidden: false, supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'test' }], defaultReasoningEffort: 'medium', inputModalities: ['text', 'image'], isDefault: true }], nextCursor: null })
  if (method === 'config/read') return reply(id, { config: { model: 'fake-model', model_reasoning_effort: 'medium' } })
  if (method === 'thread/list') return reply(id, { data: [], nextCursor: null })
  if (method === 'thread/read') return reply(id, { thread: { id: params.threadId, preview: '', modelProvider: 'fake', createdAt: 1, updatedAt: 1, path: null, cwd: process.cwd(), cliVersion: 'test', source: 'appServer', gitInfo: null, turns: [] } })
  if (method === 'thread/resume') return reply(id, { thread: { id: params.threadId, preview: '', modelProvider: 'fake', createdAt: 1, updatedAt: 1, path: null, cwd: process.cwd(), cliVersion: 'test', source: 'appServer', gitInfo: null, turns: [] }, model: 'fake-model', modelProvider: 'fake', cwd: process.cwd(), approvalPolicy: 'never', sandbox: { type: 'dangerFullAccess' }, reasoningEffort: 'medium' })
  if (method === 'thread/start') return reply(id, { thread: { id: 'fake-thread-' + Date.now() } })
  if (method === 'turn/start') {
    const turnId = 'fake-turn-' + nextTurn++
    reply(id, { turn: { id: turnId, items: [], status: 'inProgress', error: null } })
    send({ jsonrpc: '2.0', method: 'turn/started', params: { threadId: params.threadId, turn: { id: turnId, status: 'inProgress', startedAt: new Date().toISOString(), items: [] } } })
    send({ jsonrpc: '2.0', id: 'request-string-1', method: 'item/tool/requestUserInput', params: { threadId: params.threadId, turnId, itemId: 'item-1', questions: [{ id: 'confirm', header: 'Confirm', question: 'Continue?', isOther: false, isSecret: false, options: [{ label: 'Yes', description: 'yes' }] }] } })
    return
  }
  if (method === 'turn/interrupt') {
    reply(id, {})
    return send({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: params.threadId, turn: { id: params.turnId, status: 'interrupted' } } })
  }
  if (method === 'turn/steer') return reply(id, {})
  if (method === 'thread/name/set' || method === 'thread/archive' || method === 'thread/resume') return reply(id, {})
  if (method === 'plugin/list') return reply(id, { data: [] })
  if (method === 'mcpServerStatus/list') return reply(id, { data: [] })
  fail(id, 'unknown test method: ' + method)
})
`

await writeFile(codexPath, fakeCodex, { mode: 0o700 })
await mkdir(codexHome, { recursive: true })
await writeFile(join(codexHome, 'config.toml'), 'model_provider = "fake"\nmodel = "fake-model"\n[model_providers.fake]\nbase_url = "https://example.invalid"\n', 'utf8')
await writeFile(join(codexHome, 'auth.json'), '{"OPENAI_API_KEY":"test-key"}\n', { mode: 0o600 })

const app = spawn(process.execPath, ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--password', password], {
  cwd: root,
  env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: `${bin}:${process.env.PATH}` },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
app.stdout.on('data', (chunk) => { logs += chunk.toString() })
app.stderr.on('data', (chunk) => { logs += chunk.toString() })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/`); if (response.ok) return } catch {}
    await sleep(100)
  }
  throw new Error(`server did not start: ${logs}`)
}

try {
  await waitForServer()
  const rootResponse = await fetch(`http://127.0.0.1:${port}/`)
  assert.equal(rootResponse.status, 200)
  assert.match(await rootResponse.text(), /Codex Web Local/u)

  const login = await fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie)
  const wrongLogin = await fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'wrong-password' }) })
  assert.equal(wrongLogin.status, 401)
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers: { cookie, ...(options.headers || {}) } })

  const runtime = await request('/api/runtime')
  assert.equal(runtime.status, 200)
  const config = await request('/api/config?reveal=0')
  assert.equal(config.status, 200)
  const configPayload = await config.json()
  assert.equal(configPayload.config.model_providers.fake.api_key, '********')

  const list = await request(`/api/files/list?path=${encodeURIComponent(home)}`)
  assert.equal(list.status, 200)
  const outside = await request('/api/files/list?path=%2F')
  assert.equal(outside.status, 400)
  const write = await request('/api/files/write', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: join(home, 'system.txt'), content: 'system' }) })
  assert.equal(write.status, 200)
  const traversal = await request('/api/files/write', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: '/tmp/system-escape.txt', content: 'blocked' }) })
  assert.equal(traversal.status, 400)

  const events = await request('/codex-api/events')
  assert.equal(events.status, 200)
  const rpc = async (method, params = {}) => {
    const response = await request('/codex-api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params }) })
    const body = await response.text()
    assert.equal(response.status, 200, body)
    return JSON.parse(body)
  }
  const models = await rpc('model/list')
  assert.equal(models.result.data[0].id, 'fake-model')
  const started = await rpc('thread/start', { cwd: home })
  assert.ok(started.result.thread.id)
  await rpc('turn/start', { threadId: started.result.thread.id, input: [{ type: 'text', text: 'test' }] })
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pending = await (await request('/codex-api/server-requests/pending')).json()
    if (pending.data?.some((row) => row.id === 'request-string-1')) break
    await sleep(100)
  }
  const pending = await (await request('/codex-api/server-requests/pending')).json()
  const stringRequest = pending.data.find((row) => row.id === 'request-string-1')
  assert.ok(stringRequest)
  const reply = await request('/codex-api/server-requests/respond', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'request-string-1', result: { answers: { confirm: { answers: ['Yes'] } } } }) })
  assert.equal(reply.status, 200)

  const collision = spawn(process.execPath, ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(port), '--no-password'], { cwd: root, env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] })
  let collisionOutput = ''
  collision.stdout.on('data', (chunk) => { collisionOutput += chunk.toString() })
  collision.stderr.on('data', (chunk) => { collisionOutput += chunk.toString() })
  const collisionCode = await new Promise((resolve) => collision.once('exit', (code) => resolve(code)))
  assert.notEqual(collisionCode, 0)
  assert.match(collisionOutput, /already in use/u)

  const insecurePort = port + 1
  const insecure = spawn(process.execPath, ['dist-cli/index.js', '--host', '0.0.0.0', '--port', String(insecurePort), '--no-password'], { cwd: root, env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] })
  let insecureOutput = ''
  insecure.stdout.on('data', (chunk) => { insecureOutput += chunk.toString() })
  insecure.stderr.on('data', (chunk) => { insecureOutput += chunk.toString() })
  const insecureCode = await new Promise((resolve) => insecure.once('exit', (code) => resolve(code)))
  assert.notEqual(insecureCode, 0)
  assert.match(insecureOutput, /Passwordless listening is restricted/u)

  console.log(JSON.stringify({ ok: true, auth: true, wrongPassword: true, config: true, fileBoundary: true, rpc: true, stringRequestId: true, portCollision: true, insecureNetworkGuard: true, logs: logs.slice(-200) }))
} finally {
  app.kill('SIGTERM')
  await new Promise((resolve) => app.once('exit', resolve))
  await rm(home, { recursive: true, force: true })
  await rm(bin, { recursive: true, force: true })
}
