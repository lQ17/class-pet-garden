<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const { api, setUser } = useAuth()
const toast = useToast()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const rememberMe = ref(false)
const loading = ref(false)

const title = computed(() => mode.value === 'login' ? '登录' : '注册')
const submitText = computed(() => loading.value ? '处理中...' : (mode.value === 'login' ? '登录' : '注册'))

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  username.value = ''
  password.value = ''
  confirmPassword.value = ''
}

async function handleSubmit() {
  if (!username.value.trim()) {
    toast.warning('请输入用户名')
    return
  }
  if (!password.value) {
    toast.warning('请输入密码')
    return
  }
  if (mode.value === 'register') {
    if (password.value.length < 6) {
      toast.warning('密码至少6位')
      return
    }
    if (password.value !== confirmPassword.value) {
      toast.warning('两次密码输入不一致')
      return
    }
  }

  loading.value = true
  try {
    const endpoint = mode.value === 'login' ? '/auth/login' : '/auth/register'
    const res = await api.post(endpoint, {
      username: username.value.trim(),
      password: password.value
    })

    setUser(res.data.user, res.data.token)

    if (rememberMe.value) {
      localStorage.setItem('rememberMe', 'true')
    } else {
      localStorage.removeItem('rememberMe')
    }

    toast.success(mode.value === 'login' ? '登录成功' : '注册成功')
    router.push('/')
  } catch (error: any) {
    toast.error(error.response?.data?.error || '操作失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-orange-400 via-pink-500 to-purple-500 flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
      <div class="bg-gradient-to-r from-orange-400 to-pink-500 px-8 py-10 text-center">
        <div class="text-6xl mb-4 animate-bounce-slow">🐾</div>
        <h1 class="text-2xl font-bold text-white">班级宠物园</h1>
        <p class="text-white/80 text-sm mt-1">积分管理系统</p>
      </div>

      <div class="p-8">
        <h2 class="text-xl font-bold text-gray-800 mb-6 text-center">{{ title }}</h2>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-orange-400 transition-colors"
              :disabled="loading"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              v-model="password"
              type="password"
              placeholder="请输入密码"
              class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-orange-400 transition-colors"
              :disabled="loading"
            />
          </div>

          <div v-if="mode === 'register'">
            <label class="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              class="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:outline-none focus:border-orange-400 transition-colors"
              :disabled="loading"
            />
          </div>

          <div class="flex items-center">
            <input
              v-model="rememberMe"
              type="checkbox"
              id="rememberMe"
              class="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
              :disabled="loading"
            />
            <label for="rememberMe" class="ml-2 text-sm text-gray-600">记住我</label>
          </div>

          <button
            type="submit"
            class="w-full bg-gradient-to-r from-orange-400 to-pink-500 text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
            :disabled="loading"
          >
            {{ submitText }}
          </button>
        </form>

        <div class="mt-6 text-center space-y-2">
          <button @click="switchMode" class="text-orange-500 hover:text-orange-600 text-sm font-medium">
            {{ mode === 'login' ? '没有账号？立即注册' : '已有账号？立即登录' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes bounce-slow {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.animate-bounce-slow {
  animation: bounce-slow 2s ease-in-out infinite;
}
</style>
