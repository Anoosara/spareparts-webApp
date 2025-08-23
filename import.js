// import.js
// วิธีใช้:
//   node import.js path/to/data.xlsx
//   หรือ: node import.js path/to/data.csv

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { parse } = require("csv-parse/sync");
const xlsx = require("xlsx");

// ---------- 0) ตั้งค่า ----------
const COLLECTION_NAME = "spareparts";   // ให้ตรงกับที่ Frontend ใช้
const BATCH_SIZE = 400;                 // เผื่อเหลือจากลิมิต 500

// ---------- 1) Firebase Admin ----------
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ---------- 2) Helper ----------
function toNumber(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// รองรับวันที่แบบ dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, yyyy/mm/dd
function toTimestamp(v) {
  if (!v) return null;

  // ถ้าเป็น Date object อยู่แล้ว (จาก Excel) ใช้ได้เลย
  if (v instanceof Date && !isNaN(v)) {
    return admin.firestore.Timestamp.fromDate(v);
  }

  const s = String(v).trim();
  // yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d) ? null : admin.firestore.Timestamp.fromDate(d);
  }
  // dd-mm-yyyy or dd/mm/yyyy
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d) ? null : admin.firestore.Timestamp.fromDate(d);
  }

  // fallback: new Date(s)
  const d = new Date(s);
  return isNaN(d) ? null : admin.firestore.Timestamp.fromDate(d);
}

// แปลง 1 แถวตามหัวคอลัมน์ที่พี่มี
function mapRow(row) {
  return {
    no: row["No."],
    partDescription: row["Part Description"],
    category: row["Category"],
    partSerialNo: row["Part Serial No."],
    quantity: toNumber(row["Quantity"]),
    measurementUnit: row["Measurement Unit"],
    location: row["Location"],
    status: row["Status"],
    date: toTimestamp(row["Date"]),
    issuedBy: row["Issued By"],
    notes: row["Notes"],
  };
}

// อ่านไฟล์ → ได้ array ของ object
function readData(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    const text = fs.readFileSync(filePath, "utf8");
    return parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true });
  } else if (ext === ".xlsx" || ext === ".xls") {
    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { defval: "" }); // defval: "" เพื่อไม่ให้ undefined
  } else {
    throw new Error("รองรับเฉพาะไฟล์ .csv / .xlsx / .xls");
  }
}

// เขียนทีละ batch
async function commitBatch(items) {
  const batch = db.batch();
  const col = db.collection(COLLECTION_NAME);
  for (const docData of items) {
    const ref = col.doc(); // auto-id
    batch.set(ref, docData);
  }
  await batch.commit();
}

// ---------- 3) Main ----------
(async () => {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("❌ โปรดระบุ path ไฟล์ .csv/.xlsx/.xls\nตัวอย่าง: node import.js data.xlsx");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error("❌ ไม่พบไฟล์:", filePath);
    process.exit(1);
  }

  console.log("📄 กำลังอ่านไฟล์:", filePath);
  const rowsRaw = readData(filePath);
  console.log(`📦 พบทั้งหมด ${rowsRaw.length} แถว`);

  // map field
  const rows = rowsRaw.map(mapRow);

  // import เป็น batch
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await commitBatch(chunk);
    done += chunk.length;
    console.log(`✅ อัปโหลดแล้ว ${done}/${rows.length}`);
  }

  console.log(`🎉 เสร็จสิ้น! อัปโหลดทั้งหมด ${rows.length} records ไปที่ collection "${COLLECTION_NAME}"`);
  process.exit(0);
})().catch((err) => {
  console.error("💥 เกิดข้อผิดพลาด:", err);
  process.exit(1);
});