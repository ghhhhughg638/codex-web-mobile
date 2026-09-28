import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve(new URL('..', import.meta.url).pathname)
const fixtureHome = await mkdtemp(join(tmpdir(), 'codex-web-core-home-'))
const outsideRoot = await mkdtemp(join(tmpdir(), 'codex-web-core-outside-'))
const bundleRoot = await mkdtemp(join(tmpdir(), 'codex-web-core-bundle-'))
const entryPath = join(bundleRoot, 'entry.ts')
const entryOutput = join(bundleRoot, 'out')

const sourceFile = join(root, 'src/server/fileManagement.ts')
const normalizerFile = join(root, 'src/api/normalizers/v2.ts')
const updateFile = join(root, 'src/server/updateManagement.ts')

const entry = `
import { strict as assert } from 'node:assert'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDirectory, deletePath, listDirectory, readTextFile, renamePath, uploadFile, writeTextFile } from ${JSON.stringify(sourceFile)}
import { normalizeThreadMessagesV2 } from ${JSON.stringify(normalizerFile)}
import { isVersionNewer } from ${JSON.stringify(updateFile)}

const home = ${JSON.stringify(fixtureHome)}
const outside = ${JSON.stringify(outsideRoot)}
const inside = join(home, 'inside.txt')
const outsideFile = join(outside, 'outside.txt')
await writeFile(outsideFile, 'outside')
await writeTextFile(inside, 'hello')
assert.equal((await readTextFile(inside)).content, 'hello')
assert.equal((await listDirectory(home)).entries.some((entry) => entry.name === 'inside.txt'), true)
const renamed = await renamePath(inside, 'renamed.txt')
assert.equal(renamed.path, join(home, 'renamed.txt'))
await createDirectory(home, 'folder')
const uploaded = await uploadFile(home, 'a b.txt', Buffer.from('upload').toString('base64'))
assert.equal((await readTextFile(uploaded.path)).content, 'upload')
await deletePath(uploaded.path)
await assert.rejects(() => readTextFile(outsideFile), /inside the user home directory/u)
await assert.rejects(() => writeTextFile(outsideFile, 'blocked'), /inside the user home directory/u)
await assert.rejects(() => renamePath(outsideFile, 'renamed.txt'), /inside the user home directory/u)
await assert.rejects(() => deletePath(outsideFile), /inside the user home directory/u)
await assert.rejects(() => createDirectory(outside, 'blocked'), /inside the user home directory/u)
await assert.rejects(() => uploadFile(outside, 'blocked.txt', Buffer.from('blocked').toString('base64')), /inside the user home directory/u)
await assert.rejects(() => deletePath(home), /home directory/u)
await symlink(outside, join(home, 'escape-link'))
await assert.rejects(() => listDirectory(join(home, 'escape-link')), /Symbolic links/u)

const payload = { thread: { turns: [{ status: 'completed', items: [
  { type: 'agentMessage', id: 'assistant-1', text: '<img src="/home/picture.png"><audio src="/home/sound.mp3"></audio><a href="/home/page.html">page</a>' },
  { type: 'imageView', id: 'image-1', path: '/home/generated.png' },
] }] } }
const messages = normalizeThreadMessagesV2(payload)
const media = messages.flatMap((message) => message.media || [])
assert.equal(media.some((item) => item.kind === 'image'), true)
assert.equal(media.some((item) => item.kind === 'audio'), true)
assert.equal(media.some((item) => item.kind === 'html'), true)
assert.equal(messages.some((message) => message.messageType === 'imageView'), true)
assert.equal(isVersionNewer('0.2.0', '0.1.9'), true)
assert.equal(isVersionNewer('0.1.0', '0.1.0'), false)
assert.equal(isVersionNewer('0.1.0', '0.2.0'), false)
console.log(JSON.stringify({ ok: true, fileOperations: 8, mediaKinds: media.map((item) => item.kind) }))
`

try {
  await writeFile(entryPath, entry, 'utf8')
  await execFileAsync(join(root, 'node_modules/.bin/tsup'), [entryPath, '--format', 'esm', '--platform', 'node', '--target', 'node18', '--out-dir', entryOutput, '--silent'], { cwd: root })
  const result = await execFileAsync(process.execPath, [join(entryOutput, 'entry.js')], {
    cwd: root,
    env: { ...process.env, HOME: fixtureHome },
    maxBuffer: 2 * 1024 * 1024,
  })
  process.stdout.write(result.stdout)
} finally {
  await rm(bundleRoot, { recursive: true, force: true })
  await rm(fixtureHome, { recursive: true, force: true })
  await rm(outsideRoot, { recursive: true, force: true })
}
