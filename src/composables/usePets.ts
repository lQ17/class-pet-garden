import { computed, ref } from 'vue'
import { PET_TYPES, clearCustomPetTypes, setCustomPetTypes, setPetImageOverrides, updatePetImageOverride } from '@/data/pets'
import { useAuth } from '@/composables/useAuth'

const isLoading = ref(false)
const hasLoaded = ref(false)

export function usePets() {
  const { api, isLoggedIn } = useAuth()

  async function loadCustomPets(force = false) {
    if (!isLoggedIn.value) {
      clearCustomPetTypes()
      hasLoaded.value = false
      return []
    }

    if (hasLoaded.value && !force) {
      return PET_TYPES.value
    }

    isLoading.value = true
    try {
      const res = await api.get('/pets')
      setCustomPetTypes(res.data.pets || [])
      setPetImageOverrides(res.data.imageOverrides || {})
      hasLoaded.value = true
      return PET_TYPES.value
    } finally {
      isLoading.value = false
    }
  }

  function clearPets() {
    clearCustomPetTypes()
    hasLoaded.value = false
  }

  async function deleteCustomPet(petId: string, force = false) {
    const res = await api.delete(`/pets/${petId}`, {
      params: force ? { force: true } : undefined
    })
    await loadCustomPets(true)
    return res.data
  }

  async function updatePetImages(petId: string, images: Array<{ level: number; file: File }>) {
    const formData = new FormData()
    images.forEach(({ level, file }) => {
      formData.append('levels', String(level))
      formData.append('images', file)
    })

    const res = await api.put(`/pets/${petId}/images`, formData)
    if (res.data.levelImages) {
      updatePetImageOverride(petId, res.data.levelImages)
    }
    await loadCustomPets(true)
    return res.data
  }

  return {
    pets: computed(() => PET_TYPES.value),
    isLoading: computed(() => isLoading.value),
    hasLoaded: computed(() => hasLoaded.value),
    loadCustomPets,
    deleteCustomPet,
    updatePetImages,
    clearPets
  }
}
