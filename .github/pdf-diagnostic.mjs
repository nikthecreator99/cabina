import {webkit,chromium,devices} from 'playwright';
const chrome=await chromium.launch({executablePath:'/usr/bin/google-chrome'}), doc=await chrome.newPage();
await doc.setContent('<p>Расчетный листок за март месяц 2025 года</p><p>март Оплата 004L 10,00/ 2000,00</p><p>Всего начислено 2000,00</p>');
const bytes=await doc.pdf();await chrome.close();
const {writeFile, mkdtemp, rm}=await import('node:fs/promises');
const dir=await mkdtemp('/tmp/test-cabina-pdf-');await writeFile(dir+'/sample.pdf',bytes);
const w=await webkit.launch();try{
const context=await w.newContext({...devices['iPhone 13']});const page=await context.newPage();
page.on('console',m=>{if(['error','warning'].includes(m.type())) console.log(m.type(),m.text().slice(0,600))});
page.on('pageerror',e=>console.log('pageerror',e.message));
await context.addInitScript(()=>{localStorage.setItem('cabina-tours-off','1');localStorage.setItem('cabina-awards-quiet','1');});
await page.goto(process.env.CAB_URL||'https://cabina-app.ru/',{waitUntil:'domcontentloaded'});
try{await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'domcontentloaded'});}catch{}
await page.waitForSelector('.screen');
const welcome=page.locator('[data-act=onb-ok]');
if(await welcome.isVisible()){await welcome.click();await page.waitForSelector('.layer',{state:'detached'});}
await page.locator('.tab[data-tab=extra]').click();
await page.locator('button[data-page=payslip]').click();
await page.locator('#ps-files').setInputFiles(dir+'/sample.pdf');
await page.waitForSelector('#ps-details',{timeout:40000});
const details=await page.locator('#ps-details').innerText();
if(!details.includes('004L')||!details.replace(/\s/g,'').includes('2000,00'))throw Error('Synthetic payroll amount missing: '+details);
console.log('WEBKIT FILE INPUT PASS',await page.evaluate(()=>({sw:!!navigator.serviceWorker.controller,asyncIterator:!!ReadableStream.prototype[Symbol.asyncIterator]})));
}finally{await w.close();await rm(dir,{recursive:true,force:true});}