import { computed, ref, type Ref } from 'vue'
import type { RpcNotification } from '../api/codexRpcClient'

export type LocalPlanStep = {
  step: string
  status: 'pending' | 'inProgress' | 'completed'
}

export type LocalThreadTelemetry = {
  threadId: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  cachedInputTokens: number
  currentContextTokens: number
  contextWindow: number
  currentTurnTotalTokens: number
  currentTurnInputTokens: number
  currentTurnOutputTokens: number
  currentTurnReasoningOutputTokens: number
  currentTurnStartedAt: number | null
  lastTurnTotalTokens: number
  lastTurnInputTokens: number
  lastTurnOutputTokens: number
  lastTurnReasoningOutputTokens: number
  lastTurnWorkingMs: number
  lastTurnOutputTokensPerSecond: number
  workingMs: number
  turns: number
  status: 'idle' | 'working' | 'waiting' | 'completed' | 'failed'
  plan: LocalPlanStep[]
  diff: string
  updatedAt: string
  activeSince: number | null
  lastEventAt: number | null
}

const STORAGE_KEY = 'codex-web-mobile.local-telemetry.v1'
const ACTIVE_EVENT_GRACE_MS = 3000
const telemetryByThreadId = ref<Record<string, LocalThreadTelemetry>>(loadTelemetry())
const clock = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

function loadTelemetry(): Record<string, LocalThreadTelemetry> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, LocalThreadTelemetry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persist(): void {
  if (typeof window === 'undefined') return
  const saved: Record<string, LocalThreadTelemetry> = {}
  for (const [threadId, telemetry] of Object.entries(telemetryByThreadId.value)) {
    saved[threadId] = { ...telemetry, activeSince: null, lastEventAt: null }
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
}

function recordFromNotification(notification: RpcNotification): Record<string, unknown> {
  return notification.params !== null && typeof notification.params === 'object' && !Array.isArray(notification.params)
    ? notification.params as Record<string, unknown>
    : {}
}

function readThreadId(params: Record<string, unknown>): string {
  if (typeof params.threadId === 'string') return params.threadId
  if (typeof params.thread_id === 'string') return params.thread_id
  const turn = params.turn
  if (turn && typeof turn === 'object' && typeof (turn as Record<string, unknown>).threadId === 'string') {
    return (turn as Record<string, unknown>).threadId as string
  }
  return ''
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function timestamp(notification: RpcNotification): number {
  const parsed = Date.parse(notification.atIso)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function emptyTelemetry(threadId: string): LocalThreadTelemetry {
  return {
    threadId,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    cachedInputTokens: 0,
    currentContextTokens: 0,
    contextWindow: 0,
    currentTurnTotalTokens: 0,
    currentTurnInputTokens: 0,
    currentTurnOutputTokens: 0,
    currentTurnReasoningOutputTokens: 0,
    currentTurnStartedAt: null,
    lastTurnTotalTokens: 0,
    lastTurnInputTokens: 0,
    lastTurnOutputTokens: 0,
    lastTurnReasoningOutputTokens: 0,
    lastTurnWorkingMs: 0,
    lastTurnOutputTokensPerSecond: 0,
    workingMs: 0,
    turns: 0,
    status: 'idle',
    plan: [],
    diff: '',
    updatedAt: '',
    activeSince: null,
    lastEventAt: null,
  }
}

function accrueWorkingTime(telemetry: LocalThreadTelemetry, atMs: number): void {
  if (telemetry.status !== 'working' || telemetry.lastEventAt === null) return
  telemetry.workingMs += Math.min(Math.max(0, atMs - telemetry.lastEventAt), ACTIVE_EVENT_GRACE_MS)
}

function updateTelemetry(threadId: string, update: (telemetry: LocalThreadTelemetry) => void): void {
  const previous = telemetryByThreadId.value[threadId] || emptyTelemetry(threadId)
  const next = { ...previous, plan: [...previous.plan] }
  update(next)
  telemetryByThreadId.value = { ...telemetryByThreadId.value, [threadId]: next }
}

export function useLocalTelemetry() {
  if (typeof window !== 'undefined' && clockTimer === null) {
    clockTimer = setInterval(() => { clock.value = Date.now() }, 1000)
  }

  function ingest(notification: RpcNotification): void {
    const params = recordFromNotification(notification)
    const threadId = readThreadId(params)
    if (!threadId) return
    const atMs = timestamp(notification)

    updateTelemetry(threadId, (telemetry) => {
      accrueWorkingTime(telemetry, atMs)
      telemetry.lastEventAt = atMs
      telemetry.updatedAt = notification.atIso

      if (notification.method === 'turn/started') {
        telemetry.status = 'working'
        telemetry.activeSince = atMs
        telemetry.currentTurnStartedAt = atMs
        telemetry.currentTurnTotalTokens = telemetry.totalTokens
        telemetry.currentTurnInputTokens = telemetry.inputTokens
        telemetry.currentTurnOutputTokens = telemetry.outputTokens
        telemetry.currentTurnReasoningOutputTokens = telemetry.reasoningOutputTokens
        telemetry.turns += 1
      } else if (notification.method === 'server/request') {
        telemetry.status = 'waiting'
        telemetry.activeSince = null
        telemetry.lastEventAt = null
      } else if (notification.method === 'turn/completed') {
        const turn = readRecord(params.turn)
        const reportedDurationMs = readNumber(turn.durationMs) || readNumber(params.durationMs)
        const turnWorkingMs = reportedDurationMs || (telemetry.currentTurnStartedAt ? Math.max(0, atMs - telemetry.currentTurnStartedAt) : 0)
        telemetry.lastTurnTotalTokens = Math.max(0, telemetry.totalTokens - telemetry.currentTurnTotalTokens)
        telemetry.lastTurnInputTokens = Math.max(0, telemetry.inputTokens - telemetry.currentTurnInputTokens)
        telemetry.lastTurnOutputTokens = Math.max(0, telemetry.outputTokens - telemetry.currentTurnOutputTokens)
        telemetry.lastTurnReasoningOutputTokens = Math.max(0, telemetry.reasoningOutputTokens - telemetry.currentTurnReasoningOutputTokens)
        telemetry.lastTurnWorkingMs = turnWorkingMs
        telemetry.lastTurnOutputTokensPerSecond = turnWorkingMs > 0 ? telemetry.lastTurnOutputTokens / (turnWorkingMs / 1000) : 0
        telemetry.status = readTurnStatus(params) === 'failed' ? 'failed' : 'completed'
        telemetry.activeSince = null
        telemetry.lastEventAt = null
        telemetry.currentTurnStartedAt = null
      } else if (notification.method === 'turn/plan/updated' || notification.method === 'turn/planUpdated') {
        telemetry.plan = readPlan(params)
      } else if (notification.method === 'item/plan/delta' || notification.method === 'turn/plan/delta' || notification.method === 'plan/delta') {
        telemetry.status = 'working'
      } else if (notification.method === 'turn/diff/updated') {
        telemetry.diff = typeof params.diff === 'string' ? params.diff : ''
      } else if (notification.method.startsWith('item/')) {
        if (telemetry.status !== 'waiting') telemetry.status = 'working'
        if (telemetry.activeSince === null) telemetry.activeSince = atMs
      }

      if (notification.method === 'thread/tokenUsage/updated' || notification.method === 'thread/tokenUsageUpdated') {
        const usage = readRecord(params.tokenUsage)
        const total = readRecord(usage.total)
        const last = readRecord(usage.last)
        telemetry.totalTokens = readNumber(total.totalTokens)
        telemetry.inputTokens = readNumber(total.inputTokens)
        telemetry.outputTokens = readNumber(total.outputTokens)
        telemetry.reasoningOutputTokens = readNumber(total.reasoningOutputTokens)
        telemetry.cachedInputTokens = readNumber(total.cachedInputTokens)
        telemetry.currentContextTokens = readNumber(last.totalTokens)
        telemetry.contextWindow = readNumber(usage.modelContextWindow)
      }
    })

    if (notification.method === 'turn/completed' || notification.method === 'server/request') persist()
  }

  const selected = (threadId: string | Ref<string>) => computed(() => {
    const currentThreadId = typeof threadId === 'string' ? threadId : threadId.value
    const telemetry = telemetryByThreadId.value[currentThreadId] || emptyTelemetry(currentThreadId)
    const liveMs = telemetry.status === 'working' && telemetry.lastEventAt !== null
      ? Math.min(Math.max(0, clock.value - telemetry.lastEventAt), ACTIVE_EVENT_GRACE_MS)
      : 0
    const currentTurnElapsedMs = telemetry.currentTurnStartedAt === null
      ? 0
      : Math.max(0, clock.value - telemetry.currentTurnStartedAt)
    const currentTurnTotalTokens = telemetry.currentTurnStartedAt === null
      ? 0
      : Math.max(0, telemetry.totalTokens - telemetry.currentTurnTotalTokens)
    const currentTurnInputTokens = telemetry.currentTurnStartedAt === null
      ? 0
      : Math.max(0, telemetry.inputTokens - telemetry.currentTurnInputTokens)
    const currentTurnOutputTokens = telemetry.currentTurnStartedAt === null
      ? 0
      : Math.max(0, telemetry.outputTokens - telemetry.currentTurnOutputTokens)
    const currentTurnReasoningOutputTokens = telemetry.currentTurnStartedAt === null
      ? 0
      : Math.max(0, telemetry.reasoningOutputTokens - telemetry.currentTurnReasoningOutputTokens)
    const currentTurnOutputTokensPerSecond = currentTurnElapsedMs > 0
      ? currentTurnOutputTokens / (currentTurnElapsedMs / 1000)
      : 0
    return { ...telemetry, workingMs: telemetry.workingMs + liveMs, currentTurnElapsedMs, currentTurnTotalTokens, currentTurnInputTokens, currentTurnOutputTokens, currentTurnReasoningOutputTokens, currentTurnOutputTokensPerSecond }
  })

  const totals = computed(() => {
    const rows = Object.values(telemetryByThreadId.value)
    return {
      totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
      inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
      outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
      reasoningOutputTokens: rows.reduce((sum, row) => sum + row.reasoningOutputTokens, 0),
      workingMs: rows.reduce((sum, row) => sum + row.workingMs, 0),
      turns: rows.reduce((sum, row) => sum + row.turns, 0),
      activeThreads: rows.filter((row) => row.status === 'working' || row.status === 'waiting').length,
    }
  })

  const current = computed(() => {
    const threadId = typeof window !== 'undefined' ? window.localStorage.getItem('codex-web-mobile.selected-thread-id.v1') || '' : ''
    const telemetry = telemetryByThreadId.value[threadId] || emptyTelemetry(threadId)
    const liveMs = telemetry.status === 'working' && telemetry.lastEventAt !== null
      ? Math.min(Math.max(0, clock.value - telemetry.lastEventAt), ACTIVE_EVENT_GRACE_MS)
      : 0
    return { ...telemetry, workingMs: telemetry.workingMs + liveMs }
  })

  return { telemetryByThreadId, selected, current, totals, ingest, persist }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readTurnStatus(params: Record<string, unknown>): string {
  const turn = readRecord(params.turn)
  return typeof turn.status === 'string' ? turn.status : ''
}

function readPlan(params: Record<string, unknown>): LocalPlanStep[] {
  if (!Array.isArray(params.plan)) return []
  return params.plan.flatMap((value) => {
    const row = readRecord(value)
    if (typeof row.step !== 'string') return []
    const status = row.status === 'inProgress' || row.status === 'completed' ? row.status : 'pending'
    return [{ step: row.step, status }]
  })
}
