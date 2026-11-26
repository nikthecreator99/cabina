// 2.43: наглядный разбор листка и сверки (просьба Никиты 26.11.2026). Листок — выдуманный.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startEnv,openApp,seed} from './helpers.js';

const LINES=['Расчетный листок за май месяц 2026 года','Оклад/Тариф 200,00','Норма часов (по закону) 143,00',
  'Всего отработано часов за месяц 10,00','май Оплата 004L 10,00/ 2000,00','май Ночные 023L 5,00/ 40,00 400,00',
  'май Районный 026A 20,00 480,00','Всего начислено 2880,00'];

async function makePdf(browser){
  const doc=await browser.newPage();
  await doc.setContent(LINES.map(l=>'<p>'+l+'</p>').join(''));
  const pdf=await doc.pdf();await doc.close();return pdf;
}
// ничего не вылезает за край: страница и карточки
const overflow=page=>page.evaluate(()=>{
  const bad=[];
  if(document.documentElement.scrollWidth>innerWidth+1) bad.push('страница '+document.documentElement.scrollWidth);
  for(const el of document.querySelectorAll('.ps-verdict, .ps-fact, .ps-part, .ps-cmp, .ps-money-row > div, .ps-totals div, .ps-group > summary'))
    if(el.scrollWidth>el.clientWidth+1) bad.push(el.className+' '+el.scrollWidth+'>'+el.clientWidth);
  return bad;
});

test('листок: итог, главное за месяц, из чего сложилась, суммы прячутся; сверка с полосками',{timeout:180000},async()=>{
  const env=await startEnv();
  try {
    const pdf=await makePdf(env.browser);
    for(const [width,text,theme] of [[390,'m','dark'],[320,'xl','dark'],[320,'xl','light']]){
      const {page}=await openApp(env);
      await page.setViewportSize({width,height:800});
      await seed(page,{trips:[{id:'n1',start:'2026-05-04T20:00',end:'2026-05-05T06:00',routeLabel:'А → Б',restType:'turnaround'}],
        settings:{theme,textSize:text,pay:{main:{mode:'tariff',rates:[{from:'2026-01-01',rate:200}],rk:20}}}});
      await page.evaluate(([t,x])=>{document.documentElement.dataset.theme=t;document.documentElement.dataset.text=x;},[theme,text]);
      await page.locator('.tab[data-tab=extra]').click();
      await page.locator('button[data-page=payslip]').click();
      await page.locator('#ps-files').setInputFiles({name:'may.pdf',mimeType:'application/pdf',buffer:pdf});
      await page.waitForSelector('#ps-details [data-verdict]',{timeout:60000});
      const report=page.locator('#ps-details');
      assert.match(await report.locator('[data-verdict]').innerText(),/Сошлось/);
      assert.match(await report.locator('.ps-fact[data-fact=worked]').innerText(),/Отработано[\s\S]*10 ч[\s\S]*норма 143 ч/);
      assert.match(await report.locator('.ps-fact[data-fact=night]').innerText(),/5 ч/);
      const parts=report.locator('[data-breakdown] .ps-part');
      assert.equal(await parts.count(),3);
      assert.deepEqual(await parts.locator('.ps-part-name').evaluateAll(xs=>xs.map(x=>x.firstChild.textContent)),['Работа по тарифу','Ночные','Север и районный']);
      assert.equal(await report.locator('[data-breakdown] .ps-part-sum b.money').count(),3);
      assert.deepEqual(await overflow(page),[],width+' '+text+' '+theme);
      // глаз «скрыть суммы» прячет и новые суммы
      await page.evaluate(()=>document.documentElement.classList.add('money-off'));
      assert.match(await report.locator('.ps-part-sum .money').first().evaluate(e=>getComputedStyle(e).filter),/blur/);
      assert.match(await report.locator('.ps-totals dd.money').first().evaluate(e=>getComputedStyle(e).filter),/blur/);
      await page.evaluate(()=>document.documentElement.classList.remove('money-off'));

      await page.locator('.screen [data-act=back]').click();await page.locator('button[data-page=payslip]').click();
      await page.getByRole('button',{name:/Сверить с поездками в CABINA/}).click();
      await page.locator('#ps-files').setInputFiles({name:'may.pdf',mimeType:'application/pdf',buffer:pdf});
      await page.waitForSelector('#ps-details [data-verdict]',{timeout:60000});
      assert.equal(await report.locator('[data-verdict]').getAttribute('data-verdict'),'bad');
      const worked=report.locator('[data-cmp="Всего отработано"]');
      assert.equal(await worked.locator('.ps-cmp-track').count(),2);
      assert.match(await worked.locator('.ps-tag').innerText(),/Совпало/);
      const night=report.locator('[data-cmp="Ночные часы"]');
      assert.match(await night.locator('.ps-tag').innerText(),/Разница −3 ч/);
      assert.match(await night.innerText(),/CABINA\s+8 ч[\s\S]*Листок\s+5 ч/);
      assert.match(await report.locator('[data-money]').innerText(),/Прогноз CABINA[\s\S]*По листку[\s\S]*2\s880,00/);
      assert.equal(await report.locator('[data-money] b.money').count(),2);
      assert.deepEqual(await overflow(page),[],'сверка '+width+' '+text+' '+theme);
      await page.close();
    }
  } finally {await env.stop();}
});
