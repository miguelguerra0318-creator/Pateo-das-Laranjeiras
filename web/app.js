// Páteo Content Studio — lógica do cliente
// ES modules directos do CDN oficial (sem bundler).

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  indexedDBLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ─── Init ───────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, indexedDBLocalPersistence).catch((err) => {
  console.warn("Persistência IndexedDB indisponível — a sessão só dura nesta aba.", err);
});

// ─── DOM helpers ─────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const views = {
  login: $("#view-login"),
  new: $("#view-new"),
  requests: $("#view-requests"),
  library: $("#view-library"),
  partners: $("#view-partners"),
};

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
  $$(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
}

$$(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// ─── Auth state ─────────────────────────────────────────────────────────

let requestsUnsubscribe = null;

onAuthStateChanged(auth, (user) => {
  const nav = $("#app-nav");
  if (user) {
    nav.classList.remove("hidden");
    showView("new");
    subscribeRequests(user);
    updateLastRunIndicator();
  } else {
    nav.classList.add("hidden");
    showView("login");
    if (requestsUnsubscribe) {
      requestsUnsubscribe();
      requestsUnsubscribe = null;
    }
  }
});

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const errBox = $("#login-error");
  errBox.classList.add("hidden");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    $("#login-password").value = "";
  } catch (err) {
    errBox.textContent = translateAuthError(err);
    errBox.classList.remove("hidden");
  }
});

$("#logout-btn").addEventListener("click", () => signOut(auth));

function translateAuthError(err) {
  const code = err.code || "";
  if (
    code.includes("invalid-credential") ||
    code.includes("wrong-password") ||
    code.includes("user-not-found") ||
    code.includes("invalid-email")
  ) {
    return "Email ou palavra-passe incorrectos.";
  }
  if (code.includes("too-many-requests")) {
    return "Demasiadas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (code.includes("network")) {
    return "Sem ligação. Verifique a internet.";
  }
  return "Não foi possível entrar. Tente de novo.";
}

// ─── Novo pedido ────────────────────────────────────────────────────────

$("#new-request-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const briefText = $("#brief-text").value.trim();
  const language = $("#brief-language").value;
  const segment = $("#brief-segment").value || null;
  const statusEl = $("#new-request-status");
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!briefText) return;

  submitBtn.disabled = true;
  statusEl.classList.add("hidden");
  statusEl.classList.remove("success");

  try {
    await addDoc(collection(db, "requests"), {
      createdAt: serverTimestamp(),
      status: "pending",
      requestedBy: user.email,
      briefText,
      type: null,
      segment,
      language,
      results: [],
      qaPassed: false,
      qaNotes: null,
      processedAt: null,
    });
    $("#brief-text").value = "";
    $("#brief-segment").value = "";
    statusEl.textContent =
      "Pedido recebido. Os rascunhos aparecem em \"Os meus pedidos\" dentro de alguns minutos (o sistema acorda de ~15 em 15 minutos).";
    statusEl.classList.remove("hidden");
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "Não foi possível guardar o pedido. Verifique a internet e tente de novo.";
    statusEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
  }
});

// ─── Os meus pedidos ────────────────────────────────────────────────────

function subscribeRequests(user) {
  // where() sem orderBy() para evitar exigir índice composto.
  // Ordenamos client-side (dataset pequeno).
  const q = query(collection(db, "requests"), where("requestedBy", "==", user.email));
  requestsUnsubscribe = onSnapshot(
    q,
    (snap) => {
      const docs = [...snap.docs].sort((a, b) => {
        const aT = a.data().createdAt?.toMillis?.() || 0;
        const bT = b.data().createdAt?.toMillis?.() || 0;
        return bT - aT;
      });
      renderRequests(docs);
    },
    (err) => {
      console.error("Erro na subscrição de pedidos:", err);
      const list = $("#requests-list");
      list.innerHTML =
        '<li class="empty">Não foi possível carregar os pedidos. Tente actualizar a página.</li>';
    }
  );
}

function renderRequests(docs) {
  const list = $("#requests-list");
  if (!docs.length) {
    list.innerHTML =
      '<li class="empty">Ainda não fez nenhum pedido. Comece por <em>Novo pedido</em>.</li>';
    return;
  }
  list.innerHTML = "";
  docs.forEach((snap) => {
    list.appendChild(renderRequestItem(snap.id, snap.data()));
  });
}

const STATUS_LABEL = {
  pending: { label: "Pendente", cls: "badge-pending" },
  processing: { label: "A processar", cls: "badge-processing" },
  done: { label: "Pronto", cls: "badge-done" },
  error: { label: "Erro", cls: "badge-error" },
};

function renderRequestItem(id, data) {
  const li = document.createElement("li");
  li.className = "request-item";
  li.dataset.id = id;

  const status = STATUS_LABEL[data.status] || { label: data.status || "?", cls: "" };
  const created = formatDate(data.createdAt);

  const header = document.createElement("button");
  header.className = "request-header";
  header.type = "button";
  header.setAttribute("aria-expanded", "false");

  const brief = document.createElement("div");
  brief.className = "request-brief";
  const briefText = document.createElement("span");
  briefText.className = "brief-text";
  briefText.textContent = data.briefText || "(sem texto)";
  const dateEl = document.createElement("span");
  dateEl.className = "request-date";
  dateEl.textContent = created;
  brief.append(briefText, dateEl);

  const badge = document.createElement("span");
  badge.className = "badge " + status.cls;
  badge.textContent = status.label;

  header.append(brief, badge);

  const body = document.createElement("div");
  body.className = "request-body hidden";
  body.appendChild(renderRequestBody(data));

  header.addEventListener("click", () => {
    const hidden = body.classList.toggle("hidden");
    header.setAttribute("aria-expanded", String(!hidden));
  });

  li.append(header, body);
  return li;
}

function renderRequestBody(data) {
  const wrap = document.createElement("div");
  const results = Array.isArray(data.results) ? data.results : [];

  if (data.status === "pending") {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Ainda por processar. O sistema acorda de ~15 em 15 minutos.";
    wrap.appendChild(p);
    return wrap;
  }
  if (data.status === "processing") {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "A gerar os rascunhos agora...";
    wrap.appendChild(p);
    return wrap;
  }
  if (data.status === "error") {
    const p = document.createElement("p");
    p.className = "error";
    p.textContent = data.qaNotes || "Ocorreu um erro. Tente resubmeter o pedido.";
    wrap.appendChild(p);
    return wrap;
  }
  if (!results.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Nenhum resultado gerado.";
    wrap.appendChild(p);
    return wrap;
  }

  if (data.qaNotes) {
    const notes = document.createElement("p");
    notes.className = "qa-notes";
    notes.textContent = "Notas do QA: " + data.qaNotes;
    wrap.appendChild(notes);
  }

  results.forEach((r) => wrap.appendChild(renderResultCard(r)));
  return wrap;
}

function renderResultCard(result) {
  const card = document.createElement("article");
  card.className = "result-card";

  const title = document.createElement("h3");
  title.textContent = result.title || "Rascunho";
  card.appendChild(title);

  const body = document.createElement("pre");
  body.className = "result-body";
  body.textContent = result.body || "";
  card.appendChild(body);

  const copyBody = makeCopyButton("Copiar", result.body || "");
  card.appendChild(copyBody);

  if (result.imagePrompt) {
    const promptBox = document.createElement("div");
    promptBox.className = "image-prompt";
    const lbl = document.createElement("label");
    lbl.textContent = "Prompt de imagem (para colar no Gemini / Nano Banana)";
    const pre = document.createElement("pre");
    pre.textContent = result.imagePrompt;
    const copyPrompt = makeCopyButton("Copiar prompt de imagem", result.imagePrompt);
    const hint = document.createElement("small");
    hint.textContent = "Cole no Gemini (app grátis) para gerar a imagem.";
    promptBox.append(lbl, pre, copyPrompt, hint);
    card.appendChild(promptBox);
  }

  if (result.photoSuggestion) {
    const p = document.createElement("p");
    p.className = "photo-suggestion";
    p.textContent = result.photoSuggestion;
    card.appendChild(p);
  }

  if (result.notes) {
    const p = document.createElement("p");
    p.className = "muted";
    p.style.marginTop = "0.5rem";
    p.textContent = "Notas: " + result.notes;
    card.appendChild(p);
  }

  return card;
}

function makeCopyButton(label, text) {
  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copiado";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("copied");
      }, 1600);
    } catch (err) {
      console.error("Falha a copiar:", err);
      btn.textContent = "Falhou — copie à mão";
    }
  });
  return btn;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Health indicator (última execução do agente) ───────────────────────

async function updateLastRunIndicator() {
  const el = $("#last-run");
  try {
    const snap = await getDoc(doc(db, "system", "status"));
    if (snap.exists() && snap.data().lastRun) {
      const d = snap.data().lastRun.toDate();
      const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
      el.textContent = "última execução do agente: há " + mins + " min";
    } else {
      el.textContent = "agente ainda não correu";
    }
  } catch (err) {
    el.textContent = "";
  }
}
