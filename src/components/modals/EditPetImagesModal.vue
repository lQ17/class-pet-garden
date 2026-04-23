<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import type { PetType } from '@/data/pets'
import { usePets } from '@/composables/usePets'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  show: boolean
  pet: PetType | null
}>()

const emit = defineEmits<{
  close: []
  updated: []
}>()

const { updatePetImages } = usePets()
const toast = useToast()

const MAX_PET_IMAGE_SIZE = 8 * 1024 * 1024
const submitting = ref(false)
const stageFiles = ref<(File | null)[]>(Array.from({ length: 8 }, () => null))
const stagePreviews = ref<string[]>(Array.from({ length: 8 }, () => ''))

function revokeBlobPreviews() {
  stagePreviews.value.forEach((preview) => {
    if (preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }
  })
}

function getLevelImage(index: number) {
  const level = index + 1
  return props.pet?.levelImages?.[level] || props.pet?.image || ''
}

function resetForm() {
  revokeBlobPreviews()
  stageFiles.value = Array.from({ length: 8 }, () => null)
  stagePreviews.value = Array.from({ length: 8 }, (_, index) => getLevelImage(index))
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
  if (!props.pet) return

  const changedImages = stageFiles.value
    .map((file, index) => file ? { level: index + 1, file } : null)
    .filter((item): item is { level: number; file: File } => !!item)

  if (changedImages.length === 0) {
    toast.warning('请先选择要替换的等级图片')
    return
  }

  submitting.value = true
  try {
    await updatePetImages(props.pet.id, changedImages)
    toast.success('宠物等级图片已更新')
    emit('updated')
    resetForm()
    emit('close')
  } catch (error: any) {
    toast.error(error.response?.data?.error || '更新宠物图片失败')
  } finally {
    submitting.value = false
  }
}

watch(() => props.show, (show) => {
  if (show) {
    resetForm()
  } else {
    revokeBlobPreviews()
  }
})

watch(() => props.pet?.id, () => {
  if (props.show) {
    resetForm()
  }
})

onBeforeUnmount(() => {
  revokeBlobPreviews()
})
</script>

<template>
  <Transition name="modal">
    <div v-if="show && pet" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" @click.self="close">
      <div class="w-full max-w-6xl max-h-[92vh] overflow-auto rounded-3xl bg-white shadow-2xl">
        <div class="flex items-center justify-between gap-4 rounded-t-3xl bg-gradient-to-r from-orange-500 via-pink-500 to-rose-500 px-6 py-5 text-white">
          <div>
            <h3 class="text-2xl font-bold">修改等级图片</h3>
            <p class="mt-1 text-sm text-white/85">{{ pet.name }} · 可单独替换任意等级图片，未选择的等级会保留原图。</p>
          </div>
          <button class="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-2xl transition-colors hover:bg-white/30" @click="close">×</button>
        </div>

        <div class="space-y-6 p-6">
          <div class="flex items-center justify-between gap-4 rounded-2xl bg-orange-50 px-4 py-3">
            <div>
              <div class="font-bold text-gray-800">{{ pet.name }}</div>
              <div class="text-sm text-gray-500">{{ pet.category === 'mythical' ? '神兽' : '普通动物' }} · {{ pet.isCustom ? '老师自定义' : '系统内置' }}</div>
            </div>
            <div class="rounded-full bg-white px-4 py-2 text-sm font-medium text-orange-600 shadow-sm">
              {{ stageFiles.filter(Boolean).length }}/8 已选择替换
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
                <div class="font-semibold text-gray-700">Lv.{{ index + 1 }}</div>
                <div class="text-xs" :class="stageFiles[index] ? 'text-pink-500' : 'text-gray-400'">
                  {{ stageFiles[index] ? '将替换' : '当前图片' }}
                </div>
              </div>
              <div class="aspect-square p-4">
                <div class="relative h-full overflow-hidden rounded-2xl bg-white shadow-inner">
                  <img
                    v-if="stagePreviews[index]"
                    :src="stagePreviews[index]"
                    :alt="`${pet.name} Lv.${index + 1}`"
                    class="h-full w-full object-contain"
                  />
                  <div v-else class="flex h-full flex-col items-center justify-center text-center text-gray-400">
                    <div class="text-4xl">＋</div>
                    <div class="mt-2 text-sm">选择 Lv.{{ index + 1 }} 图片</div>
                  </div>
                  <div v-if="stageFiles[index]" class="absolute bottom-3 left-3 rounded-full bg-pink-500 px-3 py-1 text-xs font-semibold text-white shadow">
                    新图片
                  </div>
                </div>
              </div>
            </label>
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
              {{ submitting ? '保存中...' : '保存修改' }}
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
