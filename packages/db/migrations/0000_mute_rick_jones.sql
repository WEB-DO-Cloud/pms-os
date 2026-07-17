CREATE TYPE "public"."ack_outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_ledger_type" AS ENUM('charge', 'payment', 'refund', 'adjustment', 'invoice', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('active', 'maintenance', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending_sync', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('org_admin', 'manager', 'front_desk', 'housekeeping', 'accounting', 'property_owner');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('idle', 'running', 'healthy', 'warning', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_category" AS ENUM('cleaning', 'maintenance', 'inspection', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "ack_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"channex_revision_id" text NOT NULL,
	"status" "ack_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer,
	"principal_type" text NOT NULL,
	"principal_id" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb,
	"actions" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"rule_id" integer NOT NULL,
	"status" text NOT NULL,
	"input_event" jsonb,
	"result" jsonb,
	"idempotency_key" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "booking_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"reservation_id" integer,
	"channex_revision_id" text NOT NULL,
	"channex_booking_id" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"country" text,
	"notes" text,
	"vip" boolean DEFAULT false NOT NULL,
	"preferences" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_billing" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'none' NOT NULL,
	"current_period_end" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_entitlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"multi_network" boolean DEFAULT false NOT NULL,
	"white_label" boolean DEFAULT false NOT NULL,
	"license_key_fingerprint" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_secrets" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"kind" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"key_version" text NOT NULL,
	"last_rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "networks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"brand_display_name" text,
	"brand_accent_color" text,
	"channex_group_id" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"reservation_id" integer,
	"type" "payment_ledger_type" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"external_ref" text,
	"created_by_principal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "physical_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"room_type_id" integer NOT NULL,
	"slot_index" integer NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"channex_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address" text,
	"city" text,
	"country" text,
	"timezone" text,
	"currency" text,
	"status" "property_status" DEFAULT 'active' NOT NULL,
	"channex_title" text,
	"channex_raw" jsonb,
	"source_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"check_in_time" text DEFAULT '15:00',
	"check_out_time" text DEFAULT '11:00',
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"room_type_id" integer,
	"room_id" integer,
	"guest_id" integer,
	"channex_booking_id" text,
	"channex_unique_id" text,
	"source_revision_id" text,
	"source_updated_at" timestamp with time zone,
	"check_in_date" text NOT NULL,
	"check_out_date" text NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"infants" integer DEFAULT 0 NOT NULL,
	"status" "reservation_status" DEFAULT 'confirmed' NOT NULL,
	"channel" text,
	"total_amount_minor" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"guest_name" text,
	"guest_email" text,
	"special_requests" text,
	"payment_collect" text,
	"payment_type" text,
	"channex_raw" jsonb,
	"last_synced_at" timestamp with time zone,
	"operational_status" text,
	"staff_notes" text,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"pending_sync_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer,
	"reservation_id" integer,
	"guest_id" integer,
	"rating" integer,
	"title" text,
	"comment" text,
	"source" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"channex_id" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"count_of_rooms" integer,
	"channex_raw" jsonb,
	"source_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"cursor_key" text NOT NULL,
	"cursor_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_dead_letters" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"kind" text NOT NULL,
	"external_id" text,
	"payload" jsonb,
	"error" text NOT NULL,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"status" "sync_status" DEFAULT 'idle' NOT NULL,
	"last_pull_at" timestamp with time zone,
	"last_webhook_at" timestamp with time zone,
	"last_ack_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer,
	"reservation_id" integer,
	"title" text NOT NULL,
	"description" text,
	"category" "task_category" DEFAULT 'other' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"assigned_to_user_id" text,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_dedupe" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"delivery_key" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ack_outbox" ADD CONSTRAINT "ack_outbox_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_revisions" ADD CONSTRAINT "booking_revisions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_revisions" ADD CONSTRAINT "booking_revisions_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_billing" ADD CONSTRAINT "network_billing_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_entitlements" ADD CONSTRAINT "network_entitlements_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_memberships" ADD CONSTRAINT "network_memberships_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_secrets" ADD CONSTRAINT "network_secrets_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_properties" ADD CONSTRAINT "owner_properties_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_properties" ADD CONSTRAINT "owner_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_ledger" ADD CONSTRAINT "payment_ledger_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_ledger" ADD CONSTRAINT "payment_ledger_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_rooms" ADD CONSTRAINT "physical_rooms_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_rooms" ADD CONSTRAINT "physical_rooms_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_rooms" ADD CONSTRAINT "physical_rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_memberships" ADD CONSTRAINT "property_memberships_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_memberships" ADD CONSTRAINT "property_memberships_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_physical_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."physical_rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_dead_letters" ADD CONSTRAINT "sync_dead_letters_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_health" ADD CONSTRAINT "sync_health_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_dedupe" ADD CONSTRAINT "webhook_dedupe_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ack_outbox_network_revision_uidx" ON "ack_outbox" USING btree ("network_id","channex_revision_id");--> statement-breakpoint
CREATE INDEX "ack_outbox_status_idx" ON "ack_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_events_network_idx" ON "audit_events" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "automation_rules_network_idx" ON "automation_rules" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_idempotency_uidx" ON "automation_runs" USING btree ("network_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "automation_runs_rule_idx" ON "automation_runs" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_revisions_network_revision_uidx" ON "booking_revisions" USING btree ("network_id","channex_revision_id");--> statement-breakpoint
CREATE INDEX "booking_revisions_booking_idx" ON "booking_revisions" USING btree ("network_id","channex_booking_id");--> statement-breakpoint
CREATE INDEX "guests_network_email_idx" ON "guests" USING btree ("network_id","email");--> statement-breakpoint
CREATE INDEX "guests_network_idx" ON "guests" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "network_billing_network_uidx" ON "network_billing" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "network_entitlements_network_uidx" ON "network_entitlements" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "network_memberships_network_user_uidx" ON "network_memberships" USING btree ("network_id","user_id");--> statement-breakpoint
CREATE INDEX "network_memberships_user_idx" ON "network_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "network_secrets_network_kind_uidx" ON "network_secrets" USING btree ("network_id","kind");--> statement-breakpoint
CREATE INDEX "network_secrets_network_idx" ON "network_secrets" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "networks_slug_uidx" ON "networks" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_properties_property_user_uidx" ON "owner_properties" USING btree ("property_id","user_id");--> statement-breakpoint
CREATE INDEX "owner_properties_user_idx" ON "owner_properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_ledger_network_idx" ON "payment_ledger" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "payment_ledger_reservation_idx" ON "payment_ledger" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "physical_rooms_type_slot_uidx" ON "physical_rooms" USING btree ("room_type_id","slot_index");--> statement-breakpoint
CREATE UNIQUE INDEX "physical_rooms_property_label_uidx" ON "physical_rooms" USING btree ("property_id","label");--> statement-breakpoint
CREATE INDEX "physical_rooms_property_idx" ON "physical_rooms" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "physical_rooms_network_idx" ON "physical_rooms" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_network_channex_uidx" ON "properties" USING btree ("network_id","channex_id");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_network_slug_uidx" ON "properties" USING btree ("network_id","slug");--> statement-breakpoint
CREATE INDEX "properties_network_idx" ON "properties" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_memberships_property_user_uidx" ON "property_memberships" USING btree ("property_id","user_id");--> statement-breakpoint
CREATE INDEX "property_memberships_user_idx" ON "property_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_network_channex_booking_uidx" ON "reservations" USING btree ("network_id","channex_booking_id");--> statement-breakpoint
CREATE INDEX "reservations_network_property_dates_idx" ON "reservations" USING btree ("network_id","property_id","check_in_date","check_out_date");--> statement-breakpoint
CREATE INDEX "reservations_room_dates_idx" ON "reservations" USING btree ("room_id","check_in_date","check_out_date");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reviews_network_idx" ON "reviews" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_types_network_channex_uidx" ON "room_types" USING btree ("network_id","channex_id");--> statement-breakpoint
CREATE INDEX "room_types_property_idx" ON "room_types" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_cursors_network_key_uidx" ON "sync_cursors" USING btree ("network_id","cursor_key");--> statement-breakpoint
CREATE INDEX "sync_dead_letters_network_idx" ON "sync_dead_letters" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_health_network_uidx" ON "sync_health" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "tasks_network_status_idx" ON "tasks" USING btree ("network_id","status");--> statement-breakpoint
CREATE INDEX "tasks_property_idx" ON "tasks" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_dedupe_network_delivery_uidx" ON "webhook_dedupe" USING btree ("network_id","delivery_key");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");