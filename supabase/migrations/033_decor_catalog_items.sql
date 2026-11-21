-- Table-setting catalog items (plates, cutlery, glassware, candles, flowers).
--
-- ALREADY APPLIED to the live project on 21 Nov 2026 — kept here for history only,
-- do not re-run. Items are shared master rows (venue_id / rental_company_id null),
-- like tables and chairs; who owns how many comes from catalog_item_stock.
-- `scope` says how a table-setting quantity multiplies: per_seat x chairs at the
-- table, or per_table counted once. Flors Amelia and Sensacions are temporary
-- stand-ins for the florist and caterer (rental_companies is the only supplier
-- type that has stock and manager logins today).

insert into rental_companies (name) values ('Flors Amelia'), ('Sensacions');

alter table catalog_items
  add column scope text check (scope in ('per_seat','per_table'));

update catalog_items set scope='per_table'
  where name in ('Centrepiece (Low)','Centrepiece (Tall)','Single Candle');

insert into catalog_items (name, category, owner_type, width_cm, depth_cm, height_cm, scope) values
 ('Dinner Plate','plates','rental',27,27,2,'per_seat'),
 ('Side Plate','plates','rental',18,18,2,'per_seat'),
 ('Charger Plate','plates','rental',33,33,2,'per_seat'),
 ('Dessert Plate','plates','rental',20,20,2,'per_seat'),
 ('Dinner Fork','cutlery','rental',20,3,2,'per_seat'),
 ('Dinner Knife','cutlery','rental',23,3,2,'per_seat'),
 ('Dessert Spoon','cutlery','rental',18,4,2,'per_seat'),
 ('Water Glass','glassware','rental',8,8,12,'per_seat'),
 ('Red Wine Glass','glassware','rental',9,9,20,'per_seat'),
 ('White Wine Glass','glassware','rental',8,8,19,'per_seat'),
 ('Champagne Flute','glassware','rental',7,7,22,'per_seat'),
 ('Tealight','candles','rental',4,4,3,'per_table'),
 ('Pillar Candle','candles','rental',7,7,15,'per_table'),
 ('Taper Candle','candles','rental',10,10,30,'per_table'),
 ('Bud Vase','flowers','rental',8,8,20,'per_table'),
 ('Floral Table Runner','flowers','rental',150,30,10,'per_table');
