CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LEAVE', 'OFF');--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"employee_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"time_in" time,
	"time_out" time,
	"note" text,
	"recorded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"job_title" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employee_date_idx" ON "attendance" USING btree ("employee_id","business_date") WHERE "attendance"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "attendance_business_date_idx" ON "attendance" USING btree ("business_date");