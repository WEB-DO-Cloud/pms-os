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
  /** manual | derived | auto | cascade */
  rate_mode?: string
  parent_rate_plan_id?: string | null
  auto_rate_settings?: unknown
  options?: Array<{
    occupancy: number
    is_primary?: boolean
    rate?: number
    derived_option?: { rate: [string, string][] } | null
  }>
}

/** GET /availability — data is a plain map: room type ID → date → count. */
export type ChannexAvailabilityResponse = {
  data: Record<string, Record<string, number>>
}

/** One row in POST /availability `{ values: [...] }`. */
export type ChannexAvailabilityValue = {
  property_id: string
  room_type_id: string
  date?: string
  date_from?: string
  date_to?: string
  availability: number
}

/** POST /availability — HTTP 200 may still carry meta.warnings (AE4). */
export type ChannexAvailabilityUpdateResponse = {
  data?: Array<{ id?: string; type?: string } | string>
  meta?: {
    message?: string
    task_id?: string
    warnings?: unknown[]
  }
}

export type ChannexRestrictionValues = {
  /** Decimal string ("200.00") on read; integers are cents. */
  rate?: string | number | null
  min_stay_arrival?: number | null
  min_stay_through?: number | null
  max_stay?: number | null
  closed_to_arrival?: boolean | null
  closed_to_departure?: boolean | null
  stop_sell?: boolean | null
}

/** GET /restrictions — data is a plain map: rate plan ID → date → values. */
export type ChannexRestrictionsResponse = {
  data: Record<string, Record<string, ChannexRestrictionValues>>
}

/** One row in POST /restrictions `{ values: [...] }`. Rate as integer minor units. */
export type ChannexRestrictionUpdateValue = {
  property_id: string
  rate_plan_id: string
  date?: string
  date_from?: string
  date_to?: string
  rate?: number | string
  min_stay_arrival?: number
  min_stay_through?: number
  max_stay?: number
  closed_to_arrival?: boolean
  closed_to_departure?: boolean
  stop_sell?: boolean
}

/** POST /restrictions — HTTP 200 may still carry meta.warnings (AE4). */
export type ChannexRestrictionsUpdateResponse = {
  data?: Array<{ id?: string; type?: string } | string>
  meta?: {
    message?: string
    task_id?: string
    warnings?: unknown[]
  }
}

/** Documented derived_option.rate rule: [op, argument]. */
export type ChannexDerivedRateRule = [string, string]

export type ChannexRatePlanUpdateBody = {
  title?: string
  options?: Array<{
    occupancy: number
    is_primary?: boolean
    rate?: number
    derived_option?: { rate: ChannexDerivedRateRule[] } | null
  }>
  rate_mode?: string
  parent_rate_plan_id?: string | null
  [key: string]: unknown
}

export type ChannexBookingRevisionAttrs = {
  id: string
  booking_id: string
  status: 'new' | 'modified' | 'cancelled'
  arrival_date: string
  departure_date: string
  property_id: string
  room_type_id?: string
  /** Present on Offline / Booking CRS revisions for reconciliation. */
  ota_reservation_code?: string
  ota_name?: string
  customer?: { name?: string; surname?: string; mail?: string }
  occupancy?: { adults?: number; children?: number; infants?: number }
  currency?: string
  amount?: string
  inserted_at?: string
}

/** Body for POST /bookings (Booking CRS; wrapped as `{ booking: … }`). */
export type ChannexCreateBookingInput = {
  property_id: string
  ota_reservation_code: string
  ota_name: 'Offline'
  arrival_date: string
  departure_date: string
  currency?: string
  customer: { name: string; surname: string; mail?: string }
  rooms: Array<{
    room_type_id: string
    rate_plan_id: string
    /** Nightly prices: date → decimal string ("100.00"). */
    days: Record<string, string>
    guests: Array<{ name: string; surname: string }>
    occupancy: {
      adults: number
      children: number
      infants: number
    }
  }>
}

export type ChannexCreateBookingAttrs = {
  id: string
  status: string
  booking_id: string
  unique_id?: string
  revision_id?: string
}

export type ChannexMessageAttrs = {
  message: string | null
  sender: 'guest' | 'property' | 'system'
  attachments?: unknown[]
  inserted_at?: string
  updated_at?: string
}

export type ChannexMessageThreadAttrs = {
  title?: string
  is_closed?: boolean
  provider?: string
  message_count?: number
  last_message_received_at?: string
  inserted_at?: string
  updated_at?: string
}

export type ChannexWebhookPayload = {
  event: string
  payload?: {
    booking_revision_id?: string
    property_id?: string
    booking_id?: string
    /** `message` event fields. */
    id?: string
    message?: string
    sender?: string
    message_thread_id?: string
  }
  property_id?: string
  timestamp?: string
}
