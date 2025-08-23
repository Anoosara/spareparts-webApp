// detail.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------- Firebase config ---------- */
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

/* ---------- DOM refs ---------- */
const loadingEl   = document.getElementById('loading');
const notfoundEl  = document.getElementById('notfound');
const detailEl    = document.getElementById('detail');

const imgEl       = document.getElementById('img');
const titleEl     = document.getElementById('title');
const noEl        = document.getElementById('no');
const serialEl    = document.getElementById('serial');
const categoryEl  = document.getElementById('category');
const qtyPillEl   = document.getElementById('qtypill');
const qtyEl       = document.getElementById('qty');
const unitEl      = document.getElementById('unit');
const statusPillEl= document.getElementById('statuspill');
const locationEl  = document.getElementById('location');
const dateEl      = document.getElementById('date');
const issuedByEl  = document.getElementById('issuedBy');
const notesEl     = document.getElementById('notes');

// ปุ่มลิงก์ (ถ้าไม่มีใน HTML ก็ไม่เป็นไร)
const requestBtn  = document.querySelector('.btn.request');
const refundBtn   = document.querySelector('.btn.refund');
const historyLink = document.getElementById('historyLink');

const FALLBACK_IMG = "https://via.placeholder.com/800x600?text=No+Image";

/* ---------- utils ---------- */
function toDateString(v){
  if (!v) return "";
  if (typeof v === "object" && "toDate" in v) {
    try { return v.toDate().toLocaleDateString(); } catch {}
  }
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString();
}
function setPill(el, text, variant){
  if (!el) return;
  el.textContent = text || "-";
  el.classList.remove("out");
  if (variant === "out") el.classList.add("out");
}

/* --- แปลง URL รูปจาก Google Drive ให้โหลดกับ <img> ได้ชัวร์ --- */
function normalizeDriveUrl(raw){
  if (!raw) return "";
  const s = String(raw).trim();
  // share link: .../file/d/ID/view
  let m = s.match(/\/file\/d\/([^/]+)\//);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  // direct: ...?id=ID
  m = s.match(/[?&]id=([^&]+)/);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  // อื่น ๆ (เช่น Firebase Storage) คืนค่าเดิม
  return s;
}
function pickImageUrl(d){
  const raw = d.imageURL ?? d.imageUrl ?? d.photoUrl ?? "";
  const url = normalizeDriveUrl(raw);
  return url || FALLBACK_IMG;
}

/* ---------- read id from URL ---------- */
const params = new URLSearchParams(location.search);
const id = params.get("id");

if (!id) {
  loadingEl.hidden = true;
  notfoundEl.hidden = false;
} else {
  loadDetail(id);
}

async function loadDetail(id){
  try {
    const ref  = doc(db, "spareparts", id);
    const snap = await getDoc(ref);

    loadingEl.hidden = true;

    if (!snap.exists()){
      notfoundEl.hidden = false;
      return;
    }

    const d = snap.data();

    // title + image
    titleEl.textContent = d.partDescription || "-";

    const img = pickImageUrl(d);
    imgEl.setAttribute("referrerpolicy", "no-referrer");
    imgEl.src = img;
    imgEl.alt = (d.partDescription || "").replace(/"/g, "&quot;");
    imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = FALLBACK_IMG; };

    // fields
    noEl.textContent        = d.no ?? "-";
    serialEl.textContent    = d.partSerialNo || "-";
    categoryEl.textContent  = d.category || "-";

    const qty = Number(d.quantity ?? 0);
    setPill(qtyPillEl, qty > 0 ? `Qty: ${qty}` : "Out of stock", qty > 0 ? "" : "out");
    qtyEl.textContent  = d.measurementUnit ? `${qty} ${d.measurementUnit}` : String(qty);

    unitEl.textContent      = d.measurementUnit || "-";
    setPill(statusPillEl, d.status || "-", "");
    locationEl.textContent  = d.location || "-";
    dateEl.textContent      = toDateString(d.date || d.dated_added);
    issuedByEl.textContent  = d.issuedBy || "-";
    notesEl.textContent     = d.notes || "-";

    // ลิงก์ต่อไปหน้าอื่น
    const encodedId = encodeURIComponent(id);
    if (requestBtn)  requestBtn.href  = `request.html?id=${encodedId}`;
    if (refundBtn)   refundBtn.href   = `refund.html?id=${encodedId}`;
    if (historyLink) historyLink.href = `history.html?id=${encodedId}`;

    detailEl.hidden = false;

  } catch (err){
    console.error(err);
    loadingEl.textContent = "Error: " + (err?.message || err);
  }
}