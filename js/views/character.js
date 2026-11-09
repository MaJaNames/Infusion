import { esc, num, label, opts, set, fieldValue } from '../core/util.js';
import { derive, sellPrice, skillLimit } from '../character/derive.js';
import { itemRow, cardRow } from './databases.js';

const LIST = { skills: 'skills', pockets: 'items', repository: 'cards', equipment: 'own', implants: 'own' };
const OPEN = new Set(); // раскрытые описания навыков, чтобы состояние переживало перерисовку
const ov = (title, path, v) => `<label class="ov${v.overridden ? ' on' : ''}"><span>${title}</span><b class="${v.value < 0 ? 'bad' : ''}">${num(v.value)}</b>
  <input type="number" data-p="${path}" value="${v.overridden ? v.value : ''}" placeholder="авто ${num(v.auto)}"></label>`;
const datalist = (id, rows) => `<datalist id="dl-${id}">${rows.map(([text, rid]) => `<option value="${esc(text)}" data-id="${rid}">`).join('')}</datalist>`;
const adder = (kind, hint, disabled = false) => `<div class="add"><input list="dl-${LIST[kind]}" data-in="${kind}" placeholder="${hint}"${disabled ? ' disabled' : ''}><button data-add="${kind}"${disabled ? ' disabled' : ''}>Добавить</button></div>`;
const del = (kind, i) => `<button class="x" data-del="${kind}.${i}" title="Убрать">✕</button>`;
const missing = (kind, i, id) => `<div class="line miss">Записи ${esc(id)} больше нет в базе ${del(kind, i)}</div>`;
const slots = (rows) => `<div class="chips">${rows.map((s) => `<span class="lim ${s.status === 'ОК' ? 'o' : s.status === 'Занято' ? 'b' : s.status === 'Свободно' ? 'f' : 'x2'}">${esc(s.tag)} ${s.used}/${s.limit} · ${s.status}</span>`).join('')}</div>`;
const optionLabel = (it) => `${label(it)} · ${it.rarity} · ${it.id}`;

const skillRow = (s, d) => {
  const st = d.statMap.get(s.sk.stat);
  const shortage = s.sk.tier - s.have;
  return `<details class="line skill${s.available ? '' : ' badline'}" data-skill="${esc(s.sk.id)}"${OPEN.has(s.sk.id) ? ' open' : ''}>
    <summary><span class="grow"><b>${esc(s.sk.name)}</b> <span class="meta">${esc(st?.name || s.sk.stat)} ${s.sk.tier}${s.available ? '' : ` · не хватает ${shortage}`}</span></span>
      <span class="chip">щепки ${num(s.shards.value)}</span></summary>
    <div class="body"><p class="desc">${esc(s.sk.description || 'Описание пока не заполнено.')}</p>
      <div class="ctl"><label>Ур. <input type="number" min="0" data-p="skills.${s.i}.level" value="${s.level}"></label>
      <label>Щепки <input type="number" data-p="overrides.shards.${s.sk.id}" value="${s.shards.overridden ? s.shards.value : ''}" placeholder="${s.shards.auto}"></label>${del('skills', s.i)}</div></div>
  </details>`;
};

export function render(ctx) {
  const c = ctx.char, d = ctx.data, r = derive(c, d);
  const race = d.raceMap.get(c.race), trait = d.traitMap.get(c.trait);
  const own = c.pockets.map((e) => d.itemMap.get(e.id)).filter(Boolean);
  const stat = (s) => {
    const issue = r.statIssues[s.key];
    return `<label class="${issue ? 'stat-bad' : ''}"${issue ? ` title="Не хватает для навыков: ${esc(issue.skills.join(', '))}"` : ''}>${esc(s.name)}${issue ? ` <span class="bad">нужно ${issue.need}</span>` : ''}<input type="number" min="0" max="${s.max}" data-p="stats.${s.key}" value="${c.stats[s.key]}"${issue ? ' class="err"' : ''}></label>`;
  };
  const ab = Array.from({ length: 9 }, (_, i) => c.abilities[i] || null);
  const rankText = (x) => `${x.level} · ${x.name}`;
  const full = r.skillCount >= r.skillLimit;
  const issues = Object.entries(r.statIssues);

  const pocketRow = (e, i) => { const it = d.itemMap.get(e.id); if (!it) return missing('pockets', i, e.id); const sp = sellPrice(it, c);
    return itemRow(it, `<div class="ctl"><label>Кол-во <input type="number" min="1" data-p="pockets.${i}.qty" value="${e.qty}"></label>
      <label>Цена продажи <input type="number" data-p="overrides.sellPrice.${it.id}" value="${sp.overridden ? sp.value : ''}" placeholder="авто ${num(sp.auto)}"></label>${del('pockets', i)}</div>`); };
  const idRow = (kind) => (id, i) => { const it = d.itemMap.get(id); return it ? itemRow(it, `<div class="ctl">${del(kind, i)}</div>`) : missing(kind, i, id); };

  return `<section class="panel"><div class="grid">
    <label>Имя<input data-p="name" value="${esc(c.name)}"></label><label>Игрок<input data-p="player" value="${esc(c.player)}"></label>
    <label>Раса<select data-p="race">${opts(d.races, c.race)}</select></label>
    <label>Ранг<select data-p="rank" data-n="1">${opts(d.ranks, c.rank, rankText, (x) => x.level)}</select></label>
    <label>Класс<select data-p="class">${opts(d.classes, c.class, (x) => x.name, (x) => x.name)}</select></label>
    <label>Черта<select data-p="trait"><option value="">—</option>${opts(d.traits, c.trait)}</select></label>
    <label>Сущность<select data-p="essence"><option value="">—</option>${opts(d.essences, c.essence)}</select></label></div>
    ${race && !race.has_kronos ? `<p class="meta">${esc(race.name)}: Кроноса нет (справочно, расчёт не блокируется).</p>` : ''}
    ${trait ? `<p class="desc meta">${esc(trait.description)}</p>` : ''}</section>
  <section class="panel"><div class="grid">${ov('Свободные очки', 'overrides.freePoints', r.freePoints)}${ov('Макс. ОЗ', 'overrides.hpMax', r.hpMax)}${ov('Макс. Кронос', 'overrides.kronosMax', r.kronosMax)}</div></section>
  <section class="panel"><h2>Характеристики</h2><div class="grid">${d.stats.map(stat).join('')}</div></section>
  <section class="panel"><h2>Навыки</h2>
    <div class="chips"><span class="chip ${r.skillsOverLimit ? 'bad' : ''}">Навыки: ${r.skillCount} / ${r.skillLimit}</span><span class="chip">Щепки: ${num(r.shardsTotal)}</span><span class="chip">Лимит: 4 × ранг ${r.rankLevel}</span></div>
    ${issues.length ? `<p class="bad">Не хватает характеристик: ${issues.map(([k, v]) => `${esc(d.statMap.get(k)?.name || k)} (нужно ${v.need}, есть ${v.have})`).join('; ')}</p>` : ''}
    ${adder('skills', full ? `Лимит навыков: ${r.skillLimit}` : 'Найти навык…', full)}
    ${full ? `<p class="meta bad">Лимит навыков: ${r.skillLimit} (4 × ранг ${r.rankLevel}).</p>` : ''}
    ${r.skills.map((s) => skillRow(s, d)).join('') || '<p class="meta">Навыки не выбраны.</p>'}</section>
  <section class="panel"><h2>Способности и мутации</h2>${ab.map((id, i) => `<div class="line"><select class="grow" data-p="abilities.${i}"><option value="">Слот ${i + 1}: пусто</option>${opts(d.abilities, id, (a) => `${a.kind === 'mutation' ? 'Мутация' : 'Способность'}: ${a.name}${a.class_requirement ? ' (' + a.class_requirement + ')' : ''}`)}</select></div>
    ${id && d.abilityMap.get(id) ? `<p class="desc meta">${esc(d.abilityMap.get(id).description)}</p>` : ''}`).join('')}</section>
  <section class="panel"><h2>Карманы <span class="meta">позиций: ${c.pockets.length}</span></h2>${adder('pockets', 'Найти предмет…')}<div class="list">${c.pockets.map(pocketRow).join('')}</div></section>
  <section class="panel"><h2>Снаряжение</h2>${slots(r.gearSlots)}${adder('equipment', 'Выбрать из карманов…')}<div class="list">${c.equipment.map(idRow('equipment')).join('')}</div></section>
  <section class="panel"><h2>Импланты</h2>${slots(r.implantSlots)}${adder('implants', 'Выбрать из карманов…')}<div class="list">${c.implants.map(idRow('implants')).join('')}</div></section>
  <section class="panel"><h2>Репозиторий</h2>${adder('repository', 'Найти карту…')}<div class="list">${c.repository.map((e, i) => { const cd = d.cardMap.get(e.id); return cd ? cardRow(cd, `<div class="ctl"><label>Кол-во <input type="number" min="1" data-p="repository.${i}.qty" value="${e.qty}"></label>${del('repository', i)}</div>`) : missing('repository', i, e.id); }).join('')}</div></section>
  <section class="panel"><h2>Заметки</h2><textarea data-p="notes" rows="4" style="width:100%">${esc(c.notes)}</textarea></section>
  ${datalist('items', d.items.map((it) => [optionLabel(it), it.id]))}${datalist('cards', d.cards.map((x) => [`${label(x)} · ${x.rarity} · ${x.id}`, x.id]))}
  ${datalist('skills', d.skills.map((s) => [`${s.name} · ${d.statMap.get(s.stat)?.name} ${s.tier}`, s.id]))}${datalist('own', own.map((it) => [optionLabel(it), it.id]))}`;
}

export function bind(root, ctx) {
  const c = ctx.char, done = () => { ctx.save(); ctx.rerender(); };
  root.onchange = (e) => { if (e.target.dataset.p) { set(c, e.target.dataset.p, fieldValue(e.target)); done(); } };
  root.onclick = (e) => {
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-del]');
    if (rm) { const [kind, i] = rm.dataset.del.split('.'); c[kind].splice(Number(i), 1); done(); }
    if (!add) return;
    const kind = add.dataset.add, input = root.querySelector(`[data-in="${kind}"]`);
    const o = root.querySelector(`#dl-${LIST[kind]} option[value="${CSS.escape(input.value)}"]`);
    if (!o) { input.classList.add('err'); return; }
    const id = o.dataset.id;
    if (kind === 'skills') {
      if (c.skills.length >= skillLimit(c, ctx.data)) { input.classList.add('err'); return; }
      c.skills.push({ id, level: 5 });
    }
    else if (kind === 'pockets' || kind === 'repository') { const e2 = c[kind].find((x) => x.id === id); if (e2) e2.qty++; else c[kind].push({ id, qty: 1 }); }
    else c[kind].push(id);
    done();
  };
  if (!root._skillToggle) {
    root._skillToggle = (e) => {
      const det = e.target.closest?.('details.skill');
      if (!det) return;
      if (det.open) OPEN.add(det.dataset.skill); else OPEN.delete(det.dataset.skill);
    };
    root.addEventListener('toggle', root._skillToggle, true);
  }
}
