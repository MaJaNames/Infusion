-- Выставляет счётчики номеров после заливки, чтобы новые записи получали следующий свободный 0x…
select setval('items_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from items),1), (select count(*) > 0 from items));
select setval('cards_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from cards),1), (select count(*) > 0 from cards));
select setval('skills_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from skills),1), (select count(*) > 0 from skills));
select setval('abilities_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from abilities),1), (select count(*) > 0 from abilities));
select setval('beasts_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from beasts),1), (select count(*) > 0 from beasts));
select setval('traits_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from traits),1), (select count(*) > 0 from traits));
select setval('essences_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from essences),1), (select count(*) > 0 from essences));
select setval('races_seq', greatest((select coalesce(max(('x' || lpad(substr(id,3),8,'0'))::bit(32)::int),0) from races),1), (select count(*) > 0 from races));
