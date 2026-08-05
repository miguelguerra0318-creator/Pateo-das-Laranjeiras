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
    studio.yml          # GitHub Actions (só workflow_dispatch — disparado pela app)
```

---

## Como funciona (visão geral)

1. A sócia entra na app web, escreve um pedido em linguagem natural (ex.: _"3 posts de Instagram para um grupo de casamento que chega dia 12"_).
2. O pedido fica gravado no **Firestore** como `pending`.
3. Submeter **não arranca nada**: o pedido fica em fila. Quando a sócia carrega em **"Processar agora"**, a **app manda o GitHub Actions arrancar** o `queue.js`, que invoca o **Claude Code** headless e trata de **todos os pedidos pendentes de uma vez** (até 10 por corrida, `BATCH_LIMIT`). **Não há cron — só corre quando a sócia dispara.**
4. O Claude Code lê o `/brand-brain/`, passa pelo **Dispatcher → especialista (Copywriter / OTA Editor) → Art Director → QA**, e escreve os resultados de volta no Firestore.
5. A sócia recebe os rascunhos na app, com botões para **copiar** o texto e, quando há imagem, a **imagem já gerada** (Nano Banana) pronta a **descarregar**. Se a geração automática estiver desligada ou falhar, mostra antes o **prompt de imagem** para colar no Gemini à mão.

**Nada é publicado automaticamente. Nenhuma mensagem é enviada a clientes.**

---

## Como a sócia dispara o agente (setup único do dono)

O agente **não corre sozinho** (sem cron). É a **app** que o arranca quando a sócia carrega em **"Processar agora"** — o único ponto de disparo. Para isso, a app chama a API do GitHub para correr o workflow. Configuração (uma vez):

1. **Tornar o repositório público** — GitHub → **Settings → General → Danger Zone → Change visibility → Public**. Isto dá **minutos de Actions ilimitados** e é necessário para o modelo escolhido.
   - *Antes de tornar público:* confirmar que não há segredos no repo. A service account do Firebase e as chaves **nunca foram commitadas** (estão no `.gitignore`); os **secrets do GitHub Actions** (`FIREBASE_SERVICE_ACCOUNT`, `CLAUDE_CODE_OAUTH_TOKEN`) continuam **privados** mesmo com o repo público.
2. **Criar um token do GitHub (fine-grained PAT):** GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - *Resource owner:* a conta dona do repo.
   - *Repository access:* **Only select repositories** → este repo.
   - *Permissions → Repository → Actions:* **Read and write**.
   - Gerar e **copiar** o token.
3. **Meter o token como secret:** GitHub → **Settings → Secrets and variables → Actions → New repository secret**, com o nome **`TRIGGER_TOKEN`** e o token como valor.
   - O workflow de deploy **gera** o `web/trigger-config.js` a partir deste secret em cada publicação. Assim o disparo sobrevive a deploys feitos pelo CI.
   - `trigger-config.js` está no `.gitignore` — **nunca** o commites (o GitHub revoga tokens que apareçam em repos públicos). Localmente pode existir para `firebase serve`.

Feito isto, a sócia só usa o site: submete os pedidos que quiser → carrega em **"Processar agora"** → os rascunhos aparecem em poucos minutos.

---

## Publicar o site (deploy)

**Automático:** cada push no `main` (ex.: ao fundir um PR) corre o workflow **deploy** e publica **hosting + regras do Firestore**. Não é preciso terminal.

**Manual:** Actions → **"Páteo Content Studio — deploy"** → *Run workflow*, podendo escolher publicar só o hosting, só as regras, ou ambos.

Setup único na consola Google Cloud → **IAM**, dando à service account (`client_email` do secret `FIREBASE_SERVICE_ACCOUNT`) três funções:
- **Firebase Hosting Admin**
- **Firebase Rules Admin**
- **Service Usage Consumer**

### 🔒 Segurança do site — registo para rever no futuro

Modelo atual (escolhido por simplicidade, jul/2026):

- **O token do GitHub está público no site** (`.../trigger-config.js`) e o **repositório é público**. Qualquer pessoa que descubra o site + token pode **disparar runs do agente**.
- **Impacto máximo de abuso:** spam de runs → consome o crédito mensal de automação do Claude → a geração **pausa até ao mês seguinte**. **Sem custo monetário** (overflow do Claude OFF, minutos de Actions ilimitados). O token é **fine-grained, só _Actions_, só este repo** → **não** dá acesso a código, dados nem outros segredos.
- **Manutenção:** o PAT expira (~1 ano) → é preciso gerar outro e repetir o passo 3.
- **Como endurecer no futuro (mais seguro):** mover o token para um **Cloudflare Worker** grátis que valida o login Firebase da sócia e só então chama o GitHub — o token deixa de ser público e só a sócia autenticada dispara; o repo pode voltar a privado. A app já está preparada: basta trocar o destino do POST em `web/app.js` (`triggerAgent`) para o URL do Worker. Ver histórico da conversa/def. do Worker.

---

## Geração de imagens (Nano Banana)

**Estado atual: manual e grátis (€0).** A app mostra, em cada rascunho que precise de imagem, o **prompt do Nano Banana** com um botão para copiar; a sócia cola-o na app grátis do Gemini (https://aistudio.google.com), gera a imagem à mão e usa-a. É o fluxo escolhido — custo zero, sem cartão.

> **Nota importante (jul/2026):** o tier **gratuito da API** do Gemini para **geração de imagens deixou de existir** — a API devolve `limit: 0` para `generate_content_free_tier_requests`. Ou seja, gerar imagens **automaticamente** via API passou a exigir **faturação ativada** (cartão). O plano gratuito só serve para gerar imagens **à mão** na app/site do Gemini. Artigos que anunciam "500 imagens/dia grátis via API" já não correspondem à realidade desta conta.

### Geração automática (opcional, pago — atualmente desligada)

O código já suporta gerar as imagens automaticamente e mostrá-las prontas na app (com botão de descarregar). Está **dormente** e só liga se existir o secret `GEMINI_API_KEY` **e** a faturação estiver ativada na chave. Se um dia quiseres ligar:

1. Ativa **faturação** no projeto Google Cloud da chave (Google AI Studio → Billing) e define um **alerta de orçamento**.
2. Cria o secret `GEMINI_API_KEY` no GitHub (**Settings → Secrets and variables → Actions**).
3. (Opcional) `IMAGE_LIMIT` limita imagens por run (default 20); `GEMINI_IMAGE_MODEL` escolhe o modelo (`gemini-2.5-flash-image` ~€0,03/img; `gemini-3-pro-image` / Nano Banana Pro ~€0,12/img, melhor qualidade).

Custo típico no uso real (poucas imagens/dia): alguns euros/mês. **Degradação graciosa:** se a chave faltar ou a chamada falhar (ex.: sem faturação → 429), o sistema volta sozinho ao prompt manual — nunca bloqueia nem falha o pedido.

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
2. **Novo pedido** — escrever em português o que precisa (ex.: _"3 posts de Instagram para um grupo de casamento que chega dia 12"_), escolher a plataforma e o tipo de conteúdo, e submeter. O pedido fica **pendente**; pode fazer vários de seguida.
3. **Os meus pedidos** — carregar em **"Processar agora"** (mostra quantos pendentes vão na corrida) e os rascunhos aparecem dentro de alguns minutos, com estado (Pendente / A processar / Pronto / Erro). Um pedido em **Erro** tem um botão **"Tentar de novo"** que o devolve a pendente. Em cada rascunho pronto:
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
