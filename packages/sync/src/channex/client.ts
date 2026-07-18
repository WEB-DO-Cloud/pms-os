import type {
  ChannexAvailabilityResponse,
  ChannexAvailabilityUpdateResponse,
  ChannexAvailabilityValue,
  ChannexBookingRevisionAttrs,
  ChannexCreateBookingAttrs,
  ChannexCreateBookingInput,
  ChannexCreatePropertyInput,
  ChannexCreateRatePlanInput,
  ChannexCreateRoomTypeInput,
  ChannexGroupAttrs,
  ChannexListResponse,
  ChannexMessageAttrs,
  ChannexMessageThreadAttrs,
  ChannexPropertyAttrs,
  ChannexRatePlanAttrs,
  ChannexRatePlanUpdateBody,
  ChannexResource,
  ChannexRestrictionsResponse,
  ChannexRestrictionsUpdateResponse,
  ChannexRestrictionUpdateValue,
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

    listRatePlans(propertyChannexId: string, page = 1) {
      const filter = encodeURIComponent(propertyChannexId)
      return request<ChannexListResponse<ChannexRatePlanAttrs>>(
        `/rate_plans?filter[property_id]=${filter}&pagination[page]=${page}&pagination[limit]=100`,
      )
    },

    /** ARI read: room-type availability map for one property/date range. */
    getAvailability(propertyChannexId: string, dateFrom: string, dateTo: string) {
      const filter = encodeURIComponent(propertyChannexId)
      return request<ChannexAvailabilityResponse>(
        `/availability?filter[property_id]=${filter}&filter[date][gte]=${dateFrom}&filter[date][lte]=${dateTo}`,
      )
    },

    /**
     * ARI write: absolute room-type availability values.
     * HTTP 200 with meta.warnings is a partial outcome — callers must not treat
     * the whole batch as reconciled (AE4).
     */
    updateAvailability(values: ChannexAvailabilityValue[]) {
      return request<ChannexAvailabilityUpdateResponse>('/availability', {
        method: 'POST',
        body: JSON.stringify({ values }),
      })
    },

    /** ARI read: rate-plan restriction map for one property/date range. */
    getRestrictions(
      propertyChannexId: string,
      dateFrom: string,
      dateTo: string,
      restrictions: readonly string[],
    ) {
      const filter = encodeURIComponent(propertyChannexId)
      return request<ChannexRestrictionsResponse>(
        `/restrictions?filter[property_id]=${filter}&filter[date][gte]=${dateFrom}&filter[date][lte]=${dateTo}&filter[restrictions]=${restrictions.join(',')}`,
      )
    },

    /**
     * ARI write: absolute rate / restriction values.
     * Prefer integer minor units for `rate`. HTTP 200 + meta.warnings = partial (AE4).
     */
    updateRestrictions(values: ChannexRestrictionUpdateValue[]) {
      return request<ChannexRestrictionsUpdateResponse>('/restrictions', {
        method: 'POST',
        body: JSON.stringify({ values }),
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

    getRatePlan(ratePlanId: string) {
      return request<{ data: ChannexResource<ChannexRatePlanAttrs> }>(
        `/rate_plans/${encodeURIComponent(ratePlanId)}`,
      )
    },

    /**
     * Update a rate plan (derived_option modifiers, etc.).
     * Callers must only send documented fields — fail closed upstream for unproven modes.
     */
    updateRatePlan(ratePlanId: string, body: ChannexRatePlanUpdateBody) {
      return request<{ data: ChannexResource<ChannexRatePlanAttrs> }>(
        `/rate_plans/${encodeURIComponent(ratePlanId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ rate_plan: body }),
        },
      )
    },

    /**
     * Booking CRS beta: create an Offline booking.
     * HTTP acceptance is not confirmation — wait for a booking revision (AE3).
     */
    createBooking(input: ChannexCreateBookingInput) {
      return request<{ data: ChannexResource<ChannexCreateBookingAttrs> }>(
        '/bookings',
        {
          method: 'POST',
          body: JSON.stringify({ booking: input }),
        },
      )
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

    /** Channel chat threads (Messages app must be installed on the property). */
    listMessageThreads(page = 1) {
      return request<ChannexListResponse<ChannexMessageThreadAttrs>>(
        `/message_threads?pagination[page]=${page}&pagination[limit]=100`,
      )
    },

    listThreadMessages(threadId: string, page = 1) {
      return request<ChannexListResponse<ChannexMessageAttrs>>(
        `/message_threads/${encodeURIComponent(threadId)}/messages?pagination[page]=${page}&pagination[limit]=100`,
      )
    },

    getMessageThread(threadId: string) {
      return request<{ data: ChannexResource<ChannexMessageThreadAttrs> }>(
        `/message_threads/${encodeURIComponent(threadId)}`,
      )
    },

    sendThreadMessage(threadId: string, message: string) {
      return request<{ data: ChannexResource<ChannexMessageAttrs> }>(
        `/message_threads/${encodeURIComponent(threadId)}/messages`,
        { method: 'POST', body: JSON.stringify({ message: { message } }) },
      )
    },

    sendBookingMessage(channexBookingId: string, message: string) {
      return request<{ data: ChannexResource<ChannexMessageAttrs> }>(
        `/bookings/${encodeURIComponent(channexBookingId)}/messages`,
        { method: 'POST', body: JSON.stringify({ message: { message } }) },
      )
    },
  }
}

export type ChannexClient = ReturnType<typeof createChannexClient>
