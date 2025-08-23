// Firebase SDK (ES modules via CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

// DOM
const gridEl     = document.getElementById("grid");
const countEl    = document.getElementById("count");
const emptyEl    = document.getElementById("empty");
const loadEl     = document.getElementById("loading");
const searchEl   = document.getElementById("q");
const refreshBtn = document.getElementById("refresh");

let allItems = [];

/* Helpers */
function normalizeDriveUrl(raw){
  if (!raw) return "";
  const s = String(raw).trim();
  let m = s.match(/\/file\/d\/([^/]+)\//);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  m = s.match(/[?&]id=([^&]+)/);
  if (m && m[1]) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return s;
}
function getImageUrl(p){
  const raw = p.imageURL ?? p.imageUrl ?? p.photoUrl ?? "";
  const url = normalizeDriveUrl(raw);
  return url || "https://via.placeholder.com/640x440?text=No+Image";
}

/* View */
function cardHTML(p){
  const qty     = Number(p.quantity ?? 0);
  const inStock = qty > 0;
  const img     = getImageUrl(p);
  const alt     = (p.partDescription || "").replace(/"/g, "&quot;");

  return `
    <a class="card" href="detail.html?id=${encodeURIComponent(p.id)}">
      <img class="thumb"
           referrerpolicy="no-referrer"
           src="${img}"
           alt="${alt}"
           onerror="this.onerror=null; this.src='https://via.placeholder.com/640x440?text=No+Image'">
      <div class="content">
        <h3 class="name">${p.partDescription || "-"}</h3>
        <div class="badges">
          <span class="badge ${inStock ? "" : "out"}">
            ${inStock ? `Qty: ${qty} `: "Out of stock"}
          </span>
          ${p.status ? `<span class="badge">${p.status}</span>` : ""}
        </div>
      </div>
    </a>
  `;
}

function render(list){
  countEl.textContent = String(list.length);
  if (!list.length){ gridEl.hidden = true; emptyEl.hidden = false; return; }
  gridEl.innerHTML = list.map(cardHTML).join("");
  gridEl.hidden = false; emptyEl.hidden = true;
}

/* Search */
function applyFilter(){
  const q = (searchEl.value || "").toLowerCase().trim();
  if (!q) { render(allItems); return; }
  const filtered = allItems.filter(p =>
    (p.partDescription || "").toLowerCase().includes(q) ||
    (p.status || "").toLowerCase().includes(q)
  );
  render(filtered);
}

/* Data load */
async function loadOnce(){
  loadEl.hidden = false; gridEl.hidden = true; emptyEl.hidden = true;
  try{
    const snap = await getDocs(collection(db, "spareparts"));
    allItems = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    render(allItems);
    loadEl.hidden = true;
  }catch(err){
    console.error("Load error:", err);
    loadEl.hidden = false;
    loadEl.textContent = "Load error: " + (err?.message || err);
  }
}

// Realtime (ถ้าต้องการ)
function startRealtime(){
  loadEl.hidden = false; gridEl.hidden = true; emptyEl.hidden = true;
  const colRef = collection(db, "spareparts");
  onSnapshot(colRef, (snap)=>{
    allItems = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    render(allItems);
    loadEl.hidden = true;
  }, (err)=>{
    console.error("Realtime error:", err);
    loadEl.hidden = false;
    loadEl.textContent = "Realtime error: " + (err?.message || err);
  });
}

/* Events */
searchEl.addEventListener("input", applyFilter);
refreshBtn.addEventListener("click", loadOnce);

/* Start */
loadOnce();
// หรือใช้สด: // startRealtime();