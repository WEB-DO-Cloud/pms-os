CREATE TYPE "public"."ari_write_lane" AS ENUM('availability', 'restrictions', 'rate_plan', 'booking_crs');--> statement-breakpoint
CREATE TYPE "public"."ari_write_status" AS ENUM('queued', 'sending', 'accepted', 'partial', 'retry', 'reconciling', 'reconciled', 'drifted', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ari_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"room_type_id" integer NOT NULL,
	"date" text NOT NULL,
	"availability" integer NOT NULL,
	"snapshot_version" integer NOT NULL,
	"pulled_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ari_restrictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"rate_plan_channex_id" text NOT NULL,
	"date" text NOT NULL,
	"rate_minor" integer,
	"min_stay_arrival" integer,
	"min_stay_through" integer,
	"max_stay" integer,
	"closed_to_arrival" boolean,
	"closed_to_departure" boolean,
	"stop_sell" boolean,
	"snapshot_version" integer NOT NULL,
	"pulled_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ari_write_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"lane" "ari_write_lane" NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"resource_scope" jsonb,
	"base_snapshot_version" integer,
	"status" "ari_write_status" DEFAULT 'queued' NOT NULL,
	"channex_task_ids" jsonb,
	"warnings" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone,
	"actor_principal_id" text,
	"approved_by_principal_id" text,
	"compensates_intent_id" integer,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"date" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"network_id" integer NOT NULL,
	"booking_crs_write" boolean DEFAULT false NOT NULL,
	"availability_write" boolean DEFAULT false NOT NULL,
	"rate_restriction_write" boolean DEFAULT false NOT NULL,
	"derived_rate_write" boolean DEFAULT false NOT NULL,
	"ai_apply" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ari_availability" ADD CONSTRAINT "ari_availability_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ari_availability" ADD CONSTRAINT "ari_availability_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ari_availability" ADD CONSTRAINT "ari_availability_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ari_restrictions" ADD CONSTRAINT "ari_restrictions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ari_restrictions" ADD CONSTRAINT "ari_restrictions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ari_write_intents" ADD CONSTRAINT "ari_write_intents_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ari_write_intents" ADD CONSTRAINT "ari_write_intents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_notes" ADD CONSTRAINT "calendar_notes_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_notes" ADD CONSTRAINT "calendar_notes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_capabilities" ADD CONSTRAINT "network_capabilities_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ari_availability_room_type_date_uidx" ON "ari_availability" USING btree ("room_type_id","date");--> statement-breakpoint
CREATE INDEX "ari_availability_property_date_idx" ON "ari_availability" USING btree ("property_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "ari_restrictions_plan_date_uidx" ON "ari_restrictions" USING btree ("rate_plan_channex_id","date");--> statement-breakpoint
CREATE INDEX "ari_restrictions_property_date_idx" ON "ari_restrictions" USING btree ("property_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "ari_write_intents_idempotency_uidx" ON "ari_write_intents" USING btree ("network_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ari_write_intents_status_idx" ON "ari_write_intents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ari_write_intents_property_lane_idx" ON "ari_write_intents" USING btree ("property_id","lane");--> statement-breakpoint
CREATE INDEX "calendar_notes_property_date_idx" ON "calendar_notes" USING btree ("property_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "network_capabilities_network_uidx" ON "network_capabilities" USING btree ("network_id");