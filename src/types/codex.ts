export type RpcEnvelope<T> = {
  result: T
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type UiModel = {
  id: string
  displayName: string
  description: string
  hidden: boolean
  supportedReasoningEfforts: ReasoningEffort[]
  defaultReasoningEffort: ReasoningEffort | ''
  inputModalities: string[]
  isDefault: boolean
}

export type RpcMethodCatalog = {
  data: string[]
}

export type ThreadListResult = {
  data: ThreadSummary[]
  nextCursor?: string | null
}

export type ThreadSummary = {
  id: string
  preview: string
  title?: string
  name?: string
  cwd: string
  updatedAt: number
  createdAt: number
  source?: unknown
}

export type ThreadReadResult = {
  thread: ThreadDetail
}

export type ThreadDetail = {
  id: string
  cwd: string
  preview: string
  turns: ThreadTurn[]
  updatedAt: number
  createdAt: number
}

export type ThreadTurn = {
  id: string
  status: string
  items: ThreadItem[]
}

export type ThreadItem = {
  id: string
  type: string
  text?: string
  content?: unknown
  summary?: string[]
}

export type UserInput = {
  type: string
  text?: string
  path?: string
  name?: string
  url?: string
}

export type UiThread = {
  id: string
  title: string
  projectName: string
  cwd: string
  createdAtIso: string
  updatedAtIso: string
  preview: string
  unread: boolean
  inProgress: boolean
  turnStatus: 'idle' | 'working' | 'waiting' | 'completed' | 'failed'
}

export type UiMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  images?: string[]
  media?: UiMediaResource[]
  attachments?: UiFileAttachment[]
  messageType?: string
  rawPayload?: string
  isUnhandled?: boolean
}

export type UiMediaResource = {
  kind: 'image' | 'audio' | 'html' | 'file'
  url: string
  label: string
  path?: string
}

export type UiServerRequest = {
  id: number
  method: string
  threadId: string
  turnId: string
  itemId: string
  receivedAtIso: string
  params: unknown
}

export type UiServerRequestReply = {
  id: number
  result?: unknown
  error?: {
    code?: number
    message: string
  }
}

export type UiLiveOverlay = {
  activityLabel: string
  activityDetails: string[]
  reasoningText: string
  errorText: string
  elapsedLabel: string
}

export type UiActivityEvent = {
  id: string
  kind: 'thinking' | 'command' | 'file' | 'changes' | 'question' | 'response' | 'plan' | 'turn'
  labelKey: string
  detail: string
  status: 'running' | 'completed' | 'waiting' | 'failed'
  atIso: string
}

export type UiFileAttachment = {
  type: 'mention' | 'localImage'
  path: string
  name: string
}

export type UiProjectGroup = {
  projectName: string
  threads: UiThread[]
}

export type ThreadScrollState = {
  scrollTop: number
  isAtBottom: boolean
  scrollRatio?: number
}

export type ChatMessage = {
  id: string
  role: string
  text: string
  createdAt: string | null
}

export type ChatThread = {
  id: string
  title: string
  projectName: string
  updatedAt: string | null
  messages: ChatMessage[]
}
