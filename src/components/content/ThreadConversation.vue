<template>
  <section class="conversation-root">
    <div v-if="messages.length > 0" class="conversation-toolbar">
      <span>{{ t('conversation.title') }}</span>
      <button class="conversation-copy-button" type="button" :aria-label="copiedConversation ? t('message.copied') : t('conversation.copyAll')" @click="copyConversation">
        <svg v-if="copiedConversation" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
        <span>{{ copiedConversation ? t('message.copied') : t('conversation.copyAll') }}</span>
      </button>
    </div>
    <p v-if="isLoading" class="conversation-loading">{{ t('conversation.loading') }}</p>

    <p
      v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay"
      class="conversation-empty"
    >
      {{ t('conversation.empty') }}
    </p>

    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
      <li
        v-for="message in messages"
        :key="message.id"
        class="conversation-item"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
      >
        <div class="message-row" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <ul v-if="displayMedia(message).length > 0" class="message-media-list" :data-role="message.role">
                <li v-for="media in displayMedia(message)" :key="`${media.kind}:${media.url}`" class="message-media-item">
                  <button v-if="media.kind === 'image'" class="message-image-button" type="button" @click="openImageModal(media.url)">
                    <img class="message-image-preview" :src="media.url" :alt="media.label || t('request.previewImage')" loading="lazy" @error="onMediaError" />
                  </button>
                  <div v-else-if="media.kind === 'audio'" class="message-audio-card">
                    <strong>{{ media.label || t('files.audio') }}</strong>
                    <audio class="message-audio" controls preload="metadata" :src="media.url" @error="onMediaError" />
                  </div>
                  <a v-else class="message-resource-link" :href="media.url" target="_blank" rel="noopener noreferrer">
                    <span class="message-resource-icon">{{ media.kind === 'html' ? 'HTML' : 'FILE' }}</span>
                    <span><strong>{{ media.label || t('files.openFile') }}</strong><small>{{ t('files.openInNewTab') }}</small></span>
                    <b>↗</b>
                  </a>
                </li>
              </ul>

              <div v-if="message.attachments && message.attachments.length > 0" class="message-attachment-list">
                <a v-for="attachment in message.attachments" :key="attachment.path" class="message-attachment" :href="attachment.type === 'localImage' ? `/api/files/preview?path=${encodeURIComponent(attachment.path)}` : `#${encodeURIComponent(attachment.path)}`" target="_blank" rel="noreferrer">
                  <span class="message-attachment-icon">{{ attachment.type === 'localImage' ? 'IMG' : 'FILE' }}</span>
                  <span><strong>{{ attachment.name }}</strong><small>{{ attachment.path }}</small></span>
                  <b>↗</b>
                </a>
              </div>

              <article v-if="message.text.length > 0" class="message-card" :data-role="message.role">
                <div v-if="extractHtmlDocument(message.text)" class="message-html-action">
                  <button type="button" class="message-resource-link" @click="openHtmlDocument(extractHtmlDocument(message.text))">
                    <span class="message-resource-icon">HTML</span>
                    <span><strong>{{ t('files.openHtml') }}</strong><small>{{ t('files.openInNewTab') }}</small></span>
                    <b>↗</b>
                  </button>
                </div>
                <div v-if="message.messageType === 'worked'" class="worked-separator" aria-live="polite">
                  <span class="worked-separator-line" aria-hidden="true" />
                  <p class="worked-separator-text">{{ message.text }}</p>
                  <span class="worked-separator-line" aria-hidden="true" />
                </div>
                <template v-else-if="isLongUserMessage(message)">
                  <button class="long-content-toggle" type="button" :aria-expanded="isLongContentExpanded(message.id)" :aria-label="isLongContentExpanded(message.id) ? t('conversation.collapsePasted') : t('conversation.expandPasted')" @click="toggleLongContent(message.id)">
                    <svg v-if="isLongContentExpanded(message.id)" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg>
                    <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg>
                    <span v-if="isLongContentExpanded(message.id)">{{ t('conversation.collapsePasted') }}</span>
                    <span v-else>[{{ t('conversation.pastedContent') }} {{ messageCharacterCount(message.text) }} {{ t('conversation.chars') }}]</span>
                  </button>
                  <div v-if="isLongContentExpanded(message.id)" class="message-markdown" v-html="renderMarkdown(message.text, displayMedia(message))" @click="onMarkdownClick" />
                </template>
                <div v-else class="message-markdown" v-html="renderMarkdown(message.text, displayMedia(message))" @click="onMarkdownClick" />
              </article>
              <button v-if="message.text.length > 0 && message.role === 'user'" class="message-action-button message-edit-button" type="button" :aria-label="t('message.editResend')" :title="t('message.editResend')" @click="emit('editMessage', { text: message.text, attachments: message.attachments ?? [] })">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
              </button>
            </article>
          </div>
        </div>
      </li>

      <li
        v-for="request in pendingRequests"
        :key="`server-request:${String(request.id)}`"
        class="conversation-item conversation-item-request"
      >
        <div class="message-row">
          <div class="message-stack">
            <article class="request-card">
              <p class="request-title">{{ request.method }}</p>
              <p class="request-meta">{{ t('request.number') }} #{{ request.id }} · {{ formatIsoTime(request.receivedAtIso) }}</p>

              <p v-if="readRequestReason(request)" class="request-reason">{{ readRequestReason(request) }}</p>

              <section v-if="request.method === 'item/commandExecution/requestApproval'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondApproval(request.id, 'accept')">{{ t('request.accept') }}</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'acceptForSession')">{{ t('request.acceptSession') }}</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'decline')">{{ t('request.decline') }}</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'cancel')">{{ t('request.cancel') }}</button>
              </section>

              <section v-else-if="request.method === 'item/fileChange/requestApproval'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondApproval(request.id, 'accept')">{{ t('request.accept') }}</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'acceptForSession')">{{ t('request.acceptSession') }}</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'decline')">{{ t('request.decline') }}</button>
                <button type="button" class="request-button" @click="onRespondApproval(request.id, 'cancel')">{{ t('request.cancel') }}</button>
              </section>

              <section v-else-if="request.method === 'item/tool/requestUserInput'" class="request-user-input">
                <div
                  v-for="question in readToolQuestions(request)"
                  :key="`${String(request.id)}:${question.id}`"
                  class="request-question"
                >
                  <p class="request-question-title">{{ question.header || question.question }}</p>
                  <p v-if="question.header && question.question" class="request-question-text">{{ question.question }}</p>
                  <AppSelect
                    class-name="request-select-control"
                    :model-value="readQuestionAnswer(request.id, question.id, question.options[0] || '')"
                    :options="question.options.map((option) => ({ value: option, label: option }))"
                    :aria-label="question.header || question.question"
                    size="small"
                    @update:model-value="onQuestionAnswerValue(request.id, question.id, $event)"
                  />
                  <input
                    v-if="question.isOther"
                    class="request-input"
                    type="text"
                    :value="readQuestionOtherAnswer(request.id, question.id)"
                    :placeholder="t('request.other')"
                    @input="onQuestionOtherAnswerInput(request.id, question.id, $event)"
                  />
                </div>

                <button type="button" class="request-button request-button-primary" @click="onRespondToolRequestUserInput(request)">
                  {{ t('request.submit') }}
                </button>
              </section>

              <section v-else-if="request.method === 'item/tool/call'" class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondToolCallFailure(request.id)">{{ t('request.failTool') }}</button>
                <button type="button" class="request-button" @click="onRespondToolCallSuccess(request.id)">{{ t('request.emptySuccess') }}</button>
              </section>

              <section v-else class="request-actions">
                <button type="button" class="request-button request-button-primary" @click="onRespondEmptyResult(request.id)">{{ t('request.returnEmpty') }}</button>
                <button type="button" class="request-button" @click="onRejectUnknownRequest(request.id)">{{ t('request.reject') }}</button>
              </section>
            </article>
          </div>
        </div>
      </li>

      <li v-if="liveOverlay" class="conversation-item conversation-item-overlay">
        <div class="message-row">
          <div class="message-stack">
            <article class="live-overlay-inline" aria-live="polite">
              <div class="live-activity-heading"><span class="live-activity-indicator" aria-hidden="true" /><p class="live-overlay-label">{{ liveOverlay.activityLabel }}</p><time v-if="liveOverlay.elapsedLabel" class="live-overlay-elapsed">{{ liveOverlay.elapsedLabel }}</time></div>
              <ul v-if="liveOverlay.activityDetails.length > 0" class="live-overlay-details">
                <li v-for="detail in liveOverlay.activityDetails" :key="detail">{{ detail }}</li>
              </ul>
              <p
                v-if="liveOverlay.reasoningText"
                class="live-overlay-reasoning"
              >
                {{ liveOverlay.reasoningText }}
              </p>
              <p v-if="liveOverlay.errorText" class="live-overlay-error">{{ liveOverlay.errorText }}</p>
            </article>
          </div>
        </div>
      </li>
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
    </ul>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" :aria-label="t('files.close')" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <img class="image-modal-image" :src="modalImageUrl" :alt="t('request.expandedImage')" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { ThreadScrollState, UiFileAttachment, UiLiveOverlay, UiMediaResource, UiMessage, UiServerRequest } from '../../types/codex'
import IconTablerX from '../icons/IconTablerX.vue'
import AppSelect from '../ui/AppSelect.vue'
import { useLocale } from '../../composables/useLocale'

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  liveOverlay: UiLiveOverlay | null
  isLoading: boolean
  activeThreadId: string
  scrollState: ThreadScrollState | null
}>()
const { t } = useLocale()
marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(value: string, visibleMedia: UiMediaResource[] = []): string {
  const safeHtml = DOMPurify.sanitize(marked.parse(value, { async: false }))
  const documentFragment = new DOMParser().parseFromString(safeHtml, 'text/html')
  const visibleImageUrls = new Set(
    visibleMedia.filter((resource) => resource.kind === 'image').map((resource) => resource.url),
  )
  for (const pre of documentFragment.querySelectorAll('pre')) {
    const button = documentFragment.createElement('button')
    button.type = 'button'
    button.className = 'code-copy-button'
    button.dataset.copyCode = 'true'
    button.dataset.defaultLabel = t('message.copyCode')
    button.setAttribute('aria-label', t('message.copyCode'))
    button.title = t('message.copyCode')

    const icon = documentFragment.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('aria-hidden', 'true')
    const firstRect = documentFragment.createElementNS('http://www.w3.org/2000/svg', 'rect')
    firstRect.setAttribute('x', '8')
    firstRect.setAttribute('y', '8')
    firstRect.setAttribute('width', '12')
    firstRect.setAttribute('height', '13')
    firstRect.setAttribute('rx', '2')
    const secondPath = documentFragment.createElementNS('http://www.w3.org/2000/svg', 'path')
    secondPath.setAttribute('d', 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3')
    icon.append(firstRect, secondPath)

    const label = documentFragment.createElement('span')
    label.className = 'code-copy-label'
    label.textContent = t('message.copyCode')
    button.append(icon, label)
    pre.prepend(button)
  }
  for (const image of documentFragment.querySelectorAll<HTMLImageElement>('img')) {
    const source = image.getAttribute('src')?.trim() || ''
    const resource = source ? mediaResourceForReference(source) : null
    if (resource?.kind === 'image' && visibleImageUrls.has(resource.url)) {
      image.remove()
      continue
    }
    if (resource?.kind === 'image') {
      image.setAttribute('src', resource.url)
    }
    if (!source || (isLocalMediaReference(source) && !resource)) {
      image.remove()
      continue
    }
  }
  for (const anchor of documentFragment.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href') || ''
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    if (isLocalMediaReference(href)) {
      const resource = mediaResourceForReference(href)
      if (resource) anchor.href = resource.url
    }
  }
  return documentFragment.body.innerHTML
}

const emit = defineEmits<{
  updateScrollState: [payload: { threadId: string; state: ThreadScrollState }]
  respondServerRequest: [payload: { id: string | number; result?: unknown; error?: { code?: number; message: string } }]
  editMessage: [payload: { text: string; attachments: UiFileAttachment[] }]
}>()

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const expandedLongMessageIds = ref<Set<string>>(new Set())
const copiedConversation = ref(false)
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const BOTTOM_THRESHOLD_PX = 16
type InlineSegment =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'file'; value: string; displayName: string }

let scrollRestoreFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let copiedConversationTimer: number | null = null
const codeCopyTimers = new Set<number>()
const trackedPendingImages = new WeakSet<HTMLImageElement>()

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isOther: boolean
  options: string[]
}

const LONG_MESSAGE_CHAR_THRESHOLD = 1200

function mediaKindForPath(value: string): UiMediaResource['kind'] | null {
  const cleanValue = value.split(/[?#]/u)[0].toLowerCase()
  if (/\.(?:png|jpe?g|gif|webp|bmp|svg|avif)$/u.test(cleanValue)) return 'image'
  if (/\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/u.test(cleanValue)) return 'audio'
  if (/\.(?:html?|xhtml)$/u.test(cleanValue)) return 'html'
  return null
}

function isLocalMediaReference(value: string): boolean {
  return Boolean(mediaKindForPath(value)) && (value.startsWith('/') || value.startsWith('~/') || value.startsWith('file://'))
}

function mediaResourceForReference(reference: string): UiMediaResource | null {
  const value = reference.trim().replace(/[),.;]+$/u, '')
  if (!value) return null
  if (/^data:image\//iu.test(value)) return { kind: 'image', url: value, label: 'Image' }
  if (/^data:audio\//iu.test(value)) return { kind: 'audio', url: value, label: 'Audio' }
  const kind = mediaKindForPath(value)
  if (!kind) return null
  if (/^(?:https?:|blob:|data:)/iu.test(value)) return { kind, url: value, label: kind === 'html' ? t('files.openHtml') : kind === 'audio' ? t('files.audio') : t('files.openFile') }
  const path = value.replace(/^file:\/\//iu, '')
  return { kind, url: `/api/files/preview?path=${encodeURIComponent(path)}`, label: getBasename(path), path }
}

function displayMedia(message: UiMessage): UiMediaResource[] {
  const resources = [
    ...(message.media || []),
    ...(message.images || []).map((url) => ({ kind: 'image' as const, url, label: t('request.previewImage') })),
  ]
  return resources.filter((resource, index) => resources.findIndex((candidate) => `${candidate.kind}:${candidate.url}` === `${resource.kind}:${resource.url}`) === index)
}

function extractHtmlDocument(value: string): string {
  const fenced = value.match(/```html?\s*([\s\S]*?)```/iu)
  if (fenced?.[1]?.trim()) return fenced[1].trim()
  if (/^\s*(?:<!doctype\s+html|<html[\s>])/iu.test(value)) return value.trim()
  return ''
}

function openHtmlDocument(value: string): void {
  const blobUrl = URL.createObjectURL(new Blob([value], { type: 'text/html;charset=utf-8' }))
  window.open(blobUrl, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}

function onMediaError(event: Event): void {
  const element = event.currentTarget
  if (element instanceof HTMLElement) {
    element.closest('.message-media-item')?.remove()
  }
}

function messageCharacterCount(value: string): number {
  return value.length
}

function isLongUserMessage(message: UiMessage): boolean {
  return message.role === 'user' && messageCharacterCount(message.text) >= LONG_MESSAGE_CHAR_THRESHOLD
}

function isLongContentExpanded(messageId: string): boolean {
  return expandedLongMessageIds.value.has(messageId)
}

function toggleLongContent(messageId: string): void {
  const next = new Set(expandedLongMessageIds.value)
  if (next.has(messageId)) next.delete(messageId)
  else next.add(messageId)
  expandedLongMessageIds.value = next
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Use the selection-based fallback for browsers that block clipboard access.
  }

  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  return copied
}

async function copyConversation(): Promise<void> {
  const text = props.messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => `${message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Codex' : 'System'}:\n${message.text}`)
    .join('\n\n')
  if (!await copyToClipboard(text)) return
  copiedConversation.value = true
  if (copiedConversationTimer !== null) window.clearTimeout(copiedConversationTimer)
  copiedConversationTimer = window.setTimeout(() => {
    copiedConversation.value = false
    copiedConversationTimer = null
  }, 1400)
}

async function onMarkdownClick(event: MouseEvent): Promise<void> {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('[data-copy-code="true"]')
  if (!button) return
  const code = button.parentElement?.querySelector('code')
  if (!code || !await copyToClipboard(code.textContent ?? '')) return

  button.classList.add('is-copied')
  button.setAttribute('aria-label', t('message.copied'))
  button.title = t('message.copied')
  const label = button.querySelector('.code-copy-label')
  if (label) label.textContent = t('message.copied')
  const timer = window.setTimeout(() => {
    codeCopyTimers.delete(timer)
    if (!button.isConnected) return
    button.classList.remove('is-copied')
    button.setAttribute('aria-label', button.dataset.defaultLabel ?? t('message.copyCode'))
    button.title = button.dataset.defaultLabel ?? t('message.copyCode')
    if (label) label.textContent = button.dataset.defaultLabel ?? t('message.copyCode')
  }, 1400)
  codeCopyTimers.add(timer)
}

function isFilePath(value: string): boolean {
  if (!value || /\s/u.test(value)) return false
  if (value.endsWith('/') || value.endsWith('\\')) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return false

  const looksLikeUnixAbsolute = value.startsWith('/')
  const looksLikeWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(value)
  const looksLikeRelative = value.startsWith('./') || value.startsWith('../') || value.startsWith('~/')
  const hasPathSeparator = value.includes('/') || value.includes('\\')
  return looksLikeUnixAbsolute || looksLikeWindowsAbsolute || looksLikeRelative || hasPathSeparator
}

function getBasename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/')
  const name = normalized.split('/').filter(Boolean).pop()
  return name || pathValue
}

function parseFileReference(value: string): { path: string; line: number | null } | null {
  if (!value) return null

  let pathValue = value
  let line: number | null = null

  const hashLineMatch = pathValue.match(/^(.*)#L(\d+)(?:C\d+)?$/u)
  if (hashLineMatch) {
    pathValue = hashLineMatch[1]
    line = Number(hashLineMatch[2])
  } else {
    const colonLineMatch = pathValue.match(/^(.*):(\d+)(?::\d+)?$/u)
    if (colonLineMatch) {
      pathValue = colonLineMatch[1]
      line = Number(colonLineMatch[2])
    }
  }

  if (!isFilePath(pathValue)) return null
  return { path: pathValue, line }
}

function parseInlineSegments(text: string): InlineSegment[] {
  if (!text.includes('`')) return [{ kind: 'text', value: text }]

  const segments: InlineSegment[] = []
  let cursor = 0
  let textStart = 0

  while (cursor < text.length) {
    if (text[cursor] !== '`') {
      cursor += 1
      continue
    }

    let openLength = 1
    while (cursor + openLength < text.length && text[cursor + openLength] === '`') {
      openLength += 1
    }
    const delimiter = '`'.repeat(openLength)

    let searchFrom = cursor + openLength
    let closingStart = -1
    while (searchFrom < text.length) {
      const candidate = text.indexOf(delimiter, searchFrom)
      if (candidate < 0) break

      const hasBacktickBefore = candidate > 0 && text[candidate - 1] === '`'
      const hasBacktickAfter =
        candidate + openLength < text.length && text[candidate + openLength] === '`'
      const hasNewLineInside = text.slice(cursor + openLength, candidate).includes('\n')

      if (!hasBacktickBefore && !hasBacktickAfter && !hasNewLineInside) {
        closingStart = candidate
        break
      }
      searchFrom = candidate + 1
    }

    if (closingStart < 0) {
      cursor += openLength
      continue
    }

    if (cursor > textStart) {
      segments.push({ kind: 'text', value: text.slice(textStart, cursor) })
    }

    const token = text.slice(cursor + openLength, closingStart)
    if (token.length > 0) {
      const fileReference = parseFileReference(token)
      if (fileReference) {
        const basename = getBasename(fileReference.path)
        const displayName = fileReference.line ? `${basename} (line ${String(fileReference.line)})` : basename
        segments.push({ kind: 'file', value: token, displayName })
      } else {
        segments.push({ kind: 'code', value: token })
      }
    } else {
      segments.push({ kind: 'text', value: `${delimiter}${delimiter}` })
    }

    cursor = closingStart + openLength
    textStart = cursor
  }

  if (textStart < text.length) {
    segments.push({ kind: 'text', value: text.slice(textStart) })
  }

  return segments
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = params?.reason
  return typeof reason === 'string' ? reason.trim() : ''
}

function toolQuestionKey(requestId: string | number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => option?.label)
        .filter((option): option is string => typeof option === 'string' && option.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: string | number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function readQuestionOtherAnswer(requestId: string | number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerValue(requestId: string | number, questionId: string, value: string): void {
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: value,
  }
}

function onQuestionOtherAnswerInput(requestId: string | number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onRespondApproval(requestId: string | number, decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel'): void {
  emit('respondServerRequest', {
    id: requestId,
    result: { decision },
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0] || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: string | number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: 'Tool call rejected from codex-web-local UI.',
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: string | number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: string | number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: string | number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: 'Rejected from codex-web-local UI.',
    },
  })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function emitScrollState(container: HTMLElement): void {
  if (!props.activeThreadId) return
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const scrollRatio = maxScrollTop > 0 ? Math.min(Math.max(container.scrollTop / maxScrollTop, 0), 1) : 1
  emit('updateScrollState', {
    threadId: props.activeThreadId,
    state: {
      scrollTop: container.scrollTop,
      isAtBottom: isAtBottom(container),
      scrollRatio,
    },
  })
}

function applySavedScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  const savedState = props.scrollState
  if (!savedState || savedState.isAtBottom) {
    enforceBottomState()
    return
  }

  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0)
  const targetScrollTop =
    typeof savedState.scrollRatio === 'number'
      ? savedState.scrollRatio * maxScrollTop
      : savedState.scrollTop
  container.scrollTop = Math.min(Math.max(targetScrollTop, 0), maxScrollTop)
  emitScrollState(container)
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
  emitScrollState(container)
}

function shouldLockToBottom(): boolean {
  const savedState = props.scrollState
  return !savedState || savedState.isAtBottom === true
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleScrollRestore(): Promise<void> {
  await nextTick()
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  scrollRestoreFrame = requestAnimationFrame(() => {
    scrollRestoreFrame = 0
    applySavedScrollState()
    bindPendingImageHandlers()
    scheduleBottomLock()
  })
}

watch(
  () => props.messages,
  async () => {
    if (props.isLoading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.pendingRequests,
  async () => {
    if (props.isLoading) return
    await scheduleScrollRestore()
  },
  { deep: true },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    await nextTick()
    enforceBottomState()
    scheduleBottomLock(8)
  },
  { deep: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    await scheduleScrollRestore()
  },
)

watch(
  () => props.activeThreadId,
  () => {
    modalImageUrl.value = ''
    expandedLongMessageIds.value = new Set()
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  emitScrollState(container)
}

function openImageModal(imageUrl: string): void {
  modalImageUrl.value = imageUrl
}

function closeImageModal(): void {
  modalImageUrl.value = ''
}

onBeforeUnmount(() => {
  if (scrollRestoreFrame) {
    cancelAnimationFrame(scrollRestoreFrame)
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
  }
  if (copiedConversationTimer !== null) window.clearTimeout(copiedConversationTimer)
  for (const timer of codeCopyTimers) window.clearTimeout(timer)
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply h-full min-h-0 p-0 flex flex-col overflow-y-hidden overflow-x-visible bg-transparent border-none rounded-none;
}

.conversation-toolbar { display: flex; min-height: 34px; align-items: center; justify-content: space-between; gap: 10px; padding: 3px 5px 5px; border-bottom: 1px solid #e6ecec; color: #718286; font-size: 10px; font-weight: 700; }
.conversation-copy-button { display: inline-flex; min-height: 27px; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid #d5e1e2; border-radius: 7px; color: #55777b; background: #f7fbfb; font-size: 10px; }
.conversation-copy-button:hover { border-color: #9fbdc0; color: #285e67; background: #edf7f6; }
.conversation-copy-button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.conversation-loading {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-empty {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-5 py-3 overflow-y-auto overflow-x-visible flex flex-col gap-5;
  padding-top: 18px;
  padding-bottom: 24px;
  gap: 24px;
}

.conversation-item {
  @apply m-0 w-full flex;
}

.conversation-item-request {
  @apply justify-center;
}

.conversation-item-overlay {
  @apply justify-center;
}

.message-row {
  @apply relative w-full max-w-180 mx-auto flex;
  max-width: min(900px, 100%);
}

.message-row[data-role='user'] {
  @apply justify-end;
}

.message-row[data-role='assistant'],
.message-row[data-role='system'] {
  @apply justify-start;
}

.conversation-bottom-anchor {
  @apply h-px;
}

.message-stack {
  @apply flex flex-col w-full;
}

.request-card {
  @apply w-full max-w-180 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2;
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap;
}

.request-actions {
  @apply flex flex-wrap gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-user-input {
  @apply flex flex-col gap-3;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-select {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}

.live-overlay-inline {
  @apply w-full max-w-180 px-3 py-2 flex flex-col gap-1;
  border-left: 3px solid #d99b47;
  border-radius: 0 7px 7px 0;
  background: #f8faf9;
}

.live-activity-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px; }
.live-activity-indicator { width: 7px; height: 7px; border-radius: 50%; background: #d99b47; }

.live-overlay-label {
  @apply m-0 text-sm leading-5 font-semibold text-zinc-700;
}

.live-overlay-elapsed { color: #82663d; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 650; }

.live-overlay-details {
  display: grid;
  gap: 3px;
  margin: 5px 0 0;
  padding-left: 16px;
  color: #647583;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.4;
}

.live-overlay-reasoning {
  @apply m-0 text-sm leading-5 text-zinc-500 whitespace-pre-wrap;
}

.live-overlay-error {
  @apply m-0 text-sm leading-5 text-rose-600 whitespace-pre-wrap;
}

.message-body {
  @apply flex flex-col max-w-full;
  width: fit-content;
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
}

.message-image-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-media-list { display: grid; gap: 8px; max-width: min(560px, 100%); margin: 0 0 8px; padding: 0; list-style: none; }
.message-media-item { min-width: 0; }
.message-media-item.is-broken { opacity: .55; }

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  display: block;
  width: auto;
  max-width: min(560px, 100%);
  max-height: 420px;
  object-fit: contain;
}

.message-audio-card { display: grid; gap: 7px; max-width: min(560px, 100%); padding: 10px 12px; border: 1px solid #d8e4e8; border-radius: 9px; color: #36545d; background: #f6fafb; }
.message-audio-card strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.message-audio { width: min(520px, 100%); max-width: 100%; }
.message-resource-link { display: grid; width: min(560px, 100%); grid-template-columns: 42px minmax(0, 1fr) 18px; gap: 9px; align-items: center; padding: 9px 10px; border: 1px solid #d8e4e8; border-radius: 9px; color: #36545d; background: #f6fafb; text-decoration: none; text-align: left; }
.message-resource-link:hover { border-color: #9fc5cc; background: #edf6f7; }
.message-resource-link > span:nth-child(2) { display: grid; min-width: 0; gap: 2px; }
.message-resource-link strong, .message-resource-link small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.message-resource-link strong { font-size: 11px; }
.message-resource-link small { color: #87969d; font-size: 9px; }
.message-resource-link b { color: #81939a; font-size: 12px; }
.message-resource-icon { display: grid; width: 36px; height: 27px; place-items: center; border-radius: 5px; color: #2f7884; background: #dff0f2; font-size: 8px; font-weight: 800; }
.message-html-action { margin-bottom: 8px; }

.message-attachment-list { display: grid; gap: 6px; max-width: min(520px, 100%); margin: 7px 0 0; }
.message-attachment { display: grid; grid-template-columns: 34px minmax(0, 1fr) 16px; gap: 8px; align-items: center; padding: 8px 9px; border: 1px solid #d8e4e8; border-radius: 8px; color: #36545d; background: #f6fafb; text-decoration: none; }
.message-attachment:hover { border-color: #9fc5cc; background: #edf6f7; }
.message-attachment-icon { display: grid; width: 30px; height: 25px; place-items: center; border-radius: 5px; color: #2f7884; background: #dff0f2; font-size: 8px; font-weight: 800; }
.message-attachment > span:nth-child(2) { display: grid; min-width: 0; gap: 2px; }
.message-attachment strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.message-attachment small { overflow: hidden; color: #87969d; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.message-attachment b { color: #81939a; font-size: 12px; }

.message-card {
  @apply max-w-[min(80ch,100%)] px-0 py-0 bg-transparent border-none rounded-none;
}

.message-text {
  @apply m-0 text-sm leading-relaxed whitespace-pre-wrap text-slate-800;
}

.message-markdown {
  max-width: min(80ch, 100%);
  color: #293845;
  font-size: 15px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.message-markdown :deep(> :first-child) { margin-top: 0; }
.message-markdown :deep(> :last-child) { margin-bottom: 0; }
.message-markdown :deep(h1), .message-markdown :deep(h2), .message-markdown :deep(h3) { margin: 1.2em 0 .45em; color: #1d2c37; font-weight: 720; line-height: 1.3; }
.message-markdown :deep(h1) { font-size: 22px; }
.message-markdown :deep(h2) { font-size: 18px; }
.message-markdown :deep(h3) { font-size: 15px; }
.message-markdown :deep(p) { margin: .55em 0; }
.message-markdown :deep(ul), .message-markdown :deep(ol) { display: grid; gap: 5px; margin: .6em 0; padding-left: 1.55em; }
.message-markdown :deep(ul) { list-style-type: disc; }
.message-markdown :deep(ol) { list-style-type: decimal; }
.message-markdown :deep(ul ul) { list-style-type: circle; }
.message-markdown :deep(ul ul ul) { list-style-type: square; }
.message-markdown :deep(ol ol) { list-style-type: lower-alpha; }
.message-markdown :deep(li)::marker { color: #60838c; }
.message-markdown :deep(a) { color: #167287; text-decoration-color: #a7c8ce; text-underline-offset: 3px; }
.message-markdown :deep(blockquote) { margin: .8em 0; padding: 3px 0 3px 13px; border-left: 3px solid #7cb0b4; color: #60717d; }
.message-markdown :deep(code) { padding: 2px 5px; border: 1px solid #e0e7ea; border-radius: 5px; color: #a84e43; background: #f6f2f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; }
.message-markdown :deep(pre) { position: relative; max-width: 100%; overflow: auto; margin: .85em 0; padding: 42px 15px 15px; border: 1px solid #2b4149; border-radius: 10px; color: #e3edef; background: #17272e; box-shadow: 0 5px 14px rgba(22, 40, 47, .12); font-size: 12px; line-height: 1.6; }
.message-markdown :deep(pre code) { padding: 0; border: 0; color: inherit; background: transparent; font-size: inherit; }
.message-markdown :deep(.code-copy-button) { position: absolute; top: 7px; right: 8px; display: inline-flex; min-height: 29px; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid rgba(194, 214, 216, .22); border-radius: 7px; color: #c8d9d9; background: #293e45; font: inherit; font-size: 10px; cursor: pointer; transition: color .15s ease, background .15s ease, border-color .15s ease, transform .12s ease, box-shadow .15s ease; }
.message-markdown :deep(.code-copy-button:hover) { border-color: rgba(194, 214, 216, .45); color: #fff; background: #36535b; box-shadow: 0 3px 8px rgba(4, 17, 22, .25); }
.message-markdown :deep(.code-copy-button:active) { transform: translateY(1px) scale(.98); }
.message-markdown :deep(.code-copy-button.is-copied) { color: #d6f0df; border-color: rgba(125, 190, 148, .5); background: #274b3c; }
.message-markdown :deep(.code-copy-button svg) { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.message-markdown :deep(table) { display: block; max-width: 100%; overflow: auto; border-collapse: collapse; font-size: 12px; }
.message-markdown :deep(th), .message-markdown :deep(td) { padding: 7px 9px; border: 1px solid #dce4e8; text-align: left; }
.message-markdown :deep(th) { color: #344a53; background: #f0f5f5; }
.message-markdown :deep(hr) { margin: 1em 0; border: 0; border-top: 1px solid #e0e6e9; }

.message-inline-code {
  @apply rounded-md border border-slate-200 bg-slate-100/60 px-1.5 py-0.5 text-[0.875em] leading-[1.4] text-slate-900 font-mono;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-xl bg-[#e8f2f3] px-4 py-3 max-w-[min(680px,100%)];
  width: fit-content;
  margin-left: auto;
  align-self: flex-end;
}

.message-actions { display: flex; align-items: center; gap: 4px; margin-top: 4px; opacity: .82; transition: opacity .15s ease; }
.message-row:hover .message-actions, .message-row:focus-within .message-actions { opacity: 1; }
.message-action-button { display: inline-grid; width: 34px; height: 32px; place-items: center; padding: 7px; border: 1px solid transparent; border-radius: 8px; color: #687a82; background: transparent; transition: color .15s ease, border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .12s ease; }
.message-action-button:hover { border-color: #d5e0e2; color: #285e67; background: #f4f8f8; box-shadow: 0 2px 5px rgba(35, 67, 74, .08); }
.message-action-button:active { transform: translateY(1px) scale(.96); }
.message-action-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.message-card[data-role='assistant'] + .message-actions { align-self: flex-start; }
.message-card[data-role='user'] + .message-actions { align-self: flex-end; }

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.worked-separator {
  @apply w-full flex items-center gap-4;
}

.worked-separator-line {
  @apply h-px bg-zinc-300/80 flex-1;
}

.worked-separator-text {
  @apply m-0 text-sm leading-relaxed font-normal text-slate-800;
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-slate-300 flex items-center justify-center;
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl bg-white;
}

.icon-svg {
  @apply w-5 h-5;
}

@media (max-width: 600px) {
  .conversation-list { padding-inline: 13px; gap: 20px; }
  .message-actions { opacity: 1; }
  .message-card[data-role='user'] { max-width: min(100%, 520px); }
  .message-markdown :deep(pre) { padding-inline: 12px; font-size: 11px; }
}
</style>
