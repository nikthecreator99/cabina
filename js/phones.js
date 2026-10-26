// «Ещё» → «Телефоны»: записная книжка рабочих номеров (нарядчик, дежурный по депо, коллеги).
// Номера можно разложить по группам («Обозерская», «Нарядчики») — группа запоминается для следующих номеров.
// У одного контакта может быть несколько номеров. Хранится только в этом телефоне (meta 'contacts') и попадает
// в резервную копию. Номер коллеги — его персональные данные, поэтому никуда не отправляется; звонок — ссылкой tel:.
import { I, esc, small, sheet, openLayer, closeLayer, confirmDialog, toast, uid, searchWords, normSearch, highlight, plural } from './ui.js';
import { S, saveContact, deleteContact, forgetContactGroup } from './store.js';

const $ = (root, sel) => root.querySelector(sel);
export const PHONES_MAX = 5;

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
export const groupKey = (g) => String(g || '').trim().toLowerCase().replace(/ё/g, 'е');
// Номера контакта: с 2.8 — список phones, у записей 2.6–2.7 — одно поле phone
export const phonesOf = (c) => (Array.isArray(c?.phones) ? c.phones : c?.phone ? [c.phone] : []).filter((p) => typeof p === 'string' && p);

const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ru');
export const contactsSorted = () => [...S.contacts].sort(byName);
// Группы с номерами: [{ name, list }] по алфавиту
export function contactGroups() {
  const m = new Map();
  for (const c of S.contacts) {
    const g = String(c.group || '').trim();
    if (!g) continue;
    const k = groupKey(g);
    if (!m.has(k)) m.set(k, { name: g, list: [] });
    m.get(k).list.push(c);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function contactRow(c, words, { showGroup = false } = {}) {
  const nums = phonesOf(c);
  const sub = [showGroup && c.group ? highlight(c.group, words) : '', c.who ? highlight(c.who, words) : '', nums.length === 1 ? `<span class="nw">${highlight(nums[0], words)}</span>` : ''].filter(Boolean).join(' · ');
  return `<div class="row phone-row">
    <button class="phone-open" data-act="phone-edit" data-id="${esc(c.id)}" aria-label="Изменить: ${esc(c.name)}">
      <span class="ava-sm">${esc(initials(c.name)) || I.user}</span>
      <span class="grow"><span class="t1">${highlight(c.name, words)}</span>
        ${sub ? `<span class="t2">${sub}</span>` : ''}
        ${c.note ? `<span class="t2 phone-note">${highlight(c.note, words)}</span>` : ''}</span>
    </button>
    ${nums.length === 1 && telHref(nums[0]) ? `<a class="icon-btn call-btn" href="${esc(telHref(nums[0]))}" aria-label="Позвонить: ${esc(c.name)}">${I.call}</a>` : ''}
    ${nums.length > 1 ? `<div class="phone-nums">${nums.map((n) => (telHref(n) ? `<a class="phone-num" href="${esc(telHref(n))}" aria-label="Позвонить: ${esc(c.name)}, ${esc(n)}">${small(I.call, 16)}<span>${highlight(n, words)}</span></a>` : '')).join('')}</div>` : ''}
  </div>`;
}

const empty = `<div class="empty"><div class="em-ico">${I.book}</div><b>Номеров пока нет</b><p>Нарядчик, дежурный по депо, медпункт, коллеги — чтобы нужный номер был под рукой. Номера можно разложить по группам, например «Обозерская».</p></div>`;

// q — поиск (по всем группам сразу), group — открытая группа
export function phonesListHtml(q = '', group = null) {
  const words = searchWords(q);
  if (!S.contacts.length) return empty;
  if (words.length) {
    const arr = contactsSorted().filter((c) => {
      const nums = phonesOf(c);
      const hay = normSearch(`${c.group || ''} ${c.name} ${c.who || ''} ${nums.join(' ')} ${nums.map((n) => n.replace(/\D/g, '')).join(' ')} ${c.note || ''}`);
      return words.every((w) => hay.includes(w));
    });
    if (!arr.length) return `<div class="empty"><div class="em-ico">${I.search}</div><b>Ничего не найдено</b><p>Попробуйте другое имя, группу или часть номера.</p></div>`;
    return `<div class="panel phone-list">${arr.map((c) => contactRow(c, words, { showGroup: true })).join('')}</div>`;
  }
  if (group != null) {
    const list = S.contacts.filter((c) => groupKey(c.group) === groupKey(group)).sort(byName);
    return list.length ? `<div class="panel phone-list">${list.map((c) => contactRow(c, words)).join('')}</div>`
      : `<div class="empty"><div class="em-ico">${I.folder}</div><b>В группе пока нет номеров</b></div>`;
  }
  const groups = contactGroups();
  const loose = S.contacts.filter((c) => !String(c.group || '').trim()).sort(byName);
  return `${groups.length ? `<div class="panel phone-groups">${groups.map((g) => `<button class="row" data-act="phones-group" data-g="${esc(g.name)}">
      <span class="ico" style="--c:var(--warn)">${I.folder}</span>
      <div class="grow"><div class="t1">${esc(g.name)}</div><div class="t2">${g.list.length} ${plural(g.list.length, 'контакт', 'контакта', 'контактов')}</div></div>${small(I.right, 18)}</button>`).join('')}</div>` : ''}
    ${loose.length ? `${groups.length ? '<div class="group-title">Без группы</div>' : ''}<div class="panel phone-list">${loose.map((c) => contactRow(c, words)).join('')}</div>` : ''}`;
}

export function renderPhones(q = '', group = null) {
  if (group != null && !S.contacts.some((c) => groupKey(c.group) === groupKey(group))) group = null; // группа опустела
  const head = group != null
    ? `<div class="page-head"><button class="icon-btn" data-act="phones-up" aria-label="Назад ко всем группам">${I.left}</button><h1>${esc(group)}</h1></div>`
    : `<div class="page-head"><button class="icon-btn" data-act="extra-back" aria-label="Назад">${I.left}</button><h1>Телефоны</h1></div>
      ${S.contacts.length > 5 ? `<div class="search"><span aria-hidden="true">${small(I.search, 18)}</span><input type="search" class="input" id="phones-q" placeholder="Поиск: имя, группа или номер" autocomplete="off" enterkeyhint="search" value="${esc(q)}" aria-label="Поиск по телефонам">${q ? `<button class="search-x" data-act="phones-clear" aria-label="Очистить поиск">${small(I.x, 16)}</button>` : ''}</div>` : ''}`;
  return `${head}
    <button class="btn btn-primary" data-act="phone-add"${group != null ? ` data-g="${esc(group)}"` : ''}>${I.plus} Новый номер</button>
    <div id="phones-list" class="screen-list">${phonesListHtml(group != null ? '' : q, group)}</div>
    ${group != null ? `<button class="link-btn" data-act="phones-forget" data-g="${esc(group)}">Убрать группу (номера останутся)</button>` : `<div class="notice ok">${I.shield}<div><b>Номера хранятся только в этом телефоне</b> и никуда не отправляются. Они попадают в резервную копию — номера коллег это их личные данные, не пересылайте копию другим людям.</div></div>`}`;
}

// Выбор из контактов телефона есть не во всех браузерах (Chrome на Android — да, iPhone — нет)
const canPick = () => typeof navigator !== 'undefined' && !!navigator.contacts?.select && typeof window !== 'undefined' && 'ContactsManager' in window;

export function openPhoneForm(id, { group = '' } = {}) {
  const existing = id ? S.contacts.find((c) => c.id === id) : null;
  let nums = existing ? phonesOf(existing) : [''];
  if (!nums.length) nums = [''];
  const groupChips = () => (S.contactGroups.length ? `<div class="quick" id="ph-groups">${S.contactGroups.slice(-12).map((g) => `<button type="button" class="qchip" data-group="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : '');
  const el = openLayer(sheet({
    title: existing ? 'Контакт' : 'Новый номер',
    headRight: existing ? `<button class="icon-btn danger" data-act="del-phone" aria-label="Удалить контакт">${I.trash}</button>` : '',
    body: `
      ${!existing && canPick() ? `<button type="button" class="add-btn" data-act="pick-contact">${I.book} Взять из контактов телефона</button>` : ''}
      <div class="field"><label for="ph-group">Группа <span class="opt">· необязательно</span></label>
        <input class="input" id="ph-group" maxlength="60" autocomplete="off" placeholder="Например, Обозерская или нарядчики">
        <div id="ph-groups-box">${groupChips()}</div>
        <div class="hint">Номера одной группы будут лежать в одной папке. Новая группа запомнится.</div></div>
      <div class="field"><label for="ph-name">Имя</label><input class="input" id="ph-name" maxlength="60" autocomplete="off" placeholder="Например, Сергей Петрович"></div>
      <div class="field"><label for="ph-who">Кто это <span class="opt">· необязательно</span></label><input class="input" id="ph-who" maxlength="60" autocomplete="off" placeholder="Например, нарядчик депо"></div>
      <div class="field"><div class="label" id="ph-tels-label">Телефон</div>
        <div id="ph-tels"></div>
        <button type="button" class="add-btn" data-act="ph-more" id="ph-more">${I.call} Ещё номер</button></div>
      <div class="field"><label for="ph-note">Заметка <span class="opt">· необязательно</span></label><input class="input" id="ph-note" maxlength="200" autocomplete="off" placeholder="Например, звонить после 8:00"></div>
      <div data-error></div>`,
    foot: `<button class="btn btn-primary" data-act="save-phone">${I.check} Сохранить</button>`,
  }));
  const readNums = () => [...el.querySelectorAll('.ph-tel')].map((x) => x.value);
  function renderNums() {
    $(el, '#ph-tels').innerHTML = nums.map((n, i) => `<div class="ph-tel-row">
      <input class="input ph-tel" id="${i ? `ph-tel-${i}` : 'ph-tel'}" type="tel" inputmode="tel" maxlength="20" autocomplete="off" placeholder="+7 900 000-00-00" aria-labelledby="ph-tels-label" value="${esc(n)}">
      ${nums.length > 1 ? `<button type="button" class="icon-btn" data-act="ph-del" data-i="${i}" aria-label="Убрать номер ${i + 1}">${small(I.x, 18)}</button>` : ''}</div>`).join('');
    $(el, '#ph-more').hidden = nums.length >= PHONES_MAX;
  }
  renderNums();
  $(el, '#ph-group').value = existing?.group || group || '';
  $(el, '#ph-name').value = existing?.name || '';
  $(el, '#ph-who').value = existing?.who || '';
  $(el, '#ph-note').value = existing?.note || '';
  if (!existing) setTimeout(() => $(el, group || !S.contactGroups.length ? '#ph-name' : '#ph-group').focus(), 250);
  const err = (msg) => { const box = $(el, '[data-error]'); box.innerHTML = msg ? `<div class="error-box" role="alert">${I.alert}<span>${esc(msg)}</span></div>` : ''; };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.group != null && b.classList.contains('qchip')) { $(el, '#ph-group').value = b.dataset.group; $(el, '#ph-name').focus(); return; }
    const act = b.dataset.act;
    if (act === 'ph-more') { nums = [...readNums(), '']; renderNums(); el.querySelectorAll('.ph-tel')[nums.length - 1]?.focus(); return; }
    if (act === 'ph-del') { nums = readNums().filter((_, i) => i !== +b.dataset.i); renderNums(); return; }
    if (act === 'pick-contact') {
      try {
        const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!c) return;
        if (c.name?.[0]) $(el, '#ph-name').value = String(c.name[0]).slice(0, 60);
        if (c.tel?.length) { nums = c.tel.slice(0, PHONES_MAX).map(normPhone); renderNums(); }
      } catch { /* человек закрыл выбор */ }
      return;
    }
    if (act === 'save-phone') {
      const name = $(el, '#ph-name').value.trim().slice(0, 60);
      const phones = readNums().map(normPhone).filter(Boolean);
      if (!name) { err('Напишите имя.'); return; }
      if (!phones.length || !phones.every(phoneOk)) { err(phones.length ? 'Проверьте номер: в нём должно быть хотя бы 3 цифры.' : 'Укажите номер телефона.'); return; }
      // группа пишется так же, как уже запомненная («обозерская» → «Обозерская»)
      const typed = $(el, '#ph-group').value.trim().slice(0, 60);
      const known = S.contactGroups.find((g) => groupKey(g) === groupKey(typed));
      const now = Date.now();
      const c = {
        ...(existing || { id: uid(), createdAt: now }),
        group: known || typed, name, phones, who: $(el, '#ph-who').value.trim().slice(0, 60), note: $(el, '#ph-note').value.trim().slice(0, 200), updatedAt: now,
      };
      delete c.phone;
      await saveContact(c);
      closeLayer(el); toast(existing ? 'Контакт изменён' : 'Номер добавлен');
    } else if (act === 'del-phone') {
      const ok = await confirmDialog({ title: 'Вы действительно хотите удалить контакт?', text: `${existing.name} · ${phonesOf(existing).join(', ')}`, ok: 'Да', cancel: 'Нет' });
      if (!ok) return;
      await deleteContact(id); closeLayer(el); toast('Контакт удалён');
    }
  });
  return el;
}

// Папка группы: «Забыть группу» — номера остаются, но без группы
export async function forgetGroup(name) {
  const ok = await confirmDialog({ title: `Убрать группу «${name}»?`, text: 'Номера из неё не удалятся, а окажутся в списке без группы.', ok: 'Убрать', cancel: 'Отмена' });
  if (!ok) return false;
  await forgetContactGroup(name);
  toast('Группа убрана');
  return true;
}
