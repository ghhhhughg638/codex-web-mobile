<template>
  <div ref="rootRef" class="composer-dropdown">
    <button
      class="composer-dropdown-trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="onToggle"
    >
      <span class="composer-dropdown-value">{{ selectedLabel }}</span>
      <IconTablerChevronDown class="composer-dropdown-chevron" />
    </button>

    <Transition name="composer-dropdown-pop">
      <div
        v-if="isOpen"
        class="composer-dropdown-menu-wrap"
        :class="{
          'composer-dropdown-menu-wrap-up': openDirection === 'up',
          'composer-dropdown-menu-wrap-down': openDirection === 'down',
        }"
      >
        <ul class="composer-dropdown-menu" role="listbox">
          <li v-for="option in options" :key="option.value">
            <button
              class="composer-dropdown-option"
              :class="{ 'is-selected': option.value === modelValue }"
              type="button"
              role="option"
              :aria-selected="option.value === modelValue"
              @click="onSelect(option.value)"
            >
              <span class="composer-dropdown-option-copy">
                <strong>{{ option.label }}</strong>
                <small v-if="option.description">{{ option.description }}</small>
              </span>
              <b v-if="option.value === modelValue" aria-hidden="true">✓</b>
            </button>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconTablerChevronDown from '../icons/IconTablerChevronDown.vue'

type DropdownOption = {
  value: string
  label: string
  description?: string
}

const props = defineProps<{
  modelValue: string
  options: DropdownOption[]
  placeholder?: string
  disabled?: boolean
  openDirection?: 'up' | 'down'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const selectedLabel = computed(() => {
  const selected = props.options.find((option) => option.value === props.modelValue)
  if (selected) return selected.label
  return props.placeholder?.trim() || ''
})

const openDirection = computed(() => props.openDirection ?? 'down')

function onToggle(): void {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function onSelect(value: string): void {
  emit('update:modelValue', value)
  isOpen.value = false
}

watch(() => props.disabled, (disabled) => {
  if (disabled) isOpen.value = false
})

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const root = rootRef.value
  if (!root) return

  const target = event.target
  if (!(target instanceof Node)) return
  if (root.contains(target)) return
  isOpen.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<style scoped>
@reference "tailwindcss";

.composer-dropdown {
  @apply relative inline-flex min-w-0;
}

.composer-dropdown-trigger {
  display: inline-flex;
  min-height: 30px;
  min-width: 0;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border: 1px solid var(--ui-line, #d8e3e5);
  border-radius: 8px;
  color: var(--ui-text-soft, #52717a);
  background: var(--ui-control, #fff);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  outline: none;
  transition: color .15s ease, background-color .15s ease, border-color .15s ease, box-shadow .15s ease;
}

.composer-dropdown-trigger:hover,
.composer-dropdown-trigger:focus-visible,
.composer-dropdown-trigger[aria-expanded='true'] { border-color: var(--ui-accent-line, #9dbdc1); color: var(--ui-accent, #286f7a); background: var(--ui-hover, #f6fbfb); outline: none; box-shadow: 0 0 0 3px var(--ui-accent-ring, rgba(67, 139, 148, .1)); }

.composer-dropdown-trigger:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.composer-dropdown-value {
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-dropdown-chevron {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: var(--ui-text-faint, #82959a);
  transition: transform .18s ease;
}

.composer-dropdown-trigger[aria-expanded='true'] .composer-dropdown-chevron { transform: rotate(180deg); }

.composer-dropdown-menu-wrap {
  position: absolute;
  z-index: 70;
  left: 0;
}

.composer-dropdown-menu-wrap-down {
  @apply top-[calc(100%+8px)];
}

.composer-dropdown-menu-wrap-up {
  @apply bottom-[calc(100%+8px)];
}

.composer-dropdown-menu {
  display: grid;
  min-width: 170px;
  max-width: min(310px, calc(100vw - 24px));
  gap: 3px;
  margin: 0;
  padding: 6px;
  border: 1px solid var(--ui-line, #d9e5e6);
  border-radius: 10px;
  background: var(--ui-surface, #fff);
  box-shadow: 0 16px 36px var(--ui-menu-shadow, rgba(29, 57, 63, .18));
  list-style: none;
}

.composer-dropdown-option {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  color: var(--ui-text, #30424f);
  background: transparent;
  text-align: left;
}

.composer-dropdown-option:hover,
.composer-dropdown-option:focus-visible,
.composer-dropdown-option.is-selected {
  color: var(--ui-accent, #1d6f8a);
  background: var(--ui-accent-soft, #edf6f7);
  outline: none;
}

.composer-dropdown-option-copy { display: grid; min-width: 0; gap: 2px; }
.composer-dropdown-option strong, .composer-dropdown-option small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-dropdown-option strong { font-size: 11px; }
.composer-dropdown-option small { color: var(--ui-text-faint, #81909d); font-size: 9px; }
.composer-dropdown-option b { flex: 0 0 auto; font-size: 12px; }

.composer-dropdown-pop-enter-active,
.composer-dropdown-pop-leave-active { transform-origin: bottom left; transition: opacity .16s ease, transform .16s ease; }
.composer-dropdown-pop-enter-from,
.composer-dropdown-pop-leave-to { opacity: 0; transform: translateY(6px) scale(.98); }

@media (prefers-reduced-motion: reduce) {
  .composer-dropdown-chevron,
  .composer-dropdown-pop-enter-active,
  .composer-dropdown-pop-leave-active { transition: none; }
}
</style>
