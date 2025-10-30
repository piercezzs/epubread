import { createApp } from 'vue'
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import routes from './router/index.js'

const isDev = import.meta.env.DEV
// 路由配置
const router = createRouter({
  history: isDev ? createWebHistory() : createWebHashHistory(),
  routes
})

// 状态管理
const pinia = createPinia()

// 创建应用
const app = createApp(App)

app.use(router)
app.use(pinia)
app.use(naive)

app.mount('#app')