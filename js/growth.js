// «Статистика роста» для администратора (2.32.2, просьба Никиты 14.11.2026): Настройки аккаунта → «Статистика».
// Месяц, квартал, год или всё время; сравнение с прошлым периодом; графики; выгрузка в PDF (собирается в телефоне).
// Только числа с нашего сервера (admin_growth): почты, имён и id людей здесь нет. Видит только роль admin — проверяет сервер.
import { I, esc, pageHead, plural, toast } from './ui.js';
import { adminGrowth } from './auth.js';
import { GROWTH_PERIODS, growthRange, growthModel, shiftPeriod, cleanGrowth, spanText, PLATFORM_NAMES, num } from './growth-data.js';

const G = { period: 'month', y: 0, m: 0, key: '', data: null, loading: false, err: '', seq: 0 };
let ctxRef = null;

export const growthState = () => G;
const todayMsk = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const range = () => growthRange(G.period, G.y, G.m, G.data?.today || todayMsk());

// Первый показ: данные уже пришли (их получила кнопка «Статистика»), дальше — по смене периода
export function growthEnter(first, ctx) {
  ctxRef = ctx;
  const t = first?.today || todayMsk();
  G.period = 'month'; G.y = +t.slice(0, 4); G.m = +t.slice(5, 7); G.err = '';
  G.data = first || null; G.key = first ? keyOf() : '';
  if (!first) loadGrowth();
}
const keyOf = () => `${G.period}|${G.y}|${G.m}`;
export function growthArgs(r) {
  return { p_from: r.from, p_to: r.to, p_prev_from: r.period === 'all' || r.future ? null : r.prevFrom, p_prev_to: r.period === 'all' || r.future ? null : r.prevTo };
}
export async function loadGrowth() {
  const seq = ++G.seq;
  G.loading = true; G.err = '';
  ctxRef?.rerender();
  const r = await adminGrowth(growthArgs(range()));
  if (seq !== G.seq) return;
  G.loading = false;
  if (r.ok) { G.data = cleanGrowth(r.data); G.key = keyOf(); } else G.err = r.error;
  ctxRef?.rerender();
}

// ---------------------------------------------------------------- маленькие части
const fmtN = (v) => (v == null ? '—' : String(Math.round(num(v) * 10) / 10).replace('.', ','));
const fmtD = (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtN(Math.abs(d))}`;
function deltaChip(t, r) {
  if (!t.dl) return '';
  const { d, pct } = t.dl;
  const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
  const good = d === 0 ? 'flat' : (d > 0) !== t.bad ? 'good' : 'bad';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '=';
  return `<span class="gr-d ${good}" title="Сравнение: ${esc(r.prevText)} — ${fmtN(t.p)}">${arrow} ${d === 0 ? 'так же' : fmtD(d)}${pct != null && d !== 0 ? ` · ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%` : ''}</span>`;
}
function tileHtml(t, r) {
  return `<div class="gr-tile" data-k="${t.key}"><b class="num">${fmtN(t.v)}</b><span class="gr-tl">${esc(t.label)}</span>${deltaChip(t, r)}${t.dl ? `<span class="gr-was">было ${fmtN(t.p)}</span>` : ''}</div>`;
}

// График: столбцы или линия; прошлый период — пунктиром по тем же местам. Нажатие на столбец — подсказка (statsTap в stats.js).
export function chartHtml({ id, buckets, cur, prev, kind = 'bar', fmt = fmtN, prevName = 'прошлый период' }) {
  const n = buckets.length || 1;
  const vals = [...cur, ...(prev || [])].filter((v) => v != null);
  const max = Math.max(1, ...vals);
  const W = 320; const H = 150; const top = 16; const base = H - 20;
  const bw = W / n;
  const y = (v) => base - (v / max) * (base - top);
  const step = Math.ceil(n / 8);
  const cx = (i) => i * bw + bw / 2;
  let body = '';
  if (kind === 'bar') {
    body += cur.map((v, i) => {
      const h = v > 0 ? Math.max(3, base - y(v)) : 0; const w = Math.min(36, Math.max(2, bw - (n > 20 ? 2 : 6))); const bx = cx(i) - w / 2;
      const r = Math.min(3, w / 2, h);
      return h ? `<path class="gr-bar" d="M${bx} ${base}V${base - h + r}Q${bx} ${base - h} ${bx + r} ${base - h}H${bx + w - r}Q${bx + w} ${base - h} ${bx + w} ${base - h + r}V${base}Z"/>` : '';
    }).join('');
  } else {
    const pts = cur.map((v, i) => (v == null ? null : [cx(i), y(v)]));
    const segs = []; let s = [];
    for (const p of pts) { if (p) s.push(p); else if (s.length) { segs.push(s); s = []; } }
    if (s.length) segs.push(s);
    for (const g of segs) {
      const d = g.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join('');
      body += `<path class="gr-area" d="${d}L${g[g.length - 1][0].toFixed(1)} ${base}L${g[0][0].toFixed(1)} ${base}Z"/><path class="gr-line" d="${d}"/>`;
      if (g.length === 1) body += `<circle class="gr-dot" cx="${g[0][0].toFixed(1)}" cy="${g[0][1].toFixed(1)}" r="3.5"/>`;
    }
  }
  if (prev && prev.some((v) => v != null)) {
    const pts = prev.slice(0, n).map((v, i) => (v == null ? null : `${cx(i).toFixed(1)} ${y(v).toFixed(1)}`)).filter(Boolean);
    if (pts.length > 1) body += `<path class="gr-prev" d="M${pts.join('L')}"/>`;
    else if (pts.length === 1) body += `<circle class="gr-prev-dot" cx="${pts[0].split(' ')[0]}" cy="${pts[0].split(' ')[1]}" r="3"/>`;
  }
  const hits = buckets.map((b, i) => `<g class="bar-g" data-bar="${i}"><rect class="bar-hit" x="${(i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}"/>${i % step === 0 ? `<text class="bar-x" x="${cx(i).toFixed(1)}" y="${H - 5}">${esc(b.label)}</text>` : ''}</g>`).join('');
  const tips = buckets.map((b, i) => `${b.full}: ${fmt(cur[i])}${prev && i < prev.length ? ` · ${prevName}: ${fmt(prev[i])}` : ''}`);
  return `<figure class="chart gr-chart" id="${id}" data-tips='${esc(JSON.stringify(tips))}'>
    <div class="chart-tip" aria-live="polite">Нажмите на график, чтобы увидеть число</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(buckets.map((b, i) => `${b.full} ${fmt(cur[i])}`).join(', '))}">
      <line class="bar-base" x1="0" x2="${W}" y1="${base}" y2="${base}"/><text class="gr-max" x="0" y="10">${esc(fmt(max))}</text>${body}${hits}</svg>
    ${prev ? `<figcaption><span class="gr-lg-cur ${kind}"></span> этот период <span class="gr-lg-prev"></span> ${esc(prevName)}</figcaption>` : ''}</figure>`;
}

function meter(label, x, px, prevText) {
  if (!x) return `<div class="gr-ret"><div class="gr-ret-top"><span>${esc(label)}</span><b>—</b></div><div class="hint">Пока рано: никому из зарегистрировавшихся ещё не исполнилось столько дней</div></div>`;
  const d = px ? x.pct - px.pct : null;
  return `<div class="gr-ret"><div class="gr-ret-top"><span>${esc(label)}</span><b class="num">${x.pct}%</b></div>
    <div class="bar"><i style="width:${Math.max(2, x.pct)}%"></i></div>
    <div class="t2">${x.back} из ${x.age} ${plural(x.age, 'человека', 'человек', 'человек')}${px ? ` · ${esc(prevText)}: ${px.pct}% <span class="gr-d ${d > 0 ? 'good' : d < 0 ? 'bad' : 'flat'}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${d === 0 ? 'так же' : `${Math.abs(d)} п.`}</span>` : ''}</div></div>`;
}
function hbars(rows, total) {
  return rows.map(([label, v]) => `<div class="gr-hb"><div class="gr-hb-top"><span class="grow">${esc(label)}</span><b class="num">${fmtN(v)}</b><span class="t2">${total ? `${Math.round((v / total) * 100)}%` : ''}</span></div><div class="gr-hb-bar"><i style="width:${total ? Math.max(v ? 2 : 0, Math.round((v / total) * 100)) : 0}%"></i></div></div>`).join('');
}

// ---------------------------------------------------------------- экран
export function renderGrowth() {
  const r = range();
  const t = G.data?.today || todayMsk();
  const nx = shiftPeriod(G.period, G.y, G.m, 1);
  const atEnd = G.period !== 'all' && growthRange(G.period, nx.y, nx.m, t).future;
  const head = `${pageHead('Статистика роста', { back: true })}
    <div class="seg" id="gr-period">${Object.entries(GROWTH_PERIODS).map(([k, v]) => `<button data-act="gr-period" data-v="${k}" aria-pressed="${G.period === k}">${v}</button>`).join('')}</div>
    ${G.period === 'all' ? '' : `<div class="period-switch"><button class="icon-btn" data-act="gr-prev" aria-label="Предыдущий период">${I.left}</button><div class="period-title" aria-live="polite">${esc(r.title)}</div><button class="icon-btn" data-act="gr-next" aria-label="Следующий период"${atEnd ? ' disabled' : ''}>${I.right}</button></div>`}`;
  if (G.err && G.key !== keyOf()) return `${head}<div class="notice">${I.alert}<div>${esc(G.err)}</div></div><button class="btn btn-ghost" data-act="gr-retry">Повторить</button>`;
  if (!G.data || G.key !== keyOf()) return `${head}<div class="gr-loading" aria-busy="true">Загружаю числа…</div>`;
  const d = G.data;
  const M = growthModel(d, { ...r, from: r.from || d.firstDay });
  const span = r.period === 'all' ? `с ${spanText(M.from, M.from)} по сегодня` : spanText(M.from, M.to);
  const cmp = M.hasPrev ? `Сравнение: ${esc(r.prevText)}${r.partial ? ' — столько же дней от начала' : ''}` : r.period === 'all' ? 'За всё время — без сравнения' : 'Прошлого периода для сравнения нет';
  return `${head}
    <div class="gr-span"><b>${esc(span)}</b><span>${cmp}</span></div>
    <div class="gr-hero">
      <div><b class="num">${fmtN(d.now.total)}</b><span>${plural(d.now.total, 'аккаунт', 'аккаунта', 'аккаунтов')} сейчас</span></div>
      <div class="gr-hero-sub"><span><b class="num">${fmtN(d.now.active_1)}</b> сегодня</span><span><b class="num">${fmtN(d.now.active_7)}</b> за 7 дней</span><span><b class="num">${fmtN(d.now.active_30)}</b> за 30 дней</span></div>
    </div>
    <div class="group-title">За период</div>
    <div class="gr-tiles" id="gr-tiles">${M.tiles.map((x) => tileHtml(x, r)).join('')}</div>
    <div class="group-title">Регистрации</div>
    <div class="panel gr-pad">${chartHtml({ id: 'gr-ch-signup', buckets: M.buckets, cur: M.signups.cur, prev: M.signups.prev, prevName: r.prevText })}</div>
    <div class="group-title">Заходят в день, в среднем</div>
    <div class="panel gr-pad">${M.active.any ? chartHtml({ id: 'gr-ch-active', buckets: M.buckets, cur: M.active.cur, prev: M.active.prev, kind: 'line', prevName: r.prevText }) : ''}
      ${M.sinceLate || !M.active.any ? `<div class="hint">Заходы по дням сервер считает с ${esc(spanText(d.since || d.today, d.since || d.today))}: раньше этого дня чисел нет.</div>` : ''}</div>
    <div class="group-title">Всего аккаунтов</div>
    <div class="panel gr-pad">${chartHtml({ id: 'gr-ch-total', buckets: M.buckets, cur: M.total, kind: 'line' })}
      <div class="hint">Сколько было к концу каждого отрезка — из тех, кто не удалил аккаунт.</div></div>
    <div class="group-title">Остаются</div>
    <div class="panel gr-pad" id="gr-ret">
      <div class="t2">Из ${M.ret.n} ${plural(M.ret.n, 'зарегистрировавшегося', 'зарегистрировавшихся', 'зарегистрировавшихся')} за период</div>
      ${meter('Заходят и через неделю', M.ret.w, M.ret.pw, r.prevText)}
      ${meter('Заходят и через месяц', M.ret.m, M.ret.pm, r.prevText)}
      <div class="hint">Примерно: сервер помнит только день регистрации и день последнего захода. Даты каждого захода мы не храним — это лишние данные о людях.</div>
    </div>
    <div class="group-title">Чем пользуются сейчас</div>
    <div class="panel gr-pad" id="gr-usage">${hbars(M.usage.map((u) => [u.label, u.v]), d.now.total)}
      <div class="gr-mini"><span>Пар «коллеги»: <b class="num">${fmtN(d.now.links)}</b></span><span>Групп: <b class="num">${fmtN(d.now.groups)}</b></span></div></div>
    ${Object.keys(d.now.platforms).length ? `<div class="group-title">Устройства</div><div class="panel gr-pad">${hbars(Object.entries(d.now.platforms).sort((a, b) => b[1] - a[1]).map(([k, v]) => [PLATFORM_NAMES[k] || k, v]), d.now.total)}</div>` : ''}
    ${Object.keys(d.now.versions).length ? `<div class="group-title">Версии приложения</div><div class="panel gr-pad">${hbars(Object.entries(d.now.versions).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k === 'unknown' ? 'Неизвестно' : k, v]), d.now.total)}</div>` : ''}
    <button class="btn btn-ghost" data-act="gr-pdf" id="gr-pdf">${I.download} Скачать PDF</button>
    <div class="hint">Только числа с нашего сервера в России: почты, имён и идентификаторов людей здесь нет. Сторонней аналитики в CABINA нет.</div>`;
}

export function growthClick(act, b, ctx) {
  ctxRef = ctx;
  switch (act) {
    case 'gr-period': if (G.period === b.dataset.v) return true; G.period = b.dataset.v; { const t = G.data?.today || todayMsk(); G.y = +t.slice(0, 4); G.m = +t.slice(5, 7); } loadGrowth(); return true;
    case 'gr-prev': Object.assign(G, shiftPeriod(G.period, G.y, G.m, -1)); loadGrowth(); return true;
    case 'gr-next': if (b.disabled) return true; Object.assign(G, shiftPeriod(G.period, G.y, G.m, 1)); loadGrowth(); return true;
    case 'gr-retry': loadGrowth(); return true;
    case 'gr-pdf': {
      if (b.disabled || !G.data) return true;
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      import('./growth-pdf.js').then((m) => m.exportGrowthPdf(G.data, range()))
        .catch(() => toast('Не удалось собрать PDF. Попробуйте ещё раз.', { error: true }))
        .finally(() => { b.disabled = false; b.removeAttribute('aria-busy'); });
      return true;
    }
    default: return false;
  }
}
