CREATE TABLE "availability_slots" (
	"room_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text NOT NULL,
	"raw_label" text NOT NULL,
	CONSTRAINT "availability_slots_room_id_date_start_time_pk" PRIMARY KEY("room_id","date","start_time")
);
--> statement-breakpoint
CREATE TABLE "availability_snapshots" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"covered_from" date,
	"covered_through" date,
	"fetched_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_snapshots" ADD CONSTRAINT "availability_snapshots_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_slots_date" ON "availability_slots" USING btree ("date");