<template>
  <n-select
    :value="modelValue"
    :options="options"
    :placeholder="placeholder"
    :disabled="disabled"
    :size="size"
    :placement="placement"
    :aria-label="ariaLabel"
    :class="className"
    :consistent-menu-width="false"
    @update:value="onUpdate"
  />
</template>

<script setup lang="ts">
import { NSelect, type SelectOption, type SelectProps } from 'naive-ui'

type AppSelectOption = SelectOption & { value: string }

withDefaults(defineProps<{
  modelValue: string
  options: AppSelectOption[]
  placeholder?: string
  disabled?: boolean
  size?: SelectProps['size']
  placement?: SelectProps['placement']
  ariaLabel?: string
  className?: string
}>(), {
  placeholder: '',
  disabled: false,
  size: 'medium',
  placement: 'bottom-start',
  ariaLabel: undefined,
  className: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onUpdate(value: string | null): void {
  if (value !== null) emit('update:modelValue', value)
}
</script>
