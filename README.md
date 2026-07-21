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
5. A sócia recebe os rascunhos na app, com botões para **copiar** o texto e o **prompt de imagem** (Nano Banana), e cola manualmente onde precisa.

**Nada é publicado automaticamente. Nenhuma mensagem é enviada a clientes.**

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

Este README será actualizado no fim, com instruções completas de setup para a sócia (login, como fazer pedidos, como copiar conteúdo) e para o dono (secrets do GitHub, service account do Firebase, OAuth token do Claude Code).

Ordem de construção (ver `CLAUDE_CODE_BUILD_PROMPT.md`):

- [x] **Fase 1** — Scaffold do repositório e brand-brain completo
- [x] **Fase 2** — Firestore + regras de segurança (projeto `pateo-das-laranjeiras`, região Madrid, regras deployed, smoke test ok)
- [x] **Fase 3** — App web (login, novo pedido, lista de pedidos, biblioteca e parceiros como placeholders)
- [ ] Fase 4 — Agentes + `queue.js` local
- [ ] Fase 5 — GitHub Action (ou fallback local)
- [ ] Fase 6 — Polish, Biblioteca, Parceiros (CRM B2B), README final
