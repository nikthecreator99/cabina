// Профиль (основа будущей сети). Пока всё хранится только в этом телефоне и никому не показывается.
// Экран «Профиль» — просмотр; изменить фото, имя, должность, депо и приватность — «Редактировать профиль».
import { I, esc, small, pageHead, toast, confirmDialog, plural, whenShort, dayMonth, MONTHS_PREP } from './ui.js';
import { S, saveProfile, nowLocal, liveTrip, isPending, statsOf, routeOf } from './store.js';
import { dateKeyOf, monthSummary, fmtDur, parseLocal } from './calc.js';
import { ROLES } from './pay.js';
import { currentRest, dayOffIntervals } from './rest.js';
import { careerOf, tenure, tenureText, todayKey } from './career.js';

const CLASSES = ['3', '2', '1'];
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const safePhoto = (v) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v || ''));

// Что коллеги смогут увидеть, когда в CABINA появится общение. По умолчанию — ничего.
export const PRIVACY = [
  { k: 'status', label: 'Статус', hint: 'В пути, на выходном, между поездками или на отвлечении.' },
  { k: 'depot', label: 'Депо', hint: 'Чтобы вас могли найти коллеги из вашего депо.' },
  { k: 'photo', label: 'Фото', hint: 'Без этого коллеги увидят только первые буквы имени.' },
];
export const privacyOf = (p = S.profile) => ({ status: false, depot: false, photo: false, ...(p.privacy || {}) });

export function avatarHtml(p = S.profile, size = 96) {
  return safePhoto(p.photo) ? `<img src="${esc(p.photo)}" alt="" width="${size}" height="${size}">`
    : initials(p.name) ? `<span class="ava-txt">${esc(initials(p.name))}</span>` : I.user;
}

const subLine = (p) => [ROLES[p.role] + (p.role === 'driver' && p.klass ? `, ${p.klass} класс` : ''), p.depot ? `депо ${p.depot}` : ''].filter(Boolean).join(' · ');

// Статус: в пути → на отвлечении → на выходном → между поездками. null — пока нечего показать.
// Причину отвлечения статус не называет: больничный — это сведения о здоровье.
export function profileStatus(now = nowLocal()) {
  const live = liveTrip();
  if (live && isPending(live, now)) return { kind: 'soon', label: 'Скоро явка', sub: whenShort(statsOf(live).start, now) };
  if (live) {
    const r = routeOf(live);
    return { kind: 'trip', label: 'В пути', sub: `с ${whenShort(statsOf(live).start, now)}${r ? ` · ${r}` : ''}` };
  }
  const today = dateKeyOf(now);
  const abs = S.absences.find((a) => a.start <= today && a.end >= today);
  if (abs) return { kind: 'abs', label: 'На отвлечении', sub: `до ${dayMonth(parseLocal(`${abs.end}T00:00`))} включительно` };
  const off = dayOffIntervals().find((x) => x.s <= now && now < x.e);
  if (off) return { kind: 'dayoff', label: 'На выходном', sub: `до ${whenShort(off.e, now)}` };
  if (!S.trips.length) return null;
  const rest = currentRest(now);
  return { kind: 'between', label: 'Между поездками', sub: rest ? `${rest.label.toLowerCase()} · до ${whenShort(rest.until, now)}` : '' };
}

export function renderProfile() {
  const p = S.profile;
  const st = profileStatus();
  const now = new Date(nowLocal());
  const y = now.getUTCFullYear(); const m = now.getUTCMonth() + 1;
  const sum = monthSummary(y, m, S.trips, S.absences);
  // поездка, которая ждёт явки, в счёт не идёт, пока не началась
  const total = S.trips.filter((t) => !isPending(t)).length;
  const inMonth = sum.monthTrips.filter((t) => !isPending(t)).length;
  const tiles = S.trips.length ? `<div class="profile-tiles">
      <div class="pt"><b class="num">${inMonth}</b><span>${plural(inMonth, 'поездка', 'поездки', 'поездок')} в ${MONTHS_PREP[m - 1]}</span></div>
      <div class="pt"><b class="num">${fmtDur(sum.work, { short: true })}</b><span>отработано в ${MONTHS_PREP[m - 1]}</span></div>
      <div class="pt"><b class="num">${total}</b><span>${plural(total, 'поездка', 'поездки', 'поездок')} всего</span></div>
    </div>` : '';
  return `${pageHead('Профиль', { right: `<button class="icon-btn" data-act="go" data-page="settings" aria-label="Настройки">${I.gear}</button>` })}
    <section class="profile-card">
      <div class="avatar view">${avatarHtml(p)}</div>
      <div class="profile-name">${p.name ? esc(p.name) : '<span class="ph">Имя не указано</span>'}</div>
      <div class="profile-sub">${esc(subLine(p))}</div>
      ${(() => { const c = careerOf(p); const t = c.hired ? tenure(c.hired, todayKey()) : null; return t ? `<div class="profile-sub">${small(I.briefcase, 14)} Стаж ${tenureText(t)}</div>` : ''; })()}
      ${st ? `<div class="pr-status st-${st.kind}" id="pr-status"><span class="dot"></span><b>${st.label}</b>${st.sub ? `<small>${esc(st.sub)}</small>` : ''}</div>` : ''}
      <button class="btn btn-ghost btn-sm" data-act="go" data-page="profile-edit">${small(I.edit, 16)} Редактировать профиль</button>
    </section>
    ${tiles}
    <div class="notice ok">${I.shield}<div><b>Профиль хранится только в этом телефоне</b> и никому не показывается. Он попадает в резервную копию — не пересылайте её другим людям.</div></div>`;
}

export function renderProfileEdit() {
  const p = S.profile;
  const pv = privacyOf(p);
  return `${pageHead('Редактировать профиль', { back: true })}
    <section class="profile-card">
      <label class="avatar" aria-label="${p.photo ? 'Сменить фото' : 'Добавить фото'}">${avatarHtml(p)}<span class="ava-cam">${I.camera}</span>
        <input type="file" id="pr-photo" accept="image/*" hidden></label>
      <div class="hint">${p.photo ? 'Нажмите на фото, чтобы сменить его' : 'Нажмите, чтобы добавить фото'}</div>
      ${p.photo ? '<button class="link-btn" data-act="photo-del">Удалить фото</button>' : ''}
    </section>
    <div class="panel pay-panel">
      <div class="pay-field"><label for="pr-name">Имя</label><input class="input" id="pr-name" maxlength="60" autocomplete="name" placeholder="Например, Иван" value="${esc(p.name)}"></div>
      <div class="pay-field"><div class="label">Должность</div>
        <div class="seg" id="pr-role">${Object.entries(ROLES).map(([k, v]) => `<button data-act="pr-role" data-role="${k}" aria-pressed="${p.role === k}">${v}</button>`).join('')}</div>
        <div class="hint">По должности выбирается набор тарифных ставок для расчёта заработка.</div></div>
      ${p.role === 'driver' ? `<div class="pay-field"><div class="label">Класс</div>
        <div class="seg" id="pr-klass">${CLASSES.map((k) => `<button data-act="pr-klass" data-klass="${k}" aria-pressed="${p.klass === k}">${k} класс</button>`).join('')}</div></div>` : ''}
      <div class="pay-field"><label for="pr-depot">Депо</label><input class="input" id="pr-depot" maxlength="60" autocomplete="off" placeholder="Название вашего депо" value="${esc(p.depot)}"></div>
    </div>
    <div class="group-title">Приватность: что увидят коллеги</div>
    <div class="panel" id="pr-privacy">
      ${PRIVACY.map((f) => `<div class="row"><div class="grow"><div class="t1">${f.label}</div><div class="t2">${f.hint}</div></div>
        <button class="switch" role="switch" data-act="pr-priv" data-k="${f.k}" aria-checked="${pv[f.k]}" aria-label="Показывать коллегам: ${f.label.toLowerCase()}"></button></div>`).join('')}
    </div>
    <div class="notice ok">${I.shield}<div><b>Сейчас коллеги не видят ничего</b>: профиль хранится только в этом телефоне. Эти настройки начнут действовать, когда в CABINA появится общение. Причину отвлечения — больничный, отпуск или медкомиссия — коллеги не увидят никогда, только «На отвлечении».</div></div>`;
}

// Фото уменьшается до квадрата 320×320 (JPEG), чтобы не занимать память и не раздувать резервную копию
export async function resizePhoto(file, size = 320) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    if (!s) throw new Error('пустое изображение');
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export async function profileClick(act, b) {
  if (act === 'pr-role') { await saveProfile({ role: b.dataset.role }); return true; }
  if (act === 'pr-klass') { await saveProfile({ klass: S.profile.klass === b.dataset.klass ? '' : b.dataset.klass }); return true; }
  if (act === 'pr-priv') {
    const pv = privacyOf();
    await saveProfile({ privacy: { ...pv, [b.dataset.k]: !pv[b.dataset.k] } });
    return true;
  }
  if (act === 'photo-del') {
    if (await confirmDialog({ title: 'Удалить фото профиля?', ok: 'Удалить' })) { await saveProfile({ photo: '' }); toast('Фото удалено'); }
    return true;
  }
  return false;
}

export async function profileChange(e) {
  const t = e.target;
  if (t.id === 'pr-name') { await saveProfile({ name: t.value.trim().slice(0, 60) }); return true; }
  if (t.id === 'pr-depot') { await saveProfile({ depot: t.value.trim().slice(0, 60) }); return true; }
  if (t.id === 'pr-photo' && t.files?.[0]) {
    const f = t.files[0];
    t.value = '';
    try { await saveProfile({ photo: await resizePhoto(f) }); toast('Фото сохранено'); }
    catch { toast('Не удалось открыть это фото. Попробуйте другое.', { error: true }); }
    return true;
  }
  return false;
}
