<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <App />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider, NNotificationProvider, type GlobalThemeOverrides } from 'naive-ui'
import App from '../../App.vue'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#1d7482',
    primaryColorHover: '#286f7a',
    primaryColorPressed: '#165965',
    borderRadius: '9px',
    borderRadiusSmall: '7px',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  Button: {
    borderRadiusMedium: '9px',
    heightMedium: '40px',
  },
  Input: {
    borderRadius: '9px',
    heightMedium: '44px',
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '9px',
        heightMedium: '44px',
      },
    },
  },
  Tabs: {
    tabBorderRadius: '8px',
  },
}
</script>
