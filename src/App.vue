<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { usePets } from '@/composables/usePets'

const { isLoggedIn, fetchUserInfo } = useAuth()
const { loadCustomPets, clearPets } = usePets()

onMounted(async () => {
  if (!isLoggedIn.value) {
    clearPets()
    return
  }

  await fetchUserInfo()
  await loadCustomPets(true)
})

watch(isLoggedIn, async (loggedIn) => {
  if (!loggedIn) {
    clearPets()
    return
  }

  await loadCustomPets(true)
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <KeepAlive>
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
