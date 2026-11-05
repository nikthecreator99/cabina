// Тема до отрисовки, чтобы экран не мигал. Отдельным файлом, а не внутри index.html: правила безопасности
// страницы (Content-Security-Policy) запрещают скрипты, вписанные прямо в страницу.
try {
  var t = localStorage.getItem('cabina-theme');
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
} catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
// Размер текста (2.21.6): обычный, крупный, очень крупный — тоже до отрисовки
try {
  var z = localStorage.getItem('cabina-text');
  if (z === 'l' || z === 'xl') document.documentElement.setAttribute('data-text', z);
} catch (e) { /* обычный */ }
