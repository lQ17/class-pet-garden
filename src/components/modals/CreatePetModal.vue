<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import type { PetType } from '@/data/pets'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  created: [pet: PetType]
}>()

const { api } = useAuth()
const toast = useToast()

const MAX_PET_IMAGE_SIZE = 8 * 1024 * 1024

const submitting = ref(false)
const form = ref({
  name: '',
  category: 'normal' as 'normal' | 'mythical'
})
const stageFiles = ref<(File | null)[]>(Array.from({ length: 8 }, () => null))
const stagePreviews = ref<string[]>(Array.from({ length: 8 }, () => ''))

function resetForm() {
  stagePreviews.value.forEach((preview) => {
    if (preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }
  })

  form.value = {
    name: '',
    category: 'normal'
  }
  stageFiles.value = Array.from({ length: 8 }, () => null)
  stagePreviews.value = Array.from({ length: 8 }, () => '')
}

function close() {
  if (submitting.value) return
  resetForm()
  emit('close')
}

function handleFileChange(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (file.size > MAX_PET_IMAGE_SIZE) {
    target.value = ''
    toast.warning('单张宠物图片不能超过 8MB，请压缩后再上传')
    return
  }

  const previousPreview = stagePreviews.value[index]
  if (previousPreview?.startsWith('blob:')) {
    URL.revokeObjectURL(previousPreview)
  }

  stageFiles.value[index] = file
  stagePreviews.value[index] = URL.createObjectURL(file)
}

async function submit() {
  if (!form.value.name.trim()) {
    toast.warning('请输入宠物名称')
    return
  }

  if (stageFiles.value.some(file => !file)) {
    toast.warning('请完整上传 8 张阶段图片')
    return
  }

  const formData = new FormData()
  formData.append('name', form.value.name.trim())
  formData.append('category', form.value.category)

  stageFiles.value.forEach((file) => {
    if (file) {
      formData.append('images', file)
    }
  })

  submitting.value = true
  try {
    const res = await api.post('/pets', formData)

    toast.success('新宠物已加入图鉴')
    emit('created', res.data.pet)
    resetForm()
    emit('close')
  } catch (error: any) {
    toast.error(error.response?.data?.error || '创建宠物失败')
  } finally {
    submitting.value = false
  }
}

watch(() => props.show, (show) => {
  if (!show) {
    resetForm()
  }
})

onBeforeUnmount(() => {
  resetForm()
})
</script>

<template>
  <Transition name="modal">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" @click.self="close">
      <div class="w-full max-w-6xl max-h-[92vh] overflow-auto rounded-3xl bg-white shadow-2xl">
        <div class="flex items-center justify-between gap-4 rounded-t-3xl bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 px-6 py-5 text-white">
          <div>
            <h3 class="text-2xl font-bold">新增图鉴宠物</h3>
            <p class="mt-1 text-sm text-white/85">同一表单内可选择普通宠物或神兽，需上传固定 8 个阶段图片。</p>
          </div>
          <button class="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-2xl transition-colors hover:bg-white/30" @click="close">×</button>
        </div>

        <div class="space-y-6 p-6">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-gray-700">名称</span>
              <input
                v-model="form.name"
                type="text"
                maxlength="30"
                placeholder="例如：星辉麒麟"
                class="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-800 outline-none transition focus:border-pink-400 focus:ring-4 focus:ring-pink-100"
              />
            </label>

            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-gray-700">类型</span>
              <select
                v-model="form.category"
                class="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-800 outline-none transition focus:border-pink-400 focus:ring-4 focus:ring-pink-100"
              >
                <option value="normal">普通宠物</option>
                <option value="mythical">神兽</option>
              </select>
            </label>
          </div>

          <div>
            <div class="mb-3 flex items-center justify-between">
              <div>
                <h4 class="text-lg font-bold text-gray-800">8 个阶段图片</h4>
                <p class="text-sm text-gray-500">按 `1-8 阶` 顺序上传，创建后会直接用于图鉴和领养列表。</p>
              </div>
              <div class="rounded-full bg-orange-50 px-4 py-2 text-sm font-medium text-orange-600">
                {{ stageFiles.filter(Boolean).length }}/8 已上传
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label
                v-for="(_, index) in stageFiles"
                :key="index"
                class="group cursor-pointer overflow-hidden rounded-3xl border border-dashed border-gray-300 bg-gradient-to-br from-white to-orange-50 transition hover:border-pink-300 hover:shadow-lg"
              >
                <input type="file" accept="image/*" class="hidden" @change="handleFileChange(index, $event)" />
                <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div class="font-semibold text-gray-700">第 {{ index + 1 }} 阶</div>
                  <div class="text-xs text-gray-400">{{ stageFiles[index] ? '已选择' : '必传' }}</div>
                </div>
                <div class="aspect-square p-4">
                  <div v-if="stagePreviews[index]" class="h-full overflow-hidden rounded-2xl bg-white shadow-inner">
                    <img :src="stagePreviews[index]" :alt="`第 ${index + 1} 阶预览`" class="h-full w-full object-contain" />
                  </div>
                  <div v-else class="flex h-full flex-col items-center justify-center rounded-2xl bg-white/80 text-center text-gray-400">
                    <div class="text-4xl">+</div>
                    <div class="mt-2 text-sm">上传第 {{ index + 1 }} 阶图片</div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              class="rounded-2xl bg-gray-100 px-5 py-3 font-medium text-gray-600 transition hover:bg-gray-200"
              :disabled="submitting"
              @click="close"
            >
              取消
            </button>
            <button
              class="rounded-2xl bg-gradient-to-r from-orange-500 to-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="submitting"
              @click="submit"
            >
              {{ submitting ? '创建中...' : '创建宠物' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.96);
}
</style>
