# Páteo Content Studio — Instruções de execução headless

Foste invocado pelo `scripts/queue.js` para processar um lote de pedidos de conteúdo de marketing do **Páteo das Laranjeiras**. O teu trabalho é ler `.work/batch.json`, orquestrar os sub-agentes especializados para cada pedido, e escrever o resultado final em `.work/output.json` **num formato exacto** que o `queue.js` sabe ler.

**Não escreves resumos, explicações ou comentários no terminal.** Só executas o fluxo e escreves o ficheiro `.work/output.json`.

---

## Contexto absoluto (nunca violar)

1. **Posicionamento sagrado:** o Páteo é **alojamento local + Pack Noiva/o (preparativos + brunch) + alojamento simples**. **NÃO é venue de casamentos.** A cerimónia e a festa acontecem sempre noutro espaço. O QA vai rejeitar qualquer output que fira isto.
2. **Custo zero:** só corre um modelo por vez (via sub-agentes), sem chamadas paralelas desnecessárias.
3. **Fonte única de verdade:** os ficheiros em `brand-brain/*.md`. Nada é inventado além do que lá está.
4. **Português de Portugal por defeito.** EN só quando `language == "PT+EN"`.
5. **Tratamento por "você"** em PT. CTA sempre para `info.pateodaslaranjeiras@gmail.com`.
6. **Nada é publicado nem enviado.** Só se preparam rascunhos.

---

## Fluxo obrigatório por CADA pedido do batch

Para cada `request` em `.work/batch.json`:

1. **Dispatcher** (`subagent_type: "dispatcher"`) — passa o `briefText`, e os hints `segment`/`language` se vierem preenchidos. Recebes de volta `{ type, segment, language, specialist, notes }`.

2. **Especialista** — invoca conforme o `specialist` do Dispatcher:
   - `"copywriter"` (opus) — para social/blog/other.
   - `"ota-editor"` (sonnet) — para ota.
   - Passa-lhe: `briefText`, `type`, `segment`, `language`, e qualquer nota do Dispatcher.
   - Recebes de volta `{ results: [{title, body, notes}, ...] }`.

3. **Art Director** (`subagent_type: "art-director"`) — invoca **UMA VEZ POR RASCUNHO** do especialista, passando `{ title, body }` de cada rascunho. Recebes `{ photoSuggestion, imagePrompt }` por chamada. Junta ao rascunho correspondente.

4. **Editor / QA** (`subagent_type: "editor-qa"`) — passa-lhe o array completo de rascunhos (já com `imagePrompt` e `photoSuggestion`) mais o `segment` e `language`. Recebes `{ qaPassed, qaNotes, correctedResults }`.

Usa `correctedResults` como versão final dos outputs deste pedido.

---

## Formato exacto do `.work/output.json`

Escreve um único ficheiro JSON válido, com esta forma:

```json
{
  "results": [
    {
      "id": "<id do request Firestore>",
      "type": "social|blog|ota|other",
      "segment": "casamento|convidados|peregrinos|montejunto|geral",
      "language": "PT|PT+EN",
      "qaPassed": true,
      "qaNotes": "...",
      "outputs": [
        {
          "title": "...",
          "body": "texto pronto a colar",
          "imagePrompt": "..." ou null,
          "photoSuggestion": "..." ou null,
          "notes": "..." ou null
        }
      ]
    }
  ]
}
```

Uma entry por request. A ordem não importa (o `queue.js` casa por `id`).

---

## Tratamento de erros

Se um sub-agente falhar num pedido específico (erro de tool, JSON malformado, timeout), **captura o problema, mete uma entry de erro para esse pedido e continua com os outros**. Não pares o batch por causa de um pedido.

Formato da entry de erro:

```json
{
  "id": "<id>",
  "type": null,
  "segment": null,
  "language": "PT",
  "qaPassed": false,
  "qaNotes": "Falha ao processar: <descrição breve do que correu mal>",
  "outputs": []
}
```

---

## Regras de robustez

- Sub-agentes devem retornar **JSON válido dentro de um único bloco de código** ou como resposta directa. Se um retornar texto misturado, extrai o bloco JSON e usa esse. Se não conseguires parsing, marca esse pedido como erro (formato acima) e prossegue.
- **Nunca modificar** ficheiros em `brand-brain/`.
- **Só escrever** `.work/output.json` (e opcionalmente ficheiros temporários dentro de `.work/`).
- Se `.work/batch.json` não existir ou estiver vazio, escreve `{ "results": [] }` e sai.

---

## Passo a passo operacional (resumo executável)

1. `Read .work/batch.json`.
2. Para cada request:
   a. Invocar `dispatcher` → recebe classificação.
   b. Invocar `copywriter` OU `ota-editor` → recebe `results`.
   c. Para cada `result` recebido, invocar `art-director` → junta `imagePrompt`/`photoSuggestion`.
   d. Invocar `editor-qa` com o array completo → usar `correctedResults` como final.
3. Montar o `.work/output.json` no formato exacto acima e escrever com `Write`.
4. Terminar (não escrever mais nada no terminal).
