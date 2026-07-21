// Smoke test: prova que a service account está válida, o Firestore está vivo,
// e o Admin SDK consegue escrever, ler e apagar sem tocar em dados reais.
//
// Uso:
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\luis_\credentials\pateo\firebase-service-account.json"
//   npm run smoke:firestore

import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function resolveCredentials() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) {
    console.error("✗ Falta a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS (ou FIREBASE_SERVICE_ACCOUNT_PATH).");
    console.error("  Aponta para o ficheiro JSON da service account, ex.:");
    console.error("  $env:GOOGLE_APPLICATION_CREDENTIALS=\"C:\\Users\\luis_\\credentials\\pateo\\firebase-service-account.json\"");
    process.exit(1);
  }
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const serviceAccount = resolveCredentials();
  console.log(`→ Projeto: ${serviceAccount.project_id}`);
  console.log(`→ Service account: ${serviceAccount.client_email}`);

  const app = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app);

  const col = db.collection("_smoketest");
  const doc = col.doc();

  console.log("→ A escrever documento de teste...");
  await doc.set({
    createdAt: FieldValue.serverTimestamp(),
    note: "Smoke test do Páteo Content Studio — pode ser apagado."
  });
  console.log(`  ✓ Escrito: _smoketest/${doc.id}`);

  console.log("→ A ler de volta...");
  const snap = await doc.get();
  if (!snap.exists) throw new Error("Documento não foi encontrado após escrita.");
  console.log(`  ✓ Lido: ${JSON.stringify(snap.data())}`);

  console.log("→ A apagar (limpeza)...");
  await doc.delete();
  console.log("  ✓ Apagado.");

  console.log("\n✅ Smoke test passou. Firestore vivo, service account válida, Admin SDK operacional.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Smoke test falhou:", err.message);
  if (err.code) console.error(`  Código: ${err.code}`);
  process.exit(1);
});
