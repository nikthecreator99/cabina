// «Ещё» → «Телефоны»: записная книжка рабочих номеров (нарядчик, дежурный по депо, коллеги).
// Хранится только в этом телефоне (meta 'contacts') и попадает в резервную копию. Номер коллеги — его
// персональные данные, поэтому никуда не отправляется; звонок — обычной ссылкой tel:.
import { I, esc, small, sheet, openLayer, closeLayer, confirmDialog, toast, uid, searchWords, normSearch, highlight } from './ui.js';
import { S, saveContact, deleteContact } from './store.js';

const $ = (root, sel) => root.querySelector(sel);

// В номере оставляем только цифры, «+», пробелы, скобки и дефисы
export const normPhone = (v) => String(v ?? '').replace(/[^\d+()\- ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
// Ссылка для звонка: только «+» в начале и цифры, поэтому в разметку не попадёт ничего постороннего
export function telHref(v) {
  const s = String(v ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length < 3) return '';
  return `tel:${s.startsWith('+') ? '+' : ''}${digits}`;
}
const phoneOk = (v) => String(v).replace(/\D/g, '').length >= 3;
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

export const contactsSorted = () => [...S.contacts].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));

export function phonesListHtml(q = '') {
  const words = searchWords(q);
  if (!S.contacts.length) return `<div class="empty"><div class="em-ico">${I.book}</div><b>Номеров пока нет</b><p>Нарядчик, дежурный по депо, медпункт, коллеги — чтобы нужный номер был под рукой.</p></div>`;
  const arr = contactsSorted().filter((c) => {
    if (!words.length) return true;
    const hay = normSearch(`${c.name} ${c.who} ${c.phone} ${String(c.phone).replace(/\D/g, '')} ${c.note}`);
    return words.every((w) => hay.includes(w));
  });
  if (!arr.length) return `<div class="empty"><div class="em-ico">${I.search}</div><b>Ничего не найдено</b><p>Попробуйте другое имя или часть номера.</p></div>`;
  return `<div class="panel phone-list">${arr.map((c) => {
    const href = telHref(c.phone);
    return `<div class="row phone-row">
      <button class="phone-open" data-act="phone-edit" data-id="${esc(c.id)}" aria-label="Изменить: ${esc(c.name)}">
        <span class="ava-sm">${esc(initials(c.name)) || I.user}</span>
        <span class="grow"><span class="t1">${highlight(c.name, words)}</span>
          <span class="t2">${c.who ? `${highlight(c.who, words)} · ` : ''}<span class="nw">${highlight(c.phone, words)}</span></span>
          ${c.note ? `<span class="t2 phone-note">${highlight(c.note, words)}</span>` : ''}</span>
      </button>
      ${href ? `<a class="icon-btn call-btn" href="${esc(href)}" aria-label="Позвонить: ${esc(c.name)}">${I.call}</a>` : ''}
    </div>`;
  }).join('')}</div>`;
}

export function renderPhones(q = '') {
  return `<div class="page-head"><button class="icon-btn" data-act="extra-back" aria-label="Назад">${I.left}</button><h1>Телефоны</h1></div>
    ${S.contacts.length > 5 ? `<div class="search"><span aria-hidden="true">${small(I.search, 18)}</span><input type="search" class="input" id="phones-q" placeholder="Поиск: имя, должность или номер" autocomplete="off" enterkeyhint="search" value="${esc(q)}" aria-label="Поиск по телефонам">${q ? `<button class="search-x" data-act="phones-clear" aria-label="Очистить поиск">${small(I.x, 16)}</button>` : ''}</div>` : ''}
    <button class="btn btn-primary" data-act="phone-add">${I.plus} Новый номер</button>
    <div id="phones-list" class="screen-list">${phonesListHtml(q)}</div>
    <div class="notice ok">${I.shield}<div><b>Номера хранятся только в этом телефоне</b> и никуда не отправляются. Они попадают в резервную копию — номера коллег это их личные данные, не пересылайте копию другим людям.</div></div>`;
}

// Выбор из контактов телефона есть не во всех браузерах (Chrome на Android — да, iPhone — нет)
const canPick = () => typeof navigator !== 'undefined' && !!navigator.contacts?.select && typeof window !== 'undefined' && 'ContactsManager' in window;

export function openPhoneForm(id) {
  const existing = id ? S.contacts.find((c) => c.id === id) : null;
  const el = openLayer(sheet({
    title: existing ? 'Номер телефона' : 'Новый номер',
    headRight: existing ? `<button class="icon-btn danger" data-act="del-phone" aria-label="Удалить номер">${I.trash}</button>` : '',
    body: `
      ${!existing && canPick() ? `<button type="button" class="add-btn" data-act="pick-contact">${I.book} Взять из контактов телефона</button>` : ''}
      <div class="field"><label for="ph-name">Имя</label><input class="input" id="ph-name" maxlength="60" autocomplete="off" placeholder="Например, Сергей Петрович"></div>
      <div class="field"><label for="ph-who">Кто это <span class="opt">· необязательно</span></label><input class="input" id="ph-who" maxlength="60" autocomplete="off" placeholder="Например, нарядчик депо"></div>
      <div class="field"><label for="ph-tel">Телефон</label><input class="input" id="ph-tel" type="tel" inputmode="tel" maxlength="20" autocomplete="off" placeholder="+7 900 000-00-00"></div>
      <div class="field"><label for="ph-note">Заметка <span class="opt">· необязательно</span></label><input class="input" id="ph-note" maxlength="200" autocomplete="off" placeholder="Например, звонить после 8:00"></div>
      <div data-error></div>`,
    foot: `<button class="btn btn-primary" data-act="save-phone">${I.check} Сохранить</button>`,
  }));
  $(el, '#ph-name').value = existing?.name || '';
  $(el, '#ph-who').value = existing?.who || '';
  $(el, '#ph-tel').value = existing?.phone || '';
  $(el, '#ph-note').value = existing?.note || '';
  if (!existing) setTimeout(() => $(el, '#ph-name').focus(), 250);
  const err = (msg) => { const box = $(el, '[data-error]'); box.innerHTML = msg ? `<div class="error-box" role="alert">${I.alert}<span>${esc(msg)}</span></div>` : ''; };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    const act = b.dataset.act;
    if (act === 'pick-contact') {
      try {
        const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!c) return;
        if (c.name?.[0]) $(el, '#ph-name').value = String(c.name[0]).slice(0, 60);
        if (c.tel?.[0]) $(el, '#ph-tel').value = normPhone(c.tel[0]);
      } catch { /* человек закрыл выбор */ }
      return;
    }
    if (act === 'save-phone') {
      const name = $(el, '#ph-name').value.trim().slice(0, 60);
      const phone = normPhone($(el, '#ph-tel').value);
      if (!name) { err('Напишите имя.'); return; }
      if (!phoneOk(phone)) { err('Укажите номер телефона.'); return; }
      const now = Date.now();
      await saveContact({
        ...(existing || { id: uid(), createdAt: now }),
        name, phone, who: $(el, '#ph-who').value.trim().slice(0, 60), note: $(el, '#ph-note').value.trim().slice(0, 200), updatedAt: now,
      });
      closeLayer(el); toast(existing ? 'Номер изменён' : 'Номер добавлен');
    } else if (act === 'del-phone') {
      const ok = await confirmDialog({ title: 'Вы действительно хотите удалить номер?', text: `${existing.name} · ${existing.phone}`, ok: 'Да', cancel: 'Нет' });
      if (!ok) return;
      await deleteContact(id); closeLayer(el); toast('Номер удалён');
    }
  });
}
