// scripts/queue.js
//
// Orquestrador do Páteo Content Studio.
// Lê pedidos "pending" do Firestore, invoca Claude Code em modo headless para
// processar cada um (via .claude/CLAUDE.md e sub-agentes), e escreve os
// resultados de volta ao Firestore. Actualiza também /system/status para o
// health indicator na app.
//
// Runnable localmente e em CI. Toda a config vem de env vars:
//   GOOGLE_APPLICATION_CREDENTIALS  → path para o JSON da service account
//   CLAUDE_BIN                       → opcional (default: "claude")
//   BATCH_LIMIT                      → opcional (default: 10)
//   CLAUDE_TIMEOUT_MS                → opcional (default: 20 min)
//
// Uso local (PowerShell):
//   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\luis_\credentials\pateo\firebase-service-account.json"
//   npm run queue

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { Jimp, JimpMime } from "jimp";
import { composeOverlay } from "./overlay-templates.js";

// ─── Config ─────────────────────────────────────────────────────────────

const BATCH_LIMIT = parseInt(process.env.BATCH_LIMIT || "10", 10);
const CLAUDE_BIN = process.env.CLAUDE_BIN
  || (process.platform === "win32" ? "claude.exe" : "claude");
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || String(20 * 60 * 1000), 10);
const WORK_DIR = ".work";
const BATCH_FILE = `${WORK_DIR}/batch.json`;
const OUTPUT_FILE = `${WORK_DIR}/output.json`;

// Geração de imagens (Nano Banana / Gemini). Opcional: se GEMINI_API_KEY não
// estiver definido, o sistema não gera imagens e mantém o fluxo manual (a app
// mostra o imagePrompt para colar no Gemini à mão). Nunca gera uma fatura.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const IMAGE_LIMIT = parseInt(process.env.IMAGE_LIMIT || "20", 10); // guarda-quota por run

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

function ensureWorkDir() {
  if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true });
}

function cleanWorkFiles() {
  for (const f of [BATCH_FILE, OUTPUT_FILE]) {
    if (existsSync(f)) rmSync(f);
  }
}

async function touchStatus(db, startTime, count, status = "ok", extra = {}) {
  await db.collection("system").doc("status").set({
    lastRun: FieldValue.serverTimestamp(),
    lastRunProcessed: count,
    lastRunStatus: status,
    lastRunStartedAt: startTime.toISOString(),
    ...extra
  }, { merge: true });
}

// ─── Invocação do Claude Code headless ──────────────────────────────────

function invokeClaudeCode() {
  return new Promise((resolve, reject) => {
    const prompt =
      "Lê o ficheiro .claude/CLAUDE.md e segue as instruções: processa .work/batch.json " +
      "orquestrando os sub-agentes (dispatcher → especialista → art-director → editor-qa) " +
      "e escreve o resultado final em .work/output.json exactamente no formato descrito. " +
      "Não escrevas resumos nem explicações no terminal.";

    const args = [
      "-p", prompt,
      "--permission-mode", "bypassPermissions",
      "--output-format", "text"
    ];

    log(`A invocar Claude Code: ${CLAUDE_BIN} -p "..." --permission-mode bypassPermissions`);

    // Nota: shell: false é obrigatório no Windows para o prompt não ser truncado
    // pelo cmd.exe (espaços/quotes/parênteses causavam corrupção do argumento).
    const proc = spawn(CLAUDE_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true
    });

    let stderr = "";
    proc.stdout.on("data", (chunk) => process.stdout.write(chunk));
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    const timer = setTimeout(() => {
      log(`Timeout de ${CLAUDE_TIMEOUT_MS / 1000}s atingido — a matar o processo.`);
      try { proc.kill("SIGKILL"); } catch { /* noop */ }
      reject(new Error(`Timeout de ${CLAUDE_TIMEOUT_MS}ms`));
    }, CLAUDE_TIMEOUT_MS);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Falha ao lançar '${CLAUDE_BIN}': ${err.message}. Está o Claude Code instalado e no PATH?`));
    });

    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(
        `Claude Code saiu com código=${code} signal=${signal}. ` +
        `stderr (últimas linhas): ${stderr.slice(-500)}`
      ));
    });
  });
}

// ─── Geração de imagem (Nano Banana / Gemini) ───────────────────────────

// Recebe um imagePrompt (texto) e devolve { data (base64), mime } ou null.
// Comprime para JPEG ~1024px para caber no limite de 1 MiB/doc do Firestore.
// Qualquer falha lança erro — o chamador apanha e mantém o fluxo manual.
async function generateImage(prompt) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent` +
    `?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 300)}`);
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);
  const inline = imgPart?.inlineData || imgPart?.inline_data;
  if (!inline?.data) {
    throw new Error("Resposta do Gemini sem imagem (inlineData em falta).");
  }

  const raw = Buffer.from(inline.data, "base64");
  const img = await Jimp.read(raw);
  img.scaleToFit({ w: 1024, h: 1024 });
  const jpeg = await img.getBuffer(JimpMime.jpeg, { quality: 80 });
  return { data: jpeg.toString("base64"), mime: "image/jpeg" };
}

// Percorre os outputs, gera imagem para os que têm imagePrompt, grava cada
// imagem num doc da colecção `images` e anexa `imageRef` ao output.
async function generateImagesFor(db, results) {
  if (!GEMINI_API_KEY) {
    log("GEMINI_API_KEY ausente — imagens não geradas (mantém-se o fluxo manual).");
    return;
  }
  let generated = 0;
  for (const result of results) {
    const outs = Array.isArray(result.outputs) ? result.outputs : [];
    for (const out of outs) {
      if (!out || !out.imagePrompt) continue;
      if (generated >= IMAGE_LIMIT) {
        log(`IMAGE_LIMIT (${IMAGE_LIMIT}) atingido — restantes ficam só com prompt manual.`);
        return;
      }
      try {
        const img = await generateImage(out.imagePrompt);
        const ref = db.collection("images").doc();
        await ref.set({
          data: img.data,
          mime: img.mime,
          prompt: out.imagePrompt,
          createdAt: FieldValue.serverTimestamp()
        });
        out.imageRef = ref.id;
        generated++;
        log(`Imagem gerada → images/${ref.id} (${Math.round(img.data.length / 1024)} KB base64)`);
      } catch (err) {
        log(`Falha a gerar imagem (fica prompt manual): ${err.message}`);
      }
    }
  }
  log(`Imagens geradas neste run: ${generated}`);
}

// ─── Composição de fotos escolhidas do banco ────────────────────────────
// Para cada output que use uma foto escolhida pela sócia, lê a versão `render`
// da colecção `photos` e:
//   • mode "with-text" + overlay → compõe o texto com o template SVG de marca;
//   • mode "as-is"               → usa a foto tal-qual.
// Grava a imagem final na colecção `images` e anexa `imageRef` ao output — o UI
// reutiliza o mesmo caminho de display/download das imagens geradas.
async function compositePhotosFor(db, requests, results) {
  const reqById = new Map(requests.map((r) => [r.id, r]));
  for (const result of results) {
    const reqPhoto = reqById.get(result.id)?.photo || null;
    const outs = Array.isArray(result.outputs) ? result.outputs : [];
    for (const out of outs) {
      if (!out || out.imageRef) continue; // já tem imagem (gerada) → não sobrepor
      const driveFileId = out.photoRef || reqPhoto?.driveFileId;
      if (!driveFileId) continue; // sem foto escolhida
      const mode = out.photoMode || reqPhoto?.mode || "as-is";
      try {
        const snap = await db.collection("photos").doc(driveFileId).get();
        if (!snap.exists) {
          log(`Foto ${driveFileId} não está no banco (correr o sync?). Ignorada.`);
          continue;
        }
        const photo = snap.data();
        let data, mime;
        if (mode === "with-text" && out.overlay && out.overlay.headline) {
          const composed = await composeOverlay({
            photoBase64: photo.render,
            mime: photo.mime || "image/jpeg",
            overlay: out.overlay,
            contentType: result.contentType
          });
          data = composed.data;
          mime = composed.mime;
        } else {
          // "como está": a `render` já é JPEG ~1080px, usa-se directamente.
          data = photo.render;
          mime = photo.mime || "image/jpeg";
        }
        const ref = db.collection("images").doc();
        await ref.set({
          data,
          mime,
          source: "photo",
          driveFileId,
          mode,
          createdAt: FieldValue.serverTimestamp()
        });
        out.imageRef = ref.id;
        log(`Foto composta → images/${ref.id} (${mode}, ${Math.round(data.length / 1024)}KB base64)`);
      } catch (err) {
        log(`Falha a compor foto ${driveFileId}: ${err.message}`);
      }
    }
  }
}

// ─── Marcar pedidos como erro em lote (para falhas globais) ─────────────

async function markAllAsError(db, requests, reason) {
  const batch = db.batch();
  for (const r of requests) {
    batch.update(db.collection("requests").doc(r.id), {
      status: "error",
      qaPassed: false,
      qaNotes: reason,
      processedAt: FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  ensureWorkDir();

  const startTime = new Date();
  log(`queue: a começar. cwd=${resolvePath(".")}`);

  const app = initializeApp({ credential: cert(resolveCredentials()) });
  const db = getFirestore(app);

  // 1. Query pending
  const snap = await db.collection("requests")
    .where("status", "==", "pending")
    .limit(BATCH_LIMIT)
    .get();

  if (snap.empty) {
    log("Nenhum pedido pending. A sair.");
    await touchStatus(db, startTime, 0);
    return;
  }

  const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  log(`${requests.length} pedido(s) para processar: ${requests.map((r) => r.id).join(", ")}`);

  // 2. Mark processing
  {
    const batch = db.batch();
    for (const r of requests) {
      batch.update(db.collection("requests").doc(r.id), { status: "processing" });
    }
    await batch.commit();
  }

  // 3. Preparar batch.json
  cleanWorkFiles();
  const batchInput = requests.map((r) => ({
    id: r.id,
    briefText: r.briefText || "",
    platform: r.platform || null,
    contentType: r.contentType || null,
    photo: r.photo || null,
    segment: r.segment || null,
    language: r.language || "PT",
    ...(r.adjustment ? { adjustment: r.adjustment } : {}),
    ...(Array.isArray(r.previousOutputs) && r.previousOutputs.length
      ? { previousOutputs: r.previousOutputs }
      : {})
  }));
  writeFileSync(BATCH_FILE, JSON.stringify(batchInput, null, 2), "utf8");
  log(`Escrito ${BATCH_FILE} (${batchInput.length} entries).`);

  // 4. Invocar Claude Code
  try {
    await invokeClaudeCode();
  } catch (err) {
    log(`Falha na invocação do Claude Code: ${err.message}`);
    await markAllAsError(db, requests, `Falha do motor de geração: ${err.message}`);
    await touchStatus(db, startTime, requests.length, "error", { lastRunError: err.message });
    process.exit(1);
  }

  // 5. Ler output.json
  if (!existsSync(OUTPUT_FILE)) {
    const msg = `Claude Code terminou mas ${OUTPUT_FILE} não foi criado.`;
    log(msg);
    await markAllAsError(db, requests, msg);
    await touchStatus(db, startTime, requests.length, "error", { lastRunError: msg });
    process.exit(1);
  }

  let output;
  try {
    output = JSON.parse(readFileSync(OUTPUT_FILE, "utf8"));
  } catch (err) {
    const msg = `${OUTPUT_FILE} não é JSON válido: ${err.message}`;
    log(msg);
    await markAllAsError(db, requests, msg);
    await touchStatus(db, startTime, requests.length, "error", { lastRunError: msg });
    process.exit(1);
  }

  if (!output || !Array.isArray(output.results)) {
    const msg = `${OUTPUT_FILE} não tem o formato esperado (falta "results" array).`;
    log(msg);
    await markAllAsError(db, requests, msg);
    await touchStatus(db, startTime, requests.length, "error", { lastRunError: msg });
    process.exit(1);
  }

  // 5b. Gerar imagens (Nano Banana) para os outputs com imagePrompt.
  //     Anexa `imageRef` a cada output gerado; falhas mantêm o prompt manual.
  await generateImagesFor(db, output.results);

  // 5c. Compor fotos escolhidas do banco (foto como está ou com texto SVG).
  await compositePhotosFor(db, requests, output.results);

  // 6. Escrever resultados de volta ao Firestore
  const resultsById = new Map(output.results.map((r) => [r.id, r]));
  const doneBatch = db.batch();
  let doneCount = 0;
  let errorCount = 0;
  for (const req of requests) {
    const result = resultsById.get(req.id);
    if (!result) {
      doneBatch.update(db.collection("requests").doc(req.id), {
        status: "error",
        qaPassed: false,
        qaNotes: "O motor não devolveu resultado para este pedido.",
        processedAt: FieldValue.serverTimestamp()
      });
      errorCount++;
      continue;
    }
    const passed = result.qaPassed !== false;
    doneBatch.update(db.collection("requests").doc(req.id), {
      status: passed ? "done" : "error",
      type: result.type || null,
      platform: result.platform || req.platform || null,
      contentType: result.contentType || req.contentType || null,
      segment: result.segment || req.segment || null,
      language: result.language || req.language || "PT",
      qaPassed: passed,
      qaNotes: result.qaNotes || null,
      results: Array.isArray(result.outputs) ? result.outputs : [],
      // Após reprocessar uma revisão, limpar os campos temporários.
      adjustment: FieldValue.delete(),
      previousOutputs: FieldValue.delete(),
      processedAt: FieldValue.serverTimestamp()
    });
    if (passed) doneCount++; else errorCount++;
  }
  await doneBatch.commit();

  await touchStatus(db, startTime, requests.length, errorCount > 0 ? "partial" : "ok", {
    lastRunDone: doneCount,
    lastRunErrors: errorCount
  });

  log(`queue: concluído. ${doneCount} pronto(s), ${errorCount} erro(s).`);
}

main().catch(async (err) => {
  console.error(`queue: erro fatal: ${err.stack || err.message}`);
  process.exit(1);
});
