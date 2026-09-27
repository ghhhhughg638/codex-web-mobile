<template>
  <aside class="activity-dock" aria-live="polite">
    <Transition name="activity-panel-pop">
      <section v-if="isOpen" id="activity-panel" class="activity-panel" :aria-label="t('activity.title')">
        <header class="activity-panel-header">
          <div class="activity-panel-heading">
            <span :class="['activity-state-mark', { 'is-running': isWorking }]" aria-hidden="true">
              <svg v-if="isWorking" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>
              <svg v-else viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
            </span>
            <span><strong>{{ t('activity.title') }}</strong><small>{{ currentLabel }}</small></span>
          </div>
          <button class="activity-close" type="button" :aria-label="t('activity.close')" @click="isOpen = false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div v-if="liveOverlay" class="activity-current">
          <div class="activity-current-heading">
            <strong>{{ liveOverlay.activityLabel }}</strong>
            <time v-if="liveOverlay.elapsedLabel">{{ liveOverlay.elapsedLabel }}</time>
          </div>
          <code v-for="(detail, index) in liveOverlay.activityDetails" :key="`${index}:${detail}`">{{ detail }}</code>
          <p v-if="liveOverlay.reasoningText" class="activity-reasoning"><span>{{ t('activity.progressSummary') }}</span>{{ liveOverlay.reasoningText.slice(-900) }}</p>
          <p v-if="liveOverlay.errorText" class="activity-error">{{ liveOverlay.errorText }}</p>
        </div>

        <ol v-if="recentEvents.length > 0" class="activity-event-list">
          <li v-for="event in recentEvents" :key="event.id" :data-status="event.status">
            <span class="activity-event-mark" :data-kind="event.kind" aria-hidden="true">
              <svg v-if="event.status === 'completed'" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
              <svg v-else-if="event.status === 'failed'" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17" /></svg>
              <svg v-else-if="event.status === 'waiting'" viewBox="0 0 24 24"><path d="M12 8v4m0 4h.01" /><circle cx="12" cy="12" r="9" /></svg>
              <svg v-else-if="event.kind === 'command'" viewBox="0 0 24 24"><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12" /></svg>
              <svg v-else-if="event.kind === 'file' || event.kind === 'changes'" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6m-6 4h6" /></svg>
              <svg v-else-if="event.kind === 'question'" viewBox="0 0 24 24"><path d="M9.5 9a2.6 2.6 0 1 1 4.6 1.7c-1.1 1.1-2.1 1.4-2.1 3.3m0 3h.01" /><circle cx="12" cy="12" r="9" /></svg>
              <svg v-else viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>
            </span>
            <div class="activity-event-copy">
              <div class="activity-event-title"><strong>{{ t(event.labelKey) }}</strong><time>{{ formatTime(event.atIso) }}</time></div>
              <code v-if="event.detail">{{ event.detail }}</code>
            </div>
          </li>
        </ol>
        <p v-else class="activity-empty">{{ t('activity.noEvents') }}</p>
      </section>
    </Transition>

    <button
      class="activity-dock-trigger"
      type="button"
      aria-controls="activity-panel"
      :aria-expanded="isOpen"
      :aria-label="isOpen ? t('activity.close') : t('activity.open')"
      @click="isOpen = !isOpen"
    >
      <span :class="['activity-trigger-mark', { 'is-running': isWorking }]" aria-hidden="true">
        <svg v-if="isWorking" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>
        <svg v-else viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
      </span>
      <span class="activity-trigger-copy"><strong>{{ currentLabel }}</strong><small v-if="liveOverlay?.activityDetails[0]">{{ liveOverlay.activityDetails[0] }}</small></span>
      <time v-if="liveOverlay?.elapsedLabel">{{ liveOverlay.elapsedLabel }}</time>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UiActivityEvent, UiLiveOverlay } from '../../types/codex'
import { useLocale } from '../../composables/useLocale'

const props = defineProps<{
  events: UiActivityEvent[]
  liveOverlay: UiLiveOverlay | null
  isWorking: boolean
}>()

const { locale, t } = useLocale()
const isOpen = ref(false)
const recentEvents = computed(() => [...props.events].sort((first, second) => first.atIso.localeCompare(second.atIso)).slice(-24).reverse())
const currentLabel = computed(() => props.liveOverlay?.errorText ? t('activity.failed') : props.liveOverlay?.activityLabel || (props.isWorking ? t('activity.thinking') : t('activity.title')))

watch(() => props.isWorking, (isWorking) => {
  if (isWorking) isOpen.value = true
}, { immediate: true })

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(locale.value === 'zh-CN' ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' })
}
</script>
