CREATE TYPE "public"."staff_advance_kind" AS ENUM('ADVANCE', 'RECOVERY');--> statement-breakpoint
CREATE TYPE "public"."staff_advance_method" AS ENUM('SALARY_DEDUCTION', 'CASH_RETURN');--> statement-breakpoint
CREATE TABLE "staff_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"employee_id" uuid NOT NULL,
	"kind" "staff_advance_kind" NOT NULL,
	"method" "staff_advance_method",
	"amount" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"cash_movement_id" uuid,
	"note" text,
	"recorded_by" uuid,
	CONSTRAINT "staff_advances_amount_positive" CHECK ("staff_advances"."amount" > 0),
	CONSTRAINT "staff_advances_method_matches_kind" CHECK (("staff_advances"."kind" = 'ADVANCE' and "staff_advances"."method" is null) or ("staff_advances"."kind" = 'RECOVERY' and "staff_advances"."method" is not null))
);
--> statement-breakpoint
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_advances_employee_idx" ON "staff_advances" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "staff_advances_occurred_on_idx" ON "staff_advances" USING btree ("occurred_on");