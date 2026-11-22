import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startEnv,openApp,seed} from './helpers.js';
test('PDF за выбранный месяц и поездка через полночь',async()=>{
 const env=await startEnv();try{
 const {page,context}=await openApp(env);await seed(page,{trips:[{id:'overnight',start:'2026-04-30T22:00',end:'2026-05-01T07:00'}]});
 const doc=await context.newPage();await doc.setContent('<meta charset="utf-8"><p>Расчетный листок за май месяц 2026 года</p><p>Всего отработано часов за месяц 7,00</p><p>май Ночные 023L 5,00/ 40,00 400,00</p>');const file={name:'demo.pdf',mimeType:'application/pdf',buffer:await doc.pdf()};
 await page.locator('.tab[data-tab=extra]').click();await page.locator('button[data-page=payslip]').click();await page.locator('[data-act=ps-compare]').click();assert.equal(await page.locator('#ps-files').count(),0);
 await page.locator('#ps-month').fill('2026-04');await page.locator('#ps-files').setInputFiles(file);const report=page.locator('#ps-details');assert.match(await report.innerText(),/Выбран апрель 2026, в листке указан май 2026/);
 await page.locator('#ps-month').fill('2026-05');await page.locator('#ps-files').setInputFiles(file);assert.match(await report.locator('.ps-diff').innerText(),/Ночные часы[\s\S]*меньше на 1 ч/);await page.locator('[data-act=ps-audit]').click();assert.equal(await page.locator('#ps-month').count(),0);
 }finally{await env.stop();}});