export type ChannexResource<T> = {
  id: string
  type: string
  attributes: T
  relationships?: Record<string, { data: { id: string; type: string } | { id: string; type: string }[] }>
}

export type ChannexListResponse<T> = {
  data: ChannexResource<T>[]
  meta?: { total?: number; page?: number; limit?: number }
}

export type ChannexPropertyAttrs = {
  title: string
  address?: string
  city?: string
  country?: string
  timezone?: string
  currency?: string
  state?: string
  zip_code?: string
  updated_at?: string
  property_type?: string
}

/** Body for POST /properties (Channex wraps as `{ property: … }`). */
export type ChannexCreatePropertyInput = {
  title: string
  currency: string
  country: string
  city: string
  address: string
  timezone: string
  property_type?: string
  state?: string
  zip_code?: string
  group_id: string
}

export type ChannexGroupAttrs = {
  title: string
}

export type ChannexRoomTypeAttrs = {
  title: string
  property_id: string
  occ_adults?: number
  occ_children?: number
  occ_infants?: number
  default_occupancy?: number
  count_of_rooms?: number
  updated_at?: string
}

/** Body for POST /room_types (Channex wraps as `{ room_type: … }`). */
export type ChannexCreateRoomTypeInput = {
  property_id: string
  title: string
  count_of_rooms: number
  occ_adults: number
  occ_children: number
  occ_infants: number
  default_occupancy: number
}

export type ChannexRatePlanOption = {
  occupancy: number
  is_primary: boolean
  rate: number
}

/** Body for POST /rate_plans (Channex wraps as `{ rate_plan: … }`). */
export type ChannexCreateRatePlanInput = {
  title: string
  property_id: string
  room_type_id: string
  currency: string
  options: ChannexRatePlanOption[]
  sell_mode?: string
  rate_mode?: string
}

export type ChannexRatePlanAttrs = {
  title: string
  property_id: string
  room_type_id?: string
  currency?: string
  updated_at?: string
}

export type ChannexBookingRevisionAttrs = {
  id: string
  booking_id: string
  status: 'new' | 'modified' | 'cancelled'
  arrival_date: string
  departure_date: string
  property_id: string
  room_type_id?: string
  customer?: { name?: string; surname?: string; mail?: string }
  occupancy?: { adults?: number; children?: number; infants?: number }
  currency?: string
  amount?: string
  inserted_at?: string
}

export type ChannexWebhookPayload = {
  event: string
  payload?: {
    booking_revision_id?: string
    property_id?: string
    booking_id?: string
  }
  timestamp?: string
}
