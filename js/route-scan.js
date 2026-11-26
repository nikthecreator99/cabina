import {openLayer,closeLayer,sheet,I,esc,toast} from './ui.js';
import {readRoute,fields,normalize} from './route-reader.js';
import {trainDoubt} from './route-ink.js';

export function openRouteScan(apply) {
  const photos=[], results=new Map(), controller=new AbortController();
  let busy=false;
  const el=openLayer(sheet({title:'По фото маршрута · демо',tall:true,body:`
    <div class="notice">${I.lock}<div><b>Фото остаются на телефоне</b><br>Распознавание идёт на этом устройстве. Снимки и распознанный текст никуда не отправляются.</div></div>
    <p class="hint">Выберите одну или несколько сторон одного маршрута. Поверните страницы текстом вверх.</p>
    <button type="button" class="add-btn" data-pick>${I.camera} Выбрать фото</button><input type="file" accept="image/*" multiple hidden>
    <div class="scan-pages"></div><button class="btn btn-primary" data-read hidden>Распознать</button>
    <p role="status" class="hint" data-status></p><div data-review></div>`,
    foot:'<button class="btn btn-primary" data-apply disabled>Перенести в поездку</button>'}),{
    onClose:()=>{controller.abort();for(const p of photos)URL.revokeObjectURL(p.url)}
  });
  const q=s=>el.querySelector(s);
  const status=q('[data-status]'),picker=q('input[type=file]'),pick=q('[data-pick]'),scan=q('[data-read]'),review=q('[data-review]'),applyBtn=q('[data-apply]');
  function reset(){results.clear();review.replaceChildren();applyBtn.disabled=true;status.textContent='';}
  function drawPages(){
    q('.scan-pages').innerHTML=photos.map((p,i)=>`<div class="scan-page"><button class="scan-preview" data-preview="${i}" aria-label="Открыть фото ${i+1}"><img src="${p.url}" alt="" style="transform:rotate(${p.turn*90}deg)"></button><b>Фото ${i+1}</b><button type="button" class="icon-btn" data-rotate="${i}" aria-label="Повернуть фото ${i+1} налево">${I.undo}</button><button class="icon-btn" data-drop="${i}" aria-label="Убрать фото ${i+1}">${I.x}</button></div>`).join('');
    scan.hidden=!photos.length;
  }
  pick.onclick=()=>picker.click();
  picker.onchange=()=>{
    const files=Array.from(picker.files);picker.value='';
    if(busy||!files.length)return;
    if(photos.length+files.length>8 || files.some(f=>f.size>32*1024*1024)){toast('За раз можно выбрать до 8 фото, каждое до 32 МБ.');return}
    reset();
    for(const file of files)photos.push({file,url:URL.createObjectURL(file),turn:0});
    drawPages();
  };
  q('.scan-pages').onclick=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.preview!==undefined){
      const p=photos[+b.dataset.preview];
      const view=openLayer(sheet({title:'Фото маршрута',tall:true,body:`<img class="scan-source" alt="Фото маршрута" src="${p.url}">`}));
      view.querySelector('img').style.transform=`rotate(${p.turn*90}deg)`;return;
    }
    if(busy)return;reset();
    if(b.dataset.rotate!==undefined){const p=photos[+b.dataset.rotate];p.turn=(p.turn+3)%4;}
    if(b.dataset.drop!==undefined)URL.revokeObjectURL(photos.splice(+b.dataset.drop,1)[0].url);
    drawPages();
  };
  function selected(){
    return [...review.querySelectorAll('[data-key]')].filter(row=>row.querySelector('[type=checkbox]').checked);
  }
  function update(){applyBtn.disabled=busy||!selected().length;}
  // Вес, оси и длина проверяют друг друга: 5200 т на 30 осей — это ошибка чтения, а не поезд.
  function doubt(){
    const box=review.querySelector('[data-doubt]');if(!box)return;
    const val=k=>review.querySelector(`[data-key=${k}] .input`)?.value.replace(/\s/g,'')||'';
    const text=trainDoubt({weight:val('weight'),axles:val('axles'),length:val('length')});
    box.textContent=text?text+'. Сверьте с фото.':'';box.hidden=!text;
  }
  function fieldRow(key,value,source,checked,snippet='',extra=''){
    const hint=['sd','ed'].includes(key)?'ДД.ММ.ГГГГ':['st','et','passSt','passEt'].includes(key)?'ЧЧ:ММ':'';
    return `<div class="scan-field" data-key="${key}"><label><input type="checkbox" ${checked?'checked':''}> ${esc(fields[key])}</label>${snippet?`<img class="scan-snippet" alt="Графа на фотографии" src="${snippet}">`:''}<input class="input" placeholder="${hint}" aria-label="${esc(fields[key])}" value="${esc(value)}"><small class="hint">${esc(source)}</small>${extra}</div>`;
  }
  review.onclick=e=>{
    const choice=e.target.closest('[data-suggestion]');
    if(!choice)return;
    const row=choice.closest('[data-key]');
    row.querySelector('.input').value=choice.dataset.suggestion;
    row.querySelector('[type=checkbox]').checked=true;
    update();doubt();
  };
  review.oninput=e=>{
    const row=e.target.closest('[data-key]');if(!row)return;
    if(e.target.classList.contains('input'))row.querySelector('[type=checkbox]').checked=!!e.target.value.trim();
    update();doubt();
  };
  scan.onclick=async()=>{
    if(busy)return;
    reset();busy=true;scan.disabled=pick.disabled=true;
    const texts=[],failed=[];
    try{
      for(let i=0;i<photos.length;i++){
        const prefix=`Фото ${i+1} из ${photos.length}. `;
        status.textContent=prefix+'Загружаем модуль чтения…';
        try{
          const found=await readRoute(photos[i].file,photos[i].turn,controller.signal,msg=>{status.textContent=prefix+msg});
          photos[i].turn=found.turn;drawPages();
          texts.push(found.text);
          for(const r of found.rows){
            const values=results.get(r.key)||new Map(),had=values.get(r.value);
            // одно и то же значение по графе и по смыслу — оставляем объяснение и картинку, где они есть
            values.set(r.value,{source:`Фото ${i+1}`,snippet:r.snippet||had?.snippet,why:r.why||had?.why});results.set(r.key,values);
          }
        }catch{if(controller.signal.aborted)return;failed.push(i+1)}
      }
      if(controller.signal.aborted)return;
      status.textContent=(failed.length?'Не удалось прочитать фото '+failed.join(', ')+'. При первом запуске нужен интернет для загрузки модуля. ':'')+(results.size?'Сверьте значения со снимком. Отметьте поля для переноса.':'Уверенно сопоставить значения с полями не удалось. Можно повернуть фото или заполнить поля по снимку.');
      const rows=[],missing=[];
      for(const key of Object.keys(fields)){
        const values=results.get(key);
        if(!values){missing.push(fieldRow(key,'','',false));continue}
        const entries=[...values], candidates=entries.filter(([v])=>v);
        const value=candidates.length===1?candidates[0][0]:'';
        const src=entries.find(([,info])=>info.snippet)?.[1] || entries[0][1];
        let extra='';
        if(candidates.length>1){
          const choices=candidates.map(([v,info])=>`<button type="button" class="qchip" data-suggestion="${esc(v)}" aria-label="${esc(info.source+' · '+v)}">${esc(v)} · ${esc(info.source)}</button>`).join('');
          extra=`<div class="hint">Варианты чтения</div><div class="scan-choices">${choices}</div>`;
        }
        const why=candidates.length===1?candidates[0][1].why:'';
        rows.push(fieldRow(key,value,src.source+(why?' · '+why:'')+(src.snippet?' · сверьте с графой':''),false,src.snippet,extra));
      }
      review.innerHTML='<p class="notice" data-doubt hidden></p>'+rows.join('')+`<details><summary>Заполнить другие поля</summary>${missing.join('')}</details><details><summary>Распознанный текст</summary><pre>${esc(texts.join('\n\n')||'Текст не распознан')}</pre></details>`;
    } finally {busy=false;scan.disabled=pick.disabled=false;update();doubt()}
  };
  applyBtn.onclick=()=>{
    const values={};
    for(const row of selected()){
      const k=row.dataset.key,input=row.querySelector('.input'),v=normalize(k,input.value);
      if(!v || Object.hasOwn(values,k)){status.textContent='Проверьте поле «'+fields[k]+'» и выберите одно значение.';input.focus();return;}
      values[k]=v;
    }
    if(!Object.keys(values).length)return;
    closeLayer(el);apply(values);
  };
}
