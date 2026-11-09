-- Инфузия — схема Supabase. Выполнить целиком: Supabase → SQL Editor → New query → Run.
-- Идентификаторы везде вида 0x327: номер из последовательности в hex. Номера не повторяются, даже если запись удалили.

create function hex_id(seq regclass) returns text language sql volatile as
$$ select '0x' || lpad(to_hex(nextval(seq)), 3, '0') $$;

create sequence items_seq; create sequence cards_seq; create sequence skills_seq; create sequence abilities_seq;
create sequence beasts_seq; create sequence traits_seq; create sequence essences_seq; create sequence races_seq;

-- ===== Каталоги =====
-- Детали техники (Автомастерская) — это предметы с тегом 'Tr Mod'; тип детали и числа читает парсер на странице.
create table items (
  id text primary key default hex_id('items_seq'),
  tag text, name text not null, description text not null default '',
  cost integer not null default 0 check (cost >= 0),
  category text not null, rarity text not null,
  iconic boolean not null default false,
  organization text not null default 'Общедоступно',
  sell_price integer,                      -- пусто = 5% от cost
  issue text,                              -- пометка об ошибке оформления
  props jsonb not null default '{}',       -- любые новые свойства без изменения схемы
  updated_at timestamptz not null default now()
);
create table cards (
  id text primary key default hex_id('cards_seq'),
  tag text, name text not null, rarity text not null,
  classes text[] not null default '{}',    -- доступность по классам
  school text not null default '', essence text,
  params text not null default '', damage_type text, distance text,
  activation text[] not null default '{}', effects text[] not null default '{}',
  test text, mechanics text not null default '', amplify text[] not null default '{}',
  consumable boolean not null default false,
  kronos integer not null default 0, price_tali integer not null default 0,
  creation text not null default 'Базис', iconic boolean not null default false,
  props jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ===== Справочник правил =====
create table ranks (level integer primary key check (level between 1 and 10), name text not null, hp_base integer not null, kronos_max integer not null);
create table races (id text primary key default hex_id('races_seq'), name text not null, has_kronos boolean not null, implants_allowed boolean not null, description text not null default '');
create table classes (name text primary key);
create table stats (key text primary key, name text not null, max integer not null default 10);
create table skills (id text primary key default hex_id('skills_seq'), name text not null, stat text not null references stats(key), tier integer not null, rarity text, description text not null default '');
create table abilities (id text primary key default hex_id('abilities_seq'), name text not null, kind text not null check (kind in ('ability','mutation')), class_requirement text, description text not null default '');
create table beasts (id text primary key default hex_id('beasts_seq'), group_name text, name text not null, description text not null default '');
create table traits (id text primary key default hex_id('traits_seq'), name text not null, description text not null default '');
create table essences (id text primary key default hex_id('essences_seq'), name text not null, full_name text, description text not null default '');
create table slots (tag text primary key, grp text not null check (grp in ('gear','implant')), max_count integer not null);
create table implant_combos (name text primary key, uses jsonb not null, ich numeric not null, note text);
create table formulas (key text primary key, value jsonb not null);

-- Версия данных: приложение сравнивает её со своим кэшем и скачивает базу, только если она изменилась.
create table meta (key text primary key, value jsonb not null);
insert into meta values ('data_version', to_jsonb(now()));

-- ===== Администраторы =====
create table admins (user_id uuid primary key references auth.users(id) on delete cascade);
create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where user_id = auth.uid()) $$;

create function bump_version() returns trigger language plpgsql security definer set search_path = public as
$$ begin update meta set value = to_jsonb(now()) where key = 'data_version'; return null; end $$;
create function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
create trigger items_touch before update on items for each row execute function touch_updated_at();
create trigger cards_touch before update on cards for each row execute function touch_updated_at();

-- ===== Права: читать может любой, менять — только админ =====
do $$
declare t text;
begin
  foreach t in array array['items','cards','ranks','races','classes','stats','skills','abilities','beasts','traits','essences','slots','implant_combos','formulas','meta'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read %1$s" on %1$I for select to anon, authenticated using (true)', t);
    execute format('create policy "admin write %1$s" on %1$I for all to authenticated using (is_admin()) with check (is_admin())', t);
    if t <> 'meta' then
      execute format('create trigger bump_%1$s after insert or update or delete on %1$I for each statement execute function bump_version()', t);
    end if;
  end loop;
end $$;
alter table admins enable row level security;
create policy "see self" on admins for select to authenticated using (user_id = auth.uid());   -- записывать в admins можно только из SQL Editor

-- После первого входа на сайте по e-mail сделайте себя админом (SQL Editor):
--   insert into admins select id from auth.users where email = 'ваша@почта';
