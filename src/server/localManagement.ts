import { execFile } from 'node:child_process'
import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { parse, stringify } from '@iarna/toml'

const execFileAsync = promisify(execFile)
const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
const configPath = join(codexHome, 'config.toml')
const authPath = join(codexHome, 'auth.json')
const managementDir = join(codexHome, 'web-mobile')
const skillRoot = join(codexHome, 'skills')
const skillStatePath = join(managementDir, 'skills.json')

type ConfigRecord = Record<string, unknown>

type SkillRecord = {
  id: string
  name: string
  description: string
  path: string
  enabled: boolean
  source: string
  updatedAt: string
}

function isRecord(value: unknown): value is ConfigRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(base: ConfigRecord, next: ConfigRecord): ConfigRecord {
  const output: ConfigRecord = { ...base }
  for (const [key, value] of Object.entries(next)) {
    if (isRecord(output[key]) && isRecord(value)) {
      output[key] = deepMerge(output[key] as ConfigRecord, value)
    } else {
      output[key] = value
    }
  }
  return output
}

function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets)
  if (!isRecord(value)) return value

  const output: ConfigRecord = {}
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/-/g, '_')
    output[key] = normalized.includes('api_key') || normalized === 'token' || normalized === 'password'
      ? '********'
      : maskSecrets(item)
  }
  return output
}

function redactRaw(raw: string): string {
  return raw.replace(
    /^(\s*(?:api[_-]?key|token|password)\s*=\s*)([^\n#]+)(.*)$/gim,
    '$1"********"$3',
  )
}

function restoreMaskedSecrets(next: unknown, previous: unknown): unknown {
  if (Array.isArray(next) || Array.isArray(previous)) return next
  if (!isRecord(next) || !isRecord(previous)) return next

  const output: ConfigRecord = { ...next }
  for (const [key, value] of Object.entries(output)) {
    if (value === '********' && typeof previous[key] === 'string') {
      output[key] = previous[key]
    } else if (isRecord(value) && isRecord(previous[key])) {
      output[key] = restoreMaskedSecrets(value, previous[key])
    }
  }
  return output
}

async function ensureDirectories(): Promise<void> {
  await mkdir(managementDir, { recursive: true, mode: 0o700 })
  await mkdir(skillRoot, { recursive: true, mode: 0o700 })
}

async function readConfigRaw(): Promise<string> {
  try {
    return await readFile(configPath, 'utf8')
  } catch {
    return ''
  }
}

async function readConfigObject(): Promise<ConfigRecord> {
  const raw = await readConfigRaw()
  if (!raw.trim()) return {}
  return parse(raw) as ConfigRecord
}

async function readAuthObject(): Promise<ConfigRecord> {
  try {
    const raw = await readFile(authPath, 'utf8')
    const value = JSON.parse(raw) as unknown
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

function readAuthApiKey(auth: ConfigRecord): string {
  for (const key of ['OPENAI_API_KEY', 'api_key', 'apiKey']) {
    const value = auth[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export type ProviderBalanceQuery = {
  endpoint: string
  balancePath: string
  usedPath?: string
  currencyPath?: string
  currencyFallback?: string
  authHeader?: string
  authPrefix?: string
}

function valueAtPath(value: unknown, path: string): unknown {
  const segments = path.split('.').map((segment) => segment.trim()).filter(Boolean)
  if (segments.length === 0) return undefined
  let current = value
  for (const segment of segments) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) {
      current = current[Number(segment)]
    } else if (isRecord(current)) {
      current = current[segment]
    } else {
      return undefined
    }
  }
  return current
}

function numericBalance(value: unknown, path: string): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) throw new Error(`Balance field "${path}" is missing or is not numeric`)
  return parsed
}

export async function queryProviderBalance(input: unknown): Promise<{
  total: number
  used: number | null
  remaining: number
  currency: string
  queriedAt: string
}> {
  if (!isRecord(input)) throw new Error('Balance query settings are required')
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : ''
  const balancePath = typeof input.balancePath === 'string' ? input.balancePath.trim() : ''
  const usedPath = typeof input.usedPath === 'string' ? input.usedPath.trim() : ''
  const currencyPath = typeof input.currencyPath === 'string' ? input.currencyPath.trim() : ''
  const currencyFallback = typeof input.currencyFallback === 'string' ? input.currencyFallback.trim().slice(0, 12) : ''
  if (!endpoint || endpoint.length > 2048) throw new Error('A valid balance endpoint is required')
  if (!balancePath || balancePath.length > 200) throw new Error('A balance JSON field path is required')

  const config = await readConfigObject()
  const providerName = typeof config.model_provider === 'string' ? config.model_provider : ''
  const providers = isRecord(config.model_providers) ? config.model_providers : {}
  const provider = isRecord(providers[providerName]) ? providers[providerName] as ConfigRecord : {}
  const auth = await readAuthObject()
  const apiKey = typeof provider.api_key === 'string' && provider.api_key.trim()
    ? provider.api_key.trim()
    : typeof auth.OPENAI_API_KEY === 'string' && auth.OPENAI_API_KEY.trim()
      ? auth.OPENAI_API_KEY.trim()
      : ''
  if (!apiKey) throw new Error('Save an API key in Codex settings before querying the balance')

  const baseUrl = typeof provider.base_url === 'string' ? provider.base_url.trim() : ''
  let target: URL
  try {
    if (/^https?:\/\//iu.test(endpoint)) {
      target = new URL(endpoint)
    } else {
      if (!baseUrl) throw new Error('The active provider has no base URL; use a full balance endpoint URL')
      const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
      target = new URL(endpoint, normalizedBaseUrl)
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid balance endpoint URL')
  }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Balance endpoint must be an HTTP or HTTPS URL without embedded credentials')
  }
  if (!baseUrl) throw new Error('The active provider has no base URL')
  let providerOrigin: string
  try {
    providerOrigin = new URL(baseUrl).origin
  } catch {
    throw new Error('The active provider base URL is invalid')
  }
  if (target.origin !== providerOrigin) throw new Error('Balance endpoint must use the active provider origin')

  const authHeader = typeof input.authHeader === 'string' && input.authHeader.trim() ? input.authHeader.trim() : 'Authorization'
  const authPrefix = typeof input.authPrefix === 'string' ? input.authPrefix : 'Bearer '
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(authHeader) || /[\r\n]/u.test(authPrefix) || authPrefix.length > 100) {
    throw new Error('Invalid authorization header settings')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  let response: Response
  try {
    response = await fetch(target, {
      method: 'GET',
      headers: { Accept: 'application/json', [authHeader]: `${authPrefix}${apiKey}` },
      redirect: 'error',
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Balance query timed out after 15 seconds')
    throw new Error(error instanceof Error ? `Balance endpoint request failed: ${error.message}` : 'Balance endpoint request failed')
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) throw new Error(`Balance endpoint returned HTTP ${response.status}`)
  const raw = await response.text()
  if (raw.length > 1_000_000) throw new Error('Balance endpoint response is too large')
  let payload: unknown
  try {
    payload = JSON.parse(raw) as unknown
  } catch {
    throw new Error('Balance endpoint did not return valid JSON')
  }

  const total = numericBalance(valueAtPath(payload, balancePath), balancePath)
  const used = usedPath ? numericBalance(valueAtPath(payload, usedPath), usedPath) : null
  const currencyValue = currencyPath ? valueAtPath(payload, currencyPath) : ''
  const currency = (typeof currencyValue === 'string' ? currencyValue.trim() : '') || currencyFallback
  return {
    total,
    used,
    remaining: total - (used ?? 0),
    currency,
    queriedAt: new Date().toISOString(),
  }
}

export async function queryCurrentProviderBalance(): Promise<{
  total: number
  used: number | null
  remaining: number
  currency: string
  queriedAt: string
}> {
  const config = await readConfigObject()
  const providerName = typeof config.model_provider === 'string' ? config.model_provider : ''
  const providers = isRecord(config.model_providers) ? config.model_providers : {}
  const provider = isRecord(providers[providerName]) ? providers[providerName] as ConfigRecord : {}
  const baseUrl = typeof provider.base_url === 'string' ? provider.base_url.trim() : ''
  if (!baseUrl) throw new Error('The active Codex provider has no base URL')

  let endpoint: URL
  try {
    endpoint = new URL('/v1/usage', baseUrl)
  } catch {
    throw new Error('The active Codex provider base URL is invalid')
  }

  return queryProviderBalance({
    endpoint: endpoint.toString(),
    balancePath: 'remaining',
    currencyPath: 'unit',
    currencyFallback: 'USD',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  })
}

async function writeAuthApiKey(apiKey: string): Promise<void> {
  const auth = await readAuthObject()
  if (apiKey.trim()) auth.OPENAI_API_KEY = apiKey.trim()
  else delete auth.OPENAI_API_KEY
  await writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 })
  await chmod(authPath, 0o600)
}

function extractApiKey(config: ConfigRecord): string {
  const providers = isRecord(config.model_providers) ? config.model_providers : {}
  for (const provider of Object.values(providers)) {
    if (isRecord(provider) && typeof provider.api_key === 'string' && provider.api_key.trim()) return provider.api_key
  }
  return ''
}

function readApiKeyField(config: ConfigRecord): { present: boolean; value: string } {
  const providers = isRecord(config.model_providers) ? config.model_providers : {}
  for (const provider of Object.values(providers)) {
    if (!isRecord(provider) || !Object.prototype.hasOwnProperty.call(provider, 'api_key')) continue
    return {
      present: true,
      value: typeof provider.api_key === 'string' ? provider.api_key : '',
    }
  }
  return { present: false, value: '' }
}

function removeApiKeys(config: ConfigRecord): ConfigRecord {
  const next = JSON.parse(JSON.stringify(config)) as ConfigRecord
  const providers = isRecord(next.model_providers) ? next.model_providers : {}
  for (const provider of Object.values(providers)) {
    if (isRecord(provider)) delete provider.api_key
  }
  return next
}

async function backupConfig(raw: string): Promise<string | null> {
  if (!raw.trim()) return null
  await ensureDirectories()
  const backupPath = join(managementDir, `config-${new Date().toISOString().replace(/:/g, '-')}.toml`)
  await writeFile(backupPath, raw, { mode: 0o600 })
  return backupPath
}

async function writeConfigObject(value: ConfigRecord): Promise<{ backup: string | null }> {
  const previousRaw = await readConfigRaw()
  const backup = await backupConfig(previousRaw)
  const nextRaw = stringify(value as any)
  await writeFile(configPath, nextRaw, { mode: 0o600 })
  await chmod(configPath, 0o600)
  return { backup }
}

export async function getConfig(reveal = false): Promise<{
  path: string
  config: ConfigRecord
  raw: string
  revealed: boolean
  authPath: string
  hasApiKey: boolean
  apiKeySource: 'auth.json' | 'config.toml' | 'none'
}> {
  const raw = await readConfigRaw()
  const config = await readConfigObject()
  const auth = await readAuthObject()
  const providerName = typeof config.model_provider === 'string' ? config.model_provider : ''
  const providers = isRecord(config.model_providers) ? config.model_providers : {}
  const provider = providerName && isRecord(providers[providerName]) ? providers[providerName] as ConfigRecord : {}
  const providerApiKey = typeof provider.api_key === 'string' && provider.api_key.trim() ? provider.api_key.trim() : ''
  const authApiKey = readAuthApiKey(auth)
  const fallbackApiKey = extractApiKey(config)
  const resolvedApiKey = providerApiKey || authApiKey || fallbackApiKey
  if (providerName && isRecord(providers[providerName]) && typeof providers[providerName].api_key !== 'string') {
    providers[providerName].api_key = resolvedApiKey
  }
  return {
    path: configPath,
    config: (reveal ? config : maskSecrets(config)) as ConfigRecord,
    raw: reveal ? raw : redactRaw(raw),
    revealed: reveal,
    authPath,
    hasApiKey: Boolean(resolvedApiKey),
    apiKeySource: providerApiKey || fallbackApiKey ? 'config.toml' : authApiKey ? 'auth.json' : 'none',
  }
}

export async function saveConfigPatch(patch: ConfigRecord): Promise<{ backup: string | null }> {
  const previous = await readConfigObject()
  const patchApiKey = readApiKeyField(patch)
  const merged = restoreMaskedSecrets(deepMerge(previous, removeApiKeys(patch)), previous) as ConfigRecord
  if (patchApiKey.present) await writeAuthApiKey(patchApiKey.value)
  return writeConfigObject(removeApiKeys(merged))
}

export async function validateConfig(raw: string): Promise<{ valid: boolean; error?: string }> {
  try {
    parse(raw)
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Invalid TOML' }
  }
}

export async function saveRawConfig(raw: string): Promise<{ backup: string | null }> {
  const previousRaw = await readConfigRaw()
  const next = parse(raw) as ConfigRecord
  const previous = previousRaw.trim() ? (parse(previousRaw) as ConfigRecord) : {}
  const apiKey = readApiKeyField(next)
  const merged = restoreMaskedSecrets(removeApiKeys(next), removeApiKeys(previous)) as ConfigRecord
  if (apiKey.present) await writeAuthApiKey(apiKey.value)
  return writeConfigObject(removeApiKeys(merged))
}

export async function listConfigBackups(): Promise<string[]> {
  await ensureDirectories()
  return (await readdir(managementDir)).filter((name) => name.startsWith('config-') && name.endsWith('.toml')).sort().reverse()
}

export async function restoreConfigBackup(name: string): Promise<{ backup: string | null }> {
  if (!/^config-[a-zA-Z0-9._-]+\.toml$/.test(name)) throw new Error('Invalid backup name')
  const backupPath = join(managementDir, name)
  const raw = await readFile(backupPath, 'utf8')
  const validation = await validateConfig(raw)
  if (!validation.valid) throw new Error(validation.error || 'Backup contains invalid TOML')
  const current = await readConfigRaw()
  const backup = await backupConfig(current)
  await writeFile(configPath, raw, { mode: 0o600 })
  await chmod(configPath, 0o600)
  return { backup }
}

async function readSkillState(): Promise<Record<string, boolean>> {
  try {
    const raw = await readFile(skillStatePath, 'utf8')
    const value = JSON.parse(raw) as unknown
    return isRecord(value) ? Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    ) : {}
  } catch {
    return {}
  }
}

async function writeSkillState(state: Record<string, boolean>): Promise<void> {
  await ensureDirectories()
  await writeFile(skillStatePath, JSON.stringify(state, null, 2), { mode: 0o600 })
}

async function findSkillFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 3) return []
  const result: string[] = []
  try {
    const entries = await readdir(root, { withFileTypes: true })
    if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === 'skill.md')) {
      result.push(root)
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        result.push(...await findSkillFiles(join(root, entry.name), depth + 1))
      }
    }
  } catch {
    return result
  }
  return result
}

function parseSkillMetadata(raw: string, fallbackName: string): { name: string; description: string } {
  const frontmatter = raw.match(/^---\s*\n([\s\S]*?)\n---/)
  const block = frontmatter?.[1] ?? ''
  const clean = (value: string | undefined, fallback: string): string => {
    const normalized = value?.trim().replace(/^['"]|['"]$/g, '')
    return normalized || fallback
  }
  const name = clean(block.match(/^name:\s*(.+)$/m)?.[1], fallbackName)
  const description = clean(block.match(/^description:\s*(.+)$/m)?.[1], 'No description provided.')
  return { name, description }
}

export async function listSkills(): Promise<SkillRecord[]> {
  await ensureDirectories()
  const state = await readSkillState()
  const roots = await findSkillFiles(skillRoot)
  const skills: SkillRecord[] = []
  for (const root of roots) {
    const id = root.slice(skillRoot.length + 1).replace(/\//g, ':')
    const skillFile = join(root, 'SKILL.md')
    const raw = await readFile(skillFile, 'utf8')
    const metadata = parseSkillMetadata(raw, basename(root))
    const info = await stat(skillFile)
    skills.push({
      id,
      name: metadata.name,
      description: metadata.description,
      path: root,
      enabled: state[id] !== false,
      source: 'local',
      updatedAt: info.mtime.toISOString(),
    })
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

async function installFromDirectory(sourceDir: string, targetName: string): Promise<void> {
  const roots = await findSkillFiles(sourceDir)
  if (roots.length === 0) throw new Error('No SKILL.md was found in the source')
  const root = roots[0]
  const target = join(skillRoot, targetName.replace(/[^a-zA-Z0-9._-]/g, '-'))
  await rm(target, { recursive: true, force: true })
  await cp(root, target, { recursive: true })
}

async function installSource(source: string, targetName: string): Promise<void> {
  const temp = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(join(tmpdir(), 'codex-skill-')))
  try {
    if (source.startsWith('github:')) {
      await execFileAsync('git', ['clone', '--depth', '1', source.slice('github:'.length), temp])
      await installFromDirectory(temp, targetName)
      return
    }

    if (source.startsWith('npm:')) {
      await execFileAsync('npm', ['pack', source.slice('npm:'.length), '--ignore-scripts', '--pack-destination', temp])
      const archive = (await readdir(temp)).find((name) => name.endsWith('.tgz'))
      if (!archive) throw new Error('npm package did not produce an archive')
      const extracted = join(temp, 'package')
      await mkdir(extracted, { recursive: true })
      await execFileAsync('tar', ['-xzf', join(temp, archive), '-C', extracted, '--strip-components=1'])
      await installFromDirectory(extracted, targetName)
      return
    }

    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source)
      if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`)
      const content = Buffer.from(await response.arrayBuffer())
      if (source.toLowerCase().endsWith('skill.md')) {
        const target = join(skillRoot, targetName.replace(/[^a-zA-Z0-9._-]/g, '-'))
        await mkdir(target, { recursive: true })
        await writeFile(join(target, 'SKILL.md'), content, { mode: 0o600 })
        return
      }
      const archive = join(temp, `download${extname(new URL(source).pathname) || '.tgz'}`)
      await writeFile(archive, content)
      const extracted = join(temp, 'downloaded')
      await mkdir(extracted, { recursive: true })
      if (archive.endsWith('.zip')) {
        await execFileAsync('unzip', ['-q', archive, '-d', extracted])
      } else {
        await execFileAsync('tar', ['-xf', archive, '-C', extracted, '--strip-components=1'])
      }
      await installFromDirectory(extracted, targetName)
      return
    }

    await installFromDirectory(resolve(source), targetName)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

export async function installSkill(source: string, targetName?: string): Promise<SkillRecord[]> {
  const normalizedSource = source.trim()
  if (!normalizedSource) throw new Error('Skill source is required')
  const name = targetName?.trim() || basename(normalizedSource.replace(/\.git$/, '').replace(/\/$/, '')) || 'skill'
  await ensureDirectories()
  await installSource(normalizedSource, name)
  const skills = await listSkills()
  const state = await readSkillState()
  for (const skill of skills) {
    if (skill.name === name || skill.id === name) state[skill.id] = true
  }
  await writeSkillState(state)
  return listSkills()
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<SkillRecord[]> {
  const skills = await listSkills()
  if (!skills.some((skill) => skill.id === id)) throw new Error('Skill not found')
  const state = await readSkillState()
  state[id] = enabled
  await writeSkillState(state)
  return listSkills()
}

export async function getSkillContent(id: string): Promise<string> {
  const skills = await listSkills()
  const skill = skills.find((row) => row.id === id)
  if (!skill) throw new Error('Skill not found')
  return readFile(join(skill.path, 'SKILL.md'), 'utf8')
}

export async function removeSkill(id: string): Promise<SkillRecord[]> {
  const skills = await listSkills()
  const skill = skills.find((row) => row.id === id)
  if (!skill) throw new Error('Skill not found')
  await rm(skill.path, { recursive: true, force: true })
  const state = await readSkillState()
  delete state[id]
  await writeSkillState(state)
  return listSkills()
}
