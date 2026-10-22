// Профиль (основа будущей сети). Пока всё хранится только в этом телефоне.
import { I, esc, pageHead, toast, confirmDialog } from './ui.js';
import { S, saveProfile } from './store.js';
import { ROLES } from './pay.js';

const CLASSES = ['3', '2', '1'];
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const safePhoto = (v) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v || ''));

export function avatarHtml(p = S.profile, size = 96) {
  return safePhoto(p.photo) ? `<img src="${esc(p.photo)}" alt="" width="${size}" height="${size}">`
    : initials(p.name) ? `<span class="ava-txt">${esc(initials(p.name))}</span>` : I.user;
}

export function renderProfile() {
  const p = S.profile;
  const sub = [ROLES[p.role] + (p.role === 'driver' && p.klass ? `, ${p.klass} класс` : ''), p.depot ? `депо ${p.depot}` : ''].filter(Boolean).join(' · ');
  return `${pageHead('Профиль', { right: `<button class="icon-btn" data-act="go" data-page="settings" aria-label="Настройки">${I.gear}</button>` })}
    <section class="profile-card">
      <label class="avatar" aria-label="${p.photo ? 'Сменить фото' : 'Добавить фото'}">${avatarHtml(p)}<span class="ava-cam">${I.camera}</span>
        <input type="file" id="pr-photo" accept="image/*" hidden></label>
      <div class="profile-name">${p.name ? esc(p.name) : '<span class="ph">Ваше имя</span>'}</div>
      <div class="profile-sub">${esc(sub)}</div>
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
    <div class="notice ok">${I.shield}<div><b>Профиль хранится только в этом телефоне</b> и никуда не отправляется. Он попадает в резервную копию — не пересылайте её другим людям.</div></div>`;
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
