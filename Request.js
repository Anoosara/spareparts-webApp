// request.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, runTransaction,
  serverTimestamp, Timestamp
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
const loadingEl = document.getElementById('loading');
const errorEl   = document.getElementById('error');
const contentEl = document.getElementById('content');

const imgEl       = document.getElementById('img');
const partTitleEl = document.getElementById('partTitle');
const noEl        = document.getElementById('no');
const serialEl    = document.getElementById('serial');
const catEl       = document.getElementById('category');
const locEl       = document.getElementById('location');
const unitEl      = document.getElementById('unit');
const stockPill   = document.getElementById('stockPill');
const statusPill  = document.getElementById('statusPill');
const dateEl      = document.getElementById('date');

const form        = document.getElementById('reqForm');
const reqTitle    = document.getElementById('reqTitle');
const reqCategory = document.getElementById('reqCategory');
const requester   = document.getElementById('requester');
const reqDate     = document.getElementById('reqDate');
const reqQty      = document.getElementById('reqQty');
const reqUnit     = document.getElementById('reqUnit');
const reqDesc     = document.getElementById('reqDesc');
const msgEl       = document.getElementById('msg');

const FALLBACK_IMG = "https://via.placeholder.com/800x600?text=No+Image";

/* ---------- Helpers ---------- */
const toDateString = (v)=>{
  if (!v) return "";
  if (typeof v === "object" && "toDate" in v) {
    try { return v.toDate().toLocaleDateString(); } catch {}
  }
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString();
};
const toInt = (v)=> {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
};

// แปลงลิงก์ Google Drive ให้โหลดกับ <img> ได้ชัวร์
function normalizeDriveUrl(raw){
  if (!raw) return "";
  const s = String(raw).trim();
  let m = s.match(/\/file\/d\/([^/]+)\//);   // /file/d/ID/view
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  m = s.match(/[?&]id=([^&]+)/);             // ?id=ID
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return s;                                  // URL ภายนอก/Storage
}
function pickImageUrl(d){
  const raw = d.imageURL ?? d.imageUrl ?? d.photoUrl ?? "";
  const url = normalizeDriveUrl(raw);
  return url || FALLBACK_IMG;
}

/* ---------- Load part ---------- */
const id = new URLSearchParams(location.search).get("id");
let partData = null;

(async ()=>{
  if (!id){ loadingEl.hidden = true; errorEl.hidden = false; return; }

  const ref = doc(db, "spareparts", id);
  const snap = await getDoc(ref);

  loadingEl.hidden = true;

  if (!snap.exists()){ errorEl.hidden = false; return; }
  partData = snap.data();

  // fill spec
  const img = pickImageUrl(partData);
  imgEl.setAttribute("referrerpolicy", "no-referrer");
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = FALLBACK_IMG; };
  imgEl.src = img;
  imgEl.alt = (partData.partDescription || "").replace(/"/g, "&quot;");

  partTitleEl.textContent = partData.partDescription || "-";
  noEl.textContent        = partData.no ?? "-";
  serialEl.textContent    = partData.partSerialNo || "-";
  catEl.textContent       = partData.category || "-";
  locEl.textContent       = partData.location || "-";
  unitEl.textContent      = partData.measurementUnit || "-";

  const qty = Number(partData.quantity ?? 0);
  stockPill.textContent = qty > 0 ? `Qty: ${qty}` : "Out of stock";
  stockPill.classList.toggle("out", qty <= 0);

  statusPill.textContent = partData.status || "-";
  dateEl.textContent     = toDateString(partData.date || partData.dated_added);

  // preset form
  reqUnit.value = partData.measurementUnit || "";
  reqQty.min = 1;
  reqQty.max = Math.max(qty, 1);
  reqQty.value = 1;

  // default date = วันนี้
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  reqDate.value = today.toISOString().slice(0,10);

  contentEl.hidden = false;
})().catch(err=>{
  loadingEl.textContent = "Error: " + (err?.message || err);
});

/* ---------- Submit (ตัดสต็อก + log + เก็บฟอร์ม) ---------- */
form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  msgEl.textContent = "";

  if (!partData) return;

  const qtyReq = toInt(reqQty.value);
  if (!reqTitle.value.trim() || !requester.value.trim() || qtyReq < 1){
    msgEl.textContent = "กรอกข้อมูลให้ครบและจำนวนต้องมากกว่า 0";
    return;
  }

  try{
    const partRef  = doc(db, "spareparts", id);
    const logsCol  = collection(db, "inventory_logs");
    const formsCol = collection(db, "requests");

    await runTransaction(db, async (tx)=>{
      const partSnap = await tx.get(partRef);
      if (!partSnap.exists()) throw new Error("ไม่พบอะไหล่นี้");

      const d = partSnap.data();
      const prevQty = toInt(d.quantity ?? 0);
      if (qtyReq > prevQty) throw new Error(`สต็อกไม่พอ (คงเหลือ ${prevQty})`);

      const newQty = prevQty - qtyReq;

      // 1) อัปเดตสต็อก
      tx.update(partRef, { quantity: newQty });

      // 2) เพิ่ม Log (ระบุว่า request และจำนวนที่เบิก)
      const logRef = doc(logsCol);
      tx.set(logRef, {
        type: "request",
        partId: id,
        partDescription: d.partDescription || d.name || "",
        unit: d.measurementUnit || "",
        qty: qtyReq,                  // เก็บเป็นจำนวนที่เบิก (ค่าบวก)
        prevQty,
        newQty,
        title: reqTitle.value.trim(),
        userName: requester.value.trim(),
        note: reqDesc.value.trim(),
        createdAt: serverTimestamp(),
      });

      // 3) เก็บแบบฟอร์ม (สำเนา)
      const formRef = doc(formsCol);
      tx.set(formRef, {
        partId: id,
        partDescription: d.partDescription || "",
        no: d.no ?? null,
        partSerialNo: d.partSerialNo || "",
        measurementUnit: d.measurementUnit || "",
        location: d.location || "",
        statusAtRequest: d.status || "",
        availableBefore: prevQty,

        requestTitle: reqTitle.value.trim(),
        requestCategory: (reqCategory.value || "").trim(),
        requester: requester.value.trim(),
        qty: qtyReq,
        description: (reqDesc.value || "").trim(),
        requestDate: reqDate.value ? Timestamp.fromDate(new Date(reqDate.value)) : null,

        resultNewQty: newQty,
        status: "Submitted",
        createdAt: serverTimestamp(),
      });
    });

    msgEl.textContent = "✅ บันทึกสำเร็จ และหักสต็อกแล้ว";
    setTimeout(()=>{ location.href = `detail.html?id=${encodeURIComponent(id)}`; }, 800);

  }catch(err){
    msgEl.textContent = "❌ ไม่สำเร็จ: " + (err?.message || err);
  }
});