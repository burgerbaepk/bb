CREATE TYPE "public"."customer_entry_kind" AS ENUM('CHARGE', 'PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('OPEN', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."settlement_method" AS ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'WALLET');--> statement-breakpoint
CREATE TYPE "public"."supplier_bill_status" AS ENUM('POSTED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_kind" ADD VALUE 'RETURNED';--> statement-breakpoint
CREATE TABLE "customer_account_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"account_id" uuid NOT NULL,
	"kind" "customer_entry_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"invoice_id" uuid,
	"method" "settlement_method",
	"reference" text,
	"occurred_on" date NOT NULL,
	"cash_movement_id" uuid,
	"note" text,
	"recorded_by" uuid,
	CONSTRAINT "customer_account_entries_amount_positive" CHECK ("customer_account_entries"."amount" > 0),
	CONSTRAINT "customer_account_entries_shape" CHECK (("customer_account_entries"."kind" = 'CHARGE' and "customer_account_entries"."invoice_id" is not null and "customer_account_entries"."method" is null and "customer_account_entries"."cash_movement_id" is null) or ("customer_account_entries"."kind" = 'PAYMENT' and "customer_account_entries"."invoice_id" is null and "customer_account_entries"."method" is not null)),
	CONSTRAINT "customer_account_entries_till_is_cash" CHECK ("customer_account_entries"."cash_movement_id" is null or "customer_account_entries"."method" = 'CASH')
);
--> statement-breakpoint
CREATE TABLE "customer_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"customer_id" uuid NOT NULL,
	"credit_limit" bigint,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "customer_accounts_limit_not_negative" CHECK ("customer_accounts"."credit_limit" is null or "customer_accounts"."credit_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"purchase_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(10, 3) NOT NULL,
	"amount" bigint,
	CONSTRAINT "purchase_order_lines_qty_positive" CHECK ("purchase_order_lines"."qty" > 0),
	CONSTRAINT "purchase_order_lines_amount_not_negative" CHECK ("purchase_order_lines"."amount" is null or "purchase_order_lines"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"po_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "purchase_orders_po_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"supplier_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'OPEN' NOT NULL,
	"ordered_on" date NOT NULL,
	"expected_on" date,
	"note" text,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "supplier_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"bill_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(10, 3) NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "supplier_bill_lines_qty_positive" CHECK ("supplier_bill_lines"."qty" > 0),
	CONSTRAINT "supplier_bill_lines_amount_not_negative" CHECK ("supplier_bill_lines"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"bill_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "supplier_bills_bill_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"supplier_ref" text,
	"billed_on" date NOT NULL,
	"due_on" date,
	"charges" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"status" "supplier_bill_status" DEFAULT 'POSTED' NOT NULL,
	"note" text,
	"created_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	CONSTRAINT "supplier_bills_charges_not_negative" CHECK ("supplier_bills"."charges" >= 0),
	CONSTRAINT "supplier_bills_discount_not_negative" CHECK ("supplier_bills"."discount" >= 0),
	CONSTRAINT "supplier_bills_total_not_negative" CHECK ("supplier_bills"."total" >= 0),
	CONSTRAINT "supplier_bills_cancel_has_reason" CHECK ("supplier_bills"."status" <> 'CANCELLED' or ("supplier_bills"."cancel_reason" is not null and "supplier_bills"."cancelled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"supplier_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" "settlement_method" NOT NULL,
	"reference" text,
	"paid_on" date NOT NULL,
	"cash_movement_id" uuid,
	"note" text,
	"recorded_by" uuid,
	CONSTRAINT "supplier_payments_amount_positive" CHECK ("supplier_payments"."amount" > 0),
	CONSTRAINT "supplier_payments_till_is_cash" CHECK ("supplier_payments"."cash_movement_id" is null or "supplier_payments"."method" = 'CASH')
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"address" text,
	"ntn" text,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_delta_matches_kind";--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_account_id_customer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_demand_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."demand_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_item_id_demand_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."demand_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_account_entries_account_idx" ON "customer_account_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "customer_account_entries_occurred_on_idx" ON "customer_account_entries" USING btree ("occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_account_entries_invoice_idx" ON "customer_account_entries" USING btree ("invoice_id") WHERE "customer_account_entries"."deleted_at" is null and "customer_account_entries"."invoice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_accounts_customer_idx" ON "customer_accounts" USING btree ("customer_id") WHERE "customer_accounts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_po_no_idx" ON "purchase_orders" USING btree ("po_no");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_bill_lines_bill_idx" ON "supplier_bill_lines" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "supplier_bill_lines_item_idx" ON "supplier_bill_lines" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_bills_bill_no_idx" ON "supplier_bills" USING btree ("bill_no");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_bills_supplier_ref_idx" ON "supplier_bills" USING btree ("supplier_id",lower("supplier_ref")) WHERE "supplier_bills"."deleted_at" is null and "supplier_bills"."supplier_ref" is not null and "supplier_bills"."status" = 'POSTED';--> statement-breakpoint
CREATE INDEX "supplier_bills_supplier_idx" ON "supplier_bills" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_bills_billed_on_idx" ON "supplier_bills" USING btree ("billed_on");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_paid_on_idx" ON "supplier_payments" USING btree ("paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_idx" ON "suppliers" USING btree (lower("name")) WHERE "suppliers"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_delta_matches_kind" CHECK (("stock_movements"."kind" = 'RECEIVED' and "stock_movements"."qty" > 0 and "stock_movements"."delta" = "stock_movements"."qty") or ("stock_movements"."kind"::text in ('ISSUED', 'WASTED', 'RETURNED') and "stock_movements"."qty" > 0 and "stock_movements"."delta" = -"stock_movements"."qty") or ("stock_movements"."kind" = 'COUNTED' and "stock_movements"."qty" >= 0));