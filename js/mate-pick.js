// Окно «Напарник» (2.32): выбрать из своих коллег, из тех, с кем уже ездили, или вписать имя.
// Ничего не отправляет: выбранный напарник сохраняется только в поездке в этом телефоне, ему самому ничего не приходит.
import { I, esc, small, openLayer, closeLayer, sheet, plural } from './ui.js';
import { S } from './store.js';
import { matesOf, recentMates, mateKey, mateName, MATE_NAME_MAX } from './mates.js';
import { colSnap, colMine, loadColleagues, cardAvatar, cardSub } from './colleagues.js';
import { legalReady } from './legal.js';

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
const ava = (html) => `<span class="col-ava" aria-hidden="true">${html}</span>`;

// taken — ключи уже выбранных напарников (их не показываем). Возвращает {id, name} или undefined (закрыли).
export function openMatePicker(taken = []) {
  return new Promise((resolve) => {
    let result;
    const busy = new Set(taken);
    const account = legalReady() && !!colMine();
    const counts = new Map(recentMates(S.trips, 1000).map((m) => [m.key, m.n]));
    const times = (k) => { const n = counts.get(k); return n ? `${n} ${plural(n, 'поездка', 'поездки', 'поездок')} вместе` : ''; };
    const rows = () => {
      const snap = colSnap();
      const cols = snap?.consent?.main ? snap.colleagues.filter((c) => !busy.has(`id:${c.id}`)) : []
        .sort((x, y) => (counts.get(`id:${y.id}`) || 0) - (counts.get(`id:${x.id}`) || 0)); // с кем чаще ездили — выше
      const colKeys = new Set((snap?.colleagues || []).map((c) => `id:${c.id}`));
      // те, с кем ездили, но их нет среди коллег сейчас (вписанные имена или бывшие коллеги)
      const recent = recentMates(S.trips, 12).filter((m) => !busy.has(m.key) && !colKeys.has(m.key));
      let html = '';
      if (cols.length) {
        html += `<div class="group-title">Мои коллеги</div><div class="panel" id="mt-cols">${cols.map((c) => `<button class="row col-row" type="button" data-mate-id="${esc(c.id)}">${ava(cardAvatar(c.card, 40))}
          <div class="grow"><div class="t1">${esc(c.card.name)}</div><div class="t2">${esc(times(`id:${c.id}`) || cardSub(c.card) || 'Коллега')}</div></div>${small(I.plus, 18)}</button>`).join('')}</div>`;
      } else if (account && !snap) {
        html += '<div class="hint" id="mt-loading">Загружаем коллег…</div>';
      }
      if (recent.length) {
        html += `<div class="group-title">Ездили вместе</div><div class="panel" id="mt-recent">${recent.map((m) => `<button class="row col-row" type="button" data-mate-key="${esc(m.key)}">${ava(initials(m.name) ? `<span class="ava-txt">${esc(initials(m.name))}</span>` : I.user)}
          <div class="grow"><div class="t1">${esc(m.name)}</div><div class="t2">${esc(times(m.key))}</div></div>${small(I.plus, 18)}</button>`).join('')}</div>`;
      }
      return html;
    };
    const body = `
      <div class="field mt-new">
        <label for="mt-name" class="mini-label">Имя напарника</label>
        <div class="mt-new-row"><input id="mt-name" class="input" maxlength="${MATE_NAME_MAX}" placeholder="Например, Сергей Иванов" autocomplete="off" enterkeyhint="done">
          <button class="btn btn-primary btn-sm" type="button" data-act="mt-add">Добавить</button></div>
      </div>
      <div id="mt-rows">${rows()}</div>
      <div class="hint mt-why">${small(I.shield, 15)} Напарник сохраняется только в этом телефоне — для вашей статистики «с кем сколько ездили». Ему ничего не отправляется.</div>`;
    const el = openLayer(sheet({ title: 'Напарник', body }), { onClose: () => resolve(result) });
    const pick = (m) => { result = m; closeLayer(el); };
    if (account && !colSnap()) {
      loadColleagues().then(() => { const box = el.querySelector('#mt-rows'); if (box?.isConnected) box.innerHTML = rows(); }).catch(() => {});
    }
    const addTyped = () => {
      const name = mateName(el.querySelector('#mt-name').value);
      if (!name) { el.querySelector('#mt-name').focus(); return; }
      // то же имя, что у коллеги или у прежнего напарника, — это он и есть
      const snap = colSnap();
      const col = snap?.consent?.main ? snap.colleagues.find((c) => mateKey({ id: '', name: c.card.name }) === mateKey({ id: '', name })) : null;
      if (col && !busy.has(`id:${col.id}`)) { pick({ id: col.id, name: col.card.name }); return; }
      if (busy.has(mateKey({ id: '', name }))) { closeLayer(el); return; }
      pick({ id: '', name });
    };
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'mt-name') { e.preventDefault(); addTyped(); } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !el.contains(b)) return;
      if (b.hasAttribute('data-close')) { closeLayer(el); return; }
      if (b.dataset.act === 'mt-add') { addTyped(); return; }
      if (b.dataset.mateId) {
        const c = colSnap()?.colleagues.find((x) => x.id === b.dataset.mateId);
        if (c) pick({ id: c.id, name: c.card.name });
        return;
      }
      if (b.dataset.mateKey) {
        const m = recentMates(S.trips, 1000).find((x) => x.key === b.dataset.mateKey);
        if (m) pick({ id: m.id, name: m.name });
      }
    });
  });
}
export { matesOf };
