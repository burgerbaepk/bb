ALTER TABLE "invoices" ADD COLUMN "delivery_charge" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_charge" bigint DEFAULT 0 NOT NULL;