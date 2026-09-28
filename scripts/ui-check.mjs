import { spawn } from 'node:child_process'
import process from 'node:process'
import WebSocket from 'ws'

const root = new URL('..', import.meta.url).pathname
const chromePort = 9333
const appPort = 3037

const app = spawn('node', ['dist-cli/index.js', '--host', '127.0.0.1', '--port', String(appPort), '--no-password'], { cwd: root, stdio: 'ignore' })
const chrome = spawn('chromium-browser', [
  '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking',
  `--remote-debugging-port=${chromePort}`, 'about:blank',
], { stdio: 'ignore' })

try {
  await waitFor(`http://127.0.0.1:${appPort}/`)
  const target = await waitForJson(`http://127.0.0.1:${chromePort}/json`)
  const page = target.find((entry) => entry.type === 'page')
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome CDP page target was not available')

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 1
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    const resolver = pending.get(message.id)
    if (resolver) {
      pending.delete(message.id)
      resolver(message)
    }
  })
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })

  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result))
    socket.send(JSON.stringify({ id, method, params }))
  })

  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression })
    return response.result?.value
  }

  const capture = async (name, label) => {
    const metrics = await evaluate(`(() => { const composer = document.querySelector('.thread-composer-shell')?.getBoundingClientRect(); const home = document.querySelector('.new-thread-card')?.getBoundingClientRect(); const visibleNativeSelects = [...document.querySelectorAll('select')].filter((element) => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden').length; return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, title: document.title, app: Boolean(document.querySelector('#app')), composerBottom: composer?.bottom ?? null, homeOverlapsComposer: Boolean(home && composer && home.bottom > composer.top - 4), visibleNativeSelects }; })()`)
    checks.push({ name: label, ...metrics })
    if (!metrics.app || metrics.scrollWidth > metrics.width + 1) throw new Error(`${label} layout check failed: ${JSON.stringify(metrics)}`)
    if (metrics.composerBottom !== null && metrics.composerBottom > metrics.height + 1) throw new Error(`${label} composer was clipped: ${JSON.stringify(metrics)}`)
    if (metrics.homeOverlapsComposer) throw new Error(`${label} home content overlaps the composer: ${JSON.stringify(metrics)}`)
    if (metrics.visibleNativeSelects > 0) throw new Error(`${label} still renders a visible native select: ${JSON.stringify(metrics)}`)
  }

  const chooseMenuOption = async (triggerSelector, label) => {
    await evaluate(`document.querySelector(${JSON.stringify(triggerSelector)})?.click()`)
    await sleep(100)
    const selected = await evaluate(`(() => { const options = [...document.querySelectorAll('[role="option"], .n-dropdown-option, .n-base-select-option, .app-menu-option')]; const option = options.find((item) => item.textContent?.replace('✓', '').trim() === ${JSON.stringify(label)}); option?.click(); return Boolean(option); })()`)
    if (!selected) throw new Error(`Could not choose ${label} from ${triggerSelector}`)
    await sleep(120)
  }

  await command('Page.enable')
  await command('Runtime.enable')
  await command('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__codexTestStreams = []; window.__codexRpcCalls = []; window.__codexRequestReplies = []; window.__codexTestErrors = []; window.__codexSyntheticConversation = false; window.addEventListener('error', (event) => { const message = String(event.error || event.message || 'error'); if (!message.includes('ResizeObserver loop')) window.__codexTestErrors.push(message); }); const originalFetch = window.fetch.bind(window); window.fetch = async (input, init = {}) => { const rawUrl = typeof input === 'string' ? input : input.url; const url = new URL(rawUrl, location.href).pathname; if (url === '/codex-api/server-requests/respond') { const body = JSON.parse(init.body || '{}'); window.__codexRequestReplies.push(body); return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }); } if (url === '/codex-api/rpc') { const body = JSON.parse(init.body || '{}'); window.__codexRpcCalls.push(body); if (body.method === 'turn/interrupt') return new Response(JSON.stringify({ result: {} }), { status: 200, headers: { 'content-type': 'application/json' } }); if (body.method === 'thread/read' && window.__codexSyntheticConversation) { const threadId = body.params?.threadId || 'ui-test-thread'; const wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA='; const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII='; const assistantText = '<audio src="data:audio/wav;base64,' + wav + '"></audio>\\n\\n' + String.fromCharCode(96).repeat(3) + 'html\\n<!doctype html><html><body><h1>HTML test</h1></body></html>\\n' + String.fromCharCode(96).repeat(3); return new Response(JSON.stringify({ result: { thread: { id: threadId, preview: 'media test', modelProvider: 'test', createdAt: 1, updatedAt: 1, path: null, cwd: '/', cliVersion: 'test', source: { kind: 'appServer' }, gitInfo: null, turns: [{ id: 'media-turn', status: 'completed', error: null, items: [{ type: 'userMessage', id: 'media-user', content: [{ type: 'text', text: 'Image test' }, { type: 'image', url: png }] }, { type: 'agentMessage', id: 'media-assistant', text: assistantText }] }] } } }), { status: 200, headers: { 'content-type': 'application/json' } }); } } return originalFetch(input, init); }; window.open = (url) => { window.__codexOpenedUrls = [...(window.__codexOpenedUrls || []), String(url)]; return null; }; window.EventSource = class { constructor(url) { this.url = url; window.__codexTestStreams.push(this); } close() {} };`,
  })
  const checks = []
  for (const viewport of [{ name: 'small-mobile', width: 360, height: 740 }, { name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 900 }]) {
    await command('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 600 })
    await command('Page.navigate', { url: `http://127.0.0.1:${appPort}/` })
    await sleep(1500)
    await chooseMenuOption('.locale-menu .app-menu-trigger', 'English')
    await sleep(180)
    await capture(viewport.name, `${viewport.name} English home`)
    const maxThreadRowHeight = await evaluate("Math.max(0, ...[...document.querySelectorAll('.thread-row')].slice(0, 20).map((row) => row.getBoundingClientRect().height))")
    if (maxThreadRowHeight > 36) throw new Error(`${viewport.name} sidebar thread rows expanded unexpectedly: ${maxThreadRowHeight}`)
    const modelTrigger = await evaluate("Boolean(document.querySelector('.thread-model-control .composer-dropdown-trigger'))")
    if (!modelTrigger) throw new Error(`${viewport.name} model selector did not render`)
    await evaluate("document.querySelector('.thread-model-control .composer-dropdown-trigger')?.click()")
    let modelCount = 0
    for (let attempt = 0; attempt < 20; attempt += 1) {
      modelCount = await evaluate("document.querySelectorAll('.thread-model-control .composer-dropdown-option').length")
      if (modelCount > 0) break
      await sleep(120)
    }
    if (modelCount < 1) throw new Error(`${viewport.name} model selector did not load models`)
    await evaluate("document.querySelector('.thread-model-control .composer-dropdown-option')?.click()")
    await chooseMenuOption('.appearance-menu .app-menu-trigger', 'Midnight desk')
    const midnightState = await evaluate("({ root: document.querySelector('.mobile-app')?.className || '', appearance: document.documentElement.dataset.appearance || '' })")
    if (!midnightState.root.includes('appearance-midnight') || midnightState.appearance !== 'midnight') throw new Error(`${viewport.name} midnight appearance did not apply: ${JSON.stringify(midnightState)}`)
    await chooseMenuOption('.appearance-menu .app-menu-trigger', 'Codex clean')
    await evaluate(`(() => { const input = document.querySelector('.thread-composer-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '/'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    await sleep(120)
    if (await evaluate("document.querySelectorAll('.slash-option').length") < 8) throw new Error(`${viewport.name} slash completion did not show command suggestions`)
    await capture(`${viewport.name}-slash-completion`, `${viewport.name} slash completion`)
    await evaluate(`[...document.querySelectorAll('.slash-option')].find((row) => row.querySelector('kbd')?.textContent === '/plan')?.click()`)
    await sleep(120)
    const modeLabel = await evaluate("document.querySelector('.mode-select-control .n-base-selection-label')?.textContent || document.querySelector('.mode-select-control')?.textContent || ''")
    if (!modeLabel.includes('Plan') && !modeLabel.includes('计划')) throw new Error(`${viewport.name} /plan did not switch the session mode: ${modeLabel}`)
    await evaluate(`(() => { const input = document.querySelector('.thread-composer-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '/review'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
    await sleep(100)
    await evaluate(`[...document.querySelectorAll('.slash-option')].find((row) => row.querySelector('kbd')?.textContent === '/review')?.click()`)
    if (!await evaluate("(() => { const value = document.querySelector('.thread-composer-input')?.value || ''; return value.includes('Review the recent changes') || value.includes('当前工作区最近'); })()")) throw new Error(`${viewport.name} /review did not complete its prompt`)
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))")
    await sleep(180)
    if (!await evaluate("Boolean(document.querySelector('.command-palette'))")) throw new Error(`${viewport.name} slash command palette did not open`)
    await capture(`${viewport.name}-commands`, `${viewport.name} command palette`)
    await evaluate("document.querySelector('.command-palette input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    await sleep(100)
    await evaluate("document.querySelector('.quick-starts button')?.click()")
    const seededPrompt = await evaluate("document.querySelector('.thread-composer-input')?.value || ''")
    if (!seededPrompt) throw new Error(`${viewport.name} quick-start did not seed the composer`)
    await command('Page.navigate', { url: `http://127.0.0.1:${appPort}/` })
    await sleep(900)
    await chooseMenuOption('.locale-menu .app-menu-trigger', '中文')
    await sleep(250)
    const chineseHeading = await evaluate(`document.querySelector('.new-thread-card h1')?.textContent?.trim() || ''`)
    if (!/[\u4e00-\u9fff]/u.test(chineseHeading)) throw new Error(`${viewport.name} language toggle did not render Chinese: ${chineseHeading}`)
    await capture(`${viewport.name}-zh`, `${viewport.name} Chinese home`)

    for (const [index, viewName, expectedHeading] of [[5, 'settings', '设置'], [1, 'skills', '技能'], [2, 'integrations', '插件与 MCP']]) {
      await evaluate(`document.querySelectorAll('.nav-item')[${index}]?.click()`)
      await sleep(250)
      const heading = await evaluate(`document.querySelector('.management-stage h1')?.textContent?.trim() || ''`)
      if (!heading) throw new Error(`${viewport.name} ${viewName} view did not render`)
      if (!heading.includes(expectedHeading)) throw new Error(`${viewport.name} ${viewName} translation failed: ${heading}`)
      await capture(`${viewport.name}-${viewName}`, `${viewport.name} ${viewName}`)
      if (viewName === 'settings') {
        await chooseMenuOption('.appearance-menu .app-menu-trigger', '夜间工作台')
        await evaluate("document.querySelectorAll('.settings-tabs button')[3]?.click()")
        await sleep(180)
        const editorContrast = await evaluate("(() => { const area = document.querySelector('.toml-editor .n-input__textarea-el, .toml-editor textarea'); return { color: area ? getComputedStyle(area).color : '', background: area ? getComputedStyle(area).backgroundColor : '' } })()")
        if (!editorContrast.color || editorContrast.color === 'rgb(51, 54, 57)') throw new Error(`${viewport.name} midnight TOML text remained dark: ${JSON.stringify(editorContrast)}`)
        await chooseMenuOption('.appearance-menu .app-menu-trigger', 'Codex 清爽')
      }
    }
    await evaluate("document.querySelectorAll('.nav-item')[4]?.click()")
    await sleep(350)
    if (!await evaluate("Boolean(document.querySelector('.file-manager-stage'))")) throw new Error(`${viewport.name} file manager view did not render`)
    await capture(`${viewport.name}-file-manager`, `${viewport.name} file manager`)
    await evaluate("document.querySelectorAll('.nav-item')[0]?.click()")
    await sleep(180)
    const fileButton = await evaluate("(() => { const button = document.querySelector('.thread-composer-files'); if (button && !button.disabled) button.click(); return { found: Boolean(button), disabled: button?.disabled, chat: Boolean(document.querySelector('.chat-stage')) }; })()")
    await sleep(650)
    const filePicker = await evaluate("Boolean(document.querySelector('.file-picker'))")
    if (!filePicker) throw new Error(`${viewport.name} file picker did not open: ${JSON.stringify(fileButton)}`)
    await capture(`${viewport.name}-files`, `${viewport.name} file picker`)
    await evaluate("document.querySelector('.file-picker .icon-button')?.click()")
    await sleep(100)
    const hasThread = await evaluate("document.querySelectorAll('.thread-row').length > 0")
    if (hasThread) {
      await evaluate("window.__codexSyntheticConversation = true")
      await evaluate("document.querySelector('.thread-row .thread-main-button')?.click()")
      await sleep(700)
      await capture(`${viewport.name}-thread`, `${viewport.name} conversation`)
      const threadId = await evaluate("location.pathname.split('/').pop()")
      await command('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__codexSyntheticConversation = true;' })
      await command('Page.navigate', { url: `http://127.0.0.1:${appPort}/thread/${threadId}` })
      await sleep(700)
      let media = { image: false, audio: false, html: false }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        media = await evaluate("({ image: Boolean(document.querySelector('.message-image-preview')), audio: Boolean(document.querySelector('.message-audio')), html: Boolean(document.querySelector('.message-html-action')) })")
        if (media.image && media.audio && media.html) break
        await sleep(120)
      }
      if (!media.image || !media.audio || !media.html) {
        const debug = await evaluate("({ calls: window.__codexRpcCalls, errors: window.__codexTestErrors || [] })")
        debug.probe = await evaluate("(async () => { window.__codexSyntheticConversation = true; const response = await fetch('/codex-api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'thread/read', params: { threadId: location.pathname.split('/').pop(), includeTurns: true } }) }); const payload = await response.json(); return { status: response.status, itemCount: payload.result?.thread?.turns?.[0]?.items?.length || 0, text: payload.result?.thread?.turns?.[0]?.items?.[1]?.text || '' }; })()")
        throw new Error(`${viewport.name} generated media did not render: ${JSON.stringify({ media, debug })}`)
      }
      await evaluate("document.querySelector('.message-html-action button')?.click()")
      if (!await evaluate("Boolean(window.__codexOpenedUrls?.length)")) throw new Error(`${viewport.name} HTML result did not open in a new tab`)
      const turnId = `ui-check-${viewport.name}`
      let streamReady = false
      for (let attempt = 0; attempt < 30; attempt += 1) {
        streamReady = await evaluate("Boolean(window.__codexTestStreams?.at(-1)?.onmessage)")
        if (streamReady) break
        await sleep(150)
      }
      if (!streamReady) throw new Error(`${viewport.name} notification stream was not ready`)
      await evaluate(`(() => { const stream = window.__codexTestStreams.at(-1); const startedAt = new Date(Date.now() - 3605000).toISOString(); window.__codexTestTurnStartedAt = startedAt; stream.onmessage({ data: JSON.stringify({ method: 'turn/started', params: { threadId: ${JSON.stringify(threadId)}, turn: { id: ${JSON.stringify(turnId)}, status: 'inProgress', startedAt, items: [] } }, atIso: new Date().toISOString() }) }); })()`)
      await evaluate(`(() => { const stream = window.__codexTestStreams.at(-1); stream.onmessage({ data: JSON.stringify({ method: 'server/request', params: { id: 'ui-check-string-id', method: 'item/tool/requestUserInput', receivedAtIso: new Date().toISOString(), params: { threadId: ${JSON.stringify(threadId)}, turnId: ${JSON.stringify(turnId)}, itemId: 'question-item', questions: [{ id: 'confirm', header: 'Confirm', question: 'Continue?', isOther: false, isSecret: false, options: [{ label: 'Yes', description: 'Continue' }] }] } }, atIso: new Date().toISOString() }) }); })()`)
      await sleep(100)
      if (!await evaluate("Boolean(document.querySelector('.request-user-input'))")) throw new Error(`${viewport.name} string-id question did not render`)
      await evaluate("document.querySelector('.request-user-input .request-button-primary')?.click()")
      const answeredRequestId = await evaluate("window.__codexRequestReplies.at(-1)?.id")
      if (answeredRequestId !== 'ui-check-string-id') throw new Error(`${viewport.name} string request ID was not preserved: ${answeredRequestId}`)
      await sleep(1250)
      const firstElapsed = await evaluate("document.querySelector('.live-overlay-elapsed')?.textContent || ''")
      if (!/\d+时\s*\d+分\s*\d+秒/u.test(firstElapsed)) throw new Error(`${viewport.name} active turn elapsed time did not render: ${firstElapsed}`)
      const activeControls = await evaluate("(() => ({ inputEnabled: !document.querySelector('.thread-composer-input')?.disabled, choices: document.querySelectorAll('.running-actions button').length }))()")
      if (!activeControls.inputEnabled || activeControls.choices !== 2) throw new Error(`${viewport.name} running composer controls are unavailable: ${JSON.stringify(activeControls)}`)
      await capture(`${viewport.name}-working`, `${viewport.name} active turn`)
      await evaluate("document.querySelector('.activity-dock-trigger')?.click()")
      const dockPosition = await evaluate("(() => { const panel = document.querySelector('.activity-panel'); return panel ? { right: getComputedStyle(panel).right, left: panel.getBoundingClientRect().left, viewportWidth: innerWidth } : null })()")
      if (!dockPosition || dockPosition.left < 0 || dockPosition.left > dockPosition.viewportWidth) throw new Error(`${viewport.name} activity drawer is not docked on the right: ${JSON.stringify(dockPosition)}`)
      await sleep(1150)
      const secondElapsed = await evaluate("document.querySelector('.live-overlay-elapsed')?.textContent || ''")
      if (!secondElapsed || secondElapsed === firstElapsed) throw new Error(`${viewport.name} active turn clock did not advance: ${firstElapsed} -> ${secondElapsed}`)
      await evaluate("document.querySelector('.thread-composer-stop')?.click()")
      await sleep(200)
      const interruptCall = await evaluate("window.__codexRpcCalls.findLast((call) => call.method === 'turn/interrupt') || null")
      if (interruptCall?.params?.turnId !== turnId) throw new Error(`${viewport.name} stop did not send the active turn ID: ${JSON.stringify(interruptCall)}`)
      await evaluate(`(() => { const stream = window.__codexTestStreams.at(-1); stream.onmessage({ data: JSON.stringify({ method: 'turn/completed', params: { threadId: ${JSON.stringify(threadId)}, turn: { id: ${JSON.stringify(turnId)}, status: 'interrupted', startedAt: window.__codexTestTurnStartedAt, completedAt: new Date().toISOString(), items: [] } }, atIso: new Date().toISOString() }) }); })()`)
      await sleep(180)
      if (await evaluate("Boolean(document.querySelector('.live-overlay-elapsed'))")) throw new Error(`${viewport.name} elapsed clock remained visible after completion`)
    }
  }
  console.log(JSON.stringify({ ok: true, checks }))
  socket.close()
} finally {
  app.kill('SIGTERM')
  chrome.kill('SIGTERM')
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return } catch {}
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json() } catch {}
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
