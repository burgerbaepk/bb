CREATE TYPE "public"."stock_movement_kind" AS ENUM('RECEIVED', 'ISSUED', 'WASTED', 'COUNTED');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"item_id" uuid NOT NULL,
	"kind" "stock_movement_kind" NOT NULL,
	"qty" numeric(10, 3) NOT NULL,
	"delta" numeric(10, 3) NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text,
	"recorded_by" uuid,
	CONSTRAINT "stock_movements_delta_matches_kind" CHECK (("stock_movements"."kind" = 'RECEIVED' and "stock_movements"."qty" > 0 and "stock_movements"."delta" = "stock_movements"."qty") or ("stock_movements"."kind" in ('ISSUED', 'WASTED') and "stock_movements"."qty" > 0 and "stock_movements"."delta" = -"stock_movements"."qty") or ("stock_movements"."kind" = 'COUNTED' and "stock_movements"."qty" >= 0)),
	CONSTRAINT "stock_movements_waste_has_reason" CHECK ("stock_movements"."kind" <> 'WASTED' or "stock_movements"."note" is not null)
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_demand_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."demand_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_movements_occurred_on_idx" ON "stock_movements" USING btree ("occurred_on");