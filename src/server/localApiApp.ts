import express, { type Express } from 'express'
import {
  getConfig,
  getSkillContent,
  installSkill,
  listConfigBackups,
  listSkills,
  removeSkill,
  restoreConfigBackup,
  saveConfigPatch,
  saveRawConfig,
  setSkillEnabled,
  validateConfig,
} from './localManagement.js'
import { createDirectory, deletePath, listDirectory, readBinaryFile, readTextFile, renamePath, uploadFile, writeTextFile } from './fileManagement.js'
import { checkForUpdate, installLatestFromGitHub } from './updateManagement.js'

export function createLocalApiApp(options: {
  host?: string
  port?: number
  restartAppServer?: () => void
} = {}): Express {
  const app = express()
  app.use(express.json({ limit: '25mb' }))

  app.get('/api/update/check', async (_req, res) => {
    try { res.json(await checkForUpdate()) }
    catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'Update check failed' }) }
  })

  app.post('/api/update/apply', async (_req, res) => {
    try { res.json({ ok: true, ...await installLatestFromGitHub() }) }
    catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : 'Update install failed' }) }
  })

  app.get('/api/files/list', async (req, res) => {
    try {
      res.json(await listDirectory(typeof req.query.path === 'string' ? req.query.path : ''))
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to list directory' })
    }
  })

  app.get('/api/files/read', async (req, res) => {
    try {
      res.json(await readTextFile(typeof req.query.path === 'string' ? req.query.path : ''))
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to read file' })
    }
  })

  app.put('/api/files/write', async (req, res) => {
    try {
      const path = typeof req.body?.path === 'string' ? req.body.path : ''
      const content = typeof req.body?.content === 'string' ? req.body.content : ''
      res.json(await writeTextFile(path, content))
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to write file' }) }
  })

  app.post('/api/files/rename', async (req, res) => {
    try {
      res.json(await renamePath(typeof req.body?.path === 'string' ? req.body.path : '', typeof req.body?.name === 'string' ? req.body.name : ''))
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to rename path' }) }
  })

  app.delete('/api/files/path', async (req, res) => {
    try { res.json(await deletePath(typeof req.query.path === 'string' ? req.query.path : '')) }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to delete path' }) }
  })

  app.post('/api/files/mkdir', async (req, res) => {
    try { res.json(await createDirectory(typeof req.body?.directory === 'string' ? req.body.directory : '', typeof req.body?.name === 'string' ? req.body.name : '')) }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create directory' }) }
  })

  app.get('/api/files/preview', async (req, res) => {
    try {
      const file = await readBinaryFile(typeof req.query.path === 'string' ? req.query.path : '')
      res.setHeader('Content-Type', file.contentType)
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.send(file.content)
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : 'Failed to preview file' })
    }
  })

  app.post('/api/files/upload', async (req, res) => {
    try {
      const directory = typeof req.body?.directory === 'string' ? req.body.directory : ''
      const name = typeof req.body?.name === 'string' ? req.body.name : ''
      const content = typeof req.body?.contentBase64 === 'string' ? req.body.contentBase64 : ''
      if (!name || !content) throw new Error('File name and content are required')
      res.json(await uploadFile(directory, name, content))
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to upload file' })
    }
  })

  app.get('/api/runtime', (_req, res) => {
    res.json({ host: options.host || '127.0.0.1', port: options.port || 5173 })
  })

  app.post('/api/runtime', (req, res) => {
    const host = typeof req.body?.host === 'string' ? req.body.host.trim() : ''
    const port = Number(req.body?.port)
    if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      res.status(422).json({ error: 'Host must be localhost or a wildcard address, and port must be between 1 and 65535' })
      return
    }
    res.json({ ok: true, host, port, message: 'Runtime settings are only applied by the packaged CLI server' })
  })

  app.get('/api/config', async (req, res) => {
    try { res.json(await getConfig(req.query.reveal === '1')) }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to read config' }) }
  })

  app.put('/api/config', async (req, res) => {
    try { res.json({ ok: true, ...await saveConfigPatch(req.body?.config ?? req.body ?? {}) }) }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save config' }) }
  })

  app.get('/api/config/raw', async (req, res) => {
    try { res.json(await getConfig(req.query.reveal === '1')) }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to read raw config' }) }
  })

  app.post('/api/config/validate', async (req, res) => {
    const result = await validateConfig(typeof req.body?.raw === 'string' ? req.body.raw : '')
    res.status(result.valid ? 200 : 422).json(result)
  })

  app.put('/api/config/raw', async (req, res) => {
    try {
      const raw = typeof req.body?.raw === 'string' ? req.body.raw : ''
      const validation = await validateConfig(raw)
      if (!validation.valid) { res.status(422).json(validation); return }
      res.json({ ok: true, ...await saveRawConfig(raw) })
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save raw config' }) }
  })

  app.get('/api/config/backups', async (_req, res) => {
    res.json({ data: await listConfigBackups() })
  })

  app.post('/api/config/restore', async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : ''
      res.json({ ok: true, ...await restoreConfigBackup(name) })
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to restore config' }) }
  })

  app.post('/api/config/apply', (_req, res) => {
    options.restartAppServer?.()
    res.json({ ok: true, message: 'Codex app-server will restart on the next request' })
  })

  app.get('/api/skills', async (_req, res) => {
    try { res.json({ data: await listSkills() }) }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to list skills' }) }
  })

  app.post('/api/skills/install', async (req, res) => {
    try {
      const source = typeof req.body?.source === 'string' ? req.body.source : ''
      const targetName = typeof req.body?.targetName === 'string' ? req.body.targetName : undefined
      res.json({ data: await installSkill(source, targetName) })
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to install skill' }) }
  })

  app.post('/api/skills/:id/enable', async (req, res) => {
    try { res.json({ data: await setSkillEnabled(req.params.id, true) }) }
    catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Skill not found' }) }
  })

  app.post('/api/skills/:id/disable', async (req, res) => {
    try { res.json({ data: await setSkillEnabled(req.params.id, false) }) }
    catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Skill not found' }) }
  })

  app.get('/api/skills/:id/content', async (req, res) => {
    try { res.json({ content: await getSkillContent(req.params.id) }) }
    catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Skill not found' }) }
  })

  app.delete('/api/skills/:id', async (req, res) => {
    try { res.json({ data: await removeSkill(req.params.id) }) }
    catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Skill not found' }) }
  })

  return app
}
