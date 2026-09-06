ALTER TABLE "outlet_config" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "outlet_config" ADD COLUMN "google_rating" numeric(2, 1);--> statement-breakpoint
ALTER TABLE "outlet_config" ADD COLUMN "google_review_count" integer;