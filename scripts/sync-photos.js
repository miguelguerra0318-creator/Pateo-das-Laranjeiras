// scripts/sync-photos.js
//
// Sincroniza o banco de fotos do Páteo: lê as pastas de fotos do Google Drive
// (uma sub-pasta = um quarto/zona) e escreve versões reduzidas na colecção
// `photos` do Firestore. A partir daí o site e o queue.js leem tudo do
// Firestore — nunca tocam no Drive. As fotos em alta resolução ficam privadas
// no Drive; aqui só vivem uma miniatura (thumb) e uma versão média (render).
//
// Só este script acede ao Google Drive.
//
// Config por env vars:
//   GOOGLE_APPLICATION_CREDENTIALS  → path para o JSON da service account
//   DRIVE_PHOTOS_FOLDER_ID          → id da pasta-raiz das fotos no Drive
//   THUMB_MAX                        → opcional (default: 320 px)
//   RENDER_MAX                       → opcional (default: 1080 px)
//
// Montagem necessária (uma vez, pelo dono):
//   1. Activar a Google Drive API no projecto (grátis).
//   2. Partilhar a pasta-raiz das fotos com o email da service account
//      (client_email do JSON), em modo "Leitor".
//
// Uso local (PowerShell):
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\...\firebase-service-account.json"
//   $env:DRIVE_PHOTOS_FOLDER_ID = "<id-da-pasta>"
//   npm run sync:photos

import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import { Jimp, JimpMime } from "jimp";

// ─── Config ─────────────────────────────────────────────────────────────

const DRIVE_FOLDER_ID = process.env.DRIVE_PHOTOS_FOLDER_ID || "";
const THUMB_MAX = parseInt(process.env.THUMB_MAX || "320", 10);
const RENDER_MAX = parseInt(process.env.RENDER_MAX || "1080", 10);
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

// ─── Helpers ────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function resolveCredentials() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS (ou FIREBASE_SERVICE_ACCOUNT_PATH) não definido. " +
      "Aponta para o ficheiro JSON da service account do Firebase."
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function driveClient(credentials) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key
    },
    scopes: DRIVE_SCOPES
  });
  return google.drive({ version: "v3", auth });
}

// Lista todos os ficheiros que casam com uma query, tratando paginação.
async function listAll(drive, q) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives"
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function getFolderName(drive, folderId) {
  const res = await drive.files.get({
    fileId: folderId,
    fields: "id, name",
    supportsAllDrives: true
  });
  return res.data.name || "Sem nome";
}

// Descarrega o conteúdo binário de um ficheiro do Drive.
async function downloadFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

// Reduz uma imagem a JPEG base64 dentro de uma caixa max×max.
async function toJpegBase64(sourceImg, max, quality) {
  const img = sourceImg.clone().scaleToFit({ w: max, h: max });
  const jpeg = await img.getBuffer(JimpMime.jpeg, { quality });
  return jpeg.toString("base64");
}

// ─── Recolha das fotos por pasta (quarto/zona) ──────────────────────────

// Devolve [{ folder, files: [{id, name, mimeType}] }].
// Suporta dois casos:
//   (a) a pasta-raiz contém sub-pastas (uma por quarto/zona);
//   (b) a pasta-raiz é ela própria um quarto (contém imagens directamente) —
//       útil para testar com uma só pasta.
async function collectPhotoFolders(drive, rootId, rootName) {
  const groups = [];

  const subFolders = await listAll(
    drive,
    `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  log(`Sub-pastas encontradas: ${subFolders.length}${subFolders.length ? " (" + subFolders.map((f) => f.name).join(", ") + ")" : ""}.`);

  for (const folder of subFolders) {
    const images = await listAll(
      drive,
      `'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`
    );
    log(`  · "${folder.name}": ${images.length} imagem(ns).`);
    if (images.length) groups.push({ folder: folder.name, files: images });
  }

  // Imagens directamente na pasta-raiz → usa o nome da própria raiz como quarto/zona.
  const rootImages = await listAll(
    drive,
    `'${rootId}' in parents and mimeType contains 'image/' and trashed = false`
  );
  log(`Imagens directamente na raiz: ${rootImages.length}.`);
  if (rootImages.length) {
    groups.push({ folder: rootName, files: rootImages });
  }

  return groups;
}

// ─── Poda de fotos removidas ────────────────────────────────────────────

// Apaga docs de `photos` cujas pastas foram sincronizadas neste run mas cujo
// ficheiro já não existe no Drive. Não toca em pastas fora deste run (permite
// sincronizar um subconjunto sem apagar o resto).
async function pruneRemoved(db, seenIds, seenFolders) {
  const snap = await db.collection("photos").get();
  let removed = 0;
  const batch = db.batch();
  snap.forEach((doc) => {
    const data = doc.data();
    if (seenFolders.has(data.folder) && !seenIds.has(doc.id)) {
      batch.delete(doc.ref);
      removed++;
    }
  });
  if (removed) await batch.commit();
  return removed;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  if (!DRIVE_FOLDER_ID) {
    throw new Error("DRIVE_PHOTOS_FOLDER_ID não definido — id da pasta-raiz das fotos no Drive.");
  }

  const credentials = resolveCredentials();
  const app = initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);
  const drive = driveClient(credentials);

  log(`sync-photos: a ler a pasta ${DRIVE_FOLDER_ID} do Drive (service account: ${credentials.client_email}).`);

  // Verificação de acesso: se a service account não vê a pasta, dá erro claro.
  let rootName;
  try {
    rootName = await getFolderName(drive, DRIVE_FOLDER_ID);
    log(`Pasta-raiz acessível: "${rootName}".`);
  } catch (err) {
    log(`ERRO DE ACESSO: a service account não consegue abrir a pasta ${DRIVE_FOLDER_ID}.`);
    log(`→ Partilha a pasta com ${credentials.client_email} (Leitor) e confirma que ficou aplicado. Detalhe: ${err.message}`);
    return;
  }

  const groups = await collectPhotoFolders(drive, DRIVE_FOLDER_ID, rootName);
  if (!groups.length) {
    log("Nenhuma foto encontrada (a pasta abre, mas não tem imagens visíveis à service account nas sub-pastas nem na raiz).");
    return;
  }

  const seenIds = new Set();
  const seenFolders = new Set();
  let synced = 0;
  let failed = 0;

  for (const { folder, files } of groups) {
    seenFolders.add(folder);
    log(`Pasta "${folder}": ${files.length} foto(s).`);

    for (const file of files) {
      try {
        const raw = await downloadFile(drive, file.id);
        const img = await Jimp.read(raw);
        const thumb = await toJpegBase64(img, THUMB_MAX, 70);
        const render = await toJpegBase64(img, RENDER_MAX, 80);

        await db.collection("photos").doc(file.id).set({
          driveFileId: file.id,
          name: file.name,
          folder,
          thumb,
          render,
          mime: "image/jpeg",
          updatedAt: FieldValue.serverTimestamp()
        });

        seenIds.add(file.id);
        synced++;
        log(`  ✓ ${file.name} (thumb ${Math.round(thumb.length / 1024)}KB · render ${Math.round(render.length / 1024)}KB)`);
      } catch (err) {
        failed++;
        log(`  ✗ ${file.name}: ${err.message}`);
      }
    }
  }

  const removed = await pruneRemoved(db, seenIds, seenFolders);

  log(`Concluído: ${synced} sincronizada(s), ${failed} falha(s), ${removed} removida(s). Pastas: ${[...seenFolders].join(", ")}.`);
}

main().catch((err) => {
  log(`ERRO FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
