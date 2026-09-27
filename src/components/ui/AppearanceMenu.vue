<template>
  <AppMenu
    :model-value="modelValue"
    :options="options"
    :prefix="'◐'"
    :aria-label="t('appearance.title')"
    class-name="appearance-menu"
    @update:model-value="onSelect"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '../../composables/useLocale'
import AppMenu, { type AppMenuOption } from './AppMenu.vue'

type AppearanceMode = 'codex' | 'comet' | 'midnight'

defineProps<{ modelValue: AppearanceMode }>()
const emit = defineEmits<{ 'update:modelValue': [value: AppearanceMode] }>()
const { t } = useLocale()
const options = computed<AppMenuOption[]>(() => [
  { value: 'codex', label: t('appearance.codex') },
  { value: 'comet', label: t('appearance.comet') },
  { value: 'midnight', label: t('appearance.midnight') },
])

function onSelect(key: string | number): void {
  if (key === 'codex' || key === 'comet' || key === 'midnight') emit('update:modelValue', key)
}
</script>
