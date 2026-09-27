import { createServer } from 'node:http'
import { Command } from 'commander'
import { createServer as createApp } from '../server/httpServer.js'
import { generatePassword } from '../server/password.js'

const program = new Command()
  .name('codex-web-mobile')
  .description('Mobile-first web interface for Codex app-server')
  .option('-p, --port <port>', 'port to listen on', '3000')
  .option('--host <host>', 'host to listen on', '127.0.0.1')
  .option('--password <pass>', 'set a specific password')
  .option('--no-password', 'disable password protection')
  .parse()

const opts = program.opts<{ port: string; host: string; password: string | boolean }>()
const port = parseInt(opts.port, 10)
const host = opts.host || '127.0.0.1'

let password: string | undefined
if (opts.password === false) {
  password = undefined
} else if (typeof opts.password === 'string') {
  password = opts.password
} else {
  password = generatePassword()
}

let currentHost = host
let currentPort = port
let server: ReturnType<typeof createServer>
let appInstance: ReturnType<typeof createApp>

function announce(): void {
  const lines = [
    '',
    'Codex Web Mobile is running!',
    '',
    `  Local:    http://${currentHost}:${String(currentPort)}`,
  ]

  if (password) {
    lines.push(`  Password: ${password}`)
  }

  lines.push('')
  console.log(lines.join('\n'))
}

function listen(): void {
  server.listen(currentPort, currentHost, announce)
}

async function changeRuntime(nextHost: string, nextPort: number): Promise<void> {
  currentHost = nextHost
  currentPort = nextPort
  serverOptions.host = nextHost
  serverOptions.port = nextPort
  await new Promise<void>((resolve) => server.close(() => resolve()))
  listen()
}

const serverOptions = { password, host: currentHost, port: currentPort, onRuntimeChange: (nextHost: string, nextPort: number) => void changeRuntime(nextHost, nextPort) }
appInstance = createApp(serverOptions)
server = createServer(appInstance.app)
listen()

function shutdown() {
  console.log('\nShutting down...')
  server.close(() => {
    appInstance.dispose()
    process.exit(0)
  })
  // Force exit after timeout
  setTimeout(() => {
    appInstance.dispose()
    process.exit(1)
  }, 5000).unref()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
