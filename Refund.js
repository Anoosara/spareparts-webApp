// refund.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, addDoc,
  serverTimestamp, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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
const imgEl     = document.getElementById('ref-img');
const titleEl   = document.getElementById('ref-title');
const noEl      = document.getElementById('ref-no');
const serialEl  = document.getElementById('ref-serial');
const catEl     = document.getElementById('ref-category');
const locEl     = document.getElementById('ref-location');
const unitEl    = document.getElementById('ref-unit');
const qtyPill   = document.getElementById('ref-qtypill');
const statusEl  = document.getElementById('ref-status');
const dateEl    = document.getElementById('ref-date');

const form      = document.getElementById('refund-form');
const fTitle    = document.getElementById('f-title');
const fName     = document.getElementById('f-name');
const fQty      = document.getElementById('f-qty');
const fUnit     = document.getElementById('f-unit');
const fDesc     = document.getElementById('f-desc');
const cancelBtn = document.getElementById('cancelBtn');
const submitBtn = document.getElementById('submitBtn');
const msgEl     = document.getElementById('ref-msg');

const FALLBACK_IMG = "https://via.placeholder.com/800x600?text=No+Image";

let currentDoc = null;

/* ---------- Helpers ---------- */
function toDateString(v){
  if (!v) return "";
  if (typeof v === "object" && "toDate" in v) {
    try { return v.toDate().toLocaleDateString(); } catch {}
  }
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString();
}

// แปลง URL Google Drive ให้โหลดกับ <img> ได้ชัวร์
function normalizeDriveUrl(raw){
  if (!raw) return "";
  const s = String(raw).trim();
  let m = s.match(/\/file\/d\/([^/]+)\//);       // /file/d/ID/view
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  m = s.match(/[?&]id=([^&]+)/);                 // ?id=ID
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return s;                                      // URL ภายนอก/Storage
}
function pickImageUrl(d){
  const raw = d.imageURL ?? d.imageUrl ?? d.photoUrl ?? "";
  const url = normalizeDriveUrl(raw);
  return url || FALLBACK_IMG;
}
function disableForm(disabled){
  [fTitle, fName, fQty, fUnit, fDesc, submitBtn].forEach(el => el.disabled = disabled);
}

/* ---------- Load part spec ---------- */
const params = new URLSearchParams(location.search);
const id = params.get("id");

if (!id) {
  msgEl.textContent = "ไม่พบรหัสเอกสาร";
  disableForm(true);
} else {
  loadSpec(id);
}

async function loadSpec(docId){
  try{
    msgEl.textContent = "";
    disableForm(true);

    const ref = doc(db, "spareparts", docId);
    const snap = await getDoc(ref);
    if (!snap.exists()){
      msgEl.textContent = "ไม่พบข้อมูลชิ้นส่วนนี้";
      return;
    }

    const d = snap.data();
    currentDoc = { id: docId, ...d };

    // ฝั่งแสดงรายละเอียด
    titleEl.textContent = d.partDescription || "-";
    const img = pickImageUrl(d);
    imgEl.setAttribute("referrerpolicy", "no-referrer");
    imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = FALLBACK_IMG; };
    imgEl.src = img;
    imgEl.alt = (d.partDescription || "").replace(/"/g, "&quot;");

    noEl.textContent     = d.no ?? "-";
    serialEl.textContent = d.partSerialNo || "-";
    catEl.textContent    = d.category || "-";
    locEl.textContent    = d.location || "-";
    unitEl.textContent   = d.measurementUnit || "-";
    statusEl.textContent = d.status || "-";
    dateEl.textContent   = toDateString(d.date || d.dated_added);

    const stock = Number(d.quantity ?? 0);
    qtyPill.textContent = `Qty: ${stock}`;
    qtyPill.classList.toggle("out", stock <= 0);

    // ตั้งค่าเริ่มต้นในฟอร์ม
    fUnit.value = d.measurementUnit || "";
    fQty.min = 1;
    fQty.step = 1;
    fQty.value = 1;

    disableForm(false);
  }catch(err){
    console.error(err);
    msgEl.textContent = "Error: " + (err?.message || err);
  }
}

/* ---------- Submit refund ---------- */
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!currentDoc) return;

  const qty = Number(fQty.value);
  if (!Number.isFinite(qty) || qty <= 0){
    alert("กรุณาใส่จำนวนที่ถูกต้อง (อย่างน้อย 1)");
    fQty.focus();
    return;
  }
  if (!fTitle.value.trim() || !fName.value.trim()){
    alert("กรุณากรอกหัวข้อและชื่อผู้คืน");
    return;
  }

  try{
    disableForm(true);
    msgEl.textContent = "กำลังบันทึก…";

    // 1) บันทึกลง collection "refunds"
    await addDoc(collection(db, "refunds"), {
      partId: currentDoc.id,
      partDescription: currentDoc.partDescription || "",
      unit: currentDoc.measurementUnit || "",
      qty,
      title: fTitle.value.trim(),
      returnerName: fName.value.trim(),
      description: fDesc.value.trim(),
      createdAt: serverTimestamp(),
      status: "submitted"
    });

    // 2) เพิ่มสต็อกกลับเข้า spareparts
    await updateDoc(doc(db, "spareparts", currentDoc.id), {
      quantity: increment(qty)
    });

    // 3) Log รวม (optional)
    await addDoc(collection(db, "inventory_logs"), {
      partId: currentDoc.id,
      type: "refund",
      qtyChange: qty,
      by: fName.value.trim(),
      at: serverTimestamp(),
      note: fTitle.value.trim()
    });

    msgEl.textContent = "บันทึกคำขอคืนเรียบร้อย ✔";
    setTimeout(()=>{ location.href = `detail.html?id=${encodeURIComponent(currentDoc.id)}`; }, 700);

  }catch(err){
    console.error(err);
    msgEl.textContent = "บันทึกล้มเหลว: " + (err?.message || err);
    disableForm(false);
  }
});

/* ---------- Cancel ---------- */
cancelBtn.addEventListener("click", (e)=>{
  e.preventDefault();
  if (currentDoc){
    location.href = `detail.html?id=${encodeURIComponent(currentDoc.id)}`;
  } else {
    history.back();
  }
});