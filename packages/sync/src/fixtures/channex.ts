import type {
  ChannexBookingRevisionAttrs,
  ChannexListResponse,
  ChannexPropertyAttrs,
  ChannexRoomTypeAttrs,
  ChannexResource,
} from '../channex/types'

export const FIXTURE_NETWORK_ID = 1

export function fixtureProperty(
  id: string,
  overrides: Partial<ChannexPropertyAttrs> = {},
): ChannexResource<ChannexPropertyAttrs> {
  return {
    id,
    type: 'property',
    attributes: {
      title: `Hotel ${id}`,
      address: '1 Main St',
      city: 'Santo Domingo',
      country: 'DO',
      timezone: 'America/Santo_Domingo',
      currency: 'USD',
      updated_at: '2026-07-01T00:00:00Z',
      ...overrides,
    },
  }
}

export function fixtureRoomType(
  id: string,
  propertyId: string,
  overrides: Partial<ChannexRoomTypeAttrs> = {},
): ChannexResource<ChannexRoomTypeAttrs> {
  return {
    id,
    type: 'room_type',
    attributes: {
      title: `Suite ${id}`,
      property_id: propertyId,
      occ_adults: 2,
      count_of_rooms: 1,
      updated_at: '2026-07-01T00:00:00Z',
      ...overrides,
    },
  }
}

export function fixtureRevision(
  id: string,
  overrides: Partial<ChannexBookingRevisionAttrs> = {},
): ChannexResource<ChannexBookingRevisionAttrs> {
  const bookingId = overrides.booking_id ?? `bk-${id}`
  return {
    id,
    type: 'booking_revision',
    attributes: {
      id,
      booking_id: bookingId,
      status: 'new',
      arrival_date: '2026-08-01',
      departure_date: '2026-08-05',
      property_id: 'prop-1',
      room_type_id: 'rt-1',
      customer: { name: 'Ana', surname: 'Garcia' },
      occupancy: { adults: 2, children: 0, infants: 0 },
      currency: 'USD',
      ...overrides,
    },
  }
}

export function mockChannexFetch(handlers: {
  properties?: ChannexListResponse<ChannexPropertyAttrs>
  roomTypes?: Record<string, ChannexListResponse<ChannexRoomTypeAttrs>>
  feed?: ChannexListResponse<ChannexBookingRevisionAttrs>
  revisions?: Record<string, ChannexResource<ChannexBookingRevisionAttrs>>
  ackFail?: Set<string>
  /** group id -> member Channex property ids (for /groups/:id) */
  groups?: Record<string, string[]>
}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(url)
    const path = u.pathname + u.search
    const groupMatch = u.pathname.match(/\/groups\/([^/]+)$/)
    if (groupMatch && init?.method !== 'POST') {
      const ids = handlers.groups?.[groupMatch[1]!] ?? []
      return jsonResponse({
        data: {
          id: groupMatch[1],
          type: 'group',
          relationships: { properties: { data: ids.map((id) => ({ id })) } },
        },
      })
    }
    if (u.pathname.endsWith('/groups') && init?.method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {}
      const id = `grp-${Date.now()}`
      return jsonResponse({
        data: {
          id,
          type: 'group',
          attributes: { title: body.group?.title ?? 'Group' },
          relationships: { properties: { data: [] } },
        },
      })
    }
    if (u.pathname.endsWith('/properties') && init?.method === 'POST') {
      const body = init.body ? JSON.parse(String(init.body)) : {}
      const p = body.property ?? {}
      const id = `prop-new-${Date.now()}`
      return jsonResponse({
        data: fixtureProperty(id, {
          title: p.title,
          address: p.address,
          city: p.city,
          country: p.country,
          timezone: p.timezone,
          currency: p.currency,
        }),
      }, 201)
    }
    if (path.includes('/properties')) {
      const all = handlers.properties ?? { data: [fixtureProperty('prop-1')] }
      const idFilter = u.searchParams.get('filter[id]')
      if (idFilter) {
        const allow = new Set(idFilter.split(','))
        return jsonResponse({ ...all, data: all.data.filter((p) => allow.has(p.id)) })
      }
      return jsonResponse(all)
    }
    if (path.includes('/room_types')) {
      const propId = u.searchParams.get('filter[property_id]') ?? 'prop-1'
      const data = handlers.roomTypes?.[propId] ?? {
        data: [fixtureRoomType('rt-1', propId)],
      }
      return jsonResponse(data)
    }
    if (path.includes('/booking_revisions/feed')) {
      return jsonResponse(handlers.feed ?? { data: [] })
    }
    const revMatch = path.match(/\/booking_revisions\/([^/]+)(?:\/ack)?/)
    if (revMatch) {
      const revId = revMatch[1]!
      if (path.endsWith('/ack') && init?.method === 'POST') {
        if (handlers.ackFail?.has(revId)) {
          return new Response('ack failed', { status: 502 })
        }
        return new Response('{}', { status: 200 })
      }
      const rev = handlers.revisions?.[revId] ?? fixtureRevision(revId)
      return jsonResponse({ data: rev })
    }
    return new Response('not found', { status: 404 })
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
