-- Одноразовая миграция: ID записей 0x0c9 → 0x00c9 — минимум четыре hex-цифры.
-- Выполнить в Supabase → SQL Editor целиком, одной кнопкой Run.
--
-- Что делает:
--   1. Проверяет, что все ID ещё трёхзначные (защита от повторного запуска).
--   2. Дописывает ноль после «0x» во всех таблицах со своим id.
--   3. Меняет hex_id(), чтобы новые записи сразу получали четыре цифры.
--
-- Чего НЕ требует:
--   • внешних ключей на эти id нет, поэтому обычный UPDATE безопасен;
--   • последовательности (items_seq и т. д.) не трогаем: номера остаются те же;
--   • data_version обновят существующие триггеры bump_* — приложение само
--     перечитает таблицы.
-- Повторный запуск безопасен: проверка не найдёт трёхзначных ID и остановится
-- с сообщением, ничего не изменив.

begin;

-- 1. Страховка. Если запрос падает — миграция уже была или формат в базе другой.
do $$
declare
  t text;
  bad text;
begin
  foreach t in array array['items','cards','skills','abilities','beasts','traits','essences','races'] loop
    bad := null;
    execute format('select id from %I where id !~ ''^0x[0-9a-f]{3}$'' limit 1', t) into bad;
    if bad is not null then
      raise exception 'Таблица %: неожиданный ID «%». Ожидался вид 0x0c9 — миграция уже применена или ID другого формата.', t, bad;
    end if;
  end loop;
end $$;

-- 2. Дописываем ноль: '0x0' || substr(id, 3). Порядок и уникальность сохраняются,
--    потому что все старые ID одной длины.
update items     set id = '0x0' || substr(id, 3);
update cards     set id = '0x0' || substr(id, 3);
update skills    set id = '0x0' || substr(id, 3);
update abilities set id = '0x0' || substr(id, 3);
update beasts    set id = '0x0' || substr(id, 3);
update traits    set id = '0x0' || substr(id, 3);
update essences  set id = '0x0' || substr(id, 3);
update races     set id = '0x0' || substr(id, 3);

-- 3. Генератор для новых записей — тот же вид.
create or replace function hex_id(seq regclass) returns text language sql volatile as
$$ select '0x' || lpad(to_hex(nextval(seq)), 4, '0') $$;

commit;

-- Проверка после миграции: должно быть 0 строк и один пример нового ID.
select 'items' as tbl, count(*) filter (where id !~ '^0x[0-9a-f]{4}$') as wrong, min(id) as first_id from items
union all select 'cards',     count(*) filter (where id !~ '^0x[0-9a-f]{4}$'), min(id) from cards
union all select 'skills',    count(*) filter (where id !~ '^0x[0-9a-f]{4}$'), min(id) from skills
union all select 'abilities', count(*) filter (where id !~ '^0x[0-9a-f]{4}$'), min(id) from abilities
union all select 'beasts',    count(*) filter (where id !~ '^0x[0-9a-f]{4}$'), min(id) from beasts
union all select 'traits',    count(*) filter (where id !~ '^0x[0-9a-f]{4}$'), min(id) from traits
union all select 'essences',  count(*) filter (where id !~ '^0x[0-9a-f]{4}$'), min(id) from essences
union all select 'races',     count(*) filter (where id !~ '^0x[0-9a-f]{4}$'), min(id) from races
order by tbl;

-- Откат (если всё-таки понадобится): снять один ноль обратно.
--   update items set id = '0x' || substr(id, 5) where length(id) = 6;
--   …то же для остальных таблиц и вернуть hex_id() с lpad(..., 3, '0').
