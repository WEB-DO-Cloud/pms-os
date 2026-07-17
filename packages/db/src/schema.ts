import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const propertyStatusEnum = pgEnum('property_status', [
  'active',
  'maintenance',
  'archived',
])

export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending_sync',
  'pending',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
])

export const syncStatusEnum = pgEnum('sync_status', [
  'idle',
  'running',
  'healthy',
  'warning',
  'failed',
])

export const ackOutboxStatusEnum = pgEnum('ack_outbox_status', [
  'pending',
  'sent',
  'failed',
])

export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'done',
  'cancelled',
])

export const taskCategoryEnum = pgEnum('task_category', [
  'cleaning',
  'maintenance',
  'inspection',
  'other',
])

export const paymentLedgerTypeEnum = pgEnum('payment_ledger_type', [
  'charge',
  'payment',
  'refund',
  'adjustment',
  'invoice',
  'receipt',
])

export const roleEnum = pgEnum('member_role', [
  'org_admin',
  'manager',
  'front_desk',
  'housekeeping',
  'accounting',
  'property_owner',
])

export const networks = pgTable(
  'networks',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logoUrl: text('logo_url'),
    brandDisplayName: text('brand_display_name'),
    brandAccentColor: text('brand_accent_color'),
    // Commercial edition: scopes which Channex properties this tenant may import,
    // using a single platform master API key. Null in community (per-network key sees all).
    channexGroupId: text('channex_group_id'),
    timezone: text('timezone').default('UTC').notNull(),
    currency: text('currency').default('USD').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('networks_slug_uidx').on(t.slug)],
)

export const networkSecrets = pgTable(
  'network_secrets',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // channex_api_key | channex_webhook_secret
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    keyVersion: text('key_version').notNull(),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('network_secrets_network_kind_uidx').on(t.networkId, t.kind),
    index('network_secrets_network_idx').on(t.networkId),
  ],
)

export const properties = pgTable(
  'properties',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    channexId: text('channex_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    address: text('address'),
    city: text('city'),
    country: text('country'),
    timezone: text('timezone'),
    currency: text('currency'),
    status: propertyStatusEnum('status').default('active').notNull(),
    // Channex-owned projection fields
    channexTitle: text('channex_title'),
    channexRaw: jsonb('channex_raw'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    // PMS-owned extensions
    checkInTime: text('check_in_time').default('15:00'),
    checkOutTime: text('check_out_time').default('11:00'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('properties_network_channex_uidx').on(t.networkId, t.channexId),
    uniqueIndex('properties_network_slug_uidx').on(t.networkId, t.slug),
    index('properties_network_idx').on(t.networkId),
  ],
)

export const roomTypes = pgTable(
  'room_types',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    channexId: text('channex_id').notNull(),
    name: text('name').notNull(),
    capacity: integer('capacity'),
    countOfRooms: integer('count_of_rooms'),
    channexRaw: jsonb('channex_raw'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('room_types_network_channex_uidx').on(t.networkId, t.channexId),
    index('room_types_property_idx').on(t.propertyId),
  ],
)

/** PMS-owned sellable rooms generated from room_types.count_of_rooms. */
export const physicalRooms = pgTable(
  'physical_rooms',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    roomTypeId: integer('room_type_id')
      .notNull()
      .references(() => roomTypes.id, { onDelete: 'restrict' }),
    /** Stable generated slot within the room type (1..N). Never reused for a different logical room. */
    slotIndex: integer('slot_index').notNull(),
    /** Editable display number/label (defaults to String(slotIndex)). */
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('physical_rooms_type_slot_uidx').on(t.roomTypeId, t.slotIndex),
    uniqueIndex('physical_rooms_property_label_uidx').on(t.propertyId, t.label),
    index('physical_rooms_property_idx').on(t.propertyId),
    index('physical_rooms_network_idx').on(t.networkId),
  ],
)

export const guests = pgTable(
  'guests',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    email: text('email'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    phone: text('phone'),
    country: text('country'),
    // PMS-owned enrichments
    notes: text('notes'),
    vip: boolean('vip').default(false).notNull(),
    preferences: jsonb('preferences'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('guests_network_email_idx').on(t.networkId, t.email),
    index('guests_network_idx').on(t.networkId),
  ],
)

export const reservations = pgTable(
  'reservations',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    roomTypeId: integer('room_type_id').references(() => roomTypes.id, {
      onDelete: 'restrict',
    }),
    /** PMS-owned physical room assignment (auto-assigned; nullable = unassigned/conflict). */
    roomId: integer('room_id').references(() => physicalRooms.id, {
      onDelete: 'set null',
    }),
    guestId: integer('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    channexBookingId: text('channex_booking_id'),
    channexUniqueId: text('channex_unique_id'),
    sourceRevisionId: text('source_revision_id'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    // Stay windows as property-local calendar dates (YYYY-MM-DD strings)
    checkInDate: text('check_in_date').notNull(),
    checkOutDate: text('check_out_date').notNull(),
    adults: integer('adults').default(1).notNull(),
    children: integer('children').default(0).notNull(),
    infants: integer('infants').default(0).notNull(),
    status: reservationStatusEnum('status').default('confirmed').notNull(),
    channel: text('channel'),
    // Money as integer minor units + currency
    totalAmountMinor: integer('total_amount_minor'),
    currency: text('currency').default('USD').notNull(),
    // Channex-owned projection
    guestName: text('guest_name'),
    guestEmail: text('guest_email'),
    specialRequests: text('special_requests'),
    paymentCollect: text('payment_collect'),
    paymentType: text('payment_type'),
    channexRaw: jsonb('channex_raw'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    // PMS-owned operational state
    operationalStatus: text('operational_status'),
    staffNotes: text('staff_notes'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }),
    pendingSyncReason: text('pending_sync_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('reservations_network_channex_booking_uidx').on(
      t.networkId,
      t.channexBookingId,
    ),
    index('reservations_network_property_dates_idx').on(
      t.networkId,
      t.propertyId,
      t.checkInDate,
      t.checkOutDate,
    ),
    index('reservations_room_dates_idx').on(t.roomId, t.checkInDate, t.checkOutDate),
    index('reservations_status_idx').on(t.status),
  ],
)

export const bookingRevisions = pgTable(
  'booking_revisions',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    reservationId: integer('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    channexRevisionId: text('channex_revision_id').notNull(),
    channexBookingId: text('channex_booking_id').notNull(),
    status: text('status').notNull(), // new | modified | cancelled
    payload: jsonb('payload'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('booking_revisions_network_revision_uidx').on(
      t.networkId,
      t.channexRevisionId,
    ),
    index('booking_revisions_booking_idx').on(t.networkId, t.channexBookingId),
  ],
)

export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    propertyId: integer('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    reservationId: integer('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    category: taskCategoryEnum('category').default('other').notNull(),
    status: taskStatusEnum('status').default('todo').notNull(),
    assignedToUserId: text('assigned_to_user_id'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('tasks_network_status_idx').on(t.networkId, t.status),
    index('tasks_property_idx').on(t.propertyId),
  ],
)

export const paymentLedger = pgTable(
  'payment_ledger',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    reservationId: integer('reservation_id').references(() => reservations.id, {
      onDelete: 'restrict',
    }),
    type: paymentLedgerTypeEnum('type').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').default('USD').notNull(),
    note: text('note'),
    externalRef: text('external_ref'),
    createdByPrincipal: text('created_by_principal'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('payment_ledger_network_idx').on(t.networkId),
    index('payment_ledger_reservation_idx').on(t.reservationId),
  ],
)

export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'restrict' }),
    propertyId: integer('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    reservationId: integer('reservation_id').references(() => reservations.id, {
      onDelete: 'set null',
    }),
    guestId: integer('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    rating: integer('rating'),
    title: text('title'),
    comment: text('comment'),
    source: text('source'),
    status: text('status').default('pending').notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('reviews_network_idx').on(t.networkId)],
)

export const networkMemberships = pgTable(
  'network_memberships',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('network_memberships_network_user_uidx').on(t.networkId, t.userId),
    index('network_memberships_user_idx').on(t.userId),
  ],
)

export const propertyMemberships = pgTable(
  'property_memberships',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('property_memberships_property_user_uidx').on(t.propertyId, t.userId),
    index('property_memberships_user_idx').on(t.userId),
  ],
)

export const ownerProperties = pgTable(
  'owner_properties',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('owner_properties_property_user_uidx').on(t.propertyId, t.userId),
    index('owner_properties_user_idx').on(t.userId),
  ],
)

export const networkEntitlements = pgTable(
  'network_entitlements',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    multiNetwork: boolean('multi_network').default(false).notNull(),
    whiteLabel: boolean('white_label').default(false).notNull(),
    licenseKeyFingerprint: text('license_key_fingerprint'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('network_entitlements_network_uidx').on(t.networkId)],
)

/** Commercial Stripe subscription state — one row per network. */
export const networkBilling = pgTable(
  'network_billing',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status').default('none').notNull(), // none | active | past_due | canceled | incomplete | trialing
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('network_billing_network_uidx').on(t.networkId)],
)

export const automationRules = pgTable(
  'automation_rules',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    trigger: text('trigger').notNull(),
    conditions: jsonb('conditions'),
    actions: jsonb('actions'),
    isActive: boolean('is_active').default(true).notNull(),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('automation_rules_network_idx').on(t.networkId)],
)

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    ruleId: integer('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    inputEvent: jsonb('input_event'),
    result: jsonb('result'),
    idempotencyKey: text('idempotency_key'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('automation_runs_idempotency_uidx').on(t.networkId, t.idempotencyKey),
    index('automation_runs_rule_idx').on(t.ruleId),
  ],
)

export const syncCursors = pgTable(
  'sync_cursors',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    cursorKey: text('cursor_key').notNull(),
    cursorValue: text('cursor_value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('sync_cursors_network_key_uidx').on(t.networkId, t.cursorKey),
  ],
)

export const webhookDedupe = pgTable(
  'webhook_dedupe',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    deliveryKey: text('delivery_key').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('webhook_dedupe_network_delivery_uidx').on(t.networkId, t.deliveryKey),
  ],
)

export const ackOutbox = pgTable(
  'ack_outbox',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    channexRevisionId: text('channex_revision_id').notNull(),
    status: ackOutboxStatusEnum('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('ack_outbox_network_revision_uidx').on(
      t.networkId,
      t.channexRevisionId,
    ),
    index('ack_outbox_status_idx').on(t.status),
  ],
)

export const syncDeadLetters = pgTable(
  'sync_dead_letters',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    externalId: text('external_id'),
    payload: jsonb('payload'),
    error: text('error').notNull(),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sync_dead_letters_network_idx').on(t.networkId)],
)

export const syncHealth = pgTable(
  'sync_health',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id')
      .notNull()
      .references(() => networks.id, { onDelete: 'cascade' }),
    status: syncStatusEnum('status').default('idle').notNull(),
    lastPullAt: timestamp('last_pull_at', { withTimezone: true }),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    lastAckAt: timestamp('last_ack_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('sync_health_network_uidx').on(t.networkId)],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: serial('id').primaryKey(),
    networkId: integer('network_id').references(() => networks.id, {
      onDelete: 'set null',
    }),
    principalType: text('principal_type').notNull(),
    principalId: text('principal_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_events_network_idx').on(t.networkId),
    index('audit_events_created_idx').on(t.createdAt),
  ],
)

/** Field ownership matrix for Channex re-sync (KTD23). */
export const fieldOwnership = {
  properties: {
    channexOwned: [
      'channexTitle',
      'channexRaw',
      'sourceUpdatedAt',
      'name',
      'address',
      'city',
      'country',
      'timezone',
      'currency',
    ],
    pmsOwned: ['checkInTime', 'checkOutTime', 'notes', 'status', 'archivedAt'],
  },
  reservations: {
    channexOwned: [
      'channexBookingId',
      'channexUniqueId',
      'sourceRevisionId',
      'sourceUpdatedAt',
      'checkInDate',
      'checkOutDate',
      'adults',
      'children',
      'infants',
      'channel',
      'totalAmountMinor',
      'currency',
      'guestName',
      'guestEmail',
      'specialRequests',
      'paymentCollect',
      'paymentType',
      'channexRaw',
      'status',
      'roomTypeId',
    ],
    pmsOwned: [
      'operationalStatus',
      'staffNotes',
      'checkedInAt',
      'checkedOutAt',
      'pendingSyncReason',
      'roomId',
    ],
  },
  physicalRooms: {
    channexOwned: [] as const,
    pmsOwned: ['label', 'sortOrder', 'archivedAt'] as const,
  },
  guests: {
    channexOwned: ['email', 'firstName', 'lastName', 'phone', 'country'],
    pmsOwned: ['notes', 'vip', 'preferences'],
  },
} as const
