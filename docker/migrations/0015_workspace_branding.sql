ALTER TABLE "tenants" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "brand_logo" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_brand_color_hex" CHECK ("tenants"."brand_color" is null or "tenants"."brand_color" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_brand_logo_size" CHECK ("tenants"."brand_logo" is null or length("tenants"."brand_logo") <= 400000);