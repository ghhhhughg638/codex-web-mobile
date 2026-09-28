import { spawn } from 'node:child_process'
import { strict as assert } from 'node:assert'

const root = new URL('..', import.meta.url).pathname
const prompt = [
  '这是一次只读验收测试。请检查当前项目目录的结构、主要模块、启动入口和测试命令。',
  '只读取和分析文件，不要执行任何会修改文件、安装依赖、提交代码、启动服务或删除数据的命令。',
  '最终回复必须包含项目名称、至少三个关键目录或文件、启动方式和你发现的一个风险；如果无法读取项目，请明确报告原因。',
].join('\n')

const child = spawn('codex', [
  'exec',
  '--cd', root,
  '--sandbox', 'read-only',
  '--ephemeral',
  '--skip-git-repo-check',
  '--color', 'never',
  '--json',
  '-',
], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })

let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
child.stdin.write(prompt)
child.stdin.end()

const timeout = setTimeout(() => child.kill('SIGTERM'), 180_000)
const exitCode = await new Promise((resolve) => child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))))
clearTimeout(timeout)

const events = stdout.split('\n').map((line) => {
  try { return JSON.parse(line) }
  catch { return null }
}).filter(Boolean)
const completedMessage = events.filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message').at(-1)?.item?.text || ''
const completedTurn = events.some((event) => event.type === 'turn.completed')
assert.equal(exitCode, 0, `codex exec failed: ${stderr.slice(-2000)}`)
assert.equal(completedTurn, true, 'codex exec did not complete a turn')
assert.ok(completedMessage.trim().length > 0, 'codex exec returned no acceptance response')
assert.match(completedMessage, /(?:项目|project|目录|directory|package\.json|src)/iu, 'acceptance response did not describe the project')
console.log(JSON.stringify({ ok: true, responsePreview: completedMessage.trim().slice(-1200) }))
