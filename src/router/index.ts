import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import Home from '@/pages/Home.vue'
import PetPreview from '@/pages/PetPreview.vue'
import Ranking from '@/pages/Ranking.vue'
import Settings from '@/pages/Settings.vue'
import Records from '@/pages/Records.vue'
import Students from '@/pages/Students.vue'
import Admin from '@/pages/Admin.vue'
import Posts from '@/pages/Posts.vue'
import Shop from '@/pages/Shop.vue'
import Login from '@/pages/Login.vue'

const router = createRouter({
  history: createWebHistory('/pet-garden/'),
  routes: [
    { path: '/login', name: 'login', component: Login, meta: { requiresAuth: false } },
    { path: '/', name: 'home', component: Home, meta: { requiresAuth: true } },
    { path: '/preview', name: 'preview', component: PetPreview, meta: { requiresAuth: true } },
    { path: '/ranking', name: 'ranking', component: Ranking, meta: { requiresAuth: true } },
    { path: '/settings', name: 'settings', component: Settings, meta: { requiresAuth: true } },
    { path: '/records', name: 'records', component: Records, meta: { requiresAuth: true } },
    { path: '/students', name: 'students', component: Students, meta: { requiresAuth: true } },
    { path: '/admin', name: 'admin', component: Admin, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/posts', name: 'posts', component: Posts, meta: { requiresAuth: true } },
    { path: '/shop', name: 'shop', component: Shop, meta: { requiresAuth: true } }
  ]
})

router.beforeEach((to, _from, next) => {
  const { isLoggedIn, isAdmin, isStudent } = useAuth()
  const studentAllowedPaths = new Set(['/', '/ranking', '/shop', '/preview'])

  if (to.meta.requiresAuth && !isLoggedIn.value) {
    next('/login')
  } else if (to.meta.requiresAdmin && !isAdmin.value) {
    next('/')
  } else if (isStudent.value && !studentAllowedPaths.has(to.path)) {
    next('/')
  } else if (to.path === '/login' && isLoggedIn.value) {
    next('/')
  } else {
    next()
  }
})

export default router
