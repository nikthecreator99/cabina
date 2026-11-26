// Страница политики для магазина (data/shop-privacy.html). Текст — тот же, что в приложении
// (policyHtml в legal.js), поэтому отдельная копия не расходится с ним при новой редакции.
import { policyHtml } from './legal.js';

document.querySelector('#policy').innerHTML = policyHtml();
