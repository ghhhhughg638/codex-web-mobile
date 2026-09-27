<template>
  <form class="thread-composer" @submit.prevent="onSubmit">
    <div class="thread-composer-shell">
      <textarea
        ref="draftInputRef"
        v-model="draft"
        class="thread-composer-input"
        rows="2"
        :placeholder="placeholderText"
        :disabled="disabled || !activeThreadId || (!isTurnInProgress && isSendingMessage)"
        @keydown="onInputKeydown"
        @paste="onPaste"
      ></textarea>

      <div v-if="isSlashMenuOpen" class="slash-menu" role="listbox" :aria-label="t('command.title')">
        <button v-for="(command, index) in commandSuggestions" :key="command.id" :class="['slash-option', { selected: index === activeCommandIndex }]" type="button" role="option" :aria-selected="index === activeCommandIndex" @mouseenter="activeCommandIndex = index" @mousedown.prevent @click="chooseSlashCommand(command)">
          <kbd>{{ command.command }}</kbd><span><strong>{{ command.label }}</strong><small>{{ command.description }}</small></span><b>↵</b>
        </button>
        <div class="slash-menu-footer"><span>↑↓ {{ t('slash.navigate') }}</span><span>↵ {{ t('slash.choose') }}</span><span>Esc {{ t('slash.close') }}</span></div>
      </div>

      <div class="thread-composer-controls">
        <button class="thread-composer-files" type="button" :aria-label="t('composer.files')" :title="t('composer.files')" :disabled="!activeThreadId" @click="emit('open-files')">{{ t('composer.files') }}</button>
        <ComposerDropdown
          class="thread-composer-control thread-model-control"
          :model-value="selectedModel"
          :options="modelOptions"
          :placeholder="t('composer.model')"
          open-direction="up"
          :disabled="!activeThreadId || isTurnInProgress"
          @update:model-value="onModelSelect"
        />

        <ComposerDropdown
          class="thread-composer-control"
          :model-value="selectedReasoningEffort"
          :options="reasoningOptions"
          :placeholder="t('composer.thinking')"
          open-direction="up"
          :disabled="!activeThreadId || isTurnInProgress"
          @update:model-value="onReasoningEffortSelect"
        />

        <button
          v-if="isTurnInProgress"
          class="thread-composer-stop"
          type="button"
          :aria-label="t('composer.stop')"
          :title="t('composer.stop')"
          :disabled="disabled || !activeThreadId || isInterruptingTurn || isSendingMessage"
          @click="onInterrupt"
        >
          <IconTablerPlayerStopFilled class="thread-composer-stop-icon" />
        </button>
        <button
          v-else
          class="thread-composer-submit"
          type="submit"
          :aria-label="t('composer.send')"
          :title="t('composer.send')"
          :disabled="!canSubmit"
        >
          <IconTablerArrowUp class="thread-composer-submit-icon" />
        </button>
      </div>
      <div v-if="isTurnInProgress" class="running-actions">
        <button class="thread-composer-guide" type="button" :disabled="!canSubmit || isSendingMessage" :title="t('composer.guideHint')" @click="onGuide">{{ t('composer.guide') }}</button>
        <button class="thread-composer-stop-send" type="button" :disabled="!canSubmit || isSendingMessage || isInterruptingTurn" :title="t('composer.stopAndSendHint')" @click="onInterruptAndSend">{{ t('composer.stopAndSend') }}</button>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useLocale } from '../../composables/useLocale'
import type { ReasoningEffort, UiModel } from '../../types/codex'
import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerPlayerStopFilled from '../icons/IconTablerPlayerStopFilled.vue'
import ComposerDropdown from './ComposerDropdown.vue'

const props = defineProps<{
  activeThreadId: string
  models: UiModel[]
  selectedModel: string
  selectedReasoningEffort: ReasoningEffort | ''
  isTurnInProgress?: boolean
  isInterruptingTurn?: boolean
  isSendingMessage?: boolean
  disabled?: boolean
  hasAttachments?: boolean
  seedText?: string
}>()

const emit = defineEmits<{
  submit: [text: string]
  interrupt: []
  'update:selected-model': [modelId: string]
  'update:selected-reasoning-effort': [effort: ReasoningEffort | '']
  'open-files': []
  'seed-consumed': []
  command: [id: string]
  steer: [text: string]
  'interrupt-and-send': [text: string]
}>()

const draft = ref('')
const draftInputRef = ref<HTMLTextAreaElement | null>(null)
const pastedContentsByPlaceholder = ref<Record<string, string>>({})
const LONG_PASTE_CHAR_THRESHOLD = 1200
const { t } = useLocale()
const activeCommandIndex = ref(0)
const slashMenuDismissed = ref(false)
const slashCommands = computed(() => [
  { id: 'plan', command: '/plan', label: t('command.plan'), description: t('slash.plan') },
  { id: 'review', command: '/review', label: '/review', description: t('slash.review') },
  { id: 'explore', command: '/explore', label: '/explore', description: t('slash.explore') },
  { id: 'skills', command: '/skills', label: t('app.skills'), description: t('slash.skills') },
  { id: 'mcp', command: '/mcp', label: 'MCP', description: t('slash.mcp') },
  { id: 'browser', command: '/browser', label: t('app.browser'), description: t('slash.browser') },
  { id: 'settings', command: '/settings', label: t('app.settings'), description: t('slash.settings') },
  { id: 'model', command: '/model', label: t('slash.model'), description: t('slash.model') },
  { id: 'status', command: '/status', label: t('command.status'), description: t('slash.status') },
  { id: 'context', command: '/context', label: t('command.context'), description: t('slash.context') },
])
const slashQuery = computed(() => draft.value.match(/(?:^|\s)\/([a-z0-9-]*)$/iu))
const commandSuggestions = computed(() => {
  const query = slashQuery.value?.[1]?.toLowerCase()
  if (query === undefined || slashMenuDismissed.value) return []
  return slashCommands.value.filter((command) => command.command.slice(1).startsWith(query)).slice(0, 8)
})
const isSlashMenuOpen = computed(() => commandSuggestions.value.length > 0)
const modelOptions = computed(() => props.models.map((model) => ({
  value: model.id,
  label: model.displayName || model.id,
  description: model.description || model.id,
})))
const reasoningOptions = computed(() => {
  const selectedModel = props.models.find((model) => model.id === props.selectedModel)
  const supported = selectedModel?.supportedReasoningEfforts || []
  const order: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
  const values = supported.length > 0 ? order.filter((effort) => supported.includes(effort)) : order
  return values.map((effort) => ({ value: effort, label: t(`effort.${effort}`) }))
})
const canSubmit = computed(() => {
  if (props.disabled) return false
  if (!props.activeThreadId) return false
  return draft.value.trim().length > 0
})

const placeholderText = computed(() =>
  props.activeThreadId ? t('composer.placeholder') : t('composer.noThread'),
)

function onSubmit(): void {
  const text = expandedDraftText()
  if (!text || !canSubmit.value) return
  if (props.isTurnInProgress) emit('steer', text)
  else emit('submit', text)
  draft.value = ''
}

function onGuide(): void {
  const text = expandedDraftText()
  if (!text || !canSubmit.value) return
  emit('steer', text)
  draft.value = ''
}

function onInterruptAndSend(): void {
  const text = expandedDraftText()
  if (!text || !canSubmit.value) return
  emit('interrupt-and-send', text)
  draft.value = ''
}

function onInterrupt(): void {
  emit('interrupt')
}

function onModelSelect(value: string): void {
  emit('update:selected-model', value)
}

function onReasoningEffortSelect(value: string): void {
  emit('update:selected-reasoning-effort', value as ReasoningEffort)
}

watch(
  () => props.activeThreadId,
  () => {
    draft.value = ''
    pastedContentsByPlaceholder.value = {}
  },
)

watch(() => props.seedText, (value) => {
  if (value) {
    pastedContentsByPlaceholder.value = {}
    if (value.length >= LONG_PASTE_CHAR_THRESHOLD) {
      const placeholder = createPastePlaceholder(value)
      pastedContentsByPlaceholder.value = { [placeholder]: value }
      draft.value = placeholder
    } else {
      draft.value = value
    }
    emit('seed-consumed')
    void nextTick(() => draftInputRef.value?.focus())
  }
})

watch(slashQuery, () => { activeCommandIndex.value = 0; slashMenuDismissed.value = false })
watch(draft, (value) => {
  const next = Object.fromEntries(Object.entries(pastedContentsByPlaceholder.value).filter(([placeholder]) => value.includes(placeholder)))
  if (Object.keys(next).length !== Object.keys(pastedContentsByPlaceholder.value).length) pastedContentsByPlaceholder.value = next
  void nextTick(resizeDraft)
})

function onPaste(event: ClipboardEvent): void {
  const pastedText = event.clipboardData?.getData('text/plain') ?? ''
  const characterCount = pastedText.length
  if (characterCount < LONG_PASTE_CHAR_THRESHOLD) return
  const field = event.currentTarget
  if (!(field instanceof HTMLTextAreaElement)) return

  event.preventDefault()
  const placeholder = createPastePlaceholder(pastedText)

  const start = field.selectionStart
  const end = field.selectionEnd
  const before = draft.value.slice(0, start)
  const after = draft.value.slice(end)
  pastedContentsByPlaceholder.value = { ...pastedContentsByPlaceholder.value, [placeholder]: pastedText }
  draft.value = `${before}${placeholder}${after}`
  void nextTick(() => {
    const cursor = before.length + placeholder.length
    field.focus()
    field.setSelectionRange(cursor, cursor)
    resizeDraft()
  })
}

function createPastePlaceholder(content: string): string {
  const prefix = `[${t('conversation.pastedContent')} ${content.length} ${t('conversation.chars')}`
  let placeholder = `${prefix}]`
  let duplicateIndex = 2
  while (placeholder in pastedContentsByPlaceholder.value) {
    placeholder = `${prefix} · ${duplicateIndex}]`
    duplicateIndex += 1
  }
  return placeholder
}

function expandedDraftText(): string {
  let text = draft.value.trim()
  for (const [placeholder, content] of Object.entries(pastedContentsByPlaceholder.value)) {
    text = text.split(placeholder).join(content)
  }
  return text
}

function resizeDraft(): void {
  const field = draftInputRef.value
  if (!field) return
  field.style.height = 'auto'
  field.style.height = `${Math.min(field.scrollHeight, 150)}px`
}

function onInputKeydown(event: KeyboardEvent): void {
  if (isSlashMenuOpen.value && event.key === 'ArrowDown') {
    event.preventDefault()
    activeCommandIndex.value = (activeCommandIndex.value + 1) % commandSuggestions.value.length
  } else if (isSlashMenuOpen.value && event.key === 'ArrowUp') {
    event.preventDefault()
    activeCommandIndex.value = (activeCommandIndex.value - 1 + commandSuggestions.value.length) % commandSuggestions.value.length
  } else if (isSlashMenuOpen.value && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    const command = commandSuggestions.value[activeCommandIndex.value]
    if (command) chooseSlashCommand(command)
  } else if (isSlashMenuOpen.value && event.key === 'Escape') {
    event.preventDefault()
    slashMenuDismissed.value = true
  } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    onSubmit()
  }
}

function chooseSlashCommand(command: { id: string; command: string }): void {
  const match = slashQuery.value
  if (command.id === 'review' || command.id === 'explore') {
    const prompt = command.id === 'review' ? t('home.promptReview') : t('home.promptExplore')
    if (match && typeof match.index === 'number') {
      const leadingSpace = /^\s/u.test(match[0]) ? ' ' : ''
      draft.value = `${draft.value.slice(0, match.index)}${leadingSpace}${prompt} `
    }
    slashMenuDismissed.value = true
    return
  }

  if (match && typeof match.index === 'number') {
    const leadingSpace = /^\s/u.test(match[0]) ? ' ' : ''
    draft.value = `${draft.value.slice(0, match.index)}${leadingSpace}`
  }
  slashMenuDismissed.value = true
  emit('command', command.id)
}
</script>

<style scoped>
@reference "tailwindcss";

.thread-composer {
  @apply w-full max-w-175 mx-auto px-6;
  max-width: 860px;
  padding-inline: clamp(12px, 2.4vw, 24px);
}

.thread-composer-shell {
  @apply relative rounded-2xl border border-zinc-300 bg-white p-3 shadow-sm;
  border-radius: 15px;
  box-shadow: 0 5px 18px rgba(28, 47, 57, .09), 0 1px 2px rgba(28, 47, 57, .05);
  transition: border-color .16s ease, box-shadow .16s ease;
}

.thread-composer-shell:focus-within { border-color: #98bcc0; box-shadow: 0 0 0 3px rgba(71, 138, 145, .1), 0 8px 22px rgba(28, 47, 57, .11); }

.slash-menu {
  position: absolute;
  z-index: 55;
  right: 0;
  bottom: calc(100% + 9px);
  left: 0;
  max-height: min(420px, 62dvh);
  overflow-y: auto;
  padding: 7px;
  border: 1px solid #d5e0e5;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 38px rgba(22, 42, 54, .18);
}

.slash-option {
  display: grid;
  width: 100%;
  min-height: 48px;
  grid-template-columns: 76px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 9px;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  color: #31414d;
  background: transparent;
  text-align: left;
}

.slash-option.selected, .slash-option:hover { background: #eef5f6; }
.slash-option kbd { color: #287083; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 700; }
.slash-option > span { display: grid; min-width: 0; gap: 3px; }
.slash-option strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.slash-option small { overflow: hidden; color: #768590; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.slash-option > b { color: #8b98a1; font-size: 11px; font-weight: 500; }
.slash-menu-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; padding: 8px 8px 3px; border-top: 1px solid #edf1f3; color: #82909a; font-size: 9px; }

.thread-composer-input {
  @apply w-full min-w-0 rounded-xl border-0 bg-transparent px-1 py-2 text-sm text-zinc-900 outline-none transition;
  min-height: 52px;
  max-height: 150px;
  line-height: 1.45;
  resize: none;
  overflow-y: auto;
}

.thread-composer-input:focus {
  @apply ring-0;
}

.thread-composer-input:disabled {
  @apply bg-zinc-100 text-zinc-500 cursor-not-allowed;
}

.thread-composer-controls {
  @apply mt-3 flex items-center gap-2;
  flex-wrap: wrap;
}

.running-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 7px;
  margin-top: 9px;
}

.thread-composer-guide,
.thread-composer-stop-send {
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid #cbdce1;
  border-radius: 8px;
  color: #326d79;
  background: #f0f7f8;
  font-size: 11px;
  font-weight: 700;
}

.thread-composer-guide:hover { background: #e4f1f2; }

.thread-composer-stop-send {
  border-color: #ecd0c8;
  color: #9a5548;
  background: #fff6f2;
}

.thread-composer-stop-send:hover { background: #fbedeb; }

.thread-composer-control {
  @apply shrink-0;
}

.thread-composer-files {
  @apply shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50;
  min-height: 36px;
  box-shadow: 0 2px 0 #e5eaed;
}

.thread-composer-submit {
  @apply ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500;
}

.thread-composer-submit-icon {
  @apply h-5 w-5;
}

.thread-composer-stop {
  @apply ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-zinc-900 text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500;
}

.thread-composer-stop-icon {
  @apply h-5 w-5;
}
</style>
