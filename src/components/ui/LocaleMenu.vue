<template>
  <AppMenu
    :model-value="locale"
    :options="options"
    :prefix="'文'"
    :aria-label="t('app.locale')"
    class-name="locale-menu"
    @update:model-value="onSelect"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '../../composables/useLocale'
import AppMenu, { type AppMenuOption } from './AppMenu.vue'

const { locale, setLocale, t } = useLocale()
const options = computed<AppMenuOption[]>(() => [
  { label: '中文', value: 'zh-CN' },
  { label: 'English', value: 'en' },
])

function onSelect(key: string | number): void {
  setLocale(key === 'en' ? 'en' : 'zh-CN')
}
</script>
