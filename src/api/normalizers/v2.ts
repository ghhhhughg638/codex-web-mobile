import type {
  Thread,
  ThreadItem,
  ThreadReadResponse,
  ThreadListResponse,
  UserInput,
} from '../appServerDtos'
import type { UiMediaResource, UiMessage, UiProjectGroup, UiThread } from '../../types/codex'

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function toProjectName(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts.at(-1) || cwd || 'unknown-project'
}

function toRawPayload(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function mediaKindForPath(value: string): UiMediaResource['kind'] | null {
  const cleanValue = value.split(/[?#]/u)[0].toLowerCase()
  if (/\.(?:png|jpe?g|gif|webp|bmp|svg|avif)$/u.test(cleanValue)) return 'image'
  if (/\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/u.test(cleanValue)) return 'audio'
  if (/\.(?:html?|xhtml)$/u.test(cleanValue)) return 'html'
  return null
}

function mediaResourceForReference(reference: string): UiMediaResource | null {
  const value = reference.trim().replace(/[),.;]+$/u, '')
  if (!value) return null

  if (/^data:image\//iu.test(value)) return { kind: 'image', url: value, label: 'Image' }
  if (/^data:audio\//iu.test(value)) return { kind: 'audio', url: value, label: 'Audio' }
  if (/^blob:/iu.test(value) || /^https?:\/\//iu.test(value)) {
    const kind = mediaKindForPath(value)
    return kind ? { kind, url: value, label: kind === 'image' ? 'Image' : kind === 'audio' ? 'Audio' : 'Open HTML' } : null
  }

  const pathValue = value.replace(/^file:\/\//iu, '')
  const kind = mediaKindForPath(pathValue)
  if (!kind || (!pathValue.startsWith('/') && !pathValue.startsWith('~/'))) return null
  return {
    kind,
    url: `/api/files/preview?path=${encodeURIComponent(pathValue)}`,
    label: pathValue.split('/').filter(Boolean).at(-1) || pathValue,
    path: pathValue,
  }
}

function extractMediaResources(text: string): UiMediaResource[] {
  const candidates = new Set<string>()
  const addMatches = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) {
      const value = match[1] || match[0]
      if (value) candidates.add(value)
    }
  }

  addMatches(/(?:src|href)\s*=\s*["']([^"']+)["']/giu)
  addMatches(/(?:https?:\/\/|data:(?:image|audio)\/)[^\s<>'"`\])]+/giu)
  addMatches(/(?:^|[\s(`])((?:\/|~\/)[^\s<>'"`\])]+\.(?:png|jpe?g|gif|webp|bmp|svg|avif|mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|html?|xhtml)(?:\?[^\s<>'"`\])]+)?)/gimu)

  const resources: UiMediaResource[] = []
  for (const candidate of candidates) {
    const resource = mediaResourceForReference(candidate)
    if (resource && !resources.some((item) => item.url === resource.url)) resources.push(resource)
  }
  return resources
}

function mediaResourceForLocalPath(path: string): UiMediaResource | null {
  const resource = mediaResourceForReference(path)
  if (resource) return resource
  const kind = mediaKindForPath(path)
  if (!kind) return null
  return {
    kind,
    url: `/api/files/preview?path=${encodeURIComponent(path)}`,
    label: path.split('/').filter(Boolean).at(-1) || path,
    path,
  }
}

function extractCodexUserRequestText(value: string): string {
  const markerRegex = /(?:^|\n)\s{0,3}#{0,6}\s*my request for codex\s*:?\s*/giu
  const matches = Array.from(value.matchAll(markerRegex))
  if (matches.length === 0) {
    return value.trim()
  }

  const lastMatch = matches.at(-1)
  if (!lastMatch || typeof lastMatch.index !== 'number') {
    return value.trim()
  }

  const markerOffset = lastMatch.index + lastMatch[0].length
  return value.slice(markerOffset).trim()
}

function parseUserMessageContent(
  itemId: string,
  content: UserInput[] | undefined,
): { text: string; images: string[]; media: UiMediaResource[]; attachments: Array<{ type: 'mention' | 'localImage'; path: string; name: string }>; rawBlocks: UiMessage[] } {
  if (!Array.isArray(content)) return { text: '', images: [], media: [], attachments: [], rawBlocks: [] }

  const textChunks: string[] = []
  const images: string[] = []
  const media: UiMediaResource[] = []
  const rawBlocks: UiMessage[] = []
  const attachments: Array<{ type: 'mention' | 'localImage'; path: string; name: string }> = []

  for (const [index, block] of content.entries()) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      textChunks.push(block.text)
    }
    if (block.type === 'image' && typeof block.url === 'string' && block.url.trim().length > 0) {
      images.push(block.url.trim())
    }
    if (block.type === 'localImage' && typeof block.path === 'string' && block.path.trim()) {
      const path = block.path.trim()
      media.push({ kind: 'image', url: `/api/files/preview?path=${encodeURIComponent(path)}`, label: path.split('/').filter(Boolean).at(-1) || path, path })
      attachments.push({ type: 'localImage', path, name: path.split('/').filter(Boolean).at(-1) || path })
    }
    if (block.type === 'mention' && typeof block.path === 'string' && block.path.trim()) {
      const path = block.path.trim()
      attachments.push({ type: 'mention', path, name: block.name || path.split('/').filter(Boolean).at(-1) || path })
    }

    if (block.type !== 'text' && block.type !== 'image' && block.type !== 'localImage' && block.type !== 'mention') {
      rawBlocks.push({
        id: `${itemId}:user-content:${index}`,
        role: 'user',
        text: '',
        messageType: `userContent.${block.type}`,
        rawPayload: toRawPayload(block),
        isUnhandled: true,
      })
    }
  }

  return {
    text: extractCodexUserRequestText(textChunks.join('\n')),
    images,
    media,
    attachments,
    rawBlocks,
  }
}

function toUiMessages(item: ThreadItem): UiMessage[] {
  if (item.type === 'agentMessage') {
    const media = extractMediaResources(item.text)
    return [
      {
        id: item.id,
        role: 'assistant',
        text: item.text,
        media,
        messageType: item.type,
      },
    ]
  }

  if (item.type === 'userMessage') {
    const parsed = parseUserMessageContent(item.id, item.content as UserInput[] | undefined)
    const messages: UiMessage[] = []
    const hasRenderableUserContent = parsed.text.length > 0 || parsed.images.length > 0

    if (hasRenderableUserContent || parsed.attachments.length > 0) {
      messages.push({
        id: item.id,
        role: 'user',
        text: parsed.text,
        images: parsed.images,
        media: parsed.media,
        attachments: parsed.attachments,
        messageType: item.type,
      })
    }

    messages.push(...parsed.rawBlocks)
    if (messages.length === 0) {
      return []
    }

    return messages
  }

  if (item.type === 'imageView') {
    const media = mediaResourceForLocalPath(item.path)
    return media ? [{ id: item.id, role: 'assistant', text: '', media: [media], messageType: item.type, rawPayload: toRawPayload(item) }] : []
  }

  if (item.type === 'reasoning') {
    return []
  }

  return []
}

function pickThreadName(summary: Thread): string {
  const direct = [summary.preview]
  for (const candidate of direct) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ''
}

function toThreadTitle(summary: Thread): string {
  const named = pickThreadName(summary)
  return named.length > 0 ? named : 'Untitled thread'
}

function toUiThread(summary: Thread): UiThread {
  return {
    id: summary.id,
    title: toThreadTitle(summary),
    projectName: toProjectName(summary.cwd),
    cwd: summary.cwd,
    createdAtIso: toIso(summary.createdAt),
    updatedAtIso: toIso(summary.updatedAt),
    preview: summary.preview,
    unread: false,
    inProgress: false,
    turnStatus: 'idle',
  }
}

function groupThreadsByProject(threads: UiThread[]): UiProjectGroup[] {
  const grouped = new Map<string, UiThread[]>()
  for (const thread of threads) {
    const rows = grouped.get(thread.projectName)
    if (rows) rows.push(thread)
    else grouped.set(thread.projectName, [thread])
  }

  return Array.from(grouped.entries())
    .map(([projectName, projectThreads]) => ({
      projectName,
      threads: projectThreads.sort(
        (a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime(),
      ),
    }))
    .sort((a, b) => {
      const aLast = new Date(a.threads[0]?.updatedAtIso ?? 0).getTime()
      const bLast = new Date(b.threads[0]?.updatedAtIso ?? 0).getTime()
      return bLast - aLast
    })
}

export function normalizeThreadGroupsV2(payload: ThreadListResponse): UiProjectGroup[] {
  const uiThreads = payload.data.map(toUiThread)
  return groupThreadsByProject(uiThreads)
}

export function normalizeThreadMessagesV2(payload: ThreadReadResponse): UiMessage[] {
  const turns = Array.isArray(payload.thread.turns) ? payload.thread.turns : []
  const messages: UiMessage[] = []
  for (const turn of turns) {
    const items = Array.isArray(turn.items) ? turn.items : []
    for (const item of items) {
      messages.push(...toUiMessages(item))
    }
  }
  return messages
}
