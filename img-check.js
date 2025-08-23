// Firebase SDK (ESM via CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---- Firebase config ของคุณ ---- */
const firebaseConfig = {
  apiKey: "AIzaSyCenr3exSNHRPHO_cVhGBXlnYUSeP-zE7Y",
  authDomain: "fir-storage-2c8d5.firebaseapp.com",
  projectId: "fir-storage-2c8d5",
  storageBucket: "fir-storage-2c8d5.firebasestorage.app",
  messagingSenderId: "374243634919",
  appId: "1:374243634919:web:22515eb2679192860a7c42"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ---- DOM ---- */
const loadingEl = document.getElementById("loading");
const summaryEl = document.getElementById("summary");
const tableEl   = document.getElementById("table");
const tbodyEl   = document.getElementById("tbody");
const emptyEl   = document.getElementById("empty");
const qEl       = document.getElementById("q");
const onlyBadEl = document.getElementById("onlyBad");
const reloadBtn = document.getElementById("reload");

let rows = [];

/* ---- แปลงลิงก์ Google Drive ให้ฝังได้ (ใช้ thumbnail) ---- */
function normalizeImageUrl(raw){
  if (!raw) return "";
  const s = String(raw).trim();

  // แบบ share: https://drive.google.com/file/d/FILE_ID/view?usp=...
  let m = s.match(/\/file\/d\/([^/]+)\//);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;

  // แบบ uc?export=view&id=FILE_ID
  m = s.match(/[?&]id=([^&]+)/);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;

  // ไม่ใช่ลิงก์ Drive ก็คืนค่าเดิม (เช่น Firebase Storage URL)
  return s;
}

/* ---- ทดสอบโหลดรูป (กันค้างด้วย timeout) ---- */
function testImage(url, timeout = 8000){
  return new Promise(resolve=>{
    if (!url) { resolve({ok:false, reason:"missing"}); return; }
    const img = new Image();
    let done = false;
    const finish = (res)=>{ if (!done){ done = true; resolve(res); } };
    img.onload  = () => finish({ok:true});
    img.onerror = () => finish({ok:false, reason:"error"});
    img.src = url;
    setTimeout(()=> finish({ok:false, reason:"timeout"}), timeout);
  });
}

/* ---- วาด 1 แถว ---- */
function rowHTML(index, r){
  let badge = `<span class="badge wait">checking</span>`;
  if (r.status === "ok")      badge = `<span class="badge ok">ok</span>`;
  else if (r.status === "fail")    badge = `<span class="badge fail">${r.reason || "fail"}</span>`;
  else if (r.status === "missing") badge = `<span class="badge missing">missing</span>`;

  const link = r.url
    ? `<a class="urlbtn" href="${r.url}" target="_blank" rel="noopener">open</a>`
    : "-";

  const prev = r.url
    ? `<img class="preview" referrerpolicy="no-referrer" src="${r.url}" alt="">`
    : "";

  return `
    <div class="row" data-status="${r.status}" data-text="${(r.part||'').toLowerCase()} ${r.status}">
      <div>${index+1}</div>
      <div>${r.part || "-"}</div>
      <div class="source">${r.srcField || "-"}</div>
      <div>${badge} &nbsp; ${link}</div>
      <div>${prev}</div>
    </div>
  `;
}

/* ---- Render ทั้งหมด (ค้นหา/ฟิลเตอร์) ---- */
function render(){
  const q = (qEl.value || "").toLowerCase().trim();
  const onlyBad = onlyBadEl.checked;

  const filtered = rows.filter(r => {
    const textMatch =
      !q ||
      (r.part || "").toLowerCase().includes(q) ||
      (r.status || "").toLowerCase().includes(q);
    const badMatch = !onlyBad || r.status === "fail" || r.status === "missing";
    return textMatch && badMatch;
  });

  tbodyEl.innerHTML = filtered.map((r,i)=> rowHTML(i, r)).join("");
  tableEl.hidden = filtered.length === 0;
  emptyEl.hidden = filtered.length !== 0;

  const ok   = rows.filter(r => r.status === "ok").length;
  const miss = rows.filter(r => r.status === "missing").length;
  const fail = rows.filter(r => r.status === "fail").length;

  summaryEl.innerHTML =
    `ทั้งหมด <b>${rows.length}</b> รายการ • ใช้ได้ <b>${ok}</b> • ไม่มี URL <b>${miss}</b> • ผิดพลาด <b>${fail}</b>`;
  summaryEl.hidden = false;
}

/* ---- โหลด + ตรวจสอบรูป ---- */
async function loadAndCheck(){
  loadingEl.hidden = false;
  tableEl.hidden   = true;
  emptyEl.hidden   = true;
  summaryEl.hidden = true;
  rows = [];
  render();

  const snap = await getDocs(collection(db, "spareparts"));
  const items = snap.docs.map(d => ({ id:d.id, ...d.data() }));

  rows = items.map(it => {
    const raw = it.imageURL ?? it.photoUrl ?? "";
    const url = normalizeImageUrl(raw);
    return {
      id: it.id,
      part: it.partDescription || it.no || "(no title)",
      url,
      srcField: raw ? (it.imageURL ? "imageURL" : "photoUrl") : "-",
      status: url ? "checking" : "missing",
      reason: ""
    };
  });

  render();

  const concurrency = 8;
  let idx = 0;

  async function worker(){
    while (idx < rows.length){
      const i = idx++;
      if (!rows[i].url){ continue; }
      const {ok, reason} = await testImage(rows[i].url, 8000);
      rows[i].status = ok ? "ok" : "fail";
      rows[i].reason = ok ? "" : (reason || "error");
      render();
    }
  }
  await Promise.all(Array.from({length: concurrency}, worker));

  loadingEl.hidden = true;
}

/* ---- Events ---- */
qEl.addEventListener("input", render);
onlyBadEl.addEventListener("change", render);
reloadBtn.addEventListener("click", loadAndCheck);

/* ---- Start ---- */
loadAndCheck();