# Páteo Content Studio

Ferramenta interna para preparar conteúdo de marketing do **Páteo das Laranjeiras** (alojamento local + Pack Noiva/o + brunch, em Alenquer).

> **Uso interno apenas.** O sistema **nunca** contacta clientes: só prepara rascunhos em português (PT-PT) para a sócia rever, aprovar e publicar à mão (Instagram, Facebook, Wix, Booking, Airbnb).

---

## O que este repositório contém

```
/brand-brain/           # "cérebro" da marca — a fonte única de verdade
    concept.md          # o que somos, o que não somos, quem recebemos
    rules.md            # regras obrigatórias para todos os agentes
    rooms.md            # factos sobre os 6 quartos
    voice.md            # tom, tratamento (você), CTA por email
    segments.md         # guia por segmento (casamento, convidados, peregrinos, Montejunto)
    photo-library.md    # onde vivem as fotos + tabela de temas
/.claude/
    agents/             # sub-agentes do Claude Code (Dispatcher, Copywriter, ...)
    CLAUDE.md           # instruções da execução headless
/scripts/
    queue.js            # lê pedidos do Firestore, invoca o Claude Code, escreve resultados
/web/                   # app web (Firebase Hosting) que a sócia usa
/.github/workflows/
    studio.yml          # cron do GitHub Actions
```

---

## Como funciona (visão geral)

1. A sócia entra na app web, escreve um pedido em linguagem natural (ex.: _"3 posts de Instagram para um grupo de casamento que chega dia 12"_).
2. O pedido fica gravado no **Firestore** como `pending`.
3. De ~15 em 15 minutos, o **GitHub Actions** (ou o PC local, ver Plano B) acorda, corre o `queue.js`, que invoca o **Claude Code** headless.
4. O Claude Code lê o `/brand-brain/`, passa pelo **Dispatcher → especialista (Copywriter / OTA Editor) → Art Director → QA**, e escreve os resultados de volta no Firestore.
5. A sócia recebe os rascunhos na app, com botões para **copiar** o texto e, quando há imagem, a **imagem já gerada** (Nano Banana) pronta a **descarregar**. Se a geração automática estiver desligada ou falhar, mostra antes o **prompt de imagem** para colar no Gemini à mão.

**Nada é publicado automaticamente. Nenhuma mensagem é enviada a clientes.**

---

## Geração de imagens (Nano Banana) — opcional, grátis

O sistema pode gerar as imagens automaticamente (modelo **`gemini-2.5-flash-image`**, o "Nano Banana", do Google AI Studio) e mostrá-las já prontas na app. É **opcional** e **degrada com segurança**: sem chave, ou se a chamada falhar, volta ao fluxo manual (mostra o prompt para colar no Gemini). **Nunca gera uma fatura.**

**Porque é grátis e seguro:**
- Tier gratuito: ~**500 imagens/dia**, **sem cartão de crédito**.
- Estás no **EEE (Portugal)** → pelos termos do Gemini API, aplicam-se os termos dos serviços pagos mesmo no tier grátis: o Google **não treina** com os teus dados. *(Confirmar nos termos atuais antes de produção.)*
- Uso real da sócia (uma mão-cheia de imagens/dia) fica muito abaixo do limite.

**Como ligar (passo-a-passo):**
1. Vai a **https://aistudio.google.com/apikey** com a conta Google do projeto e clica **"Create API key"** (é grátis, não pede cartão). Copia a chave.
2. No GitHub, no repositório: **Settings → Secrets and variables → Actions → New repository secret**.
   - **Name:** `GEMINI_API_KEY`
   - **Secret:** cola a chave. Guardar.
3. Pronto. No próximo run do agente, os rascunhos que precisem de imagem já vêm com a imagem gerada.

Para correr **localmente** (Plano B), define a chave antes do `npm run queue`:
```powershell
$env:GEMINI_API_KEY = "a-tua-chave"
npm run queue
```

**Guarda-quota:** por defeito gera no máximo **20 imagens por run** (`IMAGE_LIMIT`). Podes ajustar via env/secret.

**Passar para o Nano Banana Pro (pago, melhor qualidade):** cria o secret `GEMINI_IMAGE_MODEL = gemini-3-pro-image` e **ativa a faturação** na chave. Custa ~€0,12/imagem — deixa de ser custo zero. Só faz sentido se quiseres qualidade topo (texto nítido dentro da imagem).

---

## Restrições absolutas (não negociáveis)

- **Custo zero recorrente.** Sem APIs pagas de modelos. Sem Firebase Blaze. Sem overflow billing na subscrição do Claude.
- **Sem Cloud Functions / Cloud Storage** (obrigariam a Blaze). Fotografias vivem no Google Drive.
- **Nunca contactar clientes.** Nunca publicar. Nunca reservar.
- **Nunca inventar** preços, datas, comodidades, distâncias.
- **Posicionamento sagrado:** o Páteo é **alojamento + preparativos + brunch**. **NÃO** é venue de casamentos. A cerimónia e a festa acontecem sempre noutro espaço.
- **Tudo em português de Portugal** por defeito; EN só quando explicitamente pedido.

---

## Estado da construção

Ordem de construção (ver `CLAUDE_CODE_BUILD_PROMPT.md`):

- [x] **Fase 1** — Scaffold do repositório e brand-brain completo
- [x] **Fase 2** — Firestore + regras de segurança (projeto `pateo-das-laranjeiras`, região Madrid, regras deployed, smoke test ok)
- [x] **Fase 3** — App web (login, novo pedido, lista de pedidos, biblioteca e parceiros como placeholders)
- [x] **Fase 4** — Agentes (Dispatcher/Copywriter/OTA Editor/Art Director/Editor-QA) + `queue.js` local, testado end-to-end
- [x] **Fase 5** — GitHub Action com OAuth token da subscrição Claude; cron `*/15 07-20 UTC`; testado em CI a 2026-07-21
- [x] **Fase 6** — Polish: Biblioteca funcional, Parceiros (CRM B2B) com import/export CSV, botões de copiar, indicador de saúde, README final

---

## Como a sócia usa a app

1. **Entrar** — email e palavra-passe atribuídos (login Firebase).
2. **Novo pedido** — escrever em português o que precisa (ex.: _"3 posts de Instagram para um grupo de casamento que chega dia 12"_). Opcionalmente escolher idioma (PT por defeito, ou PT+EN) e segmento. Submeter.
3. **Os meus pedidos** — os rascunhos aparecem dentro de ~15 min com estado (Pendente / A processar / Pronto / Erro). Em cada rascunho pronto:
   - **Copiar** — copia o texto para colar no Instagram/Facebook/Wix/OTA.
   - **Copiar prompt de imagem** — copia o prompt para colar no Gemini (app grátis, Nano Banana) e gerar a imagem à mão.
   - **⭐ Guardar na biblioteca** — arquiva o rascunho para reutilizar.
4. **Biblioteca** — tudo o que guardou com a estrela, pesquisável por título ou texto; copiar ou remover.
5. **Parceiros** — base de dados comercial B2B para outreach de referência:
   - Tabela ordenável (clicar no cabeçalho) e filtrável por tipo, estado, prioridade e região; pesquisa por nome/notas.
   - **+ Novo parceiro** / **Editar** — formulário completo; o campo _Notas_ serve de histórico (acrescentar por baixo).
   - Estados com cores: a contactar → contactado → em conversa → parceiro / sem interesse.
   - **Importar CSV** / **Exportar CSV** — carregar listas em massa ou levar os dados para outro lado. O CSV usa as colunas: `name, type, region, contactName, email, phone, website, instagram, contactStatus, priority, lastContact, nextAction, notes` (data no formato `AAAA-MM-DD`).
   - **Criar pedido de email de outreach** (no editor de um parceiro) — gera um pedido pré-preenchido para rascunhar um email de apresentação. **O email é só rascunhado, nunca enviado pelo sistema.**
6. **última execução do agente: há X min** — indicador no topo que mostra que o pipeline está vivo.

Nada é publicado nem enviado automaticamente. Todos os rascunhos são para a sócia rever e usar à mão.
