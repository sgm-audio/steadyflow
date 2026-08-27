-- Phase A (v2) product_findings expansion — align the table with the full
-- buildProductFinding() output so per-product rows persist without dropping
-- fields. Also disambiguates Shopify product timestamps from row timestamps.

alter table public.product_findings
  add column if not exists tags text[] not null default '{}',
  add column if not exists tag_count integer,
  add column if not exists flag_codes text[] not null default '{}',
  add column if not exists collection_titles text[] not null default '{}',
  add column if not exists sku_count integer,
  add column if not exists barcode_count integer,
  add column if not exists has_barcode boolean,
  add column if not exists has_sku boolean,
  add column if not exists tracks_inventory boolean,
  add column if not exists is_gift_card boolean,
  add column if not exists requires_shipping boolean,
  add column if not exists status text,
  add column if not exists published_at text,
  add column if not exists product_created_at text,
  add column if not exists product_updated_at text,
  add column if not exists online_store_url text,
  add column if not exists title_length integer,
  add column if not exists flag_categories jsonb not null default '{}'::jsonb;
