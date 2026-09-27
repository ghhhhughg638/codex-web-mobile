import {
  fetchRpcMethodCatalog,
  fetchRpcNotificationCatalog,
  fetchPendingServerRequests,
  rpcCall,
  respondServerRequest,
  subscribeRpcNotifications,
  type RpcNotification,
} from './codexRpcClient'
import type {
  ConfigReadResponse,
  ModelListResponse,
  ReasoningEffort,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeResponse,
  TurnStartResponse,
} from './appServerDtos'
import { normalizeCodexApiError } from './codexErrors'
import { normalizeThreadGroupsV2, normalizeThreadMessagesV2 } from './normalizers/v2'
import type { UiFileAttachment, UiMessage, UiModel, UiProjectGroup } from '../types/codex'

type CurrentModelConfig = {
  model: string
  reasoningEffort: ReasoningEffort | ''
}

async function callRpc<T>(method: string, params?: unknown): Promise<T> {
  try {
    return await rpcCall<T>(method, params)
  } catch (error) {
    throw normalizeCodexApiError(error, `RPC ${method} failed`, method)
  }
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | '' {
  const allowed: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
  return typeof value === 'string' && allowed.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : ''
}

async function getThreadGroupsV2(): Promise<UiProjectGroup[]> {
  const payload = await callRpc<ThreadListResponse>('thread/list', {
    archived: false,
    limit: 100,
    sortKey: 'updated_at',
  })
  return normalizeThreadGroupsV2(payload)
}

async function getThreadMessagesV2(threadId: string): Promise<UiMessage[]> {
  const payload = await callRpc<ThreadReadResponse>('thread/read', {
    threadId,
    includeTurns: true,
  })
  return normalizeThreadMessagesV2(payload)
}

export async function getThreadGroups(): Promise<UiProjectGroup[]> {
  try {
    return await getThreadGroupsV2()
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to load thread groups', 'thread/list')
  }
}

export async function getThreadMessages(threadId: string): Promise<UiMessage[]> {
  try {
    return await getThreadMessagesV2(threadId)
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to load thread ${threadId}`, 'thread/read')
  }
}

export async function getMethodCatalog(): Promise<string[]> {
  return fetchRpcMethodCatalog()
}

export async function getNotificationCatalog(): Promise<string[]> {
  return fetchRpcNotificationCatalog()
}

export function subscribeCodexNotifications(onNotification: (value: RpcNotification) => void): () => void {
  return subscribeRpcNotifications(onNotification)
}

export type { RpcNotification }

export async function replyToServerRequest(
  id: number,
  payload: { result?: unknown; error?: { code?: number; message: string } },
): Promise<void> {
  await respondServerRequest({
    id,
    ...payload,
  })
}

export async function getPendingServerRequests(): Promise<unknown[]> {
  return fetchPendingServerRequests()
}

export type ResumedThreadState = {
  turnId: string
  inProgress: boolean
}

export async function resumeThread(threadId: string): Promise<ResumedThreadState> {
  const payload = await callRpc<ThreadResumeResponse>('thread/resume', { threadId })
  const activeTurn = [...payload.thread.turns].reverse().find((turn) => turn.status === 'inProgress')
  return {
    turnId: activeTurn?.id || '',
    inProgress: Boolean(activeTurn),
  }
}

export async function archiveThread(threadId: string): Promise<void> {
  await callRpc('thread/archive', { threadId })
}

export async function setThreadName(threadId: string, name: string): Promise<void> {
  await callRpc('thread/name/set', { threadId, name })
}

function normalizeThreadIdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>

  const thread = record.thread
  if (thread && typeof thread === 'object') {
    const threadId = (thread as Record<string, unknown>).id
    if (typeof threadId === 'string' && threadId.length > 0) {
      return threadId
    }
  }
  return ''
}

export async function startThread(cwd?: string, model?: string, developerInstructions?: string): Promise<string> {
  try {
    const params: Record<string, unknown> = {}
    if (typeof cwd === 'string' && cwd.trim().length > 0) {
      params.cwd = cwd.trim()
    }
    if (typeof model === 'string' && model.trim().length > 0) {
      params.model = model.trim()
    }
    if (typeof developerInstructions === 'string' && developerInstructions.trim().length > 0) {
      params.developerInstructions = developerInstructions.trim()
    }
    const payload = await callRpc<{ thread?: { id?: string } }>('thread/start', params)
    const threadId = normalizeThreadIdFromPayload(payload)
    if (!threadId) {
      throw new Error('thread/start did not return a thread id')
    }
    return threadId
  } catch (error) {
    throw normalizeCodexApiError(error, 'Failed to start a new thread', 'thread/start')
  }
}

export async function startThreadTurn(
  threadId: string,
  text: string,
  model?: string,
  effort?: ReasoningEffort,
  attachments: UiFileAttachment[] = [],
): Promise<string> {
  try {
    const params: Record<string, unknown> = {
      threadId,
      input: [{ type: 'text', text }, ...attachments.map((attachment) => attachment.type === 'localImage'
        ? { type: attachment.type, path: attachment.path }
        : { type: attachment.type, path: attachment.path, name: attachment.name })],
    }
    if (typeof model === 'string' && model.length > 0) {
      params.model = model
    }
    if (typeof effort === 'string' && effort.length > 0) {
      params.effort = effort
    }
    const payload = await callRpc<TurnStartResponse>('turn/start', params)
    return payload.turn?.id || ''
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to start turn for thread ${threadId}`, 'turn/start')
  }
}

export async function steerThreadTurn(
  threadId: string,
  turnId: string,
  text: string,
  attachments: UiFileAttachment[] = [],
): Promise<void> {
  try {
    await callRpc('turn/steer', {
      threadId,
      expectedTurnId: turnId,
      input: [{ type: 'text', text }, ...attachments.map((attachment) => attachment.type === 'localImage'
        ? { type: attachment.type, path: attachment.path }
        : { type: attachment.type, path: attachment.path, name: attachment.name })],
    })
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to guide active turn for thread ${threadId}`, 'turn/steer')
  }
}

export async function interruptThreadTurn(threadId: string, turnId?: string): Promise<void> {
  const normalizedThreadId = threadId.trim()
  const normalizedTurnId = turnId?.trim() || ''
  if (!normalizedThreadId) return

  try {
    if (!normalizedTurnId) {
      throw new Error('turn/interrupt requires turnId')
    }
    await callRpc('turn/interrupt', { threadId: normalizedThreadId, turnId: normalizedTurnId })
  } catch (error) {
    throw normalizeCodexApiError(error, `Failed to interrupt turn for thread ${normalizedThreadId}`, 'turn/interrupt')
  }
}

export async function setDefaultModel(model: string): Promise<void> {
  await callRpc('setDefaultModel', { model })
}

export async function getAvailableModelIds(): Promise<string[]> {
  return (await getAvailableModels()).map((model) => model.id)
}

export async function getAvailableModels(): Promise<UiModel[]> {
  const payload = await callRpc<ModelListResponse>('model/list', {})
  const allowedEfforts: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
  const models: UiModel[] = []

  for (const row of payload.data) {
    const id = (row.id || row.model || '').trim()
    if (!id || row.hidden || models.some((model) => model.id === id)) continue

    const supportedReasoningEfforts = row.supportedReasoningEfforts
      .map((option) => option.reasoningEffort)
      .filter((effort): effort is ReasoningEffort => allowedEfforts.includes(effort))

    models.push({
      id,
      displayName: row.displayName?.trim() || id,
      description: row.description?.trim() || '',
      hidden: Boolean(row.hidden),
      supportedReasoningEfforts,
      defaultReasoningEffort: allowedEfforts.includes(row.defaultReasoningEffort)
        ? row.defaultReasoningEffort
        : '',
      inputModalities: Array.isArray(row.inputModalities) ? row.inputModalities : [],
      isDefault: row.isDefault === true,
    })
  }

  return models
}

export async function getCurrentModelConfig(): Promise<CurrentModelConfig> {
  const payload = await callRpc<ConfigReadResponse>('config/read', {})
  const model = payload.config.model ?? ''
  const reasoningEffort = normalizeReasoningEffort(payload.config.model_reasoning_effort)
  return { model, reasoningEffort }
}

// `thread/loaded/list` returns sessions loaded in memory, not currently running turns.
