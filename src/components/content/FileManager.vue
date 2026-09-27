<template>
  <section class="management-stage file-manager-stage">
    <div class="page-heading"><div class="eyebrow">{{ t('files.eyebrow') }}</div><h1>{{ t('files.managerTitle') }}</h1><p>{{ t('files.managerSubtitle') }}</p></div>
    <div class="file-manager-toolbar">
      <input v-model="currentPath" class="field-control" :placeholder="t('files.path')" @keydown.enter="loadDirectory" />
      <button class="secondary-button" type="button" @click="loadDirectory">{{ t('files.open') }}</button>
      <button class="primary-button" type="button" @click="createFolder">{{ t('files.newFolder') }}</button>
      <button class="primary-button" type="button" @click="uploadInput?.click()">{{ t('files.upload') }}</button>
      <input ref="uploadInput" type="file" multiple hidden @change="uploadFiles" />
    </div>
    <div class="file-manager-path">{{ currentPath || t('files.home') }}</div>
    <div class="file-manager-layout">
      <section class="file-manager-list">
        <button v-if="parentPath" class="file-manager-entry" type="button" @click="openDirectory(parentPath)">..</button>
        <button v-for="entry in entries" :key="entry.path" class="file-manager-entry" type="button" @click="entry.type === 'directory' ? openDirectory(entry.path) : openFile(entry)">
          <span>{{ entry.type === 'directory' ? 'DIR' : 'FILE' }}</span><strong>{{ entry.name }}</strong><small>{{ entry.type === 'file' ? formatBytes(entry.size) : '' }}</small>
          <b v-if="entry.type === 'file' || entry.type === 'directory'" title="Rename" @click.stop="renameEntry(entry)">✎</b><b title="Delete" @click.stop="deleteEntry(entry)">×</b>
        </button>
        <p v-if="error" class="error-banner">{{ error }}</p>
        <p v-if="!loading && entries.length === 0 && !error" class="empty-panel">{{ t('files.empty') }}</p>
      </section>
      <section class="file-manager-editor">
        <div class="editor-toolbar"><span class="muted-text">{{ editingPath || t('files.noFileSelected') }}</span><div><button class="secondary-button" type="button" :disabled="!editingPath || saving" @click="saveFile">{{ saving ? t('settings.saving') : t('settings.save') }}</button><button class="secondary-button" type="button" :disabled="!editingPath" @click="closeFile">×</button></div></div>
        <n-input v-model:value="content" class="file-manager-textarea" type="textarea" :autosize="{ minRows: 20 }" :disabled="!editingPath" spellcheck="false" />
      </section>
    </div>
    <n-modal v-model:show="modal.show" preset="card" :title="modal.title" :style="{ width: 'min(420px, calc(100vw - 32px))' }">
      <p class="prompt-description">{{ modal.message }}</p>
      <n-input v-if="modal.kind !== 'delete'" v-model:value="modal.value" autofocus />
      <div class="prompt-actions"><button class="secondary-button" type="button" @click="modal.show = false">{{ t('common.cancel') }}</button><button class="primary-button" type="button" :disabled="modal.kind !== 'delete' && !modal.value.trim()" @click="submitModal">{{ t('common.confirm') }}</button></div>
    </n-modal>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { NInput, NModal, useMessage } from 'naive-ui'
import { useLocale } from '../../composables/useLocale'

type Entry = { name: string; path: string; type: 'file' | 'directory'; size: number }
const { t } = useLocale()
const message = useMessage()
const currentPath = ref('')
const parentPath = ref('')
const entries = ref<Entry[]>([])
const editingPath = ref('')
const content = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const modal = reactive<{ show: boolean; kind: 'rename' | 'folder' | 'delete'; title: string; message: string; value: string; entry: Entry | null }>({ show: false, kind: 'rename', title: '', message: '', value: '', entry: null })

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`)
  return payload as T
}

async function loadDirectory(): Promise<void> {
  loading.value = true; error.value = ''
  try {
    const result = await api<{ path: string; parent: string; entries: Entry[] }>(`/api/files/list?path=${encodeURIComponent(currentPath.value)}`)
    currentPath.value = result.path; parentPath.value = result.parent === result.path ? '' : result.parent; entries.value = result.entries
  } catch (unknownError) { error.value = unknownError instanceof Error ? unknownError.message : t('files.loadFailed') } finally { loading.value = false }
}

function openDirectory(path: string): void { currentPath.value = path; closeFile(); void loadDirectory() }

async function openFile(entry: Entry): Promise<void> {
  try { const result = await api<{ content: string }>('/api/files/read?path=' + encodeURIComponent(entry.path)); editingPath.value = entry.path; content.value = result.content; error.value = '' }
  catch (unknownError) { error.value = unknownError instanceof Error ? unknownError.message : t('files.readFailed') }
}

function closeFile(): void { editingPath.value = ''; content.value = '' }

async function saveFile(): Promise<void> {
  if (!editingPath.value) return
  saving.value = true
  try { await api('/api/files/write', { method: 'PUT', body: JSON.stringify({ path: editingPath.value, content: content.value }) }); message.success(t('files.saved')); await loadDirectory() }
  catch (unknownError) { error.value = unknownError instanceof Error ? unknownError.message : t('files.saveFailed') }
  finally { saving.value = false }
}

function renameEntry(entry: Entry): void {
  modal.kind = 'rename'; modal.title = t('files.rename'); modal.message = entry.name; modal.value = entry.name; modal.entry = entry; modal.show = true
}

function deleteEntry(entry: Entry): void { modal.kind = 'delete'; modal.title = t('files.delete'); modal.message = `${t('files.delete')} ${entry.name}?`; modal.value = ''; modal.entry = entry; modal.show = true }

function createFolder(): void { modal.kind = 'folder'; modal.title = t('files.newFolder'); modal.message = t('files.folderName'); modal.value = ''; modal.entry = null; modal.show = true }

async function submitModal(): Promise<void> {
  try {
    if (modal.kind === 'folder') await api('/api/files/mkdir', { method: 'POST', body: JSON.stringify({ directory: currentPath.value, name: modal.value.trim() }) })
    else if (modal.kind === 'rename' && modal.entry) { const result = await api<{ path: string }>('/api/files/rename', { method: 'POST', body: JSON.stringify({ path: modal.entry.path, name: modal.value.trim() }) }); if (editingPath.value === modal.entry.path) editingPath.value = result.path }
    else if (modal.kind === 'delete' && modal.entry) { await api('/api/files/path?path=' + encodeURIComponent(modal.entry.path), { method: 'DELETE' }); if (editingPath.value === modal.entry.path) closeFile() }
    modal.show = false
    await loadDirectory()
  } catch (unknownError) { error.value = unknownError instanceof Error ? unknownError.message : t('files.operationFailed') }
}

async function uploadFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  try { for (const file of Array.from(input.files || [])) { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); await api('/api/files/upload', { method: 'POST', body: JSON.stringify({ directory: currentPath.value, name: file.name, contentBase64: btoa(binary) }) }); } await loadDirectory() }
  catch (unknownError) { error.value = unknownError instanceof Error ? unknownError.message : t('files.uploadFailed') }
  finally { input.value = '' }
}

function formatBytes(value: number): string { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
onMounted(() => { void loadDirectory() })
</script>
