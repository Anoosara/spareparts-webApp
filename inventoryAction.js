// inventoryActions.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, runTransaction, doc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---- config ของโปรเจกต์คุณ ----
const firebaseConfig = {
  apiKey: "AIzaSyCenr3exSNHRPHO_cVhGBXlnYUSeP-zE7Y",
  authDomain: "fir-storage-2c8d5.firebaseapp.com",
  projectId: "fir-storage-2c8d5",
  storageBucket: "fir-storage-2c8d5.firebasestorage.app",
  messagingSenderId: "374243634919",
  appId: "1:374243634919:web:22515eb2679192860a7c42"
};

// Init (ป้องกัน init ซ้ำในหลายหน้า)
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ---- helper ----
function cleanInt(v){ const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : 0; }

/**
 * ทำธุรกรรมคลัง (ยืม/คืน)
 * @param {"request"|"refund"} type
 * @param {string} partId
 * @param {number} qty
 * @param {object} meta - { title, userName, note }
 */
export async function transactInventory(type, partId, qty, meta = {}){
  const qtyInt = cleanInt(qty);
  if (qtyInt <= 0) throw new Error("จำนวนต้องมากกว่า 0");

  const partRef = doc(db, "spareparts", partId);
  const logsRef = collection(db, "inventory_logs");

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(partRef);
    if (!snap.exists()) throw new Error("ไม่พบอะไหล่นี้");

    const d = snap.data();
    const prevQty = cleanInt(d.quantity ?? 0);

    let newQty = prevQty;
    if (type === "request"){
      if (qtyInt > prevQty) throw new Error(`สต็อกไม่พอ (คงเหลือ ${prevQty})`);
      newQty = prevQty - qtyInt;
    } else if (type === "refund"){
      newQty = prevQty + qtyInt;
    } else {
      throw new Error("ประเภทธุรกรรมไม่ถูกต้อง");
    }

    // 1) อัปเดตจำนวนใน spareparts
    tx.update(partRef, { quantity: newQty });

    // 2) เพิ่ม log
    const logDoc = {
      type,                             // "request" | "refund"
      partId,
      partDescription: d.partDescription || d.name || "",
      unit: d.measurementUnit || "",
      qty: qtyInt,
      prevQty,
      newQty,
      title: (meta.title || "").trim(),
      userName: (meta.userName || "").trim(),
      note: (meta.note || "").trim(),
      createdAt: serverTimestamp(),
    };
    tx.set(doc(logsRef), logDoc);

    // ส่งข้อมูลกลับให้ผู้เรียก
    return { partId, prevQty, newQty, log: logDoc };
  });
}