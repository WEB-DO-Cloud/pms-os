import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  runCommand,
  type CommandContext,
  type DomainStore,
} from '../index'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'mgr-1',
    networkId: 1,
    role: 'manager',
    propertyIds: [10, 20],
    networkWide: false,
    ...overrides,
  })!
}

function ctx(
  p: NonNullable<ReturnType<typeof buildPrincipal>>,
  partial: Partial<CommandContext> = {},
): CommandContext {
  return {
    principal: p,
    actorKind: 'user',
    networkId: p.networkId!,
    propertyId: 10,
    ...partial,
  }
}

function enableRateWrite(store: DomainStore, derived = false) {
  store.networkCapabilities.push({
    networkId: 1,
    bookingCrsWrite: false,
    availabilityWrite: false,
    rateRestrictionWrite: true,
    derivedRateWrite: derived,
    aiApply: false,
    updatedAt: new Date().toISOString(),
  })
}

function seedSnapshot(store: DomainStore, version: number) {
  store.ariRestrictions.push({
    networkId: 1,
    propertyId: 10,
    ratePlanChannexId: 'rp-manual',
    date: '2026-08-10',
    rateMinor: 20_000,
    minStayArrival: 1,
    minStayThrough: null,
    maxStay: null,
    closedToArrival: false,
    closedToDeparture: false,
    stopSell: false,
    snapshotVersion: version,
    pulledAt: new Date().toISOString(),
  })
}

function seedManualPlan(store: DomainStore) {
  store.ratePlans.push({
    networkId: 1,
    propertyId: 10,
    channexId: 'rp-manual',
    roomTypeChannexId: 'rt-1',
    title: 'BAR',
    currency: 'USD',
    parentRatePlanChannexId: null,
    channexRaw: { rate_mode: 'manual' },
    pulledAt: new Date().toISOString(),
  })
}

function seedDerivedPlan(store: DomainStore) {
  store.ratePlans.push({
    networkId: 1,
    propertyId: 10,
    channexId: 'rp-derived',
    roomTypeChannexId: 'rt-1',
    title: 'Airbnb',
    currency: 'USD',
    parentRatePlanChannexId: 'rp-manual',
    channexRaw: {
      rate_mode: 'derived',
      options: [
        {
          occupancy: 2,
          is_primary: true,
          derived_option: { rate: [['increase_by_percent', '10']] },
        },
      ],
    },
    pulledAt: new Date().toISOString(),
  })
}

const baseRestrictionInput = {
  propertyId: 10,
  ratePlanChannexId: 'rp-manual',
  dateFrom: '2026-08-10',
  dateTo: '2026-08-12',
  fields: { minStayArrival: 2, stopSell: true },
  baseSnapshotVersion: 1,
  propertyTimezone: 'UTC',
}

describe('setRatePlanRestrictions (U7)', () => {
  it('capability off rejects before enqueue', async () => {
    const store = createMemoryStore()
    seedSnapshot(store, 1)
    seedManualPlan(store)
    const created = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      baseRestrictionInput,
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('CAPABILITY_OFF')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('AE5: stale snapshot rejects before enqueue', async () => {
    const store = createMemoryStore()
    enableRateWrite(store)
    seedSnapshot(store, 2)
    seedManualPlan(store)
    const created = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      { ...baseRestrictionInput, baseSnapshotVersion: 1 },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('STALE_SNAPSHOT')
  })

  it('enqueues absolute restriction fields on restrictions lane', async () => {
    const store = createMemoryStore()
    enableRateWrite(store)
    seedSnapshot(store, 1)
    seedManualPlan(store)
    const created = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      baseRestrictionInput,
      { store },
    )
    expect(created.status).toBe('ok')
    const intent = store.ariWriteIntents[0]!
    expect(intent.lane).toBe('restrictions')
    expect(intent.status).toBe('queued')
    const payload = intent.payload as {
      values: Array<{ min_stay_arrival: number; stop_sell: boolean; rate?: number }>
    }
    expect(payload.values[0]?.min_stay_arrival).toBe(2)
    expect(payload.values[0]?.stop_sell).toBe(true)
    expect(payload.values[0]?.rate).toBeUndefined()
  })

  it('manual nightly price enqueue includes rate as minor units', async () => {
    const store = createMemoryStore()
    enableRateWrite(store)
    seedSnapshot(store, 1)
    seedManualPlan(store)
    const created = await runCommand(
      'setRatePlanNightlyRates',
      ctx(principal()),
      {
        propertyId: 10,
        ratePlanChannexId: 'rp-manual',
        dateFrom: '2026-08-10',
        dateTo: '2026-08-10',
        rateMinor: 25_000,
        baseSnapshotVersion: 1,
        propertyTimezone: 'UTC',
      },
      { store },
    )
    expect(created.status).toBe('ok')
    const payload = store.ariWriteIntents[0]!.payload as {
      values: Array<{ rate: number }>
    }
    expect(payload.values[0]?.rate).toBe(25_000)
  })

  it('rejects nightly price on derived plan (fail closed)', async () => {
    const store = createMemoryStore()
    enableRateWrite(store)
    seedSnapshot(store, 1)
    seedManualPlan(store)
    seedDerivedPlan(store)
    const created = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      {
        ...baseRestrictionInput,
        ratePlanChannexId: 'rp-derived',
        fields: { rateMinor: 18_000 },
      },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('VALIDATION')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('ignores mismatched explicit rateMode when catalog says derived', async () => {
    const store = createMemoryStore()
    enableRateWrite(store)
    seedSnapshot(store, 1)
    seedManualPlan(store)
    seedDerivedPlan(store)
    const created = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      {
        ...baseRestrictionInput,
        ratePlanChannexId: 'rp-derived',
        fields: { rateMinor: 18_000 },
        rateMode: 'manual',
      },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('VALIDATION')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('rejects non-positive rate and past dates before enqueue', async () => {
    const store = createMemoryStore()
    enableRateWrite(store)
    seedSnapshot(store, 1)
    seedManualPlan(store)
    const badRate = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      { ...baseRestrictionInput, fields: { rateMinor: 0 } },
      { store },
    )
    expect(badRate.status).toBe('rejected')
    const past = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      {
        ...baseRestrictionInput,
        dateFrom: '2020-01-01',
        dateTo: '2020-01-02',
        fields: { stopSell: true },
      },
      { store },
    )
    expect(past.status).toBe('rejected')
    expect(past.error?.code).toBe('VALIDATION')
  })

  it('coalesces overlapping queued intents; leaves accepted alone', async () => {
    const store = createMemoryStore()
    enableRateWrite(store)
    seedSnapshot(store, 1)
    seedManualPlan(store)
    const first = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      { ...baseRestrictionInput, fields: { minStayArrival: 1 } },
      { store },
    )
    expect(first.status).toBe('ok')
    const firstId = first.data!.intent.id
    const second = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      { ...baseRestrictionInput, fields: { minStayArrival: 3 } },
      { store },
    )
    expect(second.status).toBe('ok')
    expect(store.ariWriteIntents.find((i) => i.id === firstId)?.status).toBe(
      'cancelled',
    )
    store.ariWriteIntents.push({
      ...second.data!.intent,
      id: store.nextId('ari_write_intent'),
      idempotencyKey: 'accepted-restr',
      status: 'accepted',
    })
    const third = await runCommand(
      'setRatePlanRestrictions',
      ctx(principal()),
      { ...baseRestrictionInput, fields: { minStayArrival: 4 } },
      { store },
    )
    expect(third.status).toBe('ok')
    expect(
      store.ariWriteIntents.find((i) => i.idempotencyKey === 'accepted-restr')
        ?.status,
    ).toBe('accepted')
  })
})

describe('updateDerivedRateModifier (U7 / AE7)', () => {
  const derivedInput = {
    propertyId: 10,
    ratePlanChannexId: 'rp-derived',
    occupancy: 2,
    isPrimary: true,
    derivedOption: {
      rate: [['increase_by_percent', '15'] as ['increase_by_percent', string]],
    },
    baseSnapshotVersion: 1,
  }

  it('capability off rejects', async () => {
    const store = createMemoryStore()
    enableRateWrite(store, false)
    seedSnapshot(store, 1)
    seedDerivedPlan(store)
    const created = await runCommand(
      'updateDerivedRateModifier',
      ctx(principal()),
      derivedInput,
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('CAPABILITY_OFF')
  })

  it('enqueues rate_plan lane for derived plans', async () => {
    const store = createMemoryStore()
    enableRateWrite(store, true)
    seedSnapshot(store, 1)
    seedDerivedPlan(store)
    const created = await runCommand(
      'updateDerivedRateModifier',
      ctx(principal()),
      derivedInput,
      { store },
    )
    expect(created.status).toBe('ok')
    const intent = store.ariWriteIntents[0]!
    expect(intent.lane).toBe('rate_plan')
    const payload = intent.payload as {
      rate_plan: {
        options: Array<{ derived_option: { rate: [string, string][] } }>
      }
    }
    expect(payload.rate_plan.options[0]?.derived_option.rate[0]).toEqual([
      'increase_by_percent',
      '15',
    ])
  })

  it('fail closed on cascade/auto/manual modes', async () => {
    const store = createMemoryStore()
    enableRateWrite(store, true)
    seedSnapshot(store, 1)
    store.ratePlans.push({
      networkId: 1,
      propertyId: 10,
      channexId: 'rp-cascade',
      roomTypeChannexId: 'rt-1',
      title: 'Cascade',
      currency: 'USD',
      parentRatePlanChannexId: 'rp-manual',
      channexRaw: { rate_mode: 'cascade' },
      pulledAt: new Date().toISOString(),
    })
    const created = await runCommand(
      'updateDerivedRateModifier',
      ctx(principal()),
      { ...derivedInput, ratePlanChannexId: 'rp-cascade' },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('VALIDATION')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('ignores mismatched explicit rateMode when catalog is not derived', async () => {
    const store = createMemoryStore()
    enableRateWrite(store, true)
    seedSnapshot(store, 1)
    seedManualPlan(store)
    const created = await runCommand(
      'updateDerivedRateModifier',
      ctx(principal()),
      {
        ...derivedInput,
        ratePlanChannexId: 'rp-manual',
        rateMode: 'derived',
      },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('VALIDATION')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('rejects unsupported derived ops', async () => {
    const store = createMemoryStore()
    enableRateWrite(store, true)
    seedSnapshot(store, 1)
    seedDerivedPlan(store)
    const created = await runCommand(
      'updateDerivedRateModifier',
      ctx(principal()),
      {
        ...derivedInput,
        derivedOption: {
          rate: [['multiply_by', '2'] as unknown as ['increase_by_percent', string]],
        },
      },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('VALIDATION')
  })
})
