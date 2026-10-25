// Напоминание о медкомиссии. Медкомиссию проходят раз в год (по умолчанию; можно раз в полгода или раз в 2 года).
// Когда человек добавляет отвлечение «Медкомиссия», значит, он её прошёл: предлагаем напомнить о следующей
// за 2 недели до срока. Срок считается от последней медкомиссии в отвлечениях. Храним только даты и выбор
// человека (S.settings.med) — никаких результатов и медицинских подробностей; всё только в этом телефоне.
import { I, small, toast, confirmDialog, plural } from './ui.js';
import { S, saveSettings } from './store.js';
import { todayKey, dateText, addMonths, daysBetween } from './career.js';

export const MED_PERIODS = [[6, 'Раз в полгода'], [12, 'Раз в год'], [24, 'Раз в 2 года']];
export const MED_REMIND_DAYS = 14;

export const medCfg = () => {
  const c = { on: false, months: 12, dismissed: null, ...(S.settings.med || {}) };
  if (!MED_PERIODS.some(([m]) => m === c.months)) c.months = 12;
  return c;
};

// Последняя пройденная медкомиссия — дата окончания самого позднего отвлечения «Медкомиссия»
export function lastMedical(absences = S.absences) {
  return absences.filter((a) => a.type === 'medical' && a.end).map((a) => a.end).sort().pop() || null;
}
export const medDue = (last, months = 12) => (last ? addMonths(last, months) : null);

// Для главной: за 14 дней до срока и после него, пока не добавлена новая медкомиссия или напоминание не скрыто
export function medReminder(today = todayKey(), absences = S.absences, cfg = medCfg()) {
  if (!cfg.on) return null;
  const last = lastMedical(absences);
  const due = medDue(last, cfg.months);
  if (!due || cfg.dismissed === due) return null;
  const left = daysBetween(today, due);
  if (left > MED_REMIND_DAYS) return null;
  return { last, due, left };
}

export function medBannerHtml(r) {
  const title = r.left > 0 ? `Медкомиссия через ${r.left} ${plural(r.left, 'день', 'дня', 'дней')}`
    : r.left === 0 ? 'Медкомиссия — срок сегодня' : 'Пора пройти медкомиссию';
  const sub = `${r.left < 0 ? 'Срок был' : 'Срок'} ${dateText(r.due)} · прошлая ${dateText(r.last)}`;
  return `<div class="loyal-banner med-banner" role="status"><button class="grow" data-act="med-add" aria-label="${title}. Добавить пройденную медкомиссию"><span class="ico">${I.medical}</span>
    <span class="txt"><b>${title}</b><small>${sub}</small></span></button>
    <button class="icon-btn" data-act="med-hide" aria-label="Скрыть напоминание о медкомиссии">${small(I.x, 18)}</button></div>`;
}

// После сохранения новой медкомиссии: предложить напомнить о следующей (или сказать, когда напомним)
export async function offerMedReminder() {
  const cfg = medCfg();
  const due = medDue(lastMedical(), cfg.months);
  if (!due) return;
  const at = keyMinusDays(due, MED_REMIND_DAYS);
  const soon = at <= todayKey();
  if (cfg.on) { toast(soon ? 'Срок следующей медкомиссии близко — напоминание на главном экране' : `Напомним о следующей медкомиссии ${dateText(at)}`); return; }
  const ok = await confirmDialog({
    title: 'Напомнить о следующей медкомиссии?',
    text: `Следующая — до ${dateText(due)}. ${soon ? 'Срок уже близко, напоминание появится на главном экране сразу.' : `Напомним на главном экране за 2 недели, ${dateText(at)}.`} Изменить или выключить можно в самой медкомиссии в «Отвлечениях».`,
    ok: 'Да, напомнить', cancel: 'Не нужно',
  });
  if (!ok) return;
  await saveSettings({ med: { ...cfg, on: true, dismissed: null } });
  toast('Напоминание включено');
}

export async function medClick(act, b, ctx) {
  if (act === 'med-hide') {
    const r = medReminder();
    if (r) { await saveSettings({ med: { ...medCfg(), dismissed: r.due } }); toast('Напоминание скрыто до следующей медкомиссии'); }
    return true;
  }
  if (act === 'med-toggle') {
    const cfg = medCfg();
    await saveSettings({ med: { ...cfg, on: !cfg.on, dismissed: null } });
    toast(cfg.on ? 'Напоминание о медкомиссии выключено' : 'Напоминание о медкомиссии включено');
    return true;
  }
  if (act === 'med-add') { ctx.openAbsenceForm(null, { type: 'medical' }); return true; }
  return false;
}
export async function medChange(e) {
  if (e.target.id !== 'med-period') return false;
  await saveSettings({ med: { ...medCfg(), months: +e.target.value, dismissed: null } });
  toast('Периодичность сохранена');
  return true;
}

// Блок в форме отвлечения «Медкомиссия» (2.5; раньше был в «Настройках»). end — дата окончания этой медкомиссии.
export function medFormHtml(end) {
  const cfg = medCfg();
  const last = [lastMedical(), end].filter(Boolean).sort().pop();
  const due = medDue(last, cfg.months);
  const sub = cfg.on ? `Напомним на главном экране за 2 недели${due ? ` · следующая до ${dateText(due)}` : ''}`
    : 'На главном экране за 2 недели до срока';
  return `<div class="switch-row"><div class="grow"><div style="font-weight:700">Напомнить о следующей</div><div class="hint">${sub}</div></div>
      <button type="button" class="switch" role="switch" id="med-on" aria-checked="${cfg.on}" aria-label="Напомнить о следующей медкомиссии" data-act="med-toggle"></button></div>
    <div class="row-field"><label class="hint" for="med-period">Как часто проходите</label>
      <select class="input" id="med-period" style="width:auto">${MED_PERIODS.map(([m, l]) => `<option value="${m}" ${cfg.months === m ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
}

function keyMinusDays(k, n) { return new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) - n)).toISOString().slice(0, 10); }
