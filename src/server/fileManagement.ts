import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'

export type DirectoryEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}

export async function listDirectory(pathValue: string): Promise<{ path: string; parent: string; entries: DirectoryEntry[] }> {
  const path = resolve(pathValue || process.env.HOME || '.')
  const entries = await readdir(path, { withFileTypes: true })
  const rows: DirectoryEntry[] = []
  for (const entry of entries.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.') && entry.name !== '.codex') continue
    const entryPath = join(path, entry.name)
    const info = await stat(entryPath)
    rows.push({
      name: entry.name,
      path: entryPath,
      type: entry.isDirectory() ? 'directory' : 'file',
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
    })
  }
  return { path, parent: dirname(path), entries: rows }
}

export async function readTextFile(pathValue: string): Promise<{ path: string; content: string; truncated: boolean }> {
  const path = resolve(pathValue)
  const buffer = await readFile(path)
  const maxBytes = 256 * 1024
  return { path, content: buffer.subarray(0, maxBytes).toString('utf8'), truncated: buffer.byteLength > maxBytes }
}

export async function writeTextFile(pathValue: string, content: string): Promise<{ path: string; size: number }> {
  const path = resolve(pathValue)
  if (typeof content !== 'string') throw new Error('Text content is required')
  if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) throw new Error('Text file exceeds 5 MB')
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 })
  return { path, size: Buffer.byteLength(content, 'utf8') }
}

function safeEntryName(value: string): string {
  const name = basename(value.trim())
  if (!name || name === '.' || name === '..' || name !== value.trim() || /[\\/]/u.test(name)) {
    throw new Error('A simple file or directory name is required')
  }
  return name
}

export async function renamePath(pathValue: string, nextName: string): Promise<{ path: string }> {
  const path = resolve(pathValue)
  const name = safeEntryName(nextName)
  const nextPath = join(dirname(path), name)
  await rename(path, nextPath)
  return { path: nextPath }
}

export async function deletePath(pathValue: string): Promise<{ path: string }> {
  const path = resolve(pathValue)
  const homePath = resolve(process.env.HOME || '.')
  if (path === homePath || path === dirname(homePath)) throw new Error('Deleting a home directory is not allowed')
  const info = await stat(path)
  await rm(path, { recursive: info.isDirectory(), force: false })
  return { path }
}

export async function createDirectory(targetDirectory: string, name: string): Promise<{ path: string }> {
  const directory = resolve(targetDirectory || process.env.HOME || '.')
  const path = join(directory, safeEntryName(name))
  await mkdir(path, { recursive: false, mode: 0o700 })
  return { path }
}

export async function readBinaryFile(pathValue: string): Promise<{ path: string; content: Buffer; contentType: string }> {
  const path = resolve(pathValue)
  const content = await readFile(path)
  const extension = extname(path).toLowerCase()
  const contentType = ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.opus': 'audio/opus',
    '.weba': 'audio/webm',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.xhtml': 'application/xhtml+xml',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  } as Record<string, string>)[extension] || 'application/octet-stream'
  return { path, content, contentType }
}

export async function uploadFile(targetDirectory: string, fileName: string, contentBase64: string): Promise<{ path: string; size: number }> {
  const directory = resolve(targetDirectory || process.env.HOME || '.')
  const safeName = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_') || `upload${extname(fileName)}`
  const content = Buffer.from(contentBase64, 'base64')
  const maxBytes = 20 * 1024 * 1024
  if (content.byteLength > maxBytes) throw new Error('Uploaded file exceeds 20 MB')
  await mkdir(directory, { recursive: true })
  const path = join(directory, safeName)
  await writeFile(path, content, { mode: 0o600 })
  return { path, size: content.byteLength }
}
