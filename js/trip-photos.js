import { getAll, openDB, tripPhotoRange } from './db.js';
import { I, uid, sheet, openLayer, closeLayer, toast } from './ui.js';

export const tripPhotoFields = `<div class="field trip-photos">
  <button class="add-btn" type="button" data-photo-add>${I.camera} Добавить фото</button>
  <input type="file" data-photo-files accept="image/*" multiple hidden>
  <div class="trip-photo-strip" aria-label="Фотографии поездки"></div>
  <div class="hint">Только на этом устройстве. Фото не входят в передачу коллеге и резервную копию.</div>
</div>`;

async function makeThumbnail(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 144;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    canvas.getContext('2d').drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, 144, 144);
    const thumb = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!thumb) throw new Error('thumbnail');
    return thumb;
  } finally { URL.revokeObjectURL(url); }
}

export function bindTripPhotos(form, tripId) {
  const strip = form.querySelector('.trip-photo-strip');
  const picker = form.querySelector('[data-photo-files]');
  const add = form.querySelector('[data-photo-add]');
  const items = [];
  const removed = [];
  let disposed = false;
  function append(record, added) {
    if (disposed) return;
    const url = URL.createObjectURL(record.thumb);
    const button = document.createElement('button');
    button.type = 'button';
    const img = new Image();
    img.src = url;
    img.alt = 'Открыть фото ' + (record.file.name || 'поездки');
    button.append(img);
    const item = {record, added, url, button};
    items.push(item);
    button.onclick = () => show(item);
    strip.append(button);
  }
  function show(item) {
    let index = items.indexOf(item);
    let url;
    const viewer = openLayer(sheet({
      title: 'Фото поездки', tall:true,
      body: '<img class="trip-photo-full" alt="Фотография поездки">',
      foot: `<button class="icon-btn" data-prev aria-label="Предыдущее фото">${I.left}</button>
        <button class="btn" data-remove>${I.trash} Убрать</button>
        <button class="icon-btn" data-next aria-label="Следующее фото">${I.right}</button>`
    }), { onClose: () => URL.revokeObjectURL(url) });
    const image = viewer.querySelector('.trip-photo-full');
    const prev = viewer.querySelector('[data-prev]');
    const next = viewer.querySelector('[data-next]');
    function display(position) {
      if (!items[position]) return;
      if (url) URL.revokeObjectURL(url);
      index = position;
      item = items[index];
      url = URL.createObjectURL(item.record.file);
      image.src = url;
      viewer.querySelector('h2').textContent = `Фото ${index+1} из ${items.length}`;
      prev.disabled = index === 0;
      next.disabled = index === items.length-1;
    }
    prev.onclick = () => display(index-1);
    next.onclick = () => display(index+1);
    let start;
    image.ontouchstart = e => { start = e.touches.length === 1 ? e.touches[0] : null; };
    image.ontouchend = e => {
      if (!start || e.touches.length) return;
      const dx = e.changedTouches[0].clientX-start.clientX;
      const dy = e.changedTouches[0].clientY-start.clientY;
      if (Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5) display(index-Math.sign(dx));
      start = null;
    };
    display(index);
    viewer.querySelector('[data-remove]').onclick = () => {
      if (!item.added) removed.push({store:'blobs', del:item.record.id});
      items.splice(index,1);
      item.button.remove();
      URL.revokeObjectURL(item.url);
      closeLayer(viewer);
    };
  }
  add.disabled = true;
  let pending = (async () => {
    if (!await openDB()) throw new Error('storage');
    const records = await getAll('blobs',tripPhotoRange(tripId));
    records.sort((a,b)=>a.created-b.created).forEach(record=>append(record,false));
    add.disabled = false;
  })().catch(()=>{ form.querySelector('.trip-photos .hint').textContent='Хранилище фото на устройстве недоступно.'; });
  add.onclick = () => picker.click();
  picker.onchange = () => {
    const files = Array.from(picker.files);
    picker.value = '';
    add.disabled = true;
    pending = pending.then(async () => {
      for (const file of files) {
        if (disposed) return;
        try {
          const thumb = await makeThumbnail(file);
          append({id:[tripId,uid()], file, thumb, created:Date.now()},true);
        } catch { if (!disposed) toast('Не удалось открыть фото. Попробуйте JPEG или PNG.', {error:true}); }
      }
    }).finally(()=>{ add.disabled=false; });
  };
  return {
    async operations() {
      await pending;
      return [...removed,...items.filter(i=>i.added).map(i=>({store:'blobs',put:i.record}))];
    },
    dispose() { disposed=true; items.forEach(i=>URL.revokeObjectURL(i.url)); }
  };
}
