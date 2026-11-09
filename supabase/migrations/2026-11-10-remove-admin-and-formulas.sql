-- Одноразовая миграция существующей базы: убирает административную модель и константы правил.
-- Выполнить в Supabase → SQL Editor. После миграции запись в таблицы — только через service_role
-- (GitHub Actions / SQL Editor); anon и authenticated оставляют только чтение.

-- Политики is_admin() и сама функция больше не нужны.
drop function if exists is_admin() cascade;

-- Таблица администраторов и таблица формул (жёсткие константы) удаляются.
drop table if exists admins cascade;
drop table if exists formulas cascade;

-- На всякий случай убираем оставшиеся политики записи, если они были созданы вручную.
do $$
declare t text;
begin
  foreach t in array array['items','cards','ranks','races','classes','stats','skills','abilities','beasts','traits','essences','slots','implant_combos','meta'] loop
    execute format('drop policy if exists "admin write %1$s" on %1$I', t);
  end loop;
end $$;
