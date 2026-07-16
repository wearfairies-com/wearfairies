-- Run this in Supabase SQL Editor
-- Database → SQL Editor → New Query → paste everything → Run

-- Clean start
drop table if exists rental_requests;
drop table if exists listings;

-- LISTINGS TABLE
create table listings (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  title text not null,
  description text,
  occasion text,
  size text,
  condition text,
  price_per_night numeric(10,2),
  tags text[],
  lister_name text not null,
  lister_email text not null,
  lister_phone text,
  street_address text,
  apt text,
  city text,
  state text,
  zip text,
  neighbourhood text,
  image_url text,
  status text default 'pending',
  availability text default 'available',
  lender_stripe_id text
);

-- RENTAL REQUESTS TABLE
create table rental_requests (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  listing_id uuid,
  piece_title text,
  lister_name text,
  lister_email text,
  renter_name text,
  renter_email text,
  renter_phone text,
  delivery_address text,
  event_date date,
  delivery_date date,
  collection_date date,
  message text,
  tip_amount numeric(10,2) default 0,
  total_amount numeric(10,2),
  status text default 'pending',
  stripe_payment_intent text
);

-- Disable Row Level Security so everything works
alter table listings disable row level security;
alter table rental_requests disable row level security;


-- LENDERS TABLE
create table lenders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null unique,
  name text not null,
  email text not null,
  phone text,
  stripe_connected_account text,
  stripe_access_token text,
  stripe_auth_code text,
  created_at timestamp with time zone default now()
);

-- Update existing listings table with new columns
alter table listings add column if not exists category text;
alter table listings add column if not exists original_price numeric(10,2);
alter table listings add column if not exists user_id uuid;

-- Ensure RLS is disabled
alter table lenders disable row level security;

-- RENTERS TABLE
-- Contact details only. No card data ever touches this table —
-- Stripe holds all of that.
create table if not exists renters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null unique,
  name text not null,
  email text not null,
  phone text,
  created_at timestamp with time zone default now()
);

alter table renters disable row level security;
grant all privileges on table renters to anon, authenticated;
