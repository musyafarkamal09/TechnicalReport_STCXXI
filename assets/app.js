
(function(){
"use strict";
/* ---------- utils ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const pad=n=>String(n).padStart(2,"0");
const today=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const fmtDate=s=>{if(!s)return"-";const p=s.split("-").map(Number);if(p.length<3)return s;return new Date(p[0],p[1]-1,p[2]).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})};
const rp=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n||0);
const nf=n=>new Intl.NumberFormat("id-ID",{maximumFractionDigits:2}).format(n);
const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const slug=s=>String(s||"tanpa-judul").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"item";
const IC={
  home:'<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  kerja:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5L3 17.6 6.4 21l6.3-6.3a4 4 0 0 0 5-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  beli:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
  meter:'<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1"/>',
  ekspor:'<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>'
};
const ico=n=>`<svg class="ic" viewBox="0 0 24 24">${IC[n]}</svg>`;

/* ---------- theme ---------- */
function setTheme(t){document.documentElement.setAttribute("data-theme",t);try{localStorage.setItem("xxi-theme",t)}catch(e){}}
try{const t=localStorage.getItem("xxi-theme");if(t==="light"||t==="dark")setTheme(t)}catch(e){}

/* ---------- state & API (Google Apps Script + Google Sheets + Google Drive) ---------- */
const CFG=window.XXI_CONFIG||{};
const S={reports:[],ann:[],ats:[],note:"",canWrite:true,name:"",ready:false,online:false};
const photoCache=new Map();
let cur="beranda",lastSig="";
const F={kerja:{q:"",f:"",m:""},beli:{q:"",f:"",m:""},meter:{q:"",f:"",m:""}};
const KEY_STORE="xxi-key",NAME_STORE="xxi-name";
const lsGet=k=>{try{return localStorage.getItem(k)||""}catch(e){return""}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const apiReady=()=>CFG.API_URL&&/^https:\/\/script\.google\.com\//.test(CFG.API_URL);
async function api(action,payload){
  const r=await fetch(CFG.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,key:lsGet(KEY_STORE),...(payload||{})})});
  const j=await r.json();
  if(!j.ok){const e=new Error(j.error||"error");e.code=j.error;throw e}
  return j;
}
const clean=o=>JSON.parse(JSON.stringify(o));
const COLS={reports:"reports",announcements:"ann",ats:"ats"};
async function put(col,id,data){
  data=clean(data);
  await api("put",{col,id,data});
  if(col==="settings"){S.note=data.note||"";refresh();return}
  const arr=S[COLS[col]];const i=arr.findIndex(x=>x.id===id);const row={id,...data};
  if(i>=0)arr[i]=row;else arr.push(row);
  lastSig="";refresh();
}
async function del(col,id){
  const cat=col==="reports"?(S.reports.find(x=>x.id===id)||{}).cat:undefined;
  await api("del",{col,id,cat});
  const arr=S[COLS[col]];const i=arr.findIndex(x=>x.id===id);if(i>=0)arr.splice(i,1);
  lastSig="";refresh();
}
const thumbURL=id=>`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w320`;
const fullURL=id=>`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1800`;
async function getPhoto(id){
  if(photoCache.has(id))return photoCache.get(id);
  try{const j=await api("photoGet",{id});const d={data:j.data};photoCache.set(id,d);return d}catch(e){return null}
}
async function uploadPhoto(reportId,cat,p){const j=await api("photoUp",{reportId,cat,name:p.name,data:p.data});return j.id}
async function deletePhoto(id){try{await api("photoDel",{id})}catch(e){}photoCache.delete(id)}
async function loadAll(silent){
  if(!apiReady()){S.ready=true;updateChip();return}
  if(!lsGet(KEY_STORE)){askKey(false);return}
  try{
    const j=await api("list");
    const sig=JSON.stringify([j.reports,j.ann,j.ats,j.note]);
    S.online=true;
    if(sig!==lastSig){lastSig=sig;S.reports=j.reports||[];S.ann=j.ann||[];S.ats=j.ats||[];S.note=j.note||"";S.ready=true;updateChip();refresh();return}
  }catch(e){
    if(e.code==="unauthorized"){lsSet(KEY_STORE,"");askKey(true);return}
    S.online=false;if(!silent)toast("Tidak dapat terhubung ke server. Periksa koneksi internet.");
  }
  S.ready=true;updateChip();
}
function askKey(wrong){
  if($("#keyov"))return;
  const o=document.createElement("div");o.className="ov";o.id="keyov";o.style.zIndex=100;
  o.innerHTML=`<div class="sheet" style="max-width:420px;border-radius:22px;margin:16px"><div class="sh-h"><h3>Masuk</h3></div><div class="sh-b" style="grid-template-columns:1fr"><p class="muted" style="margin:0">${wrong?"Kode akses salah. ":""}Masukkan kode akses Team Technical.</p><div class="fld"><label for="k-name">Nama Anda</label><input id="k-name" value="${esc(S.name)}" autocomplete="name"></div><div class="fld"><label for="k-key">Kode akses</label><input id="k-key" type="password" autocomplete="current-password"></div></div><div class="sh-f"><button class="btn pri" id="k-ok" type="button">Masuk</button></div></div>`;
  document.body.appendChild(o);
  const go=()=>{const k=$("#k-key").value.trim();if(!k)return;lsSet(KEY_STORE,k);S.name=$("#k-name").value.trim();lsSet(NAME_STORE,S.name);o.remove();lastSig="";loadAll()};
  $("#k-ok").addEventListener("click",go);
  o.addEventListener("keydown",e=>{if(e.key==="Enter")go()});
  setTimeout(()=>$("#k-key").focus(),50);
}
function updateChip(){
  const c=$("#sync");
  if(!apiReady()){c.textContent="Belum dikonfigurasi";c.className="chip warn";return}
  if(!S.ready){c.textContent="Memuat…";c.className="chip";return}
  c.textContent=S.online?"Tersambung · Sheets":"Offline";c.className="chip "+(S.online?"ok":"warn");
}

/* ---------- config ---------- */
const STUDIOS=["Studio 1","Studio 2","Studio 3","Studio 4","Studio 5","Studio 6","Lobby","Ruang Proyektor","Ruang Server","Area Toilet","Parkir","Lainnya"];
const CATS={
  kerja:{name:"Pengerjaan",title:"Laporan Pengerjaan",desc:"Dokumentasi pekerjaan perbaikan, perawatan, dan instalasi teknis beserta foto sebelum–sesudah.",
    filt:{label:"Semua status",key:"f",opts:["Selesai","Proses","Pending"],field:"status"},
    t:r=>r.judul||"(tanpa judul)",
    fields:[
      {k:"tanggal",l:"Tanggal",t:"date",req:1,def:today},
      {k:"lokasi",l:"Lokasi / Studio",t:"text",req:1,list:STUDIOS},
      {k:"judul",l:"Judul Pekerjaan",t:"text",req:1,full:1,ph:"Contoh: Penggantian lampu proyektor Studio 3"},
      {k:"uraian",l:"Uraian Pekerjaan",t:"textarea",full:1,ph:"Kendala, tindakan, hasil, dan material yang dipakai"},
      {k:"teknisi",l:"Teknisi",t:"text",nameDef:1},
      {k:"status",l:"Status",t:"select",o:["Selesai","Proses","Pending"],def:"Selesai"},
      {k:"prioritas",l:"Prioritas",t:"select",o:["Rendah","Sedang","Tinggi"],def:"Sedang"}
    ]},
  beli:{name:"Pembelian",title:"Laporan Pembelian Barang",desc:"Catat pembelian barang, harga, vendor, dan unggah foto nota atau bukti penerimaan.",
    filt:{label:"Semua status",key:"f",opts:["Diajukan","Disetujui","Dibeli","Diterima"],field:"status"},
    t:r=>r.barang||"(tanpa nama)",
    fields:[
      {k:"tanggal",l:"Tanggal",t:"date",req:1,def:today},
      {k:"barang",l:"Nama Barang",t:"text",req:1,ph:"Contoh: Kabel HDMI 10 m"},
      {k:"qty",l:"Jumlah",t:"number",req:1,def:1},
      {k:"satuan",l:"Satuan",t:"text",list:["pcs","unit","set","meter","roll","dus","liter"],def:"pcs"},
      {k:"harga",l:"Harga Satuan (Rp)",t:"number",req:1},
      {k:"toko",l:"Toko / Vendor",t:"text"},
      {k:"keperluan",l:"Keperluan",t:"textarea",full:1,ph:"Untuk pekerjaan atau area apa barang ini dibeli"},
      {k:"pemohon",l:"Pemohon",t:"text",nameDef:1},
      {k:"status",l:"Status",t:"select",o:["Diajukan","Disetujui","Dibeli","Diterima"],def:"Dibeli"}
    ]},
  meter:{name:"Meteran",title:"Pencatatan Meteran Air & Listrik",desc:"Catat angka meter listrik (kWh) dan air (m³). Pemakaian dihitung otomatis dari bacaan sebelumnya.",
    filt:{label:"Semua jenis",key:"f",opts:["Listrik","Air"],field:"jenis"},
    t:r=>(r.jenis||"")+" · "+(r.titik||""),
    fields:[
      {k:"tanggal",l:"Tanggal",t:"date",req:1,def:today},
      {k:"waktu",l:"Jam",t:"time",def:()=>{const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes())}},
      {k:"jenis",l:"Jenis Meter",t:"select",o:["Listrik","Air"],def:"Listrik"},
      {k:"titik",l:"Titik / Lokasi Meter",t:"text",req:1,list:()=>[...new Set(["KWH Utama","KWH Studio","KWH Lobby","Meter Air Utama","Meter Air Tandon",...S.reports.filter(r=>r.cat==="meter").map(r=>r.titik).filter(Boolean)])]},
      {k:"angka",l:"Angka Meter",t:"number",req:1,full:1,ph:"Angka pada meteran saat ini"},
      {k:"petugas",l:"Petugas",t:"text",nameDef:1},
      {k:"catatan",l:"Catatan",t:"textarea",full:1,ph:"Kondisi meter, kejanggalan, dll."}
    ]}
};
const ROUTES=["beranda","kerja","beli","meter","ekspor"];
const NAVL={beranda:"Beranda",kerja:"Pengerjaan",beli:"Pembelian",meter:"Meteran",ekspor:"Ekspor"};
const NAVI={beranda:"home",kerja:"kerja",beli:"beli",meter:"meter",ekspor:"ekspor"};

/* ---------- toast / progress / confirm ---------- */
let tt;
function toast(m){$$(".toast").forEach(x=>x.remove());const e=document.createElement("div");e.className="toast";e.textContent=m;document.body.appendChild(e);clearTimeout(tt);tt=setTimeout(()=>e.remove(),3800)}
function progress(txt,pct){let p=$(".prog");if(!p){p=document.createElement("div");p.className="prog";p.innerHTML='<div><b id="pt"></b><div class="bar"><i id="pb"></i></div></div>';document.body.appendChild(p)}$("#pt").textContent=txt;$("#pb").style.width=Math.round(pct*100)+"%"}
function progressEnd(){$$(".prog").forEach(x=>x.remove())}
function askConfirm(msg,ok="Hapus"){
  return new Promise(res=>{
    const o=document.createElement("div");o.className="ov";o.style.zIndex=70;
    o.innerHTML=`<div class="sheet" style="max-width:420px;border-radius:22px;margin:16px"><div class="sh-b" style="grid-template-columns:1fr"><h3 style="font-size:26px">Konfirmasi</h3><p style="margin:0" class="muted">${esc(msg)}</p></div><div class="sh-f"><button class="btn" data-c="0">Batal</button><button class="btn pri" data-c="1">${esc(ok)}</button></div></div>`;
    o.addEventListener("click",e=>{const b=e.target.closest("[data-c]");if(b||e.target===o){o.remove();res(b?b.dataset.c==="1":false)}});
    document.body.appendChild(o);
  });
}

/* ---------- files: save / zip / export ---------- */
async function saveFile(name,data,mime){
  const blob=data instanceof Blob?data:new Blob([data],{type:mime});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
  toast("Unduhan dimulai: "+name);
}
function titleOf(r){const c=CATS[r.cat];return c?c.t(r):""}
async function zipPhotos(list,filename){
  const rs=list.filter(r=>(r.photoIds||[]).length);
  if(!rs.length){toast("Belum ada foto untuk diunduh");return}
  if(typeof JSZip==="undefined"){toast("Pustaka ZIP belum termuat. Periksa koneksi lalu coba lagi.");return}
  const zip=new JSZip();const total=rs.reduce((a,r)=>a+r.photoIds.length,0);let done=0;
  try{
    for(const r of rs){
      const folder=`${CATS[r.cat].name}/${r.tanggal||"tanpa-tanggal"}_${slug(titleOf(r))}-${String(r.id).slice(-4)}`;
      for(let i=0;i<r.photoIds.length;i++){
        progress(`Menyiapkan foto ${done+1} dari ${total}…`,done/total);
        const p=await getPhoto(r.photoIds[i]);
        if(p&&p.data)zip.file(`${folder}/foto-${pad(i+1)}.jpg`,p.data.split(",")[1],{base64:true});
        done++;
      }
    }
    progress("Membuat file ZIP…",.97);
    const blob=await zip.generateAsync({type:"blob",compression:"STORE"});
    progressEnd();await saveFile(filename,blob,"application/zip");
  }catch(e){progressEnd();toast("Gagal membuat ZIP")}
}
function meterRows(){
  const rows=S.reports.filter(r=>r.cat==="meter").sort((a,b)=>((a.tanggal||"")+(a.waktu||""))<((b.tanggal||"")+(b.waktu||""))?-1:1);
  const last={};
  rows.forEach(r=>{const k=r.jenis+"|"+(r.titik||"").toLowerCase();const p=last[k];r._use=p!=null?+(r.angka-p).toFixed(2):null;last[k]=+r.angka});
  return rows;
}
const byDate=(a,b)=>((b.tanggal||"")+(b.createdAt||""))<((a.tanggal||"")+(a.createdAt||""))?-1:1;
function rowsFor(cat){
  if(cat==="kerja")return S.reports.filter(r=>r.cat==="kerja").sort((a,b)=>-byDate(a,b)).map(r=>({"Tanggal":r.tanggal,"Lokasi/Studio":r.lokasi,"Judul Pekerjaan":r.judul,"Uraian":r.uraian||"","Teknisi":r.teknisi||"","Status":r.status,"Prioritas":r.prioritas,"Jumlah Foto":(r.photoIds||[]).length}));
  if(cat==="beli")return S.reports.filter(r=>r.cat==="beli").sort((a,b)=>-byDate(a,b)).map(r=>({"Tanggal":r.tanggal,"Barang":r.barang,"Jumlah":r.qty,"Satuan":r.satuan||"","Harga Satuan":r.harga,"Total":(r.qty||0)*(r.harga||0),"Toko/Vendor":r.toko||"","Keperluan":r.keperluan||"","Pemohon":r.pemohon||"","Status":r.status,"Jumlah Foto":(r.photoIds||[]).length}));
  return meterRows().map(r=>({"Tanggal":r.tanggal,"Jam":r.waktu||"","Jenis":r.jenis,"Titik Meter":r.titik,"Angka Meter":r.angka,"Pemakaian":r._use==null?"":r._use,"Satuan":r.jenis==="Listrik"?"kWh":"m³","Petugas":r.petugas||"","Catatan":r.catatan||"","Jumlah Foto":(r.photoIds||[]).length}));
}
const stamp=()=>today();
function exportXLSX(only){
  if(typeof XLSX==="undefined"){toast("Pustaka Excel belum termuat. Periksa koneksi lalu coba lagi.");return}
  const wb=XLSX.utils.book_new();
  (only?[only]:["kerja","beli","meter"]).forEach(c=>{
    const rows=rowsFor(c);const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Info":"Belum ada data"}]);
    const keys=Object.keys(rows[0]||{Info:1});
    ws["!cols"]=keys.map(k=>({wch:Math.min(46,Math.max(k.length,...rows.map(r=>String(r[k]??"").length))+2)}));
    XLSX.utils.book_append_sheet(wb,ws,CATS[c].name);
  });
  const buf=XLSX.write(wb,{bookType:"xlsx",type:"array"});
  saveFile(`Laporan-Technical-${only?CATS[only].name+"-":""}${stamp()}.xlsx`,new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
}
function toCSV(rows){
  if(!rows.length)return"";const k=Object.keys(rows[0]);const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  return"\ufeff"+[k.map(q).join(","),...rows.map(r=>k.map(x=>q(r[x])).join(","))].join("\r\n");
}
function exportCSV(c){const rows=rowsFor(c);if(!rows.length){toast("Belum ada data");return}saveFile(`Laporan-${CATS[c].name}-${stamp()}.csv`,new Blob([toCSV(rows)],{type:"text/csv;charset=utf-8"}))}
async function copyTSV(c){
  const rows=rowsFor(c);if(!rows.length){toast("Belum ada data");return}
  const k=Object.keys(rows[0]);const cl=v=>String(v??"").replace(/[\t\r\n]+/g," ");
  const text=[k.join("\t"),...rows.map(r=>k.map(x=>cl(r[x])).join("\t"))].join("\n");
  try{await navigator.clipboard.writeText(text);toast("Tersalin. Buka Google Sheets, pilih sel A1, lalu tempel.");return}catch(e){}
  const o=document.createElement("div");o.className="ov";
  o.innerHTML=`<div class="sheet"><div class="sh-h"><h3>Salin Data</h3><button class="icon-btn" data-c>&times;</button></div><div class="sh-b" style="grid-template-columns:1fr"><p class="muted" style="margin:0;font-size:13px">Pilih semua teks di bawah, salin, lalu tempel di sel A1 Google Sheets.</p><textarea class="copy" readonly>${esc(text)}</textarea></div></div>`;
  o.addEventListener("click",e=>{if(e.target===o||e.target.closest("[data-c]"))o.remove()});
  document.body.appendChild(o);const ta=$("textarea",o);ta.focus();ta.select();
}

/* ---------- photos: compress ---------- */
function loadSrc(src,revoke){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>{if(revoke)URL.revokeObjectURL(src);res(i)};i.onerror=()=>{if(revoke)URL.revokeObjectURL(src);rej(new Error("img"))};i.src=src})}
function draw(img,max,q){
  const r=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(img.width*r));c.height=Math.max(1,Math.round(img.height*r));
  const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
  return c.toDataURL("image/jpeg",q);
}
async function compress(file){
  const img=await loadSrc(URL.createObjectURL(file),true);
  let max=1280,q=.8,out=draw(img,max,q),n=0;
  while(out.length>215000&&n<10){if(q>.46)q-=.08;else max=Math.round(max*.82);out=draw(img,max,q);n++}
  return{data:out,thumb:draw(img,150,.55)};
}
async function thumbOf(dataUrl){return draw(await loadSrc(dataUrl,false),150,.55)}

/* ---------- reports: save / delete ---------- */
async function saveReport(cat,id,vals,photos,onP){
  const old=id?S.reports.find(r=>r.id===id):null;const rid=id||uid();
  const keep=photos.filter(p=>p.existing).map(p=>p.id);
  const removed=((old&&old.photoIds)||[]).filter(pid=>!keep.includes(pid));
  const ids=[];const newCount=photos.filter(p=>!p.existing).length;let k=0;
  for(const p of photos){
    if(p.existing)ids.push(p.id);
    else{k++;onP&&onP(`Mengunggah foto ${k} dari ${newCount}…`);ids.push(await uploadPhoto(rid,cat,p))}
  }
  const doc={...vals,cat,photoIds:ids,updatedAt:Date.now(),createdAt:(old&&old.createdAt)||Date.now(),by:(old&&old.by)||S.name||""};
  if(cat==="beli")doc.total=(vals.qty||0)*(vals.harga||0);
  await put("reports",rid,doc);
  for(const pid of removed)await deletePhoto(pid);
}
async function deleteReport(id){
  const r=S.reports.find(x=>x.id===id);if(!r)return;
  await del("reports",id);
  for(const pid of r.photoIds||[])await deletePhoto(pid);
  toast("Laporan dihapus");
}

/* ---------- form modal ---------- */
function fieldHTML(f,v,vals){
  const id="f-"+f.k,val=v==null?"":v;
  if(f.t==="check")return`<div class="fld full"><label class="chk"><input type="checkbox" id="${id}" name="${f.k}" ${v?"checked":""}> ${esc(f.l)}</label></div>`;
  const lab=`<label for="${id}">${esc(f.l)}${f.req?"<em>*</em>":""}</label>`;let inp;
  const list=typeof f.list==="function"?f.list():f.list;
  if(f.t==="select")inp=`<select id="${id}" name="${f.k}">${f.o.map(o=>`<option ${o===val?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
  else if(f.t==="textarea")inp=`<textarea id="${id}" name="${f.k}" rows="3" placeholder="${esc(f.ph||"")}">${esc(val)}</textarea>`;
  else inp=`<input id="${id}" name="${f.k}" type="${f.t||"text"}" ${f.t==="number"?'inputmode="decimal" step="any"':""} value="${esc(val)}" placeholder="${esc(f.ph||"")}" ${list?`list="dl-${f.k}"`:""} autocomplete="off">`+(list?`<datalist id="dl-${f.k}">${list.map(o=>`<option value="${esc(o)}">`).join("")}</datalist>`:"");
  return`<div class="fld ${f.full?"full":""}">${lab}${inp}</div>`;
}
function openForm(cfg){
  $$(".ov.form").forEach(x=>x.remove());
  const photos=cfg.photos?(cfg.initPhotos||[]).slice():[];
  const o=document.createElement("div");o.className="ov form";
  const vals=cfg.vals||{};
  const body=cfg.fields.map(f=>{
    let v=vals[f.k];
    if(v==null||v===""){if(f.nameDef&&S.name)v=S.name;else if(f.def!=null&&!cfg.editing)v=typeof f.def==="function"?f.def():f.def}
    if(f.t==="check"&&cfg.editing===false&&vals[f.k]==null)v=f.def;
    return fieldHTML(f,v);
  }).join("");
  o.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(cfg.title)}">
    <div class="sh-h"><h3>${esc(cfg.title)}</h3><button class="icon-btn" data-x aria-label="Tutup">&times;</button></div>
    <form id="frm" novalidate><div class="sh-b">${body}${cfg.extra||""}
      ${cfg.photos?`<div class="photos"><div class="photos-h"><b>Foto <span id="pcount" class="muted"></span></b>
        <span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn sm" data-pick>Pilih Foto</button><button type="button" class="btn sm" data-cam>Kamera</button></span></div>
        <div class="pgrid" id="pgrid"></div><div class="hint" id="phint">Bisa memilih beberapa foto sekaligus (maks. 20 per laporan). Foto dikompres otomatis.</div>
        <input type="file" id="fpick" accept="image/*" multiple hidden><input type="file" id="fcam" accept="image/*" capture="environment" hidden></div>`:""}
    </div></form>
    <div class="sh-f"><button class="btn" data-x type="button">Batal</button><button class="btn pri" id="save" type="button">Simpan</button></div></div>`;
  document.body.appendChild(o);
  const fm=$("#frm",o);
  function drawPhotos(){
    if(!cfg.photos)return;
    $("#pgrid",o).innerHTML=photos.map((p,i)=>`<div class="ph">${p.thumb?`<img src="${p.thumb}" alt="Foto ${i+1}">`:`<span>Foto ${i+1}</span>`}<button type="button" data-rm="${i}" aria-label="Hapus foto">&times;</button></div>`).join("");
    $("#pcount",o).textContent=photos.length?`(${photos.length})`:"";
  }
  drawPhotos();
  photos.forEach(p=>{if(p.existing&&!p.thumb)getPhoto(p.id).then(ph=>ph&&thumbOf(ph.data)).then(t=>{if(t){p.thumb=t;drawPhotos()}}).catch(()=>{})});
  async function addFiles(files){
    const hint=$("#phint",o);const arr=[...files].filter(f=>/^image\//.test(f.type));let n=0;
    for(const f of arr){
      if(photos.length>=20){hint.textContent="Batas 20 foto per laporan tercapai.";break}
      hint.textContent=`Memproses foto ${++n} dari ${arr.length}…`;
      try{const c=await compress(f);photos.push({new:true,data:c.data,thumb:c.thumb,name:f.name||"foto.jpg"});drawPhotos()}catch(e){toast("Satu foto tidak dapat dibaca")}
    }
    if(photos.length<20)hint.textContent="Bisa memilih beberapa foto sekaligus (maks. 20 per laporan). Foto dikompres otomatis.";
  }
  o.addEventListener("click",e=>{
    if(e.target===o||e.target.closest("[data-x]")){o.remove();return}
    if(e.target.closest("[data-pick]"))$("#fpick",o).click();
    if(e.target.closest("[data-cam]"))$("#fcam",o).click();
    const rm=e.target.closest("[data-rm]");if(rm){photos.splice(+rm.dataset.rm,1);drawPhotos()}
  });
  if(cfg.photos){
    $("#fpick",o).addEventListener("change",e=>{addFiles(e.target.files);e.target.value=""});
    $("#fcam",o).addEventListener("change",e=>{addFiles(e.target.files);e.target.value=""});
  }
  cfg.onMount&&cfg.onMount(o,vals);
  $("#save",o).addEventListener("click",async()=>{
    const v={};
    for(const f of cfg.fields){
      const el=fm.querySelector(`[name="${f.k}"]`);if(!el)continue;
      let x=f.t==="check"?el.checked:el.value.trim();if(f.t==="number")x=x===""?null:Number(x);
      if(f.req&&(x===""||x==null||Number.isNaN(x))){toast(`Isi "${f.l}" terlebih dahulu`);el.focus();return}
      v[f.k]=x;
    }
    const b=$("#save",o);b.disabled=true;b.textContent="Menyimpan…";
    try{
      await cfg.onSubmit(v,photos,t=>{b.textContent=t});
      o.remove();toast(cfg.editing?"Perubahan disimpan":"Berhasil disimpan");
    }catch(e){b.disabled=false;b.textContent="Simpan";toast("Gagal menyimpan"+(e&&e.code?" ("+e.code+")":""))}
  });
}
function prevMeter(jenis,titik,tgl,wkt,exId){
  const key=(titik||"").toLowerCase();const t=(tgl||"")+(wkt||"");let best=null;
  S.reports.forEach(r=>{if(r.cat!=="meter"||r.id===exId||r.jenis!==jenis||(r.titik||"").toLowerCase()!==key)return;
    const rt=(r.tanggal||"")+(r.waktu||"");if(rt<=t&&(!best||rt>((best.tanggal||"")+(best.waktu||""))))best=r});
  return best;
}
function openReport(cat,id){
  const c=CATS[cat];const r=id?S.reports.find(x=>x.id===id):null;
  const cfg={title:(r?"Edit ":"Tambah ")+c.title,fields:c.fields,vals:r||{},editing:!!r,photos:true,
    initPhotos:r?(r.photoIds||[]).map((pid,i)=>({existing:true,id:pid,thumb:thumbURL(pid)})):[],
    onSubmit:(v,ph,onP)=>saveReport(cat,id,v,ph,onP)};
  if(cat==="beli"){
    cfg.extra=`<div class="calc" id="calc">Total: <b>${rp(0)}</b></div>`;
    cfg.onMount=o=>{const u=()=>{const q=+$("#f-qty",o).value||0,h=+$("#f-harga",o).value||0;$("#calc",o).innerHTML=`Total: <b>${rp(q*h)}</b>`};
      $("#f-qty",o).addEventListener("input",u);$("#f-harga",o).addEventListener("input",u);u()};
  }
  if(cat==="meter"){
    cfg.extra=`<div class="calc" id="calc">Isi titik meter dan angka untuk melihat pemakaian.</div>`;
    cfg.onMount=o=>{const u=()=>{
      const j=$("#f-jenis",o).value,t=$("#f-titik",o).value.trim(),a=$("#f-angka",o).value;
      const p=t?prevMeter(j,t,$("#f-tanggal",o).value,$("#f-waktu",o).value,id):null;const un=j==="Listrik"?"kWh":"m³";
      if(!t||a===""){$("#calc",o).textContent="Isi titik meter dan angka untuk melihat pemakaian.";return}
      if(!p){$("#calc",o).innerHTML="Ini bacaan pertama untuk titik ini, pemakaian dihitung mulai bacaan berikutnya.";return}
      const d=+a-p.angka;$("#calc",o).innerHTML=`Bacaan sebelumnya: <b>${nf(p.angka)}</b> (${fmtDate(p.tanggal)})<br>Pemakaian: <b>${nf(d)} ${un}</b>${d<0?' <span class="up">Angka lebih kecil dari bacaan sebelumnya, periksa kembali atau catat jika meter diganti.</span>':""}`};
      ["f-jenis","f-titik","f-angka","f-tanggal","f-waktu"].forEach(i=>{$("#"+i,o).addEventListener("input",u);$("#"+i,o).addEventListener("change",u)});u()};
  }
  openForm(cfg);
}

/* ---------- lightbox ---------- */
let LB=null;
function openLB(rid,i){const r=S.reports.find(x=>x.id===rid);if(!r||!(r.photoIds||[]).length)return;LB={r,i};drawLB()}
async function drawLB(){
  let el=$("#lb");if(!el){el=document.createElement("div");el.id="lb";el.className="lb";document.body.appendChild(el)}
  const{r,i}=LB;const n=r.photoIds.length;const pid=r.photoIds[i];
  el.innerHTML=`<button class="lb-x" data-act="lb-close" aria-label="Tutup">&times;</button><button class="lb-n prev" data-act="lb-prev" ${n<2?"hidden":""} aria-label="Sebelumnya">‹</button><div class="lb-img"><div class="spin"></div></div><button class="lb-n next" data-act="lb-next" ${n<2?"hidden":""} aria-label="Berikutnya">›</button><div class="lb-cap">${esc(titleOf(r))} · ${i+1}/${n}</div>`;
  const img=new Image();img.alt="Foto "+(i+1);
  img.onload=()=>{if(LB&&LB.i===i){const b=$(".lb-img",el);if(b){b.innerHTML="";b.appendChild(img)}}};
  img.onerror=async()=>{const p=await getPhoto(pid);if(!LB||LB.i!==i)return;const b=$(".lb-img",el);if(!b)return;if(p&&p.data){img.onerror=null;img.src=p.data}else b.innerHTML="<p>Foto tidak ditemukan</p>"};
  img.src=fullURL(pid);
}
function closeLB(){LB=null;const e=$("#lb");if(e)e.remove()}
document.addEventListener("keydown",e=>{
  if(!LB)return;const n=LB.r.photoIds.length;
  if(e.key==="Escape")closeLB();
  if(e.key==="ArrowRight"&&n>1){LB.i=(LB.i+1)%n;drawLB()}
  if(e.key==="ArrowLeft"&&n>1){LB.i=(LB.i-1+n)%n;drawLB()}
});

/* ---------- slideshow ---------- */
const SL={i:0,t:null,sig:""};
function atsState(a){
  const t=today();
  if(a.buka&&t<a.buka){const d=daysBetween(t,a.buka);return{k:"soon",t:d===1?"Dibuka besok":`Dibuka ${d} hari lagi`}}
  if(a.tayang&&t<a.tayang){const d=daysBetween(t,a.tayang);return{k:"live",t:`ATS berlangsung · tayang ${d} hari lagi`}}
  if(a.tayang&&t===a.tayang)return{k:"live",t:"Tayang hari ini"};
  if(a.tayang)return{k:"done",t:"Sudah tayang"};
  return{k:"live",t:"ATS berlangsung"};
}
function slideList(){
  const L=[{eyebrow:"Technical Team",h:"Portal Laporan Teknis",p:"Catat pengerjaan, pembelian, dan meteran air-listrik dengan rapi, lengkap dengan foto, siap diekspor ke spreadsheet.",meta:["Pengerjaan","Pembelian","Meteran"]}];
  S.ann.filter(a=>a.tampil!==false).sort(annSort).slice(0,4).forEach(a=>L.push({eyebrow:a.tag||"Pengumuman",h:a.judul,p:a.isi||"",meta:[fmtDate(a.tanggal)]}));
  S.ats.filter(a=>atsState(a).k!=="done").sort((a,b)=>(a.tayang||"9")<(b.tayang||"9")?-1:1).slice(0,3).forEach(a=>{
    const s=atsState(a);const m=[];if(a.buka)m.push("ATS "+fmtDate(a.buka)+(a.jam?" · "+a.jam:""));if(a.tayang)m.push("Tayang "+fmtDate(a.tayang));if(a.format)m.push(a.format);
    L.push({eyebrow:"Advance Ticket Sales",h:a.film,p:s.t+(a.catatan?". "+a.catatan:""),meta:m});
  });
  return L;
}
function slideHTML(L){
  return L.map((s,i)=>`<div class="slide${i===SL.i?" on":""}" data-s="${i}"><div class="eyebrow">${esc(s.eyebrow)}</div><h2>${esc(s.h)}</h2><p>${esc(s.p)}</p><div class="meta">${(s.meta||[]).filter(Boolean).map(m=>`<span>${esc(m)}</span>`).join("")}</div></div>`).join("");
}
function goSlide(n){
  const sl=$$(".slide");if(!sl.length)return;SL.i=(n+sl.length)%sl.length;
  sl.forEach((e,i)=>e.classList.toggle("on",i===SL.i));
  $$(".dots button").forEach((e,i)=>e.classList.toggle("on",i===SL.i));
}
function startSlides(){
  clearInterval(SL.t);if(cur!=="beranda")return;
  SL.t=setInterval(()=>{if(cur!=="beranda"||document.hidden)return;if($(".hero:hover")||SL.hold)return;goSlide(SL.i+1)},6500);
  const h=$(".hero");if(!h)return;let x0=null;
  h.addEventListener("pointerdown",e=>{x0=e.clientX;SL.hold=true});
  h.addEventListener("pointerup",e=>{if(x0!=null&&Math.abs(e.clientX-x0)>45)goSlide(SL.i+(e.clientX<x0?1:-1));x0=null;setTimeout(()=>SL.hold=false,3000)});
  h.addEventListener("pointercancel",()=>{x0=null;SL.hold=false});
}

/* ---------- views ---------- */
const annSort=(a,b)=>((b.tanggal||"")+(b.createdAt||""))<((a.tanggal||"")+(a.createdAt||""))?-1:1;
const W=()=>S.canWrite;
const PROJ=`<svg viewBox="0 0 700 380" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">
  <polygon class="beam" points="520,168 520,200 0,372 0,6" fill="url(#beamg)"/>
  <g transform="translate(0,0)">
    <rect x="540" y="236" width="10" height="70" rx="3" fill="#25252c"/><rect x="640" y="236" width="10" height="70" rx="3" fill="#25252c"/>
    <rect x="520" y="300" width="150" height="9" rx="4" fill="#1b1b21"/>
    <g class="reel"><circle cx="575" cy="118" r="42" fill="#17171c" stroke="#d9b25a" stroke-width="2.5"/><circle cx="575" cy="118" r="8" fill="#d9b25a"/><path d="M575 82v72M539 118h72M549 92l52 52M601 92l-52 52" stroke="#d9b25a" stroke-opacity=".55" stroke-width="2"/></g>
    <g class="reel r2"><circle cx="648" cy="132" r="32" fill="#17171c" stroke="#d9b25a" stroke-width="2.5"/><circle cx="648" cy="132" r="6" fill="#d9b25a"/><path d="M648 106v52M622 132h52M630 114l36 36M666 114l-36 36" stroke="#d9b25a" stroke-opacity=".55" stroke-width="2"/></g>
    <rect x="540" y="156" width="150" height="86" rx="14" fill="#1d1d24" stroke="#3a3a45" stroke-width="2"/>
    <rect x="552" y="168" width="126" height="8" rx="4" fill="#d9b25a" opacity=".85"/>
    <circle cx="664" cy="214" r="6" fill="#e24b4b"/><circle cx="646" cy="214" r="4" fill="#3ecf8e"/>
    <rect x="496" y="170" width="48" height="28" rx="6" fill="#121217" stroke="#3a3a45" stroke-width="2"/>
    <rect x="514" y="164" width="12" height="40" rx="4" fill="#25252c" stroke="#d9b25a" stroke-width="1.5"/>
    <ellipse cx="514" cy="184" rx="7" ry="15" fill="#fff6d8"/>
  </g></svg>`;
function dustHTML(){let s="";for(let i=0;i<14;i++)s+=`<i style="left:${30+Math.random()*55}%;top:${15+Math.random()*60}%;animation-delay:${(Math.random()*7).toFixed(1)}s;animation-duration:${(5+Math.random()*5).toFixed(1)}s"></i>`;return`<div class="dust">${s}</div>`}
function meterLatest(j){const rows=meterRows().filter(r=>r.jenis===j);return rows[rows.length-1]||null}
function annHTML(a,i){
  return`<article class="card ann-i" style="animation-delay:${i*60}ms"><div class="top"><span class="badge ${a.tag==="Penting"?"b-Penting":"b-tag"}">${esc(a.tag||"Info")}</span>${a.tampil===false?'<span class="badge b-done">Tidak di slideshow</span>':""}<span class="dt">${fmtDate(a.tanggal)}</span></div><h4>${esc(a.judul)}</h4>${a.isi?`<p>${esc(a.isi)}</p>`:""}${W()?`<div class="row-act"><button class="btn sm" data-act="ann-edit" data-id="${a.id}">Edit</button><button class="btn sm danger" data-act="ann-del" data-id="${a.id}">Hapus</button></div>`:""}</article>`;
}
function atsHTML(a,i){
  const s=atsState(a);
  return`<article class="card ats" style="animation-delay:${i*60}ms"><div class="ats-top"><div><h4>${esc(a.film)}</h4><div class="meta" style="margin-top:2px">${esc(a.format||"")}</div></div><span class="badge b-${s.k}">${esc(s.t)}</span></div>
  <div class="tl"><div><small>ATS Dibuka</small><b>${fmtDate(a.buka)}${a.jam?" · "+esc(a.jam):""}</b></div><div><small>Tayang</small><b>${fmtDate(a.tayang)}</b></div></div>
  ${a.catatan?`<p class="desc" style="-webkit-line-clamp:4">${esc(a.catatan)}</p>`:""}
  ${W()?`<div class="row-act"><button class="btn sm" data-act="ats-edit" data-id="${a.id}">Edit</button><button class="btn sm danger" data-act="ats-del" data-id="${a.id}">Hapus</button></div>`:""}</article>`;
}
function renderHome(){
  const L=slideList();const sig=JSON.stringify(L.map(x=>x.h+x.p));
  if(sig!==SL.sig){SL.sig=sig;}if(SL.i>=L.length)SL.i=0;
  const ym=today().slice(0,7);
  const k=S.reports.filter(r=>r.cat==="kerja"&&(r.tanggal||"").startsWith(ym));
  const b=S.reports.filter(r=>r.cat==="beli"&&(r.tanggal||"").startsWith(ym));
  const bt=b.reduce((a,r)=>a+(r.qty||0)*(r.harga||0),0);
  const le=meterLatest("Listrik"),ai=meterLatest("Air");
  const ann=S.ann.slice().sort(annSort);
  const ats=S.ats.slice().sort((a,b2)=>{const x=atsState(a).k==="done",y=atsState(b2).k==="done";if(x!==y)return x?1:-1;return(a.tayang||"")<(b2.tayang||"")?-1:1});
  $("#view").innerHTML=`
  <section class="hero" aria-label="Sorotan">
    <div class="strip t"></div><div class="strip b"></div>
    <div class="proj">${PROJ}</div>${dustHTML()}
    <div class="slides" id="slides">${slideHTML(L)}</div>
    <div class="hero-ctl"><div class="dots">${L.map((_,i)=>`<button data-act="sl-go" data-i="${i}" class="${i===SL.i?"on":""}" aria-label="Slide ${i+1}"></button>`).join("")}</div>
    <div class="arrows"><button data-act="sl-prev" aria-label="Sebelumnya">‹</button><button data-act="sl-next" aria-label="Berikutnya">›</button></div></div>
  </section>
  <section class="stats">
    <button class="stat" data-nav="kerja" style="animation-delay:.05s"><small>Pengerjaan bulan ini</small><b>${k.length}</b><span>${k.filter(r=>r.status==="Selesai").length} selesai</span></button>
    <button class="stat" data-nav="beli" style="animation-delay:.1s"><small>Pembelian bulan ini</small><b>${rp(bt)}</b><span>${b.length} transaksi</span></button>
    <button class="stat" data-nav="meter" style="animation-delay:.15s"><small>Listrik terakhir</small><b>${le?nf(le.angka):"-"}</b><span>${le?(le._use!=null?"Pemakaian "+nf(le._use)+" kWh":esc(le.titik)):"Belum ada data"}</span></button>
    <button class="stat" data-nav="meter" style="animation-delay:.2s"><small>Air terakhir</small><b>${ai?nf(ai.angka):"-"}</b><span>${ai?(ai._use!=null?"Pemakaian "+nf(ai._use)+" m³":esc(ai.titik)):"Belum ada data"}</span></button>
  </section>
  <div class="cols">
    <section><div class="sec-h"><h3>Pengumuman</h3>${W()?'<button class="btn sm pri" data-act="ann-add">+ Tambah</button>':""}</div>
      <div class="ann">${ann.length?ann.map(annHTML).join(""):`<div class="empty"><b>Belum ada pengumuman</b>Informasi penting untuk tim akan tampil di sini dan di slideshow.</div>`}</div></section>
    <section><div class="sec-h"><h3>Advance Ticket Sales</h3>${W()?'<button class="btn sm pri" data-act="ats-add">+ Jadwal ATS</button>':""}</div>
      ${ats.length?ats.map(atsHTML).join(""):`<div class="empty" style="margin-bottom:12px"><b>Belum ada jadwal ATS</b>Tambahkan film, tanggal ATS dibuka, dan tanggal tayang.</div>`}
      <div class="note"><b>Tentang ATS</b><p>Advance Ticket Sales (ATS) adalah penjualan tiket lebih awal sebelum film mulai tayang. Tim Technical memastikan sistem tiketing, printer tiket, dan jaringan siap sebelum ATS dibuka.</p></div>
      <div class="note" style="margin-top:12px"><b>Catatan teknis ATS</b><p>${S.note?esc(S.note):'<span class="muted">Belum ada catatan kesiapan.</span>'}</p>${W()?'<div class="row-act"><button class="btn sm" data-act="note-edit">Edit catatan</button></div>':""}</div>
    </section>
  </div>
  <footer>Portal internal Technical Team</footer>`;
  startSlides();
}
function matches(r,cat){
  const f=F[cat],c=CATS[cat];
  if(f.f&&r[c.filt.field]!==f.f)return false;
  if(f.m&&!(r.tanggal||"").startsWith(f.m))return false;
  if(f.q){const hay=Object.values(r).filter(v=>typeof v==="string"||typeof v==="number").join(" ").toLowerCase();if(!hay.includes(f.q.toLowerCase()))return false}
  return true;
}
function thumbsHTML(r){
  const n=(r.photoIds||[]).length;if(!n)return"";const show=Math.min(4,n);let h="";
  for(let i=0;i<show;i++){const more=i===show-1&&n>show;h+=`<button class="thumb" data-act="view" data-id="${r.id}" data-i="${i}" aria-label="Lihat foto ${i+1}"><img src="${thumbURL(r.photoIds[i])}" alt="" loading="lazy">${more?`<em>+${n-show+1}</em>`:""}</button>`}
  return`<div class="thumbs">${h}</div>`;
}
function actsHTML(r){
  const n=(r.photoIds||[]).length;
  return`<div class="row-act">${W()?`<button class="btn sm" data-act="edit" data-id="${r.id}">Edit</button>`:""}${n?`<button class="btn sm" data-act="zip" data-id="${r.id}">ZIP foto (${n})</button>`:""}${W()?`<button class="btn sm danger" data-act="del" data-id="${r.id}">Hapus</button>`:""}</div>`;
}
function cardHTML(r,i,cat){
  const d=`style="animation-delay:${Math.min(i,12)*40}ms"`;
  if(cat==="kerja")return`<article class="card rep" ${d}><div class="rep-top"><span class="badge b-${r.status}">${esc(r.status)}</span><span class="badge b-${r.prioritas}">${esc(r.prioritas)}</span><span class="dt">${fmtDate(r.tanggal)}</span></div><h4>${esc(r.judul)}</h4><div class="meta"><span>${esc(r.lokasi)}</span>${r.teknisi?`<span>Teknisi: ${esc(r.teknisi)}</span>`:""}</div>${r.uraian?`<p class="desc">${esc(r.uraian)}</p>`:""}${thumbsHTML(r)}${actsHTML(r)}</article>`;
  if(cat==="beli"){const tot=(r.qty||0)*(r.harga||0);return`<article class="card rep" ${d}><div class="rep-top"><span class="badge b-${r.status}">${esc(r.status)}</span><span class="dt">${fmtDate(r.tanggal)}</span></div><h4>${esc(r.barang)}</h4><div class="big">${rp(tot)}<small>${nf(r.qty)} ${esc(r.satuan||"")} × ${rp(r.harga)}</small></div><div class="meta">${r.toko?`<span>Vendor: ${esc(r.toko)}</span>`:""}${r.pemohon?`<span>Pemohon: ${esc(r.pemohon)}</span>`:""}</div>${r.keperluan?`<p class="desc">${esc(r.keperluan)}</p>`:""}${thumbsHTML(r)}${actsHTML(r)}</article>`}
  const un=r.jenis==="Listrik"?"kWh":"m³";
  return`<article class="card rep" ${d}><div class="rep-top"><span class="badge b-${r.jenis}">${esc(r.jenis)}</span><span class="dt">${fmtDate(r.tanggal)}${r.waktu?" · "+esc(r.waktu):""}</span></div><h4>${esc(r.titik)}</h4><div class="big">${nf(r.angka)}<small>${un}</small></div><div class="meta">${r._use!=null?`<span class="${r._use<0?"up":""}">Pemakaian: <b>${nf(r._use)} ${un}</b></span>`:"<span>Bacaan pertama</span>"}${r.petugas?`<span>Petugas: ${esc(r.petugas)}</span>`:""}</div>${r.catatan?`<p class="desc">${esc(r.catatan)}</p>`:""}${thumbsHTML(r)}${actsHTML(r)}</article>`;
}
function meterSummary(){
  const rows=meterRows();
  return`<div class="sum">${["Listrik","Air"].map(j=>{
    const rs=rows.filter(r=>r.jenis===j);const last=rs[rs.length-1];const us=rs.filter(r=>r._use!=null).slice(-12);const mx=Math.max(1,...us.map(r=>Math.abs(r._use)));const un=j==="Listrik"?"kWh":"m³";
    return`<div class="card" style="animation:rise .5s both"><span class="badge b-${j}">${j}</span><div class="big" style="margin-top:8px">${last?nf(last.angka):"-"}<small>${un} · bacaan terakhir</small></div><div class="meta" style="margin-top:4px">${last&&last._use!=null?`Pemakaian terakhir ${nf(last._use)} ${un}`:"Belum ada data pemakaian"}</div><div class="spark ${j==="Air"?"w":""}" title="Pemakaian 12 bacaan terakhir">${us.map(r=>`<i style="height:${Math.max(6,Math.abs(r._use)/mx*100)}%" title="${fmtDate(r.tanggal)}: ${nf(r._use)} ${un}"></i>`).join("")}</div></div>`}).join("")}</div>`;
}
function renderCat(cat){
  const c=CATS[cat],f=F[cat];
  $("#view").innerHTML=`<div class="page-h"><div><h2>${esc(c.title)}</h2><p>${esc(c.desc)}</p></div>${W()?`<button class="btn pri" data-act="add" data-cat="${cat}">+ Tambah laporan</button>`:""}</div>
  <div class="tools"><input class="grow" id="q" type="search" placeholder="Cari laporan…" value="${esc(f.q)}" aria-label="Cari"><select id="ff" aria-label="Filter"><option value="">${esc(c.filt.label)}</option>${c.filt.opts.map(o=>`<option ${f.f===o?"selected":""}>${o}</option>`).join("")}</select><input type="month" id="fm" value="${esc(f.m)}" aria-label="Bulan">
  <button class="btn" data-act="zipcat" data-cat="${cat}">ZIP semua foto</button><button class="btn" data-act="xlsx" data-cat="${cat}">Excel</button></div>
  ${cat==="meter"?'<div id="msum"></div>':""}<div id="list"></div>`;
  $("#q").addEventListener("input",e=>{f.q=e.target.value;renderList()});
  $("#ff").addEventListener("change",e=>{f.f=e.target.value;renderList()});
  $("#fm").addEventListener("input",e=>{f.m=e.target.value;renderList()});
  renderList();
}
function renderList(){
  if(!ROUTES.slice(1,4).includes(cur))return;const cat=cur,box=$("#list");if(!box)return;
  if(cat==="meter")$("#msum").innerHTML=meterSummary();
  const all=cat==="meter"?meterRows():S.reports.filter(r=>r.cat===cat);
  const rows=all.filter(r=>matches(r,cat)).sort(cat==="meter"?(a,b)=>-(((a.tanggal||"")+(a.waktu||""))<((b.tanggal||"")+(b.waktu||""))?-1:1):byDate);
  box.innerHTML=rows.length?`<div class="grid">${rows.map((r,i)=>cardHTML(r,i,cat)).join("")}</div>`:`<div class="empty"><b>${all.length?"Tidak ada hasil":"Belum ada laporan"}</b>${all.length?"Ubah kata kunci atau filter pencarian.":(W()?"Tekan tombol Tambah laporan untuk mulai mencatat.":"Data akan tampil setelah ada laporan.")}</div>`;
}
function renderExport(){
  const n=c=>S.reports.filter(r=>r.cat===c).length;
  const np=S.reports.reduce((a,r)=>a+(r.photoIds||[]).length,0);
  const card=(c,i)=>`<div class="card" style="animation-delay:${i*70}ms"><h4>${ico(NAVI[c])} ${CATS[c].name}</h4><p>${n(c)} laporan tercatat.</p><div class="btn-row"><button class="btn sm" data-act="xlsx" data-cat="${c}">Excel</button><button class="btn sm" data-act="csv" data-cat="${c}">CSV</button><button class="btn sm" data-act="tsv" data-cat="${c}">Salin ke Sheets</button><button class="btn sm" data-act="zipcat" data-cat="${c}">ZIP foto</button></div></div>`;
  $("#view").innerHTML=`<div class="page-h"><div><h2>Ekspor &amp; Spreadsheet</h2><p>Unduh laporan ke Excel, CSV, atau salin langsung ke Google Sheets, serta unduh semua foto dalam satu ZIP.</p></div></div>
  <div class="ex">
    <div class="card" style="animation-delay:0s"><h4>${ico("ekspor")} Semua Laporan</h4><p>Satu file Excel berisi tiga sheet terpisah: Pengerjaan, Pembelian, dan Meteran.</p><div class="btn-row"><button class="btn pri" data-act="xlsx" data-cat="">Unduh Excel (.xlsx)</button></div></div>
    <div class="card" style="animation-delay:.07s"><h4>${ico("ekspor")} Semua Foto</h4><p>${np} foto, tersusun dalam folder per kategori dan per laporan.</p><div class="btn-row"><button class="btn pri" data-act="zipall">Unduh ZIP semua foto</button></div></div>
    ${["kerja","beli","meter"].map((c,i)=>card(c,i+2)).join("")}
  </div>
  <div class="info"><b>Cara memakai Google Sheets:</b> unduh file Excel lalu buka dengan Google Sheets (File &gt; Impor), atau tekan <b>Salin ke Sheets</b>, pilih sel A1 di Google Sheets, lalu tempel (Ctrl+V). Sinkronisasi otomatis dua arah tidak tersedia di halaman ini karena koneksi keluar ke layanan lain diblokir.</div>`;
}

/* ---------- announcements / ATS forms ---------- */
function openAnn(id){
  const a=id?S.ann.find(x=>x.id===id):null;
  openForm({title:a?"Edit Pengumuman":"Tambah Pengumuman",editing:!!a,vals:a||{},
    fields:[{k:"judul",l:"Judul",t:"text",req:1,full:1},{k:"tag",l:"Kategori",t:"select",o:["Info","Penting","Jadwal","Maintenance","Pengingat"],def:"Info"},{k:"tanggal",l:"Tanggal",t:"date",req:1,def:today},{k:"isi",l:"Isi Pengumuman",t:"textarea",full:1},{k:"tampil",l:"Tampilkan di slideshow beranda",t:"check",def:true}],
    onSubmit:async v=>{const rid=id||uid();await put("announcements",rid,{...v,createdAt:(a&&a.createdAt)||Date.now()})}});
}
function openAts(id){
  const a=id?S.ats.find(x=>x.id===id):null;
  openForm({title:a?"Edit Jadwal ATS":"Tambah Jadwal ATS",editing:!!a,vals:a||{},
    fields:[{k:"film",l:"Judul Film",t:"text",req:1,full:1},{k:"format",l:"Format / Studio",t:"text",list:["Reguler","3D","Premiere","Gold Class","IMAX","Dolby Atmos"]},{k:"buka",l:"ATS Dibuka (tanggal)",t:"date",req:1},{k:"jam",l:"Jam ATS Dibuka",t:"time"},{k:"tayang",l:"Tanggal Tayang",t:"date",req:1},{k:"catatan",l:"Catatan Teknis",t:"textarea",full:1,ph:"Kesiapan sistem tiketing, printer tiket, jaringan, dll."}],
    onSubmit:async v=>{await put("ats",id||uid(),{...v,createdAt:(a&&a.createdAt)||Date.now()})}});
}
function openNote(){
  openForm({title:"Catatan Teknis ATS",editing:true,vals:{note:S.note},fields:[{k:"note",l:"Catatan kesiapan",t:"textarea",full:1,ph:"Contoh: cek printer tiket, uji koneksi sistem tiketing, siapkan cadangan kertas."}],
    onSubmit:async v=>{await put("settings","ats",{note:v.note||""})}});
}

/* ---------- routing & events ---------- */
function markNav(){
  $("#dnav").innerHTML=ROUTES.map(r=>`<button data-nav="${r}" class="${r===cur?"on":""}">${ico(NAVI[r])}${NAVL[r]}</button>`).join("");
  $("#bnav").innerHTML=ROUTES.map(r=>`<button data-nav="${r}" class="${r===cur?"on":""}" aria-label="${NAVL[r]}">${ico(NAVI[r])}<span>${NAVL[r]}</span></button>`).join("");
}
function route(){
  markNav();updateChip();
  const v=$("#view");v.classList.remove("view");void v.offsetWidth;v.classList.add("view");
  if(cur==="beranda")renderHome();else{clearInterval(SL.t);if(cur==="ekspor")renderExport();else renderCat(cur)}
}
function go(r){if(!ROUTES.includes(r))r="beranda";cur=r;try{history.replaceState(null,"","#/"+r)}catch(e){}route();window.scrollTo({top:0,behavior:"smooth"})}
let rq=0;
function refresh(){if(rq)return;rq=requestAnimationFrame(()=>{rq=0;
  if(cur==="beranda"&&!$(".ov")){renderHome()}else if(cur==="ekspor")renderExport();else if(ROUTES.slice(1,4).includes(cur))renderList()})}
document.addEventListener("click",e=>{
  const nv=e.target.closest("[data-nav]");if(nv){go(nv.dataset.nav);return}
  const t=e.target.closest("[data-act]");if(!t)return;
  const a=t.dataset.act,id=t.dataset.id,cat=t.dataset.cat||cur;
  switch(a){
    case"theme":setTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark");break;
    case"sl-prev":goSlide(SL.i-1);break;case"sl-next":goSlide(SL.i+1);break;case"sl-go":goSlide(+t.dataset.i);break;
    case"add":openReport(cat);break;
    case"edit":openReport(S.reports.find(r=>r.id===id).cat,id);break;
    case"del":askConfirm("Hapus laporan ini beserta seluruh fotonya? Tindakan ini tidak dapat dibatalkan.").then(ok=>{if(ok)deleteReport(id).catch(()=>toast("Gagal menghapus"))});break;
    case"view":openLB(id,+t.dataset.i);break;
    case"zip":{const r=S.reports.find(x=>x.id===id);if(r)zipPhotos([r],`Foto-${CATS[r.cat].name}-${r.tanggal||stamp()}-${slug(titleOf(r))}.zip`)}break;
    case"zipcat":zipPhotos(S.reports.filter(r=>r.cat===cat),`Foto-${CATS[cat].name}-${stamp()}.zip`);break;
    case"zipall":zipPhotos(S.reports,`Foto-Semua-Laporan-${stamp()}.zip`);break;
    case"xlsx":exportXLSX(t.dataset.cat||"");break;
    case"csv":exportCSV(cat);break;
    case"tsv":copyTSV(cat);break;
    case"ann-add":openAnn();break;case"ann-edit":openAnn(id);break;
    case"ann-del":askConfirm("Hapus pengumuman ini?").then(ok=>{if(ok)del("announcements",id).then(()=>toast("Pengumuman dihapus")).catch(()=>toast("Gagal menghapus"))});break;
    case"ats-add":openAts();break;case"ats-edit":openAts(id);break;
    case"ats-del":askConfirm("Hapus jadwal ATS ini?").then(ok=>{if(ok)del("ats",id).then(()=>toast("Jadwal dihapus")).catch(()=>toast("Gagal menghapus"))});break;
    case"note-edit":openNote();break;
    case"lb-close":closeLB();break;
    case"lb-prev":LB.i=(LB.i-1+LB.r.photoIds.length)%LB.r.photoIds.length;drawLB();break;
    case"lb-next":LB.i=(LB.i+1)%LB.r.photoIds.length;drawLB();break;
  }
});
document.addEventListener("click",e=>{if(LB&&e.target.id==="lb")closeLB()});

/* ---------- boot ---------- */
S.name=lsGet(NAME_STORE);
try{const h=(location.hash||"").replace("#/","");if(ROUTES.includes(h))cur=h}catch(e){}
route();
if(!apiReady()){
  $("#view").insertAdjacentHTML("afterbegin",`<div class="info" style="margin-bottom:14px"><b>Backend belum dikonfigurasi.</b> Isi <code>API_URL</code> di file <code>config.js</code> dengan URL Web App Google Apps Script Anda. Langkah lengkap ada di README.md.</div>`);
}else loadAll();
setInterval(()=>{if(!document.hidden&&!$(".ov")&&!LB)loadAll(true)},30000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadAll(true)});
})();
