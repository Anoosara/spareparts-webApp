import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---- Firebase ---- */
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
const loadingEl = document.getElementById('loading');
const emptyEl   = document.getElementById('empty');
const listEl    = document.getElementById('list');

const dayInput  = document.getElementById('day');
const reloadBtn = document.getElementById('reload');
const loadMoreBtn = document.getElementById('loadMore');
const moreWrap  = document.getElementById('moreWrap');

/* ---- Params ---- */
const partId = new URLSearchParams(location.search).get('id');

/* ---- State for pagination ---- */
const PAGE_SIZE = 20;
let filteredRows = [];   // rows ที่กรองเฉพาะวันแล้ว + sort แล้ว
let shownCount   = 0;    // แสดงไปแล้วกี่รายการ

/* ---- Utils ---- */
function toDateStr(v){
  if (!v) return "";
  if (typeof v === "object" && "toDate" in v) { try { return v.toDate().toLocaleString(); } catch{} }
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleString();
}
function tsNumber(v){
  if (!v) return 0;
  if (typeof v === "object" && "toMillis" in v) { try { return v.toMillis(); } catch{} }
  const d = new Date(v);
  return isNaN(d) ? 0 : d.getTime();
}
function getDayRange(dateStr){
  // คืน start, end ของวันตาม local time
  const base = dateStr ? new Date(dateStr) : new Date();
  const y = base.getFullYear(), m = base.getMonth(), d = base.getDate();
  const start = new Date(y, m, d, 0,0,0,0);
  const end   = new Date(y, m, d+1, 0,0,0,0); // exclusive
  return {start, end};
}
function inRange(ts, start, end){
  const t = tsNumber(ts);
  return t >= start.getTime() && t < end.getTime();
}

/* ---- Initial day = today ---- */
(function initDay(){
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  dayInput.value = today.toISOString().slice(0,10);
})();

/* ---- Main loader ---- */
if (!partId){
  loadingEl.textContent = "Missing id (?id=...)";
} else {
  loadAndRender();
}

/* ---- Events ---- */
reloadBtn.addEventListener('click', ()=> loadAndRender());
dayInput.addEventListener('change', ()=> loadAndRender());
loadMoreBtn.addEventListener('click', ()=> renderNextPage());

/* ---- Core ---- */
async function loadAndRender(){
  loadingEl.hidden = false;
  emptyEl.hidden   = true;
  listEl.hidden    = true;
  moreWrap.hidden  = true;
  listEl.innerHTML = "";
  shownCount = 0;
  filteredRows = [];

  const {start, end} = getDayRange(dayInput.value);

  try{
    // ดึง 2 แหล่ง: requests + refunds (ดึงตาม partId ก่อน แล้วค่อยกรองวัน/เรียงในเครื่อง)
    const [reqSnap, refSnap] = await Promise.all([
      getDocs(query(collection(db, "requests"), where("partId","==", partId))),
      getDocs(query(collection(db, "refunds"),  where("partId","==", partId))),
    ]);

    const all = [];

    reqSnap.forEach(d=>{
      const x = d.data();
      all.push({
        type: "Request",
        title: x.requestTitle || x.title || "-",
        who:   x.requester || x.userName || "-",
        qty:   -Math.abs(Number(x.qty ?? 0)),
        at:    x.createdAt || x.requestDate || null
      });
    });

    refSnap.forEach(d=>{
      const x = d.data();
      all.push({
        type: "Refund",
        title: x.title || "-",
        who:   x.returnerName || x.userName || "-",
        qty:   +Math.abs(Number(x.qty ?? 0)),
        at:    x.createdAt || null
      });
    });

    // ✅ กรอง “เฉพาะของวันนั้นๆ”
    filteredRows = all.filter(r => inRange(r.at, start, end));

    // เรียงเวลาใหม่ → เก่า
    filteredRows.sort((a,b)=> tsNumber(b.at) - tsNumber(a.at));

    loadingEl.hidden = true;

    if (!filteredRows.length){
      emptyEl.hidden = false;
      return;
    }

    // แสดงหน้าแรก
    renderNextPage();

  }catch(err){
    loadingEl.textContent = "Error: " + (err?.message || err);
  }
}

function renderNextPage(){
  const slice = filteredRows.slice(shownCount, shownCount + PAGE_SIZE);
  if (!slice.length) return;

  if (shownCount === 0){
    // เพิ่มหัวตารางครั้งเดียว
    listEl.innerHTML = `
      <div class="row head">
        <div>Type</div>
        <div>Detail</div>
        <div>Qty</div>
        <div>Time</div>
      </div>
    `;
  }

  const body = slice.map(x=>{
    const qtyText = (x.qty > 0 ? +`${x.qty} `: `${x.qty}`);
    const isOut   = x.qty < 0 ? 'out' : '';
    return `
      <div class="row">
        <div><span class="pill">${x.type}</span></div>
        <div>
          <div>${x.title}</div>
          <div class="muted">${x.who}</div>
        </div>
        <div><span class="pill ${isOut}">${qtyText}</span></div>
        <div class="muted">${toDateStr(x.at)}</div>
      </div>
    `;
  }).join("");

  listEl.insertAdjacentHTML('beforeend', body);
  listEl.hidden = false;

  shownCount += slice.length;

  // toggle ปุ่ม Load more
  moreWrap.hidden = shownCount >= filteredRows.length;
}