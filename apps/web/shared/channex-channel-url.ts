/** Pure URL builder for the Channex headless channels iframe (no network). */
export function buildChannelIframeUrl(opts: {
  appBase: string
  token: string
  propertyId: string
  groupId: string
  channels: readonly string[]
}): string {
  const params = new URLSearchParams({
    oauth_session_key: opts.token,
    app_mode: 'headless',
    redirect_to: '/channels',
    property_id: opts.propertyId,
    group_id: opts.groupId,
    channels: opts.channels.join(','),
  })
  return `${opts.appBase.replace(/\/$/, '')}/auth/exchange?${params.toString()}`
}
