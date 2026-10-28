-- Orders keep their own copy of the price.
-- Catalog prices change during a sale, and an order must still show
-- what the customer paid. Refunds read this column, never the catalog.
-- The check constraint keeps negative totals out.
-- Discounts are stored as separate order lines.
create table orders (
  id bigint primary key,
  total_cents bigint not null check (total_cents >= 0)
);

comment on table orders is 'One row per checkout.
Totals are copied from the cart at payment time.
Refunds read this table, not the catalog.
Discounts are separate order lines.';
