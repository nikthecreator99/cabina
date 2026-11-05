// Карьера: дата устройства на работу, история должностей и единовременное вознаграждение за преданность компании.
// Правила (со слов Никиты, по Положению ОАО «РЖД»): за 3 года непрерывного стажа — 2 месячных оклада,
// за 5 лет — 3, за 10 лет — 4, за 15 лет и далее каждые 5 лет — по 5 окладов.
// Право возникает в день, когда исполняется стаж; выплата — с зарплатой за первый месяц следующего квартала.
// Прошлая работа (2.19.9, просьба Никиты: работал, уволился, через несколько лет вернулся на ЖД): периоды до перерыва
// с датами «с» и «по» входят в общий стаж на железной дороге; перерывы — нет. Вознаграждение — только от даты устройства.
// Всё хранится только в этом телефоне (S.profile.career) и попадает в резервную копию вместе с профилем.
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, toast, confirmDialog, plural, uid, MONTHS, MONTHS_GEN, MONTHS_PREP } from './ui.js';
import { S, saveProfile, saveSettings, nowLocal } from './store.js';
import { fmtLocal } from './calc.js';
import { ROLES, NDFL, fmtRub, paySet } from './pay.js';

export const LOYALTY_STEPS = [3, 5, 10, 15];
export const salariesFor = (years) => (years === 3 ? 2 : years === 5 ? 3 : years === 10 ? 4 : years >= 15 && years % 5 === 0 ? 5 : 0);
const REMIND_DAYS = 90; // напоминание на главной — за 90 дней до права и до конца месяца выплаты

const p2 = (n) => String(n).padStart(2, '0');
export const isDateKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const msOf = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
export const todayKey = () => fmtLocal(nowLocal()).slice(0, 10);
export const dateText = (k) => `${+k.slice(8, 10)} ${MONTHS_GEN[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
const monthText = (mk) => `${MONTHS[+mk.slice(5, 7) - 1].toLowerCase()} ${mk.slice(0, 4)}`;

// Годовщина: тот же день через N лет; 29 февраля в невисокосный год — 1 марта
export function anniversary(hired, years) {
  const y = +hired.slice(0, 4) + years; const m = +hired.slice(5, 7); const d = +hired.slice(8, 10);
  return keyOf(Date.UTC(y, m - 1, d));
}
// Месяц выплаты 'YYYY-MM': первый месяц квартала, следующего за кварталом даты права
export function payMonthOf(dateKey) {
  const y = +dateKey.slice(0, 4); const m = +dateKey.slice(5, 7);
  const q = Math.floor((m - 1) / 3); // 0..3
  return q === 3 ? `${y + 1}-01` : `${y}-${p2((q + 1) * 3 + 1)}`;
}
const monthEnd = (mk) => keyOf(Date.UTC(+mk.slice(0, 4), +mk.slice(5, 7), 0));

// Все выплаты до стажа maxYears: [{ years, date, payMonth, salaries }]
export function loyaltyMilestones(hired, maxYears = 50) {
  if (!isDateKey(hired)) return [];
  const out = [];
  for (let n = 3; n <= maxYears; n = n < 5 ? 5 : n + 5) out.push({ years: n, date: anniversary(hired, n), payMonth: payMonthOf(anniversary(hired, n)), salaries: salariesFor(n) });
  return out;
}
// Ближайшая выплата, которая ещё не прошла (до конца месяца выплаты включительно)
export function nextLoyalty(hired, today) {
  return loyaltyMilestones(hired).find((x) => monthEnd(x.payMonth) >= today) || null;
}

// Плюс n месяцев к дате; если такого числа нет (31 → февраль), берётся последний день месяца
export function addMonths(k, n) {
  const y = +k.slice(0, 4); const m = +k.slice(5, 7) - 1 + n; const d = +k.slice(8, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return keyOf(Date.UTC(y, m, Math.min(d, last)));
}

// Стаж между датами: { y, m, d }
export function tenure(fromKey, toKey) {
  if (!isDateKey(fromKey) || !isDateKey(toKey) || toKey < fromKey) return null;
  let months = (+toKey.slice(0, 4) - +fromKey.slice(0, 4)) * 12 + (+toKey.slice(5, 7) - +fromKey.slice(5, 7));
  if (addMonths(fromKey, months) > toKey) months -= 1;
  return { y: Math.floor(months / 12), m: months % 12, d: daysBetween(addMonths(fromKey, months), toKey) };
}
// short — «5 лет 1 мес.» (для карточки профиля, 2.22)
export function tenureText(t, { short = false } = {}) {
  if (!t) return '';
  const parts = [];
  if (t.y) parts.push(`${t.y} ${plural(t.y, 'год', 'года', 'лет')}`);
  if (t.m) parts.push(short ? `${t.m} мес.` : `${t.m} ${plural(t.m, 'месяц', 'месяца', 'месяцев')}`);
  if (!t.y && !t.m) parts.push(`${t.d} ${plural(t.d, 'день', 'дня', 'дней')}`);
  return parts.join(' ');
}
export const daysBetween = (a, b) => Math.round((msOf(b) - msOf(a)) / 86400000);
export const nextDayKey = (k) => keyOf(msOf(k) + 86400000);
export const prevDayKey = (k) => keyOf(msOf(k) - 86400000);

// Стаж за прошлую работу: обе даты включительно (последний рабочий день тоже считается)
export const periodTenure = (p) => tenure(p.from, nextDayKey(p.to));
// Сложить стаж нескольких периодов: дни → месяцы по 30, месяцы → годы по 12 (как при подсчёте трудового стажа)
export function addTenures(list) {
  let y = 0; let m = 0; let d = 0;
  for (const t of list) if (t) { y += t.y; m += t.m; d += t.d; }
  m += Math.floor(d / 30); d %= 30;
  y += Math.floor(m / 12); m %= 12;
  return { y, m, d };
}
// Весь стаж на железной дороге: прошлая работа + нынешняя (от даты устройства до сегодня); перерывы не входят
export function totalTenure(c, today = todayKey()) {
  const parts = c.past.map(periodTenure);
  if (c.hired) parts.push(tenure(c.hired, today));
  return parts.some(Boolean) ? addTenures(parts) : null;
}

// ---------------------------------------------------------------- данные
const text60 = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');
// Прошлая работа из хранилища или резервной копии — только понятные поля, «с» не позже «по», новые сверху
export const pastOf = (c) => (Array.isArray(c.past) ? c.past : [])
  .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && x.id && isDateKey(x.from) && isDateKey(x.to) && x.from <= x.to)
  .map((x) => ({ id: x.id.slice(0, 40), place: text60(x.place), role: ROLES[x.role] ? x.role : 'other', title: ROLES[x.role] ? '' : text60(x.title), from: x.from, to: x.to }))
  .sort((a, b) => b.from.localeCompare(a.from));
export const careerOf = (p = S.profile) => {
  const c = p.career && typeof p.career === 'object' ? p.career : {};
  return { hired: isDateKey(c.hired) ? c.hired : '', jobs: Array.isArray(c.jobs) ? c.jobs.filter((j) => j && isDateKey(j.from)) : [], past: pastOf(c), dismissed: c.dismissed || '' };
};
const pastRole = (x) => ROLES[x.role] || x.title || '';
// Прошлая работа, на которую приходится дата (для конца должности, начатой до перерыва)
const pastAt = (c, k) => c.past.find((x) => x.from <= k && k <= x.to) || null;
export const jobTitle = (j) => (ROLES[j.role] || String(j.title || '').trim() || 'Должность');
const sortedJobs = (c) => [...c.jobs].sort((a, b) => b.from.localeCompare(a.from));
// Оклад из набора ставок по должности в профиле
export const myOklad = () => { const v = Number(paySet(S.settings.pay, S.profile.role).oklad); return Number.isFinite(v) && v > 0 ? v : 0; };

// Напоминание для главной: ближайшая выплата за 90 дней до права и до конца месяца выплаты
export function loyaltyReminder(today = todayKey()) {
  const c = careerOf();
  if (!c.hired) return null;
  const x = nextLoyalty(c.hired, today);
  if (!x || c.dismissed === `${x.years}`) return null;
  const left = daysBetween(today, x.date);
  if (left > REMIND_DAYS) return null;
  const oklad = myOklad();
  return { ...x, left, earned: left <= 0, amount: oklad ? x.salaries * oklad : 0 };
}

export function reminderHtml(r) {
  const title = r.earned ? `${r.years} лет стажа — вознаграждение за преданность` : `Через ${r.left} ${plural(r.left, 'день', 'дня', 'дней')} — ${r.years} ${plural(r.years, 'год', 'года', 'лет')} стажа`;
  const sub = `${r.salaries} ${plural(r.salaries, 'оклад', 'оклада', 'окладов')}${r.amount ? ` <span class="money">≈ ${fmtRub(r.amount)}</span>` : ''} · выплата в ${MONTHS_PREP[+r.payMonth.slice(5, 7) - 1]} ${r.payMonth.slice(0, 4)}`;
  return `<div class="loyal-banner" role="status"><button class="grow" data-act="go" data-page="career"><span class="ico">${I.medal}</span>
    <span class="txt"><b>${title}</b><small>${sub}</small></span></button>
    <button class="icon-btn" data-act="loyal-hide" aria-label="Скрыть напоминание">${small(I.x, 18)}</button></div>`;
}

// ---------------------------------------------------------------- экраны
// Подпись строки «Карьера» в «Редактировать профиль» (с 2.19; до этого — в Настройках)
export function careerSub() {
  const t = totalTenure(careerOf());
  return t ? `Стаж ${tenureText(t)}` : 'Дата устройства, должности, вознаграждение за преданность';
}

export function renderCareer() {
  const c = careerOf();
  const today = todayKey();
  const t = c.hired ? tenure(c.hired, today) : null;
  const total = c.past.length ? totalTenure(c, today) : null;
  const oklad = myOklad();
  const jobs = sortedJobs(c);
  const ms = c.hired ? loyaltyMilestones(c.hired) : [];
  const next = c.hired ? nextLoyalty(c.hired, today) : null;
  const shown = ms.filter((x) => x.date <= today || (next && x.years <= next.years + 10)).slice(-8);
  const amount = (x) => (oklad ? ` · <span class="money">≈ ${fmtRub(x.salaries * oklad)}</span>` : '');
  let nextHtml = '';
  if (next) {
    const left = daysBetween(today, next.date);
    nextHtml = `<section class="loyal-next">
      <div class="eyebrow">Следующее вознаграждение за преданность</div>
      <div class="loyal-big"><b class="num">${next.years}</b><span>${plural(next.years, 'год', 'года', 'лет')} стажа</span></div>
      <div class="rows">
        <div class="r"><span class="grow">Право на выплату</span><b>${dateText(next.date)}</b></div>
        <div class="r"><span class="grow">${left > 0 ? 'Осталось' : 'Стаж исполнился'}</span><b>${left > 0 ? `${left} ${plural(left, 'день', 'дня', 'дней')}` : 'да'}</b></div>
        <div class="r"><span class="grow">Выплата с зарплатой за</span><b>${monthText(next.payMonth)}</b></div>
        <div class="r"><span class="grow">Размер</span><b>${next.salaries} ${plural(next.salaries, 'оклад', 'оклада', 'окладов')}</b></div>
        ${oklad ? `<div class="r"><span class="grow">Начислят ≈</span><b class="money">${fmtRub(next.salaries * oklad)}</b></div>
        <div class="r"><span class="grow">На руки ≈ (минус НДФЛ ${NDFL}%)</span><b class="money">${fmtRub(Math.round(next.salaries * oklad * (1 - NDFL / 100)))}</b></div>` : ''}
      </div>
      ${oklad ? '' : `<button class="link-btn" data-act="career-oklad">${small(I.wallet, 16)} Указать оклад, чтобы посчитать сумму</button>`}
    </section>`;
  }
  // 2.21 (просьба Никиты: «нелогично, непонятно»): сверху — итог (стаж), потом где и когда работали — нынешняя
  // и прошлая работа одним списком, потом должности, в конце — вознаграждение за преданность с окладом.
  const pastRows = c.past.map((x) => `<button class="row" data-act="past-edit" data-id="${esc(x.id)}"><span class="ico" style="--c:var(--muted)">${I.briefcase}</span>
        <div class="grow"><div class="t1">${esc(x.place || 'Место не указано')}</div><div class="t2">${pastRole(x) ? `${esc(pastRole(x))} · ` : ''}${tenureText(periodTenure(x))}</div><div class="t2">с ${dateText(x.from)} по ${dateText(x.to)}</div></div>${small(I.edit, 18)}</button>`).join('');
  const sum = t ? `<section class="panel career-sum" id="cr-sum">
      ${total ? `<div class="cs-row main"><span>Всего на железной дороге</span><b class="num" id="cr-total">${tenureText(total)}</b></div>` : ''}
      <div class="cs-row${total ? '' : ' main'}"><span>${total ? 'Непрерывный, на нынешней работе' : 'Непрерывный стаж'}</span><b class="num" id="cr-tenure">${tenureText(t)}</b></div>
      ${total ? '<div class="hint">«Всего» — нынешняя и прошлая работа, перерывы не считаются. От непрерывного стажа — вознаграждение за преданность.</div>' : ''}
    </section>` : `<div class="notice">${I.info}<div><b>Укажите дату устройства на работу</b> — посчитаем стаж и вознаграждение за преданность.</div></div>`;
  return `${pageHead('Карьера', { back: true })}
    ${sum}
    <div class="sec-head"><h2>Где и когда работали</h2></div>
    <div class="panel career-work">
      <div class="pay-field"><label for="cr-hired">${small(I.briefcase, 16)} Нынешняя работа — дата устройства</label>
        <input type="date" class="input" id="cr-hired" value="${esc(c.hired)}" max="${today}">
        <div class="hint">Если увольнялись и вернулись — дата последнего устройства, а прошлую работу добавьте ниже.</div></div>
      ${c.past.length ? `<div class="cw-head">Раньше</div><div id="cr-past">${pastRows}</div>` : ''}
      <button class="row add-row" data-act="past-add" id="cr-past-add"><span class="ico" style="--c:var(--accent)">${I.plus}</span>
        <div class="grow"><div class="t1">Добавить прошлую работу</div>${c.past.length ? '' : '<div class="t2">Работали на ЖД раньше, уволились и вернулись — эти годы войдут в общий стаж</div>'}</div></button>
    </div>
    <div class="sec-head"><h2>Должности</h2></div>
    <div class="panel">
      ${jobs.length ? `<div id="cr-jobs">${jobs.map((j, i) => {
      // должность заканчивается накануне следующей, а если начата на прошлой работе — не позже её окончания
      let end = i > 0 ? prevDayKey(jobs[i - 1].from) : '';
      const was = pastAt(c, j.from);
      if (was && (!end || was.to < end)) end = was.to;
      return `<button class="row" data-act="job-edit" data-id="${esc(j.id)}"><span class="ico" style="--c:${i === 0 && !end ? 'var(--ok)' : 'var(--muted)'}">${I.briefcase}</span>
        <div class="grow"><div class="t1">${esc(jobTitle(j))}</div><div class="t2">с ${dateText(j.from)}${end ? ` по ${dateText(end)}` : ' · сейчас'}</div></div>${small(I.edit, 18)}</button>`;
    }).join('')}</div>` : ''}
      <button class="row add-row" data-act="job-add"><span class="ico" style="--c:var(--accent)">${I.plus}</span>
        <div class="grow"><div class="t1">Добавить должность</div>${jobs.length ? '' : '<div class="t2">Например, «Помощник машиниста» с одной даты и «Машинист» — с другой</div>'}</div></button>
    </div>
    <div class="sec-head"><h2>Вознаграждение за преданность</h2></div>
    <div class="panel pay-panel">
      <div class="pay-field"><label for="cr-oklad">Оклад, ₽ в месяц</label>
        <div class="input-unit"><input class="input" id="cr-oklad" inputmode="decimal" autocomplete="off" value="${oklad ? esc(okladText(oklad)) : ''}" placeholder="Например, 48 000"><span>₽</span></div>
        <div class="hint">Нужен для расчёта вознаграждения за преданность.</div></div>
    </div>
    ${nextHtml}
    ${ms.length ? `<div class="panel loyal-list">${shown.map((x) => `<div class="row ${x.date <= today ? 'done' : ''}"><span class="ico" style="--c:${x.date <= today ? 'var(--ok)' : 'var(--warn)'}">${x.date <= today ? I.check : I.medal}</span>
      <div class="grow"><div class="t1">${x.years} ${plural(x.years, 'год', 'года', 'лет')} — ${x.salaries} ${plural(x.salaries, 'оклад', 'оклада', 'окладов')}${amount(x)}</div><div class="t2">право ${dateText(x.date)} · выплата: ${monthText(x.payMonth)}</div></div></div>`).join('')}</div>` : ''}
    <div class="notice">${I.info}<div><b>Расчёт ориентировочный.</b> За 3 года непрерывного стажа — 2 оклада, за 5 лет — 3, за 10 лет — 4, за 15 лет и дальше каждые 5 лет — 5 окладов. Выплата — с зарплатой за первый месяц следующего квартала. Сумма может быть больше при высокой эффективности и меньше при взысканиях. Итог — по вашему расчётному листку.</div></div>`;
}

// Должность: добавить или изменить
function openJobForm(id) {
  const c = careerOf();
  const job = id ? c.jobs.find((j) => j.id === id) : null;
  const st = { role: job ? (ROLES[job.role] ? job.role : 'other') : S.profile.role || 'assistant', title: job?.title || '', from: job?.from || '' };
  const opts = { ...ROLES, other: 'Другая' };
  const el = openLayer(sheet({
    title: job ? 'Должность' : 'Новая должность',
    body: `<div class="field"><div class="label">Должность</div><div class="seg" id="jf-role">${Object.entries(opts).map(([k, v]) => `<button type="button" data-role="${k}" aria-pressed="${st.role === k}">${v}</button>`).join('')}</div></div>
      <div class="field" id="jf-title-box" ${st.role === 'other' ? '' : 'hidden'}><label class="label" for="jf-title">Название</label><input class="input" id="jf-title" maxlength="60" placeholder="Например, слесарь" value="${esc(st.title)}"></div>
      <div class="field"><label class="label" for="jf-from">С какого числа</label><input type="date" class="input" id="jf-from" value="${esc(st.from)}" max="${todayKey()}"></div>
      <div class="hint">Дата вступления в должность. Предыдущая должность закончится накануне.</div>`,
    foot: `${job ? `<button class="btn btn-plain" data-act="jf-del">${small(I.trash, 18)} Удалить</button>` : ''}<button class="btn btn-primary" data-act="jf-save">Сохранить</button>`,
  }));
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.role) {
      st.role = b.dataset.role;
      el.querySelectorAll('#jf-role button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelector('#jf-title-box').hidden = st.role !== 'other';
      return;
    }
    if (b.dataset.act === 'jf-del') {
      if (await confirmDialog({ title: 'Вы действительно хотите удалить должность?', text: jobTitle(job), ok: 'Да', cancel: 'Нет' })) {
        await saveCareer({ ...c, jobs: c.jobs.filter((j) => j.id !== job.id) });
        closeLayer(el); toast('Должность удалена');
      }
      return;
    }
    if (b.dataset.act === 'jf-save') {
      const from = el.querySelector('#jf-from').value;
      const title = el.querySelector('#jf-title').value.trim().slice(0, 60);
      if (!isDateKey(from)) { toast('Укажите, с какого числа', { error: true }); return; }
      if (st.role === 'other' && !title) { toast('Впишите название должности', { error: true }); return; }
      const item = { id: job?.id || uid(), role: st.role === 'other' ? 'other' : st.role, title: st.role === 'other' ? title : '', from };
      const jobs = job ? c.jobs.map((j) => (j.id === job.id ? item : j)) : [...c.jobs, item];
      await saveCareer({ ...c, jobs });
      closeLayer(el);
      toast('Должность сохранена');
    }
  });
}

// Прошлая работа: добавить или изменить. Где, должность, с какого и по какое число (оба дня включительно).
function openPastForm(id) {
  const c = careerOf();
  const item = id ? c.past.find((x) => x.id === id) : null;
  if (id && !item) return;
  const st = { role: item ? item.role : S.profile.role || 'assistant' };
  const opts = { ...ROLES, other: 'Другая' };
  const today = todayKey();
  const max = c.hired ? prevDayKey(c.hired) : today; // до даты устройства на нынешнее место
  const el = openLayer(sheet({
    title: item ? 'Прошлая работа' : 'Новая прошлая работа',
    body: `<div class="field"><label class="label" for="pw-place">Где работали</label><input class="input" id="pw-place" maxlength="60" autocomplete="off" placeholder="Депо, город или станция" value="${esc(item?.place || '')}"></div>
      <div class="field"><div class="label">Должность</div><div class="seg" id="pw-role">${Object.entries(opts).map(([k, v]) => `<button type="button" data-role="${k}" aria-pressed="${st.role === k}">${v}</button>`).join('')}</div></div>
      <div class="field" id="pw-title-box" ${st.role === 'other' ? '' : 'hidden'}><label class="label" for="pw-title">Название</label><input class="input" id="pw-title" maxlength="60" placeholder="Например, слесарь" value="${esc(item?.title || '')}"></div>
      <div class="field"><label class="label" for="pw-from">С какого числа</label><input type="date" class="input" id="pw-from" value="${esc(item?.from || '')}" max="${max}"></div>
      <div class="field"><label class="label" for="pw-to">По какое число</label><input type="date" class="input" id="pw-to" value="${esc(item?.to || '')}" max="${max}"></div>
      <div class="hint" id="pw-len"></div>`,
    foot: `${item ? `<button class="btn btn-plain" data-act="pw-del">${small(I.trash, 18)} Удалить</button>` : ''}<button class="btn btn-primary" data-act="pw-save">Сохранить</button>`,
  }));
  const val = (sel) => el.querySelector(sel).value;
  // сколько стажа даёт этот период — сразу видно, правильно ли вписаны даты
  const showLen = () => {
    const from = val('#pw-from'); const to = val('#pw-to');
    el.querySelector('#pw-len').textContent = isDateKey(from) && isDateKey(to) && from <= to ? `Стаж за это время: ${tenureText(periodTenure({ from, to }))}` : '';
  };
  showLen();
  el.addEventListener('input', showLen);
  el.addEventListener('change', showLen);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.role) {
      st.role = b.dataset.role;
      el.querySelectorAll('#pw-role button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      el.querySelector('#pw-title-box').hidden = st.role !== 'other';
      return;
    }
    if (b.dataset.act === 'pw-del') {
      if (await confirmDialog({ title: 'Вы действительно хотите удалить прошлую работу?', text: item.place || `с ${dateText(item.from)} по ${dateText(item.to)}`, ok: 'Да', cancel: 'Нет' })) {
        const cur = careerOf();
        await saveCareer({ ...cur, past: cur.past.filter((x) => x.id !== item.id) });
        closeLayer(el); toast('Прошлая работа удалена');
      }
      return;
    }
    if (b.dataset.act !== 'pw-save') return;
    const cur = careerOf();
    const from = val('#pw-from'); const to = val('#pw-to');
    const err = pastError(cur, { id: item?.id, from, to }, todayKey());
    if (err) { toast(err, { error: true, ms: 4500 }); return; }
    const place = val('#pw-place').trim().slice(0, 60);
    const title = st.role === 'other' ? val('#pw-title').trim().slice(0, 60) : '';
    const next = { id: item?.id || uid(), place, role: st.role, title, from, to };
    const past = item ? cur.past.map((x) => (x.id === item.id ? next : x)) : [...cur.past, next];
    await saveCareer({ ...cur, past });
    closeLayer(el);
    toast('Прошлая работа сохранена');
  });
}

// Ошибка в датах прошлой работы (или null): обе даты, «с» не позже «по», не в будущем,
// раньше даты устройства на нынешнее место и без пересечений с другой прошлой работой
export function pastError(c, { id, from, to }, today) {
  if (!isDateKey(from)) return 'Укажите, с какого числа';
  if (!isDateKey(to)) return 'Укажите, по какое число';
  if (to < from) return 'Окончание работы раньше начала. Проверьте даты';
  if (to > today) return 'Окончание прошлой работы не может быть в будущем';
  if (c.hired && to >= c.hired) return `Прошлая работа должна закончиться раньше даты устройства — ${dateText(c.hired)}`;
  const other = c.past.find((x) => x.id !== id && x.from <= to && from <= x.to);
  if (other) return `Даты пересекаются с другой прошлой работой${other.place ? `: ${other.place}` : ''} (с ${dateText(other.from)} по ${dateText(other.to)})`;
  return null;
}

// Сохранить карьеру. Если текущая (последняя) должность — помощник или машинист, должность в профиле меняется вместе с ней:
// от неё зависит набор тарифных ставок.
async function saveCareer(c) {
  const career = { hired: c.hired, jobs: c.jobs.map(({ id, role, title, from }) => ({ id, role, title, from })),
    past: (c.past || []).map(({ id, place, role, title, from, to }) => ({ id, place, role, title, from, to })), dismissed: c.dismissed || '' };
  const patch = { career };
  const cur = sortedJobs(career).find((j) => j.from <= todayKey());
  if (cur && ROLES[cur.role] && cur.role !== S.profile.role) {
    patch.role = cur.role;
    setTimeout(() => toast(`Должность в профиле: ${ROLES[cur.role].toLowerCase()}`), 900);
  }
  await saveProfile(patch);
}

export async function careerClick(act, b, ctx) {
  if (act === 'job-add') { openJobForm(null); return true; }
  if (act === 'job-edit') { openJobForm(b.dataset.id); return true; }
  if (act === 'past-add') { openPastForm(null); return true; }
  if (act === 'past-edit') { openPastForm(b.dataset.id); return true; }
  if (act === 'career-oklad') { const f = document.getElementById('cr-oklad'); f?.scrollIntoView({ block: 'center', behavior: 'smooth' }); f?.focus(); return true; }
  if (act === 'loyal-hide') {
    const r = loyaltyReminder();
    if (r) { await saveProfile({ career: { ...careerOf(), dismissed: `${r.years}` } }); toast('Напоминание скрыто. Срок виден в «Карьере».'); }
    return true;
  }
  return false;
}

const okladText = (v) => String(v).replace('.', ',');

export async function careerChange(e) {
  const t = e.target;
  if (t.id === 'cr-oklad') {
    // оклад хранится в наборе ставок (один на человека, как и тарифная ставка)
    const raw = t.value.replace(/\s/g, '').replace(',', '.');
    const v = raw === '' ? '' : Number(raw);
    if (v !== '' && (!Number.isFinite(v) || v < 0 || v > 1000000)) { toast('Оклад — число в рублях, например 48000', { error: true }); return true; }
    const pay = { ...(S.settings.pay || {}) };
    pay.main = { ...paySet(pay, S.profile.role || 'assistant'), oklad: v === '' ? '' : Math.round(v * 100) / 100 };
    await saveSettings({ pay });
    toast(v === '' || v === 0 ? 'Оклад удалён' : 'Оклад сохранён');
    return true;
  }
  if (t.id !== 'cr-hired') return false;
  const v = t.value;
  if (v === careerOf().hired) return true; // не изменилась (повторное «change») — молча
  if (v && (!isDateKey(v) || v > todayKey())) { toast('Дата устройства не может быть в будущем', { error: true }); t.value = careerOf().hired; return true; }
  const lastTo = careerOf().past.reduce((m, x) => (x.to > m ? x.to : m), '');
  if (v && lastTo && v <= lastTo) { toast(`Дата устройства должна быть позже прошлой работы — она закончилась ${dateText(lastTo)}`, { error: true, ms: 4500 }); t.value = careerOf().hired; return true; }
  await saveProfile({ career: { ...careerOf(), hired: v, dismissed: '' } });
  toast(v ? 'Дата устройства сохранена' : 'Дата устройства удалена');
  return true;
}
