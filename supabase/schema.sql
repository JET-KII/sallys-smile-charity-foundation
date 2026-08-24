create extension if not exists pgcrypto;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  kind text not null check (kind in ('shop', 'donation')),
  status text not null default 'pending',
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  currency text not null default 'GHS',
  subtotal numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  fulfillment_method text,
  delivery_area text,
  address text,
  notes text,
  paystack_access_code text,
  paystack_status text,
  paystack_transaction_id bigint,
  paystack_customer_code text,
  admin_notified_at timestamptz,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_items (
  id bigint generated always as identity primary key,
  reference text not null references payments(reference) on delete cascade,
  sku text not null,
  title_snapshot text not null,
  unit_price numeric(12, 2) not null,
  quantity integer not null,
  line_total numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
  before update on payments
  for each row
  execute procedure set_updated_at();

create index if not exists payments_kind_status_idx on payments(kind, status, created_at desc);
create index if not exists payment_items_reference_idx on payment_items(reference);
