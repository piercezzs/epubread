import epub from '@/views/epub.vue'
import txt from '@/views/txt.vue'
import settings from '@/views/settings.vue'

const routes = [
  {
    path: '/',
    redirect: '/epub'
  },
  {
    path: '/epub',
    name: 'Epub',
    component: epub
  },
  {
    path: '/txt',
    name: 'Txt',
    component: txt
  },
  {
    path: '/settings',
    name: 'Settings',
    component: settings
  }
]

export default routes