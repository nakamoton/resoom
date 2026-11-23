CREATE TABLE "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"requested_by" text,
	"requested_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"message" text,
	CONSTRAINT "crawl_runs_trigger" CHECK ("crawl_runs"."trigger" in ('schedule', 'manual')),
	CONSTRAINT "crawl_runs_status" CHECK ("crawl_runs"."status" in ('requested', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_runs_one_active" ON "crawl_runs" USING btree ((true)) WHERE "crawl_runs"."status" in ('requested', 'running');--> statement-breakpoint
CREATE INDEX "crawl_runs_requested_at" ON "crawl_runs" USING btree ("requested_at");