<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getPetLevelImage } from '@/data/pets'
import type { PetType } from '@/data/pets'
import { useAuth } from '@/composables/useAuth'
import { usePets } from '@/composables/usePets'
import { useToast } from '@/composables/useToast'
import PetImage from '@/components/PetImage.vue'
import PageLayout from '@/components/layout/PageLayout.vue'
import CreatePetModal from '@/components/modals/CreatePetModal.vue'
import EditPetImagesModal from '@/components/modals/EditPetImagesModal.vue'

const { user, isAdmin } = useAuth()
const { pets, loadCustomPets, deleteCustomPet } = usePets()
const toast = useToast()

const categories = [
  { id: 'all', name: '全部' },
  { id: 'normal', name: '普通动物' },
  { id: 'mythical', name: '神兽' }
]

const currentCategory = ref('all')
const selectedPet = ref<string | null>(null)
const selectedLevel = ref(1)
const showCreateModal = ref(false)
const showEditImagesModal = ref(false)
const deletingPet = ref(false)

const normalPets = computed(() => pets.value.filter(p => p.category === 'normal'))
const mythicalPets = computed(() => pets.value.filter(p => p.category === 'mythical'))
const selectedPetData = computed(() => pets.value.find(p => p.id === selectedPet.value) || null)
const canManagePets = computed(() => !!user.value && (isAdmin.value || !user.value.isGuest))

onMounted(async () => {
  await loadCustomPets()
})

function getLevelColor(level: number): string {
  const colors: Record<number, string> = {
    1: 'from-gray-400 to-gray-500',
    2: 'from-gray-400 to-slate-500',
    3: 'from-blue-400 to-cyan-500',
    4: 'from-cyan-400 to-teal-500',
    5: 'from-purple-400 to-violet-500',
    6: 'from-pink-400 to-rose-500',
    7: 'from-rose-400 to-red-500',
    8: 'from-yellow-400 via-amber-400 to-orange-500'
  }
  return colors[level] || 'from-gray-400 to-gray-500'
}

function getLevelName(level: number): string {
  const names: Record<number, string> = {
    1: '初生',
    2: '成长',
    3: '优秀',
    4: '进阶',
    5: '稀有',
    6: '精英',
    7: '史诗',
    8: '传说'
  }
  return names[level] || `Lv.${level}`
}

function selectPet(petId: string) {
  selectedPet.value = petId
  selectedLevel.value = 1
}

function closeDetail() {
  selectedPet.value = null
  showEditImagesModal.value = false
}

async function handleCreated(pet: PetType) {
  await loadCustomPets(true)
  currentCategory.value = pet.category
  selectPet(pet.id)
}

async function handleImagesUpdated() {
  await loadCustomPets(true)
}

async function handleDeletePet() {
  if (!selectedPet.value || !selectedPetData.value?.isCustom || deletingPet.value) return

  const petId = selectedPet.value
  const petName = selectedPetData.value.name
  if (!window.confirm(`确定删除「${petName}」吗？`)) return

  deletingPet.value = true
  try {
    const result = await deleteCustomPet(petId)
    toast.success(result.replacedStudents > 0
      ? `已删除宠物，并将 ${result.replacedStudents} 名学生替换为橘猫`
      : '宠物已删除')
    closeDetail()
  } catch (error: any) {
    if (error.response?.status === 409 && error.response?.data?.inUse) {
      const studentCount = error.response.data.studentCount || 0
      const confirmed = window.confirm(`「${petName}」正在被 ${studentCount} 名学生使用。是否强制删除，并将这些学生的宠物替换为橘猫？`)

      if (!confirmed) return

      try {
        const result = await deleteCustomPet(petId, true)
        toast.success(`已强制删除宠物，并将 ${result.replacedStudents} 名学生替换为橘猫`)
        closeDetail()
      } catch (forceError: any) {
        toast.error(forceError.response?.data?.error || '强制删除宠物失败')
      }
      return
    }

    toast.error(error.response?.data?.error || '删除宠物失败')
  } finally {
    deletingPet.value = false
  }
}
</script>

<template>
  <PageLayout>
    <div class="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
      <div class="flex gap-3 flex-wrap">
        <button
          v-for="cat in categories"
          :key="cat.id"
          @click="currentCategory = cat.id"
          class="px-6 py-3 rounded-xl font-bold transition-all"
          :class="currentCategory === cat.id ? 'bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50 shadow-md'"
        >
          {{ cat.name }}
        </button>
      </div>

      <button
        v-if="canManagePets"
        class="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:scale-[1.02]"
        @click="showCreateModal = true"
      >
        <span class="text-lg leading-none">＋</span>
        <span>新增宠物 / 神兽</span>
      </button>
    </div>

    <section v-if="currentCategory === 'all' || currentCategory === 'normal'" class="mb-10">
      <h2 class="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
        <span class="w-8 h-8 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 flex items-center justify-center text-white text-sm">🐤</span>
        普通动物
      </h2>
      <div class="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
        <div v-for="pet in normalPets" :key="pet.id" @click="selectPet(pet.id)" class="bg-white rounded-2xl p-3 shadow-md hover:shadow-lg transition-all cursor-pointer group">
          <div class="aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-orange-100 to-pink-100 mb-2 relative">
            <PetImage :src="getPetLevelImage(pet.id, 1)" :alt="pet.name" size="full" :rounded="false" :hover-scale="true" :fixed-emoji-size="true" />
          </div>
          <div class="text-center">
            <div class="font-bold text-sm text-gray-800 group-hover:text-orange-500 transition-colors">{{ pet.name }}</div>
            <div class="text-xs text-gray-400">{{ pet.isCustom ? '自定义宠物' : '点击查看' }}</div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="currentCategory === 'all' || currentCategory === 'mythical'">
      <h2 class="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
        <span class="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center text-white text-sm">✨</span>
        神兽
      </h2>
      <div class="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
        <div v-for="pet in mythicalPets" :key="pet.id" @click="selectPet(pet.id)" class="bg-white rounded-2xl p-3 shadow-md hover:shadow-lg transition-all cursor-pointer group">
          <div class="aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 mb-2 relative">
            <PetImage :src="getPetLevelImage(pet.id, 1)" :alt="pet.name" size="full" :rounded="false" :hover-scale="true" :fixed-emoji-size="true" />
          </div>
          <div class="text-center">
            <div class="font-bold text-sm text-gray-800 group-hover:text-purple-500 transition-colors">{{ pet.name }}</div>
            <div class="text-xs text-gray-400">{{ pet.isCustom ? '自定义神兽' : '点击查看' }}</div>
          </div>
        </div>
      </div>
    </section>

    <Transition name="modal">
      <div v-if="selectedPet && selectedPetData" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="closeDetail">
        <div class="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-auto shadow-2xl">
          <div class="bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 p-6 rounded-t-3xl flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-2xl overflow-hidden bg-white/20 flex items-center justify-center">
                <PetImage :src="getPetLevelImage(selectedPet, selectedLevel)" size="md" :rounded="true" :show-loading="false" :fixed-emoji-size="true" />
              </div>
              <div class="text-white">
                <h2 class="text-2xl font-bold">{{ selectedPetData.name }}</h2>
                <p class="text-white/80">
                  {{ selectedPetData.category === 'mythical' ? '神兽' : '普通动物' }} · Lv.{{ selectedLevel }} {{ getLevelName(selectedLevel) }}
                  <span v-if="selectedPetData.isCustom" class="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">自定义</span>
                </p>
              </div>
            </div>
            <button @click="closeDetail" class="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white text-2xl transition-colors">×</button>
          </div>

          <div class="p-6">
            <div class="flex flex-col md:flex-row gap-6 mb-8">
              <div class="w-full md:w-1/2">
                <div class="aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-orange-100 via-pink-100 to-purple-100 shadow-inner relative">
                  <PetImage :src="getPetLevelImage(selectedPet, selectedLevel)" :alt="selectedPetData.name" size="full" :rounded="false" :show-loading="true" :fixed-emoji-size="true" />
                  <div class="absolute top-4 right-4 font-bold px-4 py-2 rounded-full shadow-lg text-white text-lg bg-gradient-to-r" :class="getLevelColor(selectedLevel)">Lv.{{ selectedLevel }}</div>
                </div>
              </div>

              <div class="w-full md:w-1/2 flex flex-col justify-center">
                <h3 class="text-xl font-bold text-gray-800 mb-4">等级信息</h3>
                <div class="space-y-3">
                  <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span class="text-gray-600">当前等级</span>
                    <span class="font-bold text-lg bg-gradient-to-r bg-clip-text text-transparent" :class="getLevelColor(selectedLevel)">Lv.{{ selectedLevel }} {{ getLevelName(selectedLevel) }}</span>
                  </div>
                  <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span class="text-gray-600">宠物类型</span>
                    <span class="font-bold text-gray-800">{{ selectedPetData.category === 'mythical' ? '神兽' : '普通动物' }}</span>
                  </div>
                  <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span class="text-gray-600">来源</span>
                    <span class="font-bold text-gray-800">{{ selectedPetData.isCustom ? '老师自定义' : '系统内置' }}</span>
                  </div>
                </div>

                <button
                  v-if="canManagePets"
                  class="mt-6 rounded-2xl bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-3 font-semibold text-white shadow-lg transition hover:scale-[1.02]"
                  @click="showEditImagesModal = true"
                >
                  修改等级图片
                </button>

                <button
                  v-if="canManagePets && selectedPetData.isCustom"
                  class="mt-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="deletingPet"
                  @click="handleDeletePet"
                >
                  {{ deletingPet ? '删除中...' : '删除该宠物' }}
                </button>
              </div>
            </div>

            <h3 class="text-lg font-bold text-gray-800 mb-4">选择等级预览</h3>
            <div class="grid grid-cols-4 md:grid-cols-8 gap-3">
              <button v-for="level in 8" :key="level" @click="selectedLevel = level" class="relative aspect-square rounded-2xl overflow-hidden transition-all" :class="selectedLevel === level ? 'ring-4 ring-orange-400 scale-105' : 'hover:scale-105'">
                <div class="absolute inset-0 bg-gradient-to-br" :class="getLevelColor(level)"></div>
                <PetImage :src="getPetLevelImage(selectedPet, level)" size="full" :rounded="false" :show-loading="false" :fixed-emoji-size="true" class="relative z-10" />
                <div class="absolute bottom-1 left-1 right-1 z-20">
                  <div class="bg-white/90 rounded-lg py-1 text-center">
                    <div class="text-xs font-bold text-gray-800">Lv.{{ level }}</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <CreatePetModal :show="showCreateModal" @close="showCreateModal = false" @created="handleCreated" />
    <EditPetImagesModal
      :show="showEditImagesModal"
      :pet="selectedPetData"
      @close="showEditImagesModal = false"
      @updated="handleImagesUpdated"
    />
  </PageLayout>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.9);
}
</style>
