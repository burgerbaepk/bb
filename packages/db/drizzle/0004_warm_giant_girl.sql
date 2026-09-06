CREATE TYPE "public"."demand_sheet_status" AS ENUM('DRAFT', 'SUBMITTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "demand_sheet_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"sheet_id" uuid NOT NULL,
	"item" text NOT NULL,
	"unit" text NOT NULL,
	"qty" numeric(10, 3) DEFAULT '1' NOT NULL,
	"estimated_unit_cost" bigint,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "demand_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"needed_by" date NOT NULL,
	"status" "demand_sheet_status" DEFAULT 'DRAFT' NOT NULL,
	"supplier" text,
	"note" text,
	"created_by" uuid,
	"submitted_at" timestamp with time zone,
	"cancel_reason" text
);
--> statement-breakpoint
ALTER TABLE "demand_sheet_lines" ADD CONSTRAINT "demand_sheet_lines_sheet_id_demand_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."demand_sheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_sheets" ADD CONSTRAINT "demand_sheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demand_sheet_lines_sheet_idx" ON "demand_sheet_lines" USING btree ("sheet_id");--> statement-breakpoint
CREATE INDEX "demand_sheets_needed_by_idx" ON "demand_sheets" USING btree ("needed_by");--> statement-breakpoint
CREATE INDEX "demand_sheets_status_idx" ON "demand_sheets" USING btree ("status");