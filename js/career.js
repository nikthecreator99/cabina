// Карьера: дата устройства на работу, история должностей и единовременное вознаграждение за преданность компании.
// Правила (со слов Никиты, по Положению ОАО «РЖД»): за 3 года непрерывного стажа — 2 месячных оклада,
// за 5 лет — 3, за 10 лет — 4, за 15 лет и далее каждые 5 лет — по 5 окладов.
// Право возникает в день, когда исполняется стаж; выплата — с зарплатой за первый месяц следующего квартала.
// Всё хранится только в этом телефоне (S.profile.career) и попадает в резервную копию вместе с профилем.
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, toast, confirmDialog, plural, uid, MONTHS, MONTHS_GEN, MONTHS_PREP } from './ui.js';
import { S, saveProfile, nowLocal } from './store.js';
import { fmtLocal } from './calc.js';
import { ROLES, NDFL, fmtRub } from './pay.js';

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
export function tenureText(t) {
  if (!t) return '';
  const parts = [];
  if (t.y) parts.push(`${t.y} ${plural(t.y, 'год', 'года', 'лет')}`);
  if (t.m) parts.push(`${t.m} ${plural(t.m, 'месяц', 'месяца', 'месяцев')}`);
  if (!t.y && !t.m) parts.push(`${t.d} ${plural(t.d, 'день', 'дня', 'дней')}`);
  return parts.join(' ');
}
export const daysBetween = (a, b) => Math.round((msOf(b) - msOf(a)) / 86400000);

// ---------------------------------------------------------------- данные
export const careerOf = (p = S.profile) => {
  const c = p.career && typeof p.career === 'object' ? p.career : {};
  return { hired: isDateKey(c.hired) ? c.hired : '', jobs: Array.isArray(c.jobs) ? c.jobs.filter((j) => j && isDateKey(j.from)) : [], dismissed: c.dismissed || '' };
};
export const jobTitle = (j) => (ROLES[j.role] || String(j.title || '').trim() || 'Должность');
const sortedJobs = (c) => [...c.jobs].sort((a, b) => b.from.localeCompare(a.from));
// Оклад из набора ставок по должности в профиле
export const myOklad = () => { const v = Number(S.settings.pay?.[S.profile.role]?.oklad); return Number.isFinite(v) && v > 0 ? v : 0; };

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
  const sub = `${r.salaries} ${plural(r.salaries, 'оклад', 'оклада', 'окладов')}${r.amount ? ` ≈ ${fmtRub(r.amount)}` : ''} · выплата в ${MONTHS_PREP[+r.payMonth.slice(5, 7) - 1]} ${r.payMonth.slice(0, 4)}`;
  return `<div class="loyal-banner" role="status"><button class="grow" data-act="go" data-page="career"><span class="ico">${I.medal}</span>
    <span class="txt"><b>${title}</b><small>${sub}</small></span></button>
    <button class="icon-btn" data-act="loyal-hide" aria-label="Скрыть напоминание">${small(I.x, 18)}</button></div>`;
}

// ---------------------------------------------------------------- экраны
export function renderProfileSettings() {
  const c = careerOf();
  const t = c.hired ? tenure(c.hired, todayKey()) : null;
  return `${pageHead('Настройка профиля', { back: true })}
    <div class="panel">
      <button class="row" data-act="go" data-page="profile-edit"><span class="ico" style="--c:var(--accent)">${I.user}</span><div class="grow"><div class="t1">Профиль</div><div class="t2">Фото, имя, должность, депо, приватность</div></div>${small(I.right, 18)}</button>
      <button class="row" data-act="go" data-page="career"><span class="ico" style="--c:var(--warn)">${I.briefcase}</span><div class="grow"><div class="t1">Карьера</div><div class="t2">${t ? `Стаж ${tenureText(t)}` : 'Дата устройства, должности, вознаграждение за преданность'}</div></div>${small(I.right, 18)}</button>
    </div>
    <div class="notice ok">${I.shield}<div><b>Эти данные хранятся только в этом телефоне</b> и никому не показываются.</div></div>`;
}

export function renderCareer() {
  const c = careerOf();
  const today = todayKey();
  const t = c.hired ? tenure(c.hired, today) : null;
  const oklad = myOklad();
  const jobs = sortedJobs(c);
  const ms = c.hired ? loyaltyMilestones(c.hired) : [];
  const next = c.hired ? nextLoyalty(c.hired, today) : null;
  const shown = ms.filter((x) => x.date <= today || (next && x.years <= next.years + 10)).slice(-8);
  const amount = (x) => (oklad ? ` · ≈ ${fmtRub(x.salaries * oklad)}` : '');
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
        ${oklad ? `<div class="r"><span class="grow">Начислят ≈</span><b>${fmtRub(next.salaries * oklad)}</b></div>
        <div class="r"><span class="grow">На руки ≈ (минус НДФЛ ${NDFL}%)</span><b>${fmtRub(Math.round(next.salaries * oklad * (1 - NDFL / 100)))}</b></div>` : ''}
      </div>
      ${oklad ? '' : `<button class="link-btn" data-act="career-oklad">${small(I.wallet, 16)} Указать оклад, чтобы посчитать сумму</button>`}
    </section>`;
  }
  return `${pageHead('Карьера', { back: true })}
    <div class="panel pay-panel">
      <div class="pay-field"><label for="cr-hired">Дата устройства на работу</label>
        <input type="date" class="input" id="cr-hired" value="${esc(c.hired)}" max="${today}">
        <div class="hint">Начало непрерывного стажа в компании. От неё считается вознаграждение за преданность.</div></div>
      ${t ? `<div class="pay-field"><div class="label">Непрерывный стаж</div><div class="career-tenure num">${tenureText(t)}</div></div>` : ''}
    </div>
    ${nextHtml}
    <div class="sec-head"><h2>Должности</h2></div>
    ${jobs.length ? `<div class="panel" id="cr-jobs">${jobs.map((j, i) => {
      const to = i > 0 ? jobs[i - 1].from : null;
      return `<button class="row" data-act="job-edit" data-id="${esc(j.id)}"><span class="ico" style="--c:${i === 0 ? 'var(--ok)' : 'var(--muted)'}">${I.briefcase}</span>
        <div class="grow"><div class="t1">${esc(jobTitle(j))}</div><div class="t2">с ${dateText(j.from)}${to ? ` по ${dateText(keyOf(msOf(to) - 86400000))}` : ' · сейчас'}</div></div>${small(I.edit, 18)}</button>`;
    }).join('')}</div>` : '<div class="hint">Добавьте должности, чтобы видеть свой путь: например, «Помощник машиниста» с одной даты и «Машинист» — с другой.</div>'}
    <button class="btn btn-ghost" data-act="job-add">${I.plus} Добавить должность</button>
    ${ms.length ? `<div class="sec-head"><h2>Вознаграждение за преданность</h2></div>
    <div class="panel loyal-list">${shown.map((x) => `<div class="row ${x.date <= today ? 'done' : ''}"><span class="ico" style="--c:${x.date <= today ? 'var(--ok)' : 'var(--warn)'}">${x.date <= today ? I.check : I.medal}</span>
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

// Сохранить карьеру. Если текущая (последняя) должность — помощник или машинист, должность в профиле меняется вместе с ней:
// от неё зависит набор тарифных ставок.
async function saveCareer(c) {
  const career = { hired: c.hired, jobs: c.jobs.map(({ id, role, title, from }) => ({ id, role, title, from })), dismissed: c.dismissed || '' };
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
  if (act === 'career-oklad') { ctx.go('tariffs'); return true; }
  if (act === 'loyal-hide') {
    const r = loyaltyReminder();
    if (r) { await saveProfile({ career: { ...careerOf(), dismissed: `${r.years}` } }); toast('Напоминание скрыто. Срок виден в «Карьере».'); }
    return true;
  }
  return false;
}

export async function careerChange(e) {
  const t = e.target;
  if (t.id !== 'cr-hired') return false;
  const v = t.value;
  if (v && (!isDateKey(v) || v > todayKey())) { toast('Дата устройства не может быть в будущем', { error: true }); t.value = careerOf().hired; return true; }
  await saveProfile({ career: { ...careerOf(), hired: v, dismissed: '' } });
  toast(v ? 'Дата устройства сохранена' : 'Дата устройства удалена');
  return true;
}
