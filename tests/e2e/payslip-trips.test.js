import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webkit} from 'playwright';
import {startEnv,openApp,seed} from './helpers.js';

test('сверка с поездками определяет месяц из PDF и меняет месяц без повторной загрузки',async()=>{
  const env=await startEnv();
  const phone=process.env.CHECK_WEBKIT ? await webkit.launch() : env.browser;
  try {
    const {page}=await openApp({...env,browser:phone});
    await seed(page,{trips:[{id:'overnight',start:'2026-04-30T22:00',end:'2026-05-01T07:00'}],settings:{pay:{main:{rates:[{from:'2026-01-01',rate:200}]}}}});
    const doc=await env.browser.newPage();
    await doc.setContent('<p>Расчетный листок за май месяц 2026 года</p><p>Всего отработано часов за месяц 7,00</p><p>май Ночные 023L 5,00/ 40,00 400,00</p>');
    const pdf=await doc.pdf();
    await doc.close();
    await page.locator('.tab[data-tab=extra]').click();
    await page.locator('button[data-page=payslip]').click();
    const audit=page.locator('.ps-panel').filter({has:page.locator('#ps-files')});
    assert.equal(await audit.locator('[data-act=ps-compare]').count(),0);
    await page.getByRole('button',{name:'Перейти к сверке поездок'}).click();
    assert.equal(await page.locator('#ps-month').inputValue(),'');
    // iOS возвращает страницу из системного окна выбора файла до события change.
    assert.equal(await page.locator('#ps-files').evaluate(input=>{
      document.dispatchEvent(new Event('visibilitychange'));
      return input===document.querySelector('#ps-files');
    }),true);
    await page.locator('#ps-files').setInputFiles({name:'demo.pdf',mimeType:'application/pdf',buffer:pdf});
    const report=page.locator('#ps-details');
    assert.match(await report.innerText(),/Сверка за май 2026[\s\S]*Ночные часы[\s\S]*меньше на 1 ч/);
    await page.locator('#ps-month').selectOption('2026-04');
    assert.match(await report.innerText(),/Выбран апрель 2026, в листке указан май 2026/);
    await page.locator('#ps-month').selectOption('2026-05');
    assert.match(await report.innerText(),/Всего отработано[\s\S]*Cabina · 7 ч/);
  } finally {if(phone!==env.browser) await phone.close();await env.stop();}
});
