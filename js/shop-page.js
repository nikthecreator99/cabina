import { I } from './ui.js';
import { avatarSvg, bgSvg, normalizeAvatar, ownNote } from './avatar.js';
import { API, session, accessToken } from './auth.js';

const status = document.querySelector('#status');
// Откуда пришли (2.43.1): приложение кладёт отметку в sessionStorage этой вкладки перед уходом сюда — адрес страницы
// магазина и (из редактора персонажа) примерку. Referer сайт не передаёт (Referrer-Policy: no-referrer), поэтому так.
function readJson(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}
const fromApp = (() => {
  const back = readJson('cabina-back');
  return back && typeof back === 'object' && Date.now() - back.t < 30 * 60000 ? back : null;
})();
let products = [...document.querySelectorAll('[data-sku]')];
const selected = new URLSearchParams(location.search).get('item');
const checkout = products.some(card => card.dataset.sku === selected);
if (checkout) {
  for (const card of products) if (card.dataset.sku !== selected) card.remove();
  products = products.filter(card => card.dataset.sku === selected);
  document.querySelector('h1').textContent = 'Оформление покупки';
  document.querySelector('.store h1 + p').textContent = 'Разовая покупка для вашего профиля CABINA.';
  document.querySelector('.store nav').before(document.querySelector('#goods'));
}
for (const id of ['terms', 'returns']) {
  const section = document.getElementById(id);
  const heading = section.querySelector('h2');
  const summary = document.createElement('summary');
  summary.textContent = heading.textContent;
  heading.replaceWith(summary);
  const details = document.createElement('details');
  details.id = id;
  details.append(...section.childNodes);
  section.replaceWith(details);
}
function decorateRow(row, icon, end) {
  row.classList.add('checkout-row');
  row.insertAdjacentHTML('afterbegin', icon);
  row.insertAdjacentHTML('beforeend', end);
}
// Оба вида (весь магазин и один предмет) — в одном стиле: «Назад», строки оферты, возврата и политики.
// Реквизиты продавца в общем списке видны сразу (их проверяет Робокасса), в оформлении — под «О продавце».
const store = document.querySelector('.store');
store.classList.add('checkout');
if (!checkout) store.classList.add('catalog');
{
  const back = store.querySelector('a');
  back.className = 'checkout-back';
  back.innerHTML = I.left;
  back.setAttribute('aria-label', checkout ? 'Назад' : 'В CABINA');
  // «Назад» — туда, откуда пришли: из общего списка магазина — в список, из приложения — в приложение (на тот же экран).
  // Открыли страницу по ссылке напрямую — из оформления в общий список, из списка — в CABINA.
  const here = location.pathname + location.search;
  let fromList = false;
  try { fromList = checkout && sessionStorage.getItem('cabina-shop-nav') === location.search; } catch {}
  const fromHere = fromApp?.url === here;
  back.href = checkout ? 'shop.html' : '../';
  back.onclick = event => {
    if (!fromList && !fromHere) return;
    event.preventDefault();
    history.back();
  };
  const nav = store.querySelector('nav');
  const privacy = nav.querySelector('[href="shop-privacy.html"]');
  const footer = store.querySelector('footer');
  const terms = store.querySelector('#terms');
  const returns = store.querySelector('#returns');
  const rows = [terms, returns, privacy];
  if (checkout) {
    const seller = document.createElement('details');
    seller.id = 'seller';
    seller.innerHTML = '<summary>О продавце</summary>';
    seller.append(footer.querySelector('p'));
    footer.removeAttribute('id');
    footer.querySelector('h2').remove();
    footer.querySelector('br')?.remove();
    rows.push(seller);
    decorateRow(seller.querySelector('summary'), I.user, I.down);
  } else {
    footer.querySelector('h2').textContent = 'Продавец';
    footer.querySelector('h2').className = 'seller-head';
    footer.querySelector('p').className = 'seller-req';
    footer.querySelector(':scope > br')?.remove();
    footer.before(Object.assign(document.createElement('h2'), {className: 'shop-group', textContent: 'Условия покупки'}));
    footer.before(nav);
  }
  nav.replaceChildren(...rows);
  if (checkout) nav.before(status);
  decorateRow(terms.querySelector('summary'), I.file, I.down);
  decorateRow(returns.querySelector('summary'), I.swap, I.down);
  decorateRow(privacy, I.shield, I.external);
  for (const link of footer.querySelectorAll('a')) {
    decorateRow(link, link.protocol === 'tel:' ? I.call : I.mail, I.right);
  }
}
// Общий список: товары по группам, карточка целиком ведёт к оформлению этого предмета.
const GROUPS = [['Персонажи', ['robot', 'horse', 'skeleton']], ['Фоны', ['ocean', 'depot']], ['Детали', ['mazut', 'peaked']]];
if (!checkout) {
  const goods = document.querySelector('#goods');
  for (const [title, skus] of GROUPS) {
    const cards = skus.map(sku => products.find(card => card.dataset.sku === sku)).filter(Boolean);
    if (!cards.length) continue;
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    grid.append(...cards);
    goods.append(Object.assign(document.createElement('h2'), {className: 'shop-group', textContent: title}), grid);
  }
  for (const card of products) {
    const name = card.querySelector('h2').textContent;
    const price = card.querySelector('strong');
    const link = document.createElement('a');
    link.className = 'product-link';
    link.href = '?item=' + encodeURIComponent(card.dataset.sku);
    link.setAttribute('aria-label', name + ', ' + price.textContent);
    link.addEventListener('click', () => { try { sessionStorage.setItem('cabina-shop-nav', link.search); } catch {} });
    card.querySelector('.action').before(Object.assign(document.createElement('div'), {className: 'product-foot'}));
    const foot = card.querySelector('.product-foot');
    price.className = 'product-price';
    foot.append(price, card.querySelector('.action'));
    foot.insertAdjacentHTML('beforeend', '<span class="product-go" aria-hidden="true">' + I.right + '</span>');
    card.append(link);
  }
  status.classList.add('shop-note');
  try { sessionStorage.removeItem('cabina-shop-nav'); } catch {}
}
function revealTerms() {
  const section = document.getElementById(location.hash.slice(1));
  if (section?.tagName === 'DETAILS') section.open = true;
}
window.addEventListener('hashchange', revealTerms);
revealTerms();
const account = session()?.sub;
let terms, mode, busy = false;

async function call(path, body) {
  const headers = {};
  if (path !== 'catalog') headers.Authorization = 'Bearer ' + await accessToken();
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(API + '/shop/v1/' + path, {
    method: body ? 'POST' : 'GET', headers, body: body && JSON.stringify(body), cache: 'no-store'
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || 'Сервис временно недоступен.');
  return data;
}

// Примерка из редактора: показываем именно её, если в ней есть этот предмет (иначе — обычная картинка предмета)
function hasItem(look, sku) {
  if (['robot', 'horse', 'skeleton'].includes(sku)) return look.sex === sku;
  if (['depot', 'ocean'].includes(sku)) return look.bg === sku;
  if (sku === 'peaked') return look.hat === 'peaked';
  if (sku === 'mazut') return look.mazut === true;
  return false;
}
function preview(sku) {
  const look = checkout && fromApp?.url === location.pathname + location.search && fromApp.look;
  if (look && typeof look === 'object') {
    try {
      const a = normalizeAvatar(look, {premium: true});
      if (hasItem(a, sku)) return avatarSvg(a);
    } catch {}
  }
  if (['depot', 'ocean'].includes(sku)) return bgSvg(sku);
  if (sku === 'peaked') return avatarSvg({hat: 'peaked'});
  if (sku === 'mazut') return avatarSvg({mazut: true});
  return avatarSvg({sex: sku});
}

async function buy(card) {
  if (busy || session()?.sub !== account) return;
  const sku = card.dataset.sku;
  const price = Number.parseInt(card.querySelector('strong').textContent, 10);
  const name = card.querySelector('h2').textContent;
  if (!confirm('Принимаю публичную оферту и оплачиваю «' + name + '» за ' + price + ' ₽.' +
    (mode === 'test' ? ' Тестовый режим.' : ''))) return;
  busy = true;
  try {
    const result = await call('checkout', {sku, terms, price});
    if (result.owned) { location.reload(); return; }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://auth.robokassa.ru/Merchant/Index.aspx';
    for (const [name, value] of Object.entries(result.fields)) {
      const input = document.createElement('input');
      Object.assign(input, {type:'hidden', name, value});
      form.append(input);
    }
    document.body.append(form);
    form.submit();
  } catch (err) {
    status.textContent = err.message;
    busy = false;
  }
}

for (const card of products) card.querySelector('.preview').innerHTML = preview(card.dataset.sku);
function paymentButton(card, available) {
  // «299 ₽» не разрывается: знак рубля не уходит на отдельную строку
  const price = card.querySelector('strong').textContent.replace(/\s+₽/, '\u00a0₽');
  const button = document.createElement('button');
  button.className = 'btn btn-primary checkout-pay';
  button.disabled = !available;
  button.innerHTML = I.cart;
  const label = document.createElement('span');
  label.textContent = available ? 'Купить за ' + price : 'Оплата недоступна · ' + price;
  button.append(label);
  if (available) button.onclick = () => buy(card);
  card.querySelector('.action').replaceChildren(button);
}
if (checkout) {
  paymentButton(products[0], false);
  const card = products[0];
  const info = document.createElement('div');
  info.className = 'checkout-info';
  info.append(card.querySelector('.preview'), card.querySelector('h2'), card.querySelector('p'));
  card.prepend(info);
  // Покупается предмет, а не примерка: настраивать можно и потом (2.43.3, просьба Никиты)
  info.after(Object.assign(document.createElement('p'), {className: 'checkout-note', textContent: ownNote(card.dataset.sku, card.querySelector('h2').textContent)}));
}
// Страница собрана — можно показывать (до этого её прячет shop.css, иначе на миг видна «сырая» разметка)
store.classList.add('ready');
try {
  ({terms, mode} = await call('catalog'));
  const owned = account ? (await call('owned')).owned : [];
  if (account && session()?.sub === account) localStorage.setItem('cabina-owned-' + account, JSON.stringify(owned));
  for (const card of products) {
    const action = card.querySelector('.action');
    if (owned.includes(card.dataset.sku)) { action.textContent = 'Уже в профиле'; card.classList.add('owned'); }
    else if (checkout && account && mode !== 'off') {
      paymentButton(card, true);
    }
  }
  status.textContent = mode === 'off' ? (checkout ? '' : 'Приём оплаты скоро откроется.') :
    mode === 'test' ? 'Тестовый режим оплаты.' : account ? '' : 'Для покупки войдите в свой аккаунт в CABINA.';
  if (new URLSearchParams(location.search).has('InvId')) {
    status.textContent = 'После подтверждения платежа у предмета появится отметка «Уже в профиле».';
    const refresh = document.createElement('button');
    refresh.className = 'btn btn-ghost';
    refresh.textContent = 'Проверить покупку';
    refresh.onclick = () => location.reload();
    status.append(refresh);
  }
} catch {
  status.textContent = checkout ? '' : 'Приём оплаты скоро откроется.';
}
