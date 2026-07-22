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
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  Timestamp
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
let libraryUnsubscribe = null;
let partnersUnsubscribe = null;

onAuthStateChanged(auth, (user) => {
  const nav = $("#app-nav");
  if (user) {
    nav.classList.remove("hidden");
    showView("new");
    subscribeRequests(user);
    subscribeLibrary();
    subscribePartners();
    updateLastRunIndicator();
  } else {
    nav.classList.add("hidden");
    showView("login");
    [requestsUnsubscribe, libraryUnsubscribe, partnersUnsubscribe].forEach((fn) => fn && fn());
    requestsUnsubscribe = libraryUnsubscribe = partnersUnsubscribe = null;
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
      ["#requests-pending", "#requests-done", "#requests-archived"].forEach((sel) => {
        const el = $(sel);
        if (el) el.innerHTML = '<li class="empty">Não foi possível carregar os pedidos.</li>';
      });
    }
  );
}

let allRequestDocs = [];

$("#archived-search").addEventListener("input", renderArchived);

function renderRequests(docs) {
  allRequestDocs = docs;
  const pending = docs.filter((s) => s.data().status !== "done");
  const done = docs.filter((s) => s.data().status === "done" && !s.data().archived);

  fillRequestList(
    "#requests-pending",
    pending,
    "Sem pedidos pendentes. Comece por <em>Novo pedido</em>."
  );
  fillRequestList(
    "#requests-done",
    done,
    "Nada pronto de momento. Os rascunhos aparecem aqui quando o agente correr."
  );
  renderArchived();
}

function renderArchived() {
  const term = ($("#archived-search")?.value || "").trim().toLowerCase();
  let archived = allRequestDocs.filter(
    (s) => s.data().status === "done" && s.data().archived
  );
  if (term) {
    archived = archived.filter((s) => {
      const d = s.data();
      const hay =
        (d.briefText || "") +
        " " +
        (d.results || []).map((r) => (r.title || "") + " " + (r.body || "")).join(" ");
      return hay.toLowerCase().includes(term);
    });
  }
  fillRequestList(
    "#requests-archived",
    archived,
    term ? "Nada corresponde à pesquisa." : "Ainda sem pedidos arquivados."
  );
}

function fillRequestList(sel, docs, emptyMsg) {
  const list = $(sel);
  if (!list) return;
  if (!docs.length) {
    list.innerHTML = '<li class="empty">' + emptyMsg + "</li>";
    return;
  }
  list.innerHTML = "";
  docs.forEach((snap) => list.appendChild(renderRequestItem(snap.id, snap.data())));
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
  body.appendChild(renderRequestBody(id, data));

  header.addEventListener("click", () => {
    const hidden = body.classList.toggle("hidden");
    header.setAttribute("aria-expanded", String(!hidden));
  });

  li.append(header, body);
  return li;
}

function renderRequestBody(id, data) {
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

  const ctx = { requestId: id, segment: data.segment, type: data.type };
  results.forEach((r) => wrap.appendChild(renderResultCard(r, ctx)));

  // Barra de arquivo do pedido inteiro.
  const bar = document.createElement("div");
  bar.className = "request-archive-bar";
  const archiveBtn = document.createElement("button");
  archiveBtn.className = "ghost small";
  archiveBtn.type = "button";
  archiveBtn.textContent = data.archived ? "Desarquivar pedido" : "Arquivar pedido";
  archiveBtn.addEventListener("click", async () => {
    archiveBtn.disabled = true;
    try {
      await updateDoc(doc(db, "requests", id), { archived: !data.archived });
    } catch (err) {
      console.error("Falha a (des)arquivar:", err);
      archiveBtn.disabled = false;
    }
  });
  bar.appendChild(archiveBtn);
  wrap.appendChild(bar);

  return wrap;
}

function renderResultCard(result, ctx = null, opts = {}) {
  const card = document.createElement("article");
  card.className = "result-card";

  if (!opts.skipTitle) {
    const title = document.createElement("h3");
    title.textContent = result.title || "Rascunho";
    card.appendChild(title);
  }

  const body = document.createElement("pre");
  body.className = "result-body";
  body.textContent = result.body || "";
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.appendChild(makeCopyButton("Copiar", result.body || ""));
  if (ctx && !opts.noSave) actions.appendChild(makeSaveToLibraryButton(result, ctx));
  (opts.extraActions || []).forEach((b) => actions.appendChild(b));
  card.appendChild(actions);

  if (result.imageRef) {
    // Imagem já gerada pelo sistema (Nano Banana) — mostra e deixa descarregar.
    card.appendChild(buildGeneratedImage(result));
  } else if (result.imagePrompt) {
    // Fallback manual: sem imagem gerada, mostra o prompt para colar no Gemini.
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

// Mostra a imagem gerada (carregada da colecção `images`) + botão descarregar.
function buildGeneratedImage(result) {
  const box = document.createElement("div");
  box.className = "gen-image";

  const loading = document.createElement("p");
  loading.className = "gen-image-loading";
  loading.textContent = "A carregar imagem…";
  box.appendChild(loading);

  getDoc(doc(db, "images", result.imageRef))
    .then((snap) => {
      if (!snap.exists()) {
        loading.textContent = "Imagem indisponível.";
        return;
      }
      const d = snap.data();
      const src = `data:${d.mime || "image/jpeg"};base64,${d.data}`;
      box.innerHTML = "";

      const img = document.createElement("img");
      img.className = "gen-image-img";
      img.src = src;
      img.alt = result.title || "Imagem gerada";
      img.loading = "lazy";
      box.appendChild(img);

      const actions = document.createElement("div");
      actions.className = "gen-image-actions";
      const dl = document.createElement("a");
      dl.className = "copy-btn";
      // NFD separa os acentos; o filtro [^a-z0-9] remove as marcas combinantes.
      const slug = (result.title || "imagem-pateo")
        .toLowerCase().normalize("NFD")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "imagem-pateo";
      dl.href = src;
      dl.download = slug + ".jpg";
      dl.textContent = "Descarregar imagem";
      actions.appendChild(dl);
      box.appendChild(actions);

      if (result.imagePrompt) {
        const det = document.createElement("details");
        det.className = "gen-prompt-details";
        const sum = document.createElement("summary");
        sum.textContent = "Ver prompt usado";
        const pre = document.createElement("pre");
        pre.textContent = result.imagePrompt;
        det.append(sum, pre);
        box.appendChild(det);
      }
    })
    .catch((err) => {
      console.error("Falha a carregar imagem:", err);
      loading.textContent = "Não foi possível carregar a imagem.";
    });

  return box;
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

// ─── Biblioteca ─────────────────────────────────────────────────────────

let libraryDocs = [];

// Adivinha a plataforma a partir do tipo e do texto do rascunho.
function inferPlatform(type, title, body) {
  const t = ((title || "") + " " + (body || "")).toLowerCase();
  if (/\bairbnb\b/.test(t)) return "Airbnb";
  if (/\bbooking\b/.test(t)) return "Booking";
  if (/instagram|\binsta\b|story|stories|\breel/.test(t)) return "Instagram";
  if (/facebook|\bfb\b/.test(t)) return "Facebook";
  if (type === "ota") return "Booking";
  if (type === "blog") return "Blog/Site";
  if (type === "social") return "Instagram";
  return "Outro";
}

const SEGMENT_LABEL = {
  casamento: "Casamento",
  convidados: "Convidados",
  peregrinos: "Peregrinos",
  montejunto: "Montejunto",
  geral: "Geral",
};

function makeSaveToLibraryButton(result, ctx = {}) {
  const btn = document.createElement("button");
  btn.className = "star-btn";
  btn.type = "button";
  btn.textContent = "⭐ Guardar na biblioteca";
  btn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    btn.disabled = true;
    try {
      await addDoc(collection(db, "library"), {
        title: result.title || "Rascunho",
        body: result.body || "",
        imagePrompt: result.imagePrompt || null,
        imageRef: result.imageRef || null,
        photoSuggestion: result.photoSuggestion || null,
        notes: result.notes || null,
        segment: ctx.segment || null,
        type: ctx.type || null,
        platform: inferPlatform(ctx.type, result.title, result.body),
        savedAt: serverTimestamp(),
        savedBy: user.email,
      });
      // Guardar na biblioteca arquiva o pedido de origem.
      if (ctx.requestId) {
        try {
          await updateDoc(doc(db, "requests", ctx.requestId), { archived: true });
        } catch (e) {
          console.warn("Não foi possível arquivar o pedido de origem:", e);
        }
      }
      btn.textContent = "⭐ Guardado";
      btn.classList.add("saved");
      setTimeout(() => {
        btn.textContent = "⭐ Guardar na biblioteca";
        btn.classList.remove("saved");
        btn.disabled = false;
      }, 1800);
    } catch (err) {
      console.error("Falha a guardar na biblioteca:", err);
      btn.textContent = "Não foi possível guardar";
      btn.disabled = false;
    }
  });
  return btn;
}

function subscribeLibrary() {
  libraryUnsubscribe = onSnapshot(
    collection(db, "library"),
    (snap) => {
      libraryDocs = [...snap.docs].sort((a, b) => {
        const aT = a.data().savedAt?.toMillis?.() || 0;
        const bT = b.data().savedAt?.toMillis?.() || 0;
        return bT - aT;
      });
      renderLibrary();
    },
    (err) => {
      console.error("Erro na subscrição da biblioteca:", err);
      $("#library-list").innerHTML =
        '<p class="empty">Não foi possível carregar a biblioteca.</p>';
    }
  );
}

["#library-search", "#library-platform", "#library-segment"].forEach((sel) =>
  $(sel).addEventListener("input", renderLibrary)
);

function renderLibrary() {
  const box = $("#library-list");
  const term = $("#library-search").value.trim().toLowerCase();
  const fPlatform = $("#library-platform").value;
  const fSegment = $("#library-segment").value;

  const filtered = libraryDocs.filter((snap) => {
    const d = snap.data();
    if (fPlatform && d.platform !== fPlatform) return false;
    if (fSegment && d.segment !== fSegment) return false;
    if (term) {
      const hay = ((d.title || "") + " " + (d.body || "")).toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    box.innerHTML = libraryDocs.length
      ? '<p class="empty">Nada corresponde aos filtros.</p>'
      : '<p class="empty">Ainda não guardou nada. Em <em>Os meus pedidos</em>, use a estrela ⭐ para guardar um rascunho aqui.</p>';
    return;
  }

  box.innerHTML = "";
  filtered.forEach((snap) => box.appendChild(renderLibraryCard(snap.id, snap.data())));
}

function renderLibraryCard(id, data) {
  const item = document.createElement("div");
  item.className = "lib-item";

  // Cabeçalho (acordeão) — fechado por defeito.
  const header = document.createElement("button");
  header.className = "lib-header";
  header.type = "button";
  header.setAttribute("aria-expanded", "false");

  const titleWrap = document.createElement("span");
  titleWrap.className = "lib-title";
  titleWrap.textContent = data.title || "Rascunho";

  const tags = document.createElement("span");
  tags.className = "lib-tags";
  if (data.platform) {
    const pb = document.createElement("span");
    pb.className = "badge plat-badge";
    pb.textContent = data.platform;
    tags.appendChild(pb);
  }
  if (data.segment && SEGMENT_LABEL[data.segment]) {
    const sb = document.createElement("span");
    sb.className = "badge seg-badge";
    sb.textContent = SEGMENT_LABEL[data.segment];
    tags.appendChild(sb);
  }
  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "⌄";

  header.append(titleWrap, tags, chevron);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "lib-body hidden";

  const remove = document.createElement("button");
  remove.className = "danger-btn small";
  remove.type = "button";
  remove.textContent = "Remover da biblioteca";
  remove.addEventListener("click", async () => {
    if (!confirm("Remover este item da biblioteca?")) return;
    try {
      await deleteDoc(doc(db, "library", id));
    } catch (err) {
      console.error("Falha a remover da biblioteca:", err);
      alert("Não foi possível remover. Tente de novo.");
    }
  });

  const card = renderResultCard(data, null, {
    skipTitle: true,
    noSave: true,
    extraActions: [remove],
  });

  const meta = document.createElement("p");
  meta.className = "library-meta";
  meta.textContent = "Guardado " + formatDate(data.savedAt);
  card.insertBefore(meta, card.firstChild);

  bodyWrap.appendChild(card);

  header.addEventListener("click", () => {
    const hidden = bodyWrap.classList.toggle("hidden");
    header.setAttribute("aria-expanded", String(!hidden));
    item.classList.toggle("open", !hidden);
  });

  item.append(header, bodyWrap);
  return item;
}

// ─── Parceiros (CRM B2B) ────────────────────────────────────────────────

let partnersDocs = [];
let editingPartnerId = null;
let partnerSort = { key: "name", dir: 1 };

const PARTNER_STATUS = {
  "a contactar": "st-todo",
  "contactado": "st-contacted",
  "em conversa": "st-talking",
  "parceiro": "st-partner",
  "sem interesse": "st-none",
};

function subscribePartners() {
  partnersUnsubscribe = onSnapshot(
    collection(db, "partners"),
    (snap) => {
      partnersDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderPartners();
    },
    (err) => {
      console.error("Erro na subscrição de parceiros:", err);
      $("#partners-tbody").innerHTML =
        '<tr><td colspan="8" class="empty">Não foi possível carregar os parceiros.</td></tr>';
    }
  );
}

["#partner-search", "#filter-type", "#filter-status", "#filter-priority", "#filter-region"].forEach(
  (sel) => $(sel).addEventListener("input", renderPartners)
);

$$("#partners-table th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (partnerSort.key === key) partnerSort.dir *= -1;
    else partnerSort = { key, dir: 1 };
    renderPartners();
  });
});

function filteredPartners() {
  const term = $("#partner-search").value.trim().toLowerCase();
  const fType = $("#filter-type").value;
  const fStatus = $("#filter-status").value;
  const fPriority = $("#filter-priority").value;
  const fRegion = $("#filter-region").value.trim().toLowerCase();

  return partnersDocs
    .filter((p) => {
      if (fType && p.type !== fType) return false;
      if (fStatus && p.contactStatus !== fStatus) return false;
      if (fPriority && p.priority !== fPriority) return false;
      if (fRegion && !(p.region || "").toLowerCase().includes(fRegion)) return false;
      if (term) {
        const hay = ((p.name || "") + " " + (p.notes || "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const k = partnerSort.key;
      let av = a[k], bv = b[k];
      if (k === "lastContact") {
        av = av?.toMillis?.() || 0;
        bv = bv?.toMillis?.() || 0;
      } else {
        av = (av || "").toString().toLowerCase();
        bv = (bv || "").toString().toLowerCase();
      }
      if (av < bv) return -1 * partnerSort.dir;
      if (av > bv) return 1 * partnerSort.dir;
      return 0;
    });
}

function renderPartners() {
  const tbody = $("#partners-tbody");
  const rows = filteredPartners();
  $("#partner-count").textContent =
    partnersDocs.length + " parceiro(s)" +
    (rows.length !== partnersDocs.length ? " · " + rows.length + " a mostrar" : "");

  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty">' +
      (partnersDocs.length ? "Nada corresponde aos filtros." : "Ainda sem parceiros. Use <em>+ Novo parceiro</em> ou <em>Importar CSV</em>.") +
      "</td></tr>";
    return;
  }

  tbody.innerHTML = "";
  rows.forEach((p) => tbody.appendChild(renderPartnerRow(p)));
}

function td(text) {
  const cell = document.createElement("td");
  cell.textContent = text || "—";
  return cell;
}

function renderPartnerRow(p) {
  const frag = document.createDocumentFragment();
  const tr = document.createElement("tr");
  tr.className = "partner-row";

  const nameCell = document.createElement("td");
  nameCell.className = "cell-name";
  nameCell.textContent = p.name || "(sem nome)";
  if (p.priority === "alta") {
    const dot = document.createElement("span");
    dot.className = "prio-dot";
    dot.title = "Prioridade alta";
    nameCell.prepend(dot);
  }
  tr.appendChild(nameCell);

  tr.appendChild(td(p.type));
  tr.appendChild(td(p.region));

  const statusCell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "badge " + (PARTNER_STATUS[p.contactStatus] || "");
  badge.textContent = p.contactStatus || "—";
  statusCell.appendChild(badge);
  tr.appendChild(statusCell);

  const prioCell = document.createElement("td");
  prioCell.className = "prio-" + (p.priority || "");
  prioCell.textContent = p.priority || "—";
  tr.appendChild(prioCell);

  tr.appendChild(td(p.nextAction));
  tr.appendChild(td(p.lastContact ? formatDate(p.lastContact) : "—"));

  const chevCell = document.createElement("td");
  chevCell.className = "cell-chevron";
  chevCell.innerHTML = '<span class="chevron">⌄</span>';
  tr.appendChild(chevCell);

  // Linha de detalhe (escondida; abre ao clicar na linha).
  const detailTr = document.createElement("tr");
  detailTr.className = "partner-detail hidden";
  const detailTd = document.createElement("td");
  detailTd.colSpan = 8;
  detailTd.appendChild(buildPartnerDetail(p));
  detailTr.appendChild(detailTd);

  tr.addEventListener("click", () => {
    const hidden = detailTr.classList.toggle("hidden");
    tr.classList.toggle("open", !hidden);
  });

  frag.append(tr, detailTr);
  return frag;
}

function buildPartnerDetail(p) {
  const wrap = document.createElement("div");
  wrap.className = "partner-detail-inner";

  const dl = document.createElement("dl");
  dl.className = "detail-grid";
  // Mostra sempre todos os campos (— quando vazio).
  const fields = [
    ["Tipo", p.type],
    ["Região", p.region],
    ["Estado", p.contactStatus],
    ["Prioridade", p.priority],
    ["Contacto", p.contactName],
    ["Email", p.email, "email"],
    ["Telefone", p.phone],
    ["Último contacto", p.lastContact ? formatDate(p.lastContact) : null],
    ["Próxima acção", p.nextAction],
  ];
  fields.forEach(([label, value, kind]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (value && kind === "email") {
      const a = document.createElement("a");
      a.href = "mailto:" + value;
      a.textContent = value;
      dd.appendChild(a);
    } else {
      dd.textContent = value || "—";
      if (!value) dd.classList.add("empty-val");
    }
    dl.append(dt, dd);
  });
  wrap.appendChild(dl);

  const notes = document.createElement("div");
  notes.className = "detail-notes";
  const h = document.createElement("strong");
  h.textContent = "Notas";
  const body = document.createElement("pre");
  body.textContent = p.notes || "—";
  notes.append(h, body);
  wrap.appendChild(notes);

  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const editBtn = document.createElement("button");
  editBtn.className = "primary small";
  editBtn.type = "button";
  editBtn.textContent = "Editar";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPartnerEditor(p);
  });
  const delBtn = document.createElement("button");
  delBtn.className = "danger-btn small";
  delBtn.type = "button";
  delBtn.textContent = "Apagar";
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("Apagar " + (p.name || "este parceiro") + "? Não pode ser desfeito.")) return;
    try {
      await deleteDoc(doc(db, "partners", p.id));
    } catch (err) {
      console.error("Falha a apagar parceiro:", err);
      alert("Não foi possível apagar. Tente de novo.");
    }
  });
  actions.append(editBtn, delBtn);
  wrap.appendChild(actions);

  return wrap;
}

// ── Editor ──

$("#partner-new-btn").addEventListener("click", () => openPartnerEditor(null));
$("#pe-cancel").addEventListener("click", closePartnerEditor);
$("#pe-save").addEventListener("click", savePartner);
$("#pe-delete").addEventListener("click", deletePartner);

function openPartnerEditor(p) {
  editingPartnerId = p?.id || null;
  $("#partner-editor-title").textContent = p ? "Editar parceiro" : "Novo parceiro";
  $("#pe-name").value = p?.name || "";
  $("#pe-type").value = p?.type || "outro";
  $("#pe-region").value = p?.region || "";
  $("#pe-contactName").value = p?.contactName || "";
  $("#pe-email").value = p?.email || "";
  $("#pe-phone").value = p?.phone || "";
  $("#pe-contactStatus").value = p?.contactStatus || "a contactar";
  $("#pe-priority").value = p?.priority || "média";
  $("#pe-lastContact").value = p?.lastContact ? toDateInput(p.lastContact) : "";
  $("#pe-nextAction").value = p?.nextAction || "";
  $("#pe-notes").value = p?.notes || "";
  $("#pe-delete").classList.toggle("hidden", !p);
  $("#pe-status").classList.add("hidden");
  $("#partner-editor").classList.remove("hidden");
  $("#partner-editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closePartnerEditor() {
  $("#partner-editor").classList.add("hidden");
  editingPartnerId = null;
}

function collectPartnerForm() {
  const dateVal = $("#pe-lastContact").value;
  return {
    name: $("#pe-name").value.trim(),
    type: $("#pe-type").value,
    region: $("#pe-region").value.trim() || null,
    contactName: $("#pe-contactName").value.trim() || null,
    email: $("#pe-email").value.trim() || null,
    phone: $("#pe-phone").value.trim() || null,
    contactStatus: $("#pe-contactStatus").value,
    priority: $("#pe-priority").value,
    lastContact: dateVal ? Timestamp.fromDate(new Date(dateVal)) : null,
    nextAction: $("#pe-nextAction").value.trim() || null,
    notes: $("#pe-notes").value.trim(),
  };
}

async function savePartner() {
  const data = collectPartnerForm();
  const statusEl = $("#pe-status");
  if (!data.name) {
    statusEl.textContent = "O nome é obrigatório.";
    statusEl.className = "status-message";
    statusEl.classList.remove("hidden");
    return;
  }
  $("#pe-save").disabled = true;
  try {
    if (editingPartnerId) {
      await updateDoc(doc(db, "partners", editingPartnerId), data);
    } else {
      await addDoc(collection(db, "partners"), data);
    }
    closePartnerEditor();
  } catch (err) {
    console.error("Falha a guardar parceiro:", err);
    statusEl.textContent = "Não foi possível guardar. Verifique a ligação e tente de novo.";
    statusEl.className = "status-message";
    statusEl.classList.remove("hidden");
  } finally {
    $("#pe-save").disabled = false;
  }
}

async function deletePartner() {
  if (!editingPartnerId) return;
  if (!confirm("Apagar este parceiro? Esta acção não pode ser desfeita.")) return;
  try {
    await deleteDoc(doc(db, "partners", editingPartnerId));
    closePartnerEditor();
  } catch (err) {
    console.error("Falha a apagar parceiro:", err);
    alert("Não foi possível apagar. Tente de novo.");
  }
}

// ── CSV import/export ──

const CSV_COLUMNS = [
  "name", "type", "region", "contactName", "email", "phone",
  "contactStatus", "priority", "lastContact", "nextAction", "notes",
];

$("#partner-export-btn").addEventListener("click", exportPartnersCsv);
$("#partner-import-input").addEventListener("change", importPartnersCsv);

function csvEscape(val) {
  const s = val == null ? "" : String(val);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportPartnersCsv() {
  const rows = [CSV_COLUMNS.join(",")];
  // Exporta a tabela toda (não a vista filtrada), conforme especificação.
  partnersDocs.forEach((p) => {
    const line = CSV_COLUMNS.map((c) => {
      if (c === "lastContact") return csvEscape(p.lastContact ? toDateInput(p.lastContact) : "");
      return csvEscape(p[c]);
    });
    rows.push(line.join(","));
  });
  const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "parceiros-pateo.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Parser CSV simples que respeita aspas e vírgulas dentro de campos.
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); field = ""; row = [];
    } else if (ch === "\r") {
      // ignora; \n trata a quebra
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim()));
}

async function importPartnersCsv(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    let text = await file.text();
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // remove BOM
    const rows = parseCsv(text);
    if (rows.length < 2) {
      alert("O ficheiro não tem linhas de dados.");
      e.target.value = "";
      return;
    }
    const header = rows[0].map((h) => h.trim());
    const idx = {};
    CSV_COLUMNS.forEach((c) => { idx[c] = header.indexOf(c); });
    if (idx.name < 0) {
      alert('O CSV precisa de uma coluna "name". Exporte primeiro um ficheiro para ver o formato.');
      e.target.value = "";
      return;
    }

    const dataRows = rows.slice(1);
    if (!confirm(`Importar ${dataRows.length} parceiro(s)? Serão adicionados como novos registos.`)) {
      e.target.value = "";
      return;
    }

    let ok = 0, fail = 0;
    for (const r of dataRows) {
      const get = (c) => (idx[c] >= 0 ? (r[idx[c]] || "").trim() : "");
      const name = get("name");
      if (!name) { fail++; continue; }
      const dateStr = get("lastContact");
      const parsed = dateStr ? new Date(dateStr) : null;
      try {
        await addDoc(collection(db, "partners"), {
          name,
          type: get("type") || "outro",
          region: get("region") || null,
          contactName: get("contactName") || null,
          email: get("email") || null,
          phone: get("phone") || null,
          contactStatus: get("contactStatus") || "a contactar",
          priority: get("priority") || "média",
          lastContact: parsed && !isNaN(parsed) ? Timestamp.fromDate(parsed) : null,
          nextAction: get("nextAction") || null,
          notes: get("notes") || "",
        });
        ok++;
      } catch (err) {
        console.error("Falha a importar linha:", err);
        fail++;
      }
    }
    alert(`Importação concluída: ${ok} adicionado(s)` + (fail ? `, ${fail} ignorado(s).` : "."));
  } catch (err) {
    console.error("Falha a ler CSV:", err);
    alert("Não foi possível ler o ficheiro CSV.");
  } finally {
    e.target.value = "";
  }
}

function toDateInput(ts) {
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
