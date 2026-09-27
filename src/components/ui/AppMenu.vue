<template>
  <div ref="rootRef" :class="['app-menu', className]">
    <button
      class="app-menu-trigger"
      type="button"
      :aria-label="ariaLabel"
      :aria-expanded="isOpen"
      :disabled="disabled"
      @click="toggleMenu"
    >
      <span v-if="prefix" class="app-menu-prefix" aria-hidden="true">{{ prefix }}</span>
      <span class="app-menu-trigger-label">{{ selectedLabel }}</span>
      <span class="app-menu-chevron" :class="{ 'is-open': isOpen }" aria-hidden="true">⌄</span>
    </button>

    <Transition name="app-menu-pop">
      <div v-if="isOpen" class="app-menu-panel" role="listbox" :aria-label="ariaLabel" @click.stop>
        <button
          v-for="option in options"
          :key="option.value"
          class="app-menu-option"
          :class="{ 'is-selected': option.value === modelValue }"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="selectOption(option.value)"
        >
          <span class="app-menu-option-copy">
            <strong>{{ option.label }}</strong>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
          <b v-if="option.value === modelValue" aria-hidden="true">✓</b>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type AppMenuOption = {
  value: string
  label: string
  description?: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: AppMenuOption[]
  ariaLabel?: string
  prefix?: string
  className?: string
  disabled?: boolean
}>(), {
  ariaLabel: '',
  prefix: '',
  className: '',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const selectedLabel = computed(() =>
  props.options.find((option) => option.value === props.modelValue)?.label || props.modelValue,
)

function toggleMenu(): void {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function selectOption(value: string): void {
  emit('update:modelValue', value)
  isOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value || !rootRef.value) return
  const target = event.target
  if (target instanceof Node && !rootRef.value.contains(target)) isOpen.value = false
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') isOpen.value = false
}

watch(() => props.disabled, (disabled) => {
  if (disabled) isOpen.value = false
})

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<style scoped>
.app-menu {
  position: relative;
  display: inline-flex;
  min-width: 0;
}

.app-menu-trigger {
  display: inline-flex;
  min-height: 34px;
  min-width: 0;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid var(--ui-line, #d9e0e5);
  border-radius: 9px;
  color: var(--ui-text-soft, #52666e);
  background: var(--ui-control, #fff);
  box-shadow: 0 2px 0 var(--ui-shadow-line, #e8edef);
  font-size: 11px;
  font-weight: 700;
}

.app-menu-trigger:hover,
.app-menu-trigger:focus-visible {
  border-color: var(--ui-accent-line, #b8cdd1);
  color: var(--ui-accent, #225d66);
  background: var(--ui-hover, #f6fbfb);
  outline: none;
  box-shadow: 0 3px 10px var(--ui-shadow, rgba(34, 87, 95, .1));
}

.app-menu-trigger:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.app-menu-prefix {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 50%;
  color: var(--ui-accent, #297682);
  background: var(--ui-accent-soft, #e9f4f4);
  font-size: 10px;
}

.app-menu-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-menu-chevron {
  color: var(--ui-text-faint, #82959a);
  line-height: 1;
  transition: transform .18s ease;
}

.app-menu-chevron.is-open { transform: rotate(180deg); }

.app-menu-panel {
  position: absolute;
  z-index: 70;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  min-width: 180px;
  max-width: min(320px, calc(100vw - 24px));
  gap: 3px;
  padding: 6px;
  border: 1px solid var(--ui-line, #d9e5e6);
  border-radius: 11px;
  background: var(--ui-surface, #fff);
  box-shadow: 0 16px 36px var(--ui-menu-shadow, rgba(29, 57, 63, .18));
}

.app-menu-option {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  color: var(--ui-text, #30424f);
  background: transparent;
  text-align: left;
}

.app-menu-option:hover,
.app-menu-option:focus-visible,
.app-menu-option.is-selected {
  color: var(--ui-accent, #1d6f8a);
  background: var(--ui-accent-soft, #edf6f7);
  outline: none;
}

.app-menu-option-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.app-menu-option strong,
.app-menu-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-menu-option strong { font-size: 11px; }
.app-menu-option small { color: var(--ui-text-faint, #81909d); font-size: 10px; }
.app-menu-option b { flex: 0 0 auto; font-size: 12px; }

.app-menu-pop-enter-active,
.app-menu-pop-leave-active {
  transform-origin: top right;
  transition: opacity .16s ease, transform .16s ease;
}

.app-menu-pop-enter-from,
.app-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(.98);
}

@media (prefers-reduced-motion: reduce) {
  .app-menu-chevron,
  .app-menu-pop-enter-active,
  .app-menu-pop-leave-active { transition: none; }
}
</style>
