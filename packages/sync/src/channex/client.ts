import type {
  ChannexBookingRevisionAttrs,
  ChannexCreatePropertyInput,
  ChannexCreateRatePlanInput,
  ChannexCreateRoomTypeInput,
  ChannexGroupAttrs,
  ChannexListResponse,
  ChannexPropertyAttrs,
  ChannexRatePlanAttrs,
  ChannexResource,
  ChannexRoomTypeAttrs,
} from './types'

export type ChannexClientOptions = {
  apiKey: string
  baseUrl?: string
  fetchFn?: typeof fetch
}

export class ChannexApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'ChannexApiError'
  }
}

export function channexBaseUrl(): string {
  return process.env.CHANNEX_API_BASE ?? 'https://staging.channex.io/api/v1'
}

/** Strip trailing `/api/v1` so iframe auth URLs hit the Channex app host. */
export function channexAppBaseUrl(apiBase = channexBaseUrl()): string {
  return apiBase.replace(/\/$/, '').replace(/\/api\/v1$/i, '')
}

export type ChannexOneTimeTokenInput = {
  propertyId: string
  groupId?: string
  username: string
}

export function createChannexClient(opts: ChannexClientOptions) {
  const base = (opts.baseUrl ?? channexBaseUrl()).replace(/\/$/, '')
  const fetchFn = opts.fetchFn ?? fetch

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchFn(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'user-api-key': opts.apiKey,
        ...init?.headers,
      },
    })
    const text = await res.text()
    if (!res.ok) {
      throw new ChannexApiError(`Channex ${res.status}`, res.status, text)
    }
    return text ? (JSON.parse(text) as T) : ({} as T)
  }

  return {
    listProperties(page = 1, opts?: { ids?: readonly string[] }) {
      let path = `/properties?pagination[page]=${page}&pagination[limit]=100`
      if (opts?.ids?.length) {
        path += `&filter[id]=${opts.ids.map(encodeURIComponent).join(',')}`
      }
      return request<ChannexListResponse<ChannexPropertyAttrs>>(path)
    },

    /** Channex property IDs belonging to a group (used to scope a tenant's catalog). */
    async listGroupPropertyIds(groupId: string): Promise<string[]> {
      const res = await request<{
        data?: {
          relationships?: {
            properties?: { data?: { id: string }[] }
          }
        }
      }>(`/groups/${encodeURIComponent(groupId)}`)
      return res.data?.relationships?.properties?.data?.map((p) => p.id) ?? []
    },

    createGroup(title: string) {
      return request<{ data: ChannexResource<ChannexGroupAttrs> }>('/groups', {
        method: 'POST',
        body: JSON.stringify({ group: { title } }),
      })
    },

    createProperty(input: ChannexCreatePropertyInput) {
      return request<{ data: ChannexResource<ChannexPropertyAttrs> }>('/properties', {
        method: 'POST',
        body: JSON.stringify({ property: input }),
      })
    },

    getProperty(channexId: string) {
      return request<{ data: ChannexResource<ChannexPropertyAttrs> }>(
        `/properties/${encodeURIComponent(channexId)}`,
      )
    },

    createOneTimeToken(input: ChannexOneTimeTokenInput) {
      return request<{ data: { token: string } }>('/auth/one_time_token', {
        method: 'POST',
        body: JSON.stringify({
          one_time_token: {
            property_id: input.propertyId,
            group_id: input.groupId,
            username: input.username,
          },
        }),
      })
    },

    listRoomTypes(propertyChannexId: string, page = 1) {
      const filter = encodeURIComponent(propertyChannexId)
      return request<ChannexListResponse<ChannexRoomTypeAttrs>>(
        `/room_types?filter[property_id]=${filter}&pagination[page]=${page}&pagination[limit]=100`,
      )
    },

    createRoomType(input: ChannexCreateRoomTypeInput) {
      return request<{ data: ChannexResource<ChannexRoomTypeAttrs> }>('/room_types', {
        method: 'POST',
        body: JSON.stringify({ room_type: input }),
      })
    },

    createRatePlan(input: ChannexCreateRatePlanInput) {
      return request<{ data: ChannexResource<ChannexRatePlanAttrs> }>('/rate_plans', {
        method: 'POST',
        body: JSON.stringify({
          rate_plan: {
            sell_mode: 'per_room',
            rate_mode: 'manual',
            ...input,
          },
        }),
      })
    },

    getBookingRevisionFeed() {
      return request<ChannexListResponse<ChannexBookingRevisionAttrs>>(
        '/booking_revisions/feed',
      )
    },

    getBookingRevision(revisionId: string) {
      return request<{ data: { id: string; type: string; attributes: ChannexBookingRevisionAttrs } }>(
        `/booking_revisions/${revisionId}`,
      )
    },

    ackBookingRevision(revisionId: string) {
      return request<unknown>(`/booking_revisions/${revisionId}/ack`, {
        method: 'POST',
        body: '{}',
      })
    },
  }
}

export type ChannexClient = ReturnType<typeof createChannexClient>
