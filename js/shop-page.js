import { I } from './ui.js';
import { avatarSvg, bgSvg } from './avatar.js';
import { API, session, accessToken } from './auth.js';

const status = document.querySelector('#status');
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
if (checkout) {
  const store = document.querySelector('.store');
  store.classList.add('checkout');
  const back = store.querySelector('a');
  back.className = 'checkout-back';
  back.innerHTML = I.left;
  back.setAttribute('aria-label', 'Назад');
  if (document.referrer && new URL(document.referrer).origin === location.origin) {
    back.onclick = event => { event.preventDefault(); history.back(); };
  }
  const nav = store.querySelector('nav');
  const privacy = nav.querySelector('[href="shop-privacy.html"]');
  const footer = store.querySelector('footer');
  const seller = document.createElement('details');
  seller.id = 'seller';
  seller.innerHTML = '<summary>О продавце</summary>';
  seller.append(footer.querySelector('p'));
  footer.removeAttribute('id');
  footer.querySelector('h2').remove();
  footer.querySelector('br')?.remove();
  const terms = store.querySelector('#terms');
  const returns = store.querySelector('#returns');
  nav.replaceChildren(terms, returns, privacy, seller);
  nav.before(status);
  decorateRow(terms.querySelector('summary'), I.file, I.down);
  decorateRow(returns.querySelector('summary'), I.swap, I.down);
  decorateRow(privacy, I.shield, I.external);
  decorateRow(seller.querySelector('summary'), I.user, I.down);
  for (const link of footer.querySelectorAll('a')) {
    decorateRow(link, link.protocol === 'tel:' ? I.call : I.mail, I.right);
  }
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

function preview(sku) {
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
  const price = card.querySelector('strong').textContent;
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
}
try {
  ({terms, mode} = await call('catalog'));
  const owned = account ? (await call('owned')).owned : [];
  if (account && session()?.sub === account) localStorage.setItem('cabina-owned-' + account, JSON.stringify(owned));
  for (const card of products) {
    const action = card.querySelector('.action');
    if (owned.includes(card.dataset.sku)) action.textContent = 'Уже в профиле';
    else if (account && mode !== 'off') {
      paymentButton(card, true);
    }
  }
  status.textContent = mode === 'off' ? (checkout ? '' : 'Приём оплаты пока закрыт.') :
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
  status.textContent = checkout ? '' : 'Оплата сейчас недоступна. Попробуйте позже.';
}
