// Utilitário rápido para ver o estado da fila antes de correr o queue.
// Uso: GOOGLE_APPLICATION_CREDENTIALS=... node scripts/count-pending.js
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!path) { console.error("Falta GOOGLE_APPLICATION_CREDENTIALS"); process.exit(1); }
const app = initializeApp({ credential: cert(JSON.parse(readFileSync(path, "utf8"))) });
const db = getFirestore(app);

const [pending, processing, done, error] = await Promise.all([
  db.collection("requests").where("status", "==", "pending").get(),
  db.collection("requests").where("status", "==", "processing").get(),
  db.collection("requests").where("status", "==", "done").get(),
  db.collection("requests").where("status", "==", "error").get()
]);

console.log(`pending:    ${pending.size}`);
console.log(`processing: ${processing.size}`);
console.log(`done:       ${done.size}`);
console.log(`error:      ${error.size}`);

if (pending.size > 0) {
  console.log("\nBriefs pendentes:");
  pending.docs.forEach(d => {
    const data = d.data();
    console.log(`  - ${d.id}: [${data.segment || "?"}] ${(data.briefText || "").slice(0, 80)}`);
  });
}

process.exit(0);
