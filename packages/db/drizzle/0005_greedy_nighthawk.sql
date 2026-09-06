CREATE TABLE "demand_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"default_unit" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demand_sheet_lines" ALTER COLUMN "unit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "demand_sheet_lines" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "demand_items_category_idx" ON "demand_items" USING btree ("category","sort_order");