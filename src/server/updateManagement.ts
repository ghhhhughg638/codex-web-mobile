import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const packageCandidates = [join(moduleDirectory, '..', 'package.json'), join(moduleDirectory, '..', '..', 'package.json')]
const repository = 'ghhhhughg638/codex-web-mobile'
const githubPackageUrl = `https://raw.githubusercontent.com/${repository}/main/package.json`

type PackageInfo = { version?: string; name?: string }

function parseVersion(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null
  const match = value.trim().replace(/^v/iu, '').match(/^(\d+)\.(\d+)\.(\d+)/u)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function isVersionNewer(latest: string, current: string): boolean {
  const left = parseVersion(latest)
  const right = parseVersion(current)
  if (!left || !right) return latest !== current
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index]
  }
  return false
}

export type UpdateCheckResult = {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  repository: string
  releaseUrl: string
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  let localPackage: PackageInfo | null = null
  for (const packagePath of packageCandidates) {
    try { localPackage = JSON.parse(await readFile(packagePath, 'utf8')) as PackageInfo; break } catch {}
  }
  if (!localPackage) throw new Error('Local package metadata could not be read')
  const response = await fetch(githubPackageUrl, {
    headers: { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'codex-web-mobile-update-check' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`)
  const remotePackage = await response.json() as PackageInfo
  const currentVersion = localPackage.version || '0.0.0'
  const latestVersion = remotePackage.version || currentVersion
  return {
    currentVersion,
    latestVersion,
    updateAvailable: isVersionNewer(latestVersion, currentVersion),
    repository,
    releaseUrl: `https://github.com/${repository}/releases`,
  }
}

export async function installLatestFromGitHub(): Promise<{ message: string }> {
  await execFileAsync('npm', ['install', '--global', `github:${repository}#main`], {
    cwd: moduleDirectory,
    timeout: 180_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  return { message: 'Update downloaded and installed. Restart codex-web-mobile to use it.' }
}
