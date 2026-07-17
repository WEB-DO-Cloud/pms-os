<script setup lang="ts">
const { data: setup } = await useFetch('/api/setup/status')
if (setup.value?.needsSetup) {
  await navigateTo('/setup', { replace: true })
} else {
  await navigateTo('/dashboard', { replace: true })
}
</script>
