import { createApp } from 'vue'
import AppProviders from './components/ui/AppProviders.vue'
import router from './router'
import './style.css'

createApp(AppProviders).use(router).mount('#app')
