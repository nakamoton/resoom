CREATE TABLE "policy_evidences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"result" text NOT NULL,
	"instruments" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text NOT NULL,
	"source_url" text,
	"reported_by" text NOT NULL,
	"seed_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_evidences_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "policy_evidences_kind" CHECK ("policy_evidences"."kind" in ('usage', 'inquiry', 'document')),
	CONSTRAINT "policy_evidences_result" CHECK ("policy_evidences"."result" in ('allowed', 'conditional', 'prohibited'))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"municipality" text NOT NULL,
	"facility_name" text NOT NULL,
	"room_name" text NOT NULL,
	"capacity" integer,
	"nearest_station" text,
	"adapter_id" text,
	"adapter_facility_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_evidences" ADD CONSTRAINT "policy_evidences_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_evidences_room" ON "policy_evidences" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_identity" ON "rooms" USING btree ("municipality","facility_name","room_name");