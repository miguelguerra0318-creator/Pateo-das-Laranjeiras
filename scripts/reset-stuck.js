// Reset de emergência: repõe pedidos "processing" antigos como "pending".
// Útil quando o queue.js falhou a meio e deixou docs em processing.
// Uso: GOOGLE_APPLICATION_CREDENTIALS=... node scripts/reset-stuck.js

import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!path) { console.error("Falta GOOGLE_APPLICATION_CREDENTIALS"); process.exit(1); }
const app = initializeApp({ credential: cert(JSON.parse(readFileSync(path, "utf8"))) });
const db = getFirestore(app);

const snap = await db.collection("requests").where("status", "==", "processing").get();
if (snap.empty) {
  console.log("Nenhum pedido em processing. Nada a fazer.");
  process.exit(0);
}
const batch = db.batch();
snap.docs.forEach(d => batch.update(d.ref, { status: "pending" }));
await batch.commit();
console.log(`Reset feito para ${snap.size} pedido(s).`);
process.exit(0);
