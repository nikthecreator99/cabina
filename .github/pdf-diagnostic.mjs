import {webkit,chromium,devices} from 'playwright';
const chrome=await chromium.launch({executablePath:'/usr/bin/google-chrome'}), doc=await chrome.newPage();
await doc.setContent('<p>Расчетный листок за март месяц 2025 года</p><p>март Оплата 004L 10,00/ 2000,00</p><p>Всего начислено 2000,00</p>');
const bytes=(await doc.pdf()).toString('base64');await chrome.close();
const w=await webkit.launch();try{
const context=await w.newContext({...devices['iPhone 13']});const page=await context.newPage();
page.on('console',m=>{if(['error','warning'].includes(m.type())) console.log(m.type(),m.text().slice(0,600))});
page.on('pageerror',e=>console.log('pageerror',e.message));
await page.goto(process.env.CAB_URL||'https://cabina-app.ru/',{waitUntil:'domcontentloaded'});
try{await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'domcontentloaded'});}catch{}
const result=await page.evaluate(async bytes=>{
const f=new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'sample.pdf',{type:'application/pdf'});
try{const mod=await import('/js/payslip-reader.js');const r=await mod.readPayslip([f],console.log,new AbortController().signal);return {ok:r.text.includes('004L'),sw:!!navigator.serviceWorker.controller};}
catch(e){return {error:e.name+' '+e.message,stack:e.stack?.slice(0,1000)};}
},bytes);console.log('PDF CHECK',result);if(!result.ok) process.exitCode=1;
}finally{await w.close()}