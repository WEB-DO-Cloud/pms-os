import { networks } from '@pms/db'
import { ChannexApiError, mapChannexRoomType } from '@pms/sync'
import { eq } from 'drizzle-orm'
import { isOtaCode, type OtaCode } from '../../shared/otas'
import { getDb } from './auth'
import { createChannelIframeSession } from './channex-channels'
import { provisionOnboardingProperty } from './channex-onboarding'
import { isCommercialEdition } from './edition'
import {
  ensureSecretsHydrated,
  getChannexClientForNetwork,
  getSyncStore,
} from './sync'

/** Minimal defaults for one-click OTA auto-provision (see plan). */
export const AUTO_OTA_DEFAULTS = {
  currency: 'USD',
  timezone: 'America/Santo_Domingo',
  country: 'DO',
  city: 'Santo Domingo',
  address: 'TBD',
  propertyType: 'apartment',
  roomTitle: 'Standard',
  roomCount: 1,
  occAdults: 2,
  occChildren: 0,
  occInfants: 0,
  defaultOccupancy: 2,
  rateTitle: 'Best Available Rate',
  rate: 0,
} as const

export type ConnectOtaResult = {
  property: {
    id: number
    channexId: string
    name: string
    slug: string
  }
  url: string
  channels: readonly string[]
  created: boolean
}

async function networkTitle(networkId: number): Promise<string> {
  const db = getDb()
  const [net] = await db
    .select({ name: networks.name })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)
  return net?.name?.trim() || 'Property 1'
}

/**
 * One-click OTA connect: reuse or auto-create property (+ room + rate), then mint iframe URL.
 */
export async function connectOtaChannel(
  networkId: number,
  channelCode: string,
): Promise<ConnectOtaResult> {
  if (!isCommercialEdition()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'OTA connect is only available on the commercial platform',
    })
  }

  const code = channelCode.trim().toUpperCase()
  if (!isOtaCode(code)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown channel code' })
  }

  const store = await ensureSecretsHydrated(networkId)
  const existing = store.listProperties(networkId)
  let property: ConnectOtaResult['property']
  let created = false

  if (existing.length > 0) {
    const first = existing[0]!
    property = {
      id: first.id,
      channexId: first.channexId,
      name: first.name,
      slug: first.slug,
    }
  } else {
    const title = await networkTitle(networkId)
    const provisioned = await provisionOnboardingProperty(networkId, {
      title,
      propertyType: AUTO_OTA_DEFAULTS.propertyType,
      currency: AUTO_OTA_DEFAULTS.currency,
      timezone: AUTO_OTA_DEFAULTS.timezone,
      address: AUTO_OTA_DEFAULTS.address,
      city: AUTO_OTA_DEFAULTS.city,
      country: AUTO_OTA_DEFAULTS.country,
    })
    property = provisioned.property
    created = true

    const client = getChannexClientForNetwork(store, networkId)
    try {
      const roomRes = await client.createRoomType({
        property_id: property.channexId,
        title: AUTO_OTA_DEFAULTS.roomTitle,
        count_of_rooms: AUTO_OTA_DEFAULTS.roomCount,
        occ_adults: AUTO_OTA_DEFAULTS.occAdults,
        occ_children: AUTO_OTA_DEFAULTS.occChildren,
        occ_infants: AUTO_OTA_DEFAULTS.occInfants,
        default_occupancy: AUTO_OTA_DEFAULTS.defaultOccupancy,
      })
      const room = roomRes.data
      const mapped = mapChannexRoomType(
        networkId,
        property.id,
        room.id,
        room.attributes,
        room,
      )
      getSyncStore(networkId).upsertRoomType(mapped)

      await client.createRatePlan({
        title: AUTO_OTA_DEFAULTS.rateTitle,
        property_id: property.channexId,
        room_type_id: room.id,
        currency: AUTO_OTA_DEFAULTS.currency,
        options: [
          {
            occupancy: AUTO_OTA_DEFAULTS.defaultOccupancy,
            is_primary: true,
            rate: AUTO_OTA_DEFAULTS.rate,
          },
        ],
      })
    } catch (err) {
      if (err instanceof ChannexApiError) {
        throw createError({
          statusCode: err.status >= 400 && err.status < 500 ? err.status : 502,
          statusMessage: 'Channex could not create room or rate plan',
          data: { code: 'CHANNEX_ROOM_RATE_FAILED', message: err.message, body: err.body },
        })
      }
      throw err
    }
  }

  const session = await createChannelIframeSession(
    networkId,
    property.id,
    code as OtaCode,
  )

  return {
    property,
    url: session.url,
    channels: session.channels,
    created,
  }
}
