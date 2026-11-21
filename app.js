'use strict';
const views=[...document.querySelectorAll('.view')];
document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>{
  views.forEach(view=>view.hidden=view.id!==btn.dataset.open);
  window.scrollTo({top:0,behavior:'smooth'});
}));

// Pemilihan dan preview foto berjalan di browser. Endpoint upload backend belum dihubungkan.
const photos={picking:[],part:[]};
const PICKING_LIMIT=10;
function render(kind){
  const list=photos[kind], count=document.getElementById(`${kind}-count`), area=document.getElementById(`${kind}-previews`);
  count.textContent=kind==='picking'?`${list.length}/10 foto dipilih`:`${list.length} foto dipilih`;
  area.replaceChildren();
  list.forEach((file,index)=>{
    const card=document.createElement('div');card.className='preview';
    const img=document.createElement('img');img.alt=file.name;img.src=URL.createObjectURL(file);
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Hapus foto');
    remove.addEventListener('click',()=>{URL.revokeObjectURL(img.src);list.splice(index,1);render(kind);});
    const name=document.createElement('small');name.textContent=file.name;
    card.append(img,remove,name);area.append(card);
  });
}
function add(kind,fileList){
  const incoming=[...fileList].filter(file=>file.type.startsWith('image/'));
  if(kind==='picking'){
    const remaining=PICKING_LIMIT-photos.picking.length;
    if(incoming.length>remaining)alert(`Maksimal 10 foto Picking List. Slot tersisa: ${remaining}.`);
    photos.picking.push(...incoming.slice(0,Math.max(0,remaining)));
  }else photos.part.push(...incoming);
  render(kind);
}
document.querySelectorAll('[data-camera]').forEach(btn=>btn.addEventListener('click',()=>{
  const kind=btn.dataset.camera;
  if(kind==='picking'&&photos.picking.length>=PICKING_LIMIT){alert('Photo Picking List sudah mencapai 10 foto.');return;}
  document.getElementById(`${kind}-camera`).click();
}));
document.querySelectorAll('[data-upload]').forEach(btn=>btn.addEventListener('click',()=>document.getElementById(`${btn.dataset.upload}-upload`).click()));
['picking','part'].forEach(kind=>{
  ['camera','upload'].forEach(source=>{
    const input=document.getElementById(`${kind}-${source}`);
    input.addEventListener('change',event=>{add(kind,event.target.files);event.target.value='';});
  });
});
document.getElementById('qc-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(!document.getElementById('do-number').value.trim()||!document.getElementById('picking-list').value.trim()){
    alert('DO Number dan Picking List Number wajib diisi.');return;
  }
  if(!photos.picking.length||!photos.part.length){alert('Foto Picking List dan Item / Part wajib ditambahkan.');return;}
  alert('Validasi form berhasil. Backend upload dan penyimpanan belum dihubungkan; belum ada data yang dikirim.');
});
// Laser barcode PDA diharapkan mengisi input yang sedang fokus (keyboard wedge/HID).
// Tidak ada fitur kamera barcode scanner di halaman ini.
