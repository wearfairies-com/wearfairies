-- ============================================================
-- FAIRIES — ROW LEVEL SECURITY
-- Supabase → Database → SQL Editor → New Query → paste → Run
--
-- Run this ALL AT ONCE. It enables RLS and creates the policies in
-- the same transaction. Enabling RLS without policies takes the site
-- down — the wardrobe goes blank and nothing can be written.
--
-- Safe to re-run: every policy is dropped before it's created.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- LISTINGS
-- Public can read approved listings (the wardrobe is open to all).
-- Only signed-in lenders can create, and only against their own email.
-- Only the owner — or admin — can change or delete.
-- ------------------------------------------------------------
alter table listings enable row level security;

drop policy if exists "approved listings are public" on listings;
create policy "approved listings are public"
  on listings for select
  using ( status = 'approved' );

drop policy if exists "lenders read own listings" on listings;
create policy "lenders read own listings"
  on listings for select
  to authenticated
  using ( lister_email = auth.jwt() ->> 'email' );

drop policy if exists "admin reads all listings" on listings;
create policy "admin reads all listings"
  on listings for select
  to authenticated
  using ( auth.jwt() ->> 'email' = 'wearfairies@outlook.com' );

-- Insert: signed in, and you can't list under someone else's email.
drop policy if exists "lenders create own listings" on listings;
create policy "lenders create own listings"
  on listings for insert
  to authenticated
  with check ( lister_email = auth.jwt() ->> 'email' );

-- Update: owner or admin. Admin needs this to approve/reject.
drop policy if exists "lenders update own listings" on listings;
create policy "lenders update own listings"
  on listings for update
  to authenticated
  using ( lister_email = auth.jwt() ->> 'email' )
  with check ( lister_email = auth.jwt() ->> 'email' );

drop policy if exists "admin updates any listing" on listings;
create policy "admin updates any listing"
  on listings for update
  to authenticated
  using ( auth.jwt() ->> 'email' = 'wearfairies@outlook.com' );

-- Delete: owner or admin. Closes a real hole — the dashboard deletes
-- by id with no ownership check, so before RLS any signed-in lender
-- could delete any listing on the platform.
drop policy if exists "lenders delete own listings" on listings;
create policy "lenders delete own listings"
  on listings for delete
  to authenticated
  using ( lister_email = auth.jwt() ->> 'email' );

drop policy if exists "admin deletes any listing" on listings;
create policy "admin deletes any listing"
  on listings for delete
  to authenticated
  using ( auth.jwt() ->> 'email' = 'wearfairies@outlook.com' );


-- ------------------------------------------------------------
-- LENDERS
-- Your own row, nobody else's. Admin sees all.
-- ------------------------------------------------------------
alter table lenders enable row level security;

drop policy if exists "lenders read own profile" on lenders;
create policy "lenders read own profile"
  on lenders for select
  to authenticated
  using ( user_id = auth.uid() );

drop policy if exists "admin reads all lenders" on lenders;
create policy "admin reads all lenders"
  on lenders for select
  to authenticated
  using ( auth.jwt() ->> 'email' = 'wearfairies@outlook.com' );

drop policy if exists "lenders create own profile" on lenders;
create policy "lenders create own profile"
  on lenders for insert
  to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists "lenders update own profile" on lenders;
create policy "lenders update own profile"
  on lenders for update
  to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );


-- ------------------------------------------------------------
-- RENTERS
-- Same shape. Contact details, visible only to the owner and admin.
-- ------------------------------------------------------------
alter table renters enable row level security;

drop policy if exists "renters read own profile" on renters;
create policy "renters read own profile"
  on renters for select
  to authenticated
  using ( user_id = auth.uid() );

drop policy if exists "admin reads all renters" on renters;
create policy "admin reads all renters"
  on renters for select
  to authenticated
  using ( auth.jwt() ->> 'email' = 'wearfairies@outlook.com' );

drop policy if exists "renters create own profile" on renters;
create policy "renters create own profile"
  on renters for insert
  to authenticated
  with check ( user_id = auth.uid() );

drop policy if exists "renters update own profile" on renters;
create policy "renters update own profile"
  on renters for update
  to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );


-- ------------------------------------------------------------
-- RENTAL_REQUESTS
-- Bookings. Renter creates, renter reads own, lender reads requests
-- against their pieces, admin reads all.
-- ------------------------------------------------------------
alter table rental_requests enable row level security;

drop policy if exists "renters create requests" on rental_requests;
create policy "renters create requests"
  on rental_requests for insert
  to authenticated
  with check ( renter_email = auth.jwt() ->> 'email' );

drop policy if exists "renters read own requests" on rental_requests;
create policy "renters read own requests"
  on rental_requests for select
  to authenticated
  using ( renter_email = auth.jwt() ->> 'email' );

drop policy if exists "lenders read requests for own pieces" on rental_requests;
create policy "lenders read requests for own pieces"
  on rental_requests for select
  to authenticated
  using ( lister_email = auth.jwt() ->> 'email' );

drop policy if exists "admin reads all requests" on rental_requests;
create policy "admin reads all requests"
  on rental_requests for select
  to authenticated
  using ( auth.jwt() ->> 'email' = 'wearfairies@outlook.com' );

drop policy if exists "admin updates any request" on rental_requests;
create policy "admin updates any request"
  on rental_requests for update
  to authenticated
  using ( auth.jwt() ->> 'email' = 'wearfairies@outlook.com' );

commit;

-- ============================================================
-- WHAT THIS DOES NOT FIX
--
-- The wardrobe still sends lender addresses to the browser for
-- approved listings — RLS controls which ROWS are visible, not
-- which COLUMNS. The wardrobe query was narrowed to public columns
-- already, which is what actually closed that. A database view
-- would enforce it properly at some point.
--
-- Ownership of listings hangs on lister_email matching the account
-- email, because listings have no user_id. If a lender ever changes
-- their account email, they lose access to their own listings.
-- Adding user_id and backfilling it is the real fix.
-- ============================================================
