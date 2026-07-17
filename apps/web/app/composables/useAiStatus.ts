export function useAiStatus() {
  const { currentNetworkId } = useCurrentNetwork()
  const enabled = ref(false)
  const model = ref('grok-4.5')
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    error.value = null
    try {
      const res = await $fetch<{
        enabled: boolean
        model: string
      }>('/api/ai/status', {
        query: { networkId: currentNetworkId.value },
      })
      enabled.value = res.enabled
      model.value = res.model
    } catch (err: unknown) {
      const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
      error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'AI status unavailable'
      enabled.value = false
    } finally {
      loaded.value = true
    }
  }

  onMounted(refresh)
  watch(currentNetworkId, () => {
    void refresh()
  })

  const disabledHint = computed(() =>
    loaded.value && !enabled.value
      ? 'AI is off — set XAI_API_KEY on the server to enable Grok suggestions.'
      : null,
  )

  return { enabled, model, loaded, error, disabledHint, refresh }
}
