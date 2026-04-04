import { ref, computed } from 'vue'
import axios from 'axios'

interface User {
  id: string
  username: string
  isAdmin: boolean
}

let globalErrorHandler: ((message: string) => void) | null = null

export function setGlobalErrorHandler(handler: (message: string) => void) {
  globalErrorHandler = handler
}

const user = ref<User | null>(null)
const token = ref<string>('')

const api = axios.create({
  baseURL: '/pet-garden/api'
})

api.interceptors.request.use((config) => {
  if (token.value) {
    config.headers.Authorization = `Bearer ${token.value}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || '请求失败'

    if (globalErrorHandler) {
      globalErrorHandler(message)
    }

    if (error.response?.status === 401) {
      logout()
      window.location.href = '/pet-garden/login'
    }

    return Promise.reject(error)
  }
)

const savedUser = localStorage.getItem('user')
const savedToken = localStorage.getItem('token')
if (savedUser && savedToken) {
  try {
    user.value = JSON.parse(savedUser)
    token.value = savedToken
  } catch {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }
}

const isLoggedIn = computed(() => !!user.value)
const isAdmin = computed(() => user.value?.isAdmin ?? false)
const username = computed(() => user.value?.username || '')

function setUser(userData: User, userToken: string) {
  user.value = userData
  token.value = userToken
  localStorage.setItem('token', userToken)
  localStorage.setItem('user', JSON.stringify(userData))
}

function logout() {
  user.value = null
  token.value = ''
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('rememberMe')
}

async function fetchUserInfo() {
  if (!isLoggedIn.value) return
  try {
    const res = await api.get('/auth/me')
    user.value = res.data.user
  } catch {
    logout()
  }
}

export function useAuth() {
  return {
    user,
    token,
    isLoggedIn,
    isAdmin,
    username,
    api,
    setUser,
    logout,
    fetchUserInfo
  }
}
