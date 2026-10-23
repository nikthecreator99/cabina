// Закрепление состава на уклоне: сколько тормозных башмаков нужно и сколько ручных тормозных осей их заменят.
// Нормы — таблица III.4 «Правил технического обслуживания тормозного оборудования и управления тормозами
// железнодорожного подвижного состава» (Совет по железнодорожному транспорту СНГ, 2014): на каждые 100 тс веса.
// Расчёт справочный: закрепление выполняется по действующим инструкциям и ТРА станции.
import { I, esc, small, plural } from './ui.js';

// [уклон ‰, башмаков при нагрузке на ось ≥ 10 тс, башмаков при < 10 тс, ручных тормозных осей (null — не нормируется)]
export const FIX_TABLE = [
  [0, 0.2, 0.4, 0.4], [2, 0.2, 0.4, 0.4], [4, 0.2, 0.4, 0.4], [6, 0.2, 0.4, 0.4], [8, 0.2, 0.6, 0.6],
  [10, 0.3, 0.8, 0.8], [12, 0.4, 1.0, 1.0], [14, 0.4, 1.2, 1.2], [16, 0.5, 1.4, 1.4], [18, 0.6, 1.6, 1.6],
  [20, 0.6, 1.8, 1.8], [22, 0.7, 2.0, null], [24, 0.8, 2.2, null], [26, 0.8, 2.4, null], [28, 0.9, 2.6, null],
  [30, 1.0, 2.8, null], [32, 1.0, 3.0, null], [34, 1.1, 3.2, null], [36, 1.2, 3.4, null], [38, 1.2, 3.6, null],
  [40, 1.3, 3.8, null],
];
export const LOADED_AXLE = 10; // тс на ось: от 10 и больше — гружёный
// Один башмак заменяет 3 ручные тормозные оси при нагрузке на ось ≥ 10 тс и 1 ось при меньшей
export const AXES_PER_SHOE = { loaded: 3, empty: 1 };
export const AXES_PER_WAGON = 4;

// Целое «с запасом» вверх без ошибок округления дробей (5200 / 100 × 0,2 = 10,400000000000002 → 11, а 10 → 10)
const ceil = (v) => Math.ceil(Math.round(v * 1e6) / 1e6);

// weight — вес состава в тс, axles — число осей, shoes — башмаков на локомотиве, slope — уклон ‰ из таблицы
export function fixCalc({ weight, axles, shoes = 0, slope = 0 }) {
  const w = Number(weight); const a = Number(axles); const have = Math.max(0, Math.floor(Number(shoes) || 0));
  if (!(w > 0) || !(a > 0)) return null;
  const row = FIX_TABLE.find((r) => r[0] >= slope) || FIX_TABLE[FIX_TABLE.length - 1];
  const load = w / a;
  const loaded = load >= LOADED_AXLE;
  const k = loaded ? row[1] : row[2];
  const need = ceil(w / 100 * k);
  const deficit = Math.max(0, need - have);
  const eq = loaded ? AXES_PER_SHOE.loaded : AXES_PER_SHOE.empty;
  const extraAxes = deficit * eq;
  return {
    slope: row[0], load: Math.round(load * 100) / 100, loaded, k, need, have,
    lay: Math.min(need, have), deficit, eq, extraAxes, extraWagons: Math.ceil(extraAxes / AXES_PER_WAGON),
    axesK: row[3], axesNorm: row[3] == null ? null : ceil(w / 100 * row[3]),
  };
}

// ---------------------------------------------------------------- экран
export const fixState = { weight: '', axles: '', shoes: '', slope: 0 };
const numText = (v) => String(v).replace('.', ',');
const k1 = (v) => numText(v.toFixed(1));
const axesText = (n) => `${n} ${plural(n, 'ось', 'оси', 'осей')}`;
const parse = (s) => { const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.'); const n = Number(t); return t && Number.isFinite(n) && n >= 0 ? n : NaN; };

export function fixResultHtml() {
  const w = parse(fixState.weight); const a = parse(fixState.axles); const sh = fixState.shoes === '' ? 0 : parse(fixState.shoes);
  if (Number.isNaN(w) || Number.isNaN(a) || !(w > 0) || !(a > 0)) {
    return `<div class="fix-empty">${small(I.info, 18)} Впишите вес состава и количество осей — расчёт появится здесь.</div>`;
  }
  if (Number.isNaN(sh)) return `<div class="fix-empty">${small(I.info, 18)} Количество башмаков — целое число, например 4.</div>`;
  const r = fixCalc({ weight: w, axles: a, shoes: sh, slope: fixState.slope });
  const ok = r.deficit === 0;
  const kind = r.loaded ? `гружёный (≥ ${LOADED_AXLE} тс/ось)` : `порожний (< ${LOADED_AXLE} тс/ось)`;
  return `<section class="fix-res ${ok ? 'ok' : 'bad'}" aria-live="polite">
    <div class="fix-res-head">${ok ? I.check : I.alert}<b>${ok ? 'Башмаков на локомотиве достаточно' : `Не хватает башмаков: ${r.deficit}`}</b></div>
    <div class="fix-big"><span class="num">${r.need}</span><small>${ok ? `уложить башмаков` : `нужно башмаков, на локомотиве ${r.have}`}</small></div>
    <div class="rows">
      <div class="r"><span class="grow">Нагрузка на ось</span><b>${numText(r.load)} тс</b></div>
      <div class="r"><span class="grow">Состав</span><b>${kind}</b></div>
      <div class="r"><span class="grow">Норма башмаков на 100 тс при ${r.slope ? `уклоне ${r.slope}‰` : 'уклоне 0'}</span><b>${k1(r.k)}</b></div>
      <div class="r"><span class="grow">${numText(w)} / 100 × ${k1(r.k)} = ${numText(Math.round(w / 100 * r.k * 100) / 100)}, округляем вверх</span><b>${r.need}</b></div>
      ${ok ? '' : `<div class="r"><span class="grow">Заменить ${r.deficit} баш. ручными тормозами (1 баш. = ${r.eq} ${r.eq === 1 ? 'ось' : 'оси'})</span><b>${axesText(r.extraAxes)}</b></div>
      <div class="r"><span class="grow">Это примерно вагонов по ${AXES_PER_WAGON} оси</span><b>${r.extraWagons}</b></div>`}
      ${r.axesNorm != null ? `<div class="r"><span class="grow">Только ручными тормозами (${k1(r.axesK)} оси на 100 тс)</span><b>${axesText(r.axesNorm)}</b></div>` : '<div class="r"><span class="grow">Ручными тормозами при уклоне круче 20‰</span><b>не нормируется</b></div>'}
    </div></section>`;
}

const slopeBtns = () => FIX_TABLE.map(([s]) => `<button data-act="fix-slope" data-v="${s}" aria-pressed="${fixState.slope === s}">${s ? `${s}‰` : '0'}</button>`).join('');

export function renderFix() {
  const f = (id, label, unit, ph, hint = '') => `<div class="pay-field"><label for="fx-${id}">${label}</label>
    <div class="input-unit"><input class="input" id="fx-${id}" data-fix="${id}" inputmode="numeric" autocomplete="off" value="${esc(fixState[id])}" placeholder="${ph}"><span>${unit}</span></div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  return `<div class="page-head"><button class="icon-btn" data-act="extra-back" aria-label="Назад">${I.left}</button><h1>Закрепление состава</h1></div>
    <div class="panel pay-panel" id="fix-inputs">
      <div class="two">${f('weight', 'Вес состава', 'тс', '5200')}${f('axles', 'Осей в составе', 'ос.', '216')}</div>
      ${f('shoes', 'Башмаков на локомотиве', 'шт.', '0', 'Тормозные башмаки, которые есть у вас на локомотиве.')}
    </div>
    <div class="group-title">Уклон пути</div>
    <div class="fix-slopes" id="fix-slopes" role="group" aria-label="Уклон пути">${slopeBtns()}</div>
    <div class="hint">Если уклон между значениями — выбирайте большее.</div>
    <div id="fix-result">${fixResultHtml()}</div>
    <details class="panel fix-table"><summary>${small(I.grid, 18)} Таблица норм на 100 тс веса</summary>
      <table><thead><tr><th>Уклон</th><th>Баш.<br>≥10 тс/ось</th><th>Баш.<br>&lt;10 тс/ось</th><th>Ручн. тормоз. оси</th></tr></thead>
      <tbody>${FIX_TABLE.map(([s, a, b, c]) => `<tr><td>${s ? `${s}‰` : '0'}</td><td>${numText(a.toFixed(1))}</td><td>${numText(b.toFixed(1))}</td><td>${c == null ? '—' : numText(c.toFixed(1))}</td></tr>`).join('')}</tbody></table>
      <div class="hint">Таблица III.4 Правил технического обслуживания тормозного оборудования и управления тормозами (2014). Один башмак заменяет 3 ручные тормозные оси при нагрузке на ось 10 тс и больше и 1 ось при меньшей.</div>
    </details>
    <div class="notice">${I.alert}<div><b>Расчёт справочный.</b> Закрепляйте по действующим инструкциям, ТРА станции и указаниям ДСП или ДНЦ. Если цифры расходятся — верна инструкция.</div></div>`;
}

// Ввод и выбор уклона без перерисовки всего экрана, чтобы не сбивать набор
export function fixInput(t) {
  if (!t.dataset?.fix) return false;
  fixState[t.dataset.fix] = t.value;
  const box = document.getElementById('fix-result');
  if (box) box.innerHTML = fixResultHtml();
  return true;
}
export function fixSlope(b) {
  fixState.slope = +b.dataset.v;
  b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const box = document.getElementById('fix-result');
  if (box) box.innerHTML = fixResultHtml();
}
