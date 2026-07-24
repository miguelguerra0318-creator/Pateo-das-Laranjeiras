# Biblioteca de Fotografias — Páteo das Laranjeiras

> Referência para o **Art Director** decidir quando usar **foto real** e quando pedir uma **imagem gerada (Nano Banana)**.
> **Regra de ouro (rules.md §5):** para mostrar o espaço real (quartos, piscina, pátio, pequeno-almoço) **usar sempre fotografia real**. Imagens geradas são **só** para conteúdo decorativo/ilustrativo que não represente falsamente o espaço nem pessoas reais.

---

## Onde vivem as fotos

As fotografias reais do Páteo estão numa pasta do Google Drive, **organizadas por sub-pastas — uma por quarto/zona** (ex.: `Suíte Camel/`, `Quarto Ocre/`, `Piscina/`, `Pátio principal/`). O nome da sub-pasta é a etiqueta que aparece no seletor de fotos da app.

**As fotos em alta resolução ficam sempre privadas no Drive.** Um sync (`scripts/sync-photos.js`, ver workflow `sync de fotos`) lê essas pastas e guarda apenas **versões reduzidas** (miniatura + versão média) na colecção `photos` do Firestore, protegida por login. A partir daí, a app e o motor leem tudo do Firestore — nunca tocam no Drive.

### Montagem (uma vez, pelo dono)

1. **Activar a Google Drive API** no projecto Google (grátis).
2. **Partilhar a pasta-raiz das fotos com o email da service account** (o `client_email` do secret `FIREBASE_SERVICE_ACCOUNT`; o workflow imprime-o ao correr), em modo **Leitor**. Isto dá acesso de leitura **sem** tornar as fotos públicas.
3. **Indicar a pasta:** definir a variável de repositório `DRIVE_PHOTOS_FOLDER_ID` (ou passar o `folder_id` ao correr o workflow).

### Sincronizar

- Correr o workflow **"Páteo Content Studio — sync de fotos"** no separador Actions (ou `npm run sync:photos` localmente com `GOOGLE_APPLICATION_CREDENTIALS` + `DRIVE_PHOTOS_FOLDER_ID`).
- Para **testar com uma só pasta de um quarto**: aponta o `folder_id` directamente a essa pasta — o sync usa o nome dela como quarto/zona.
- Correr de novo sempre que adicionares/trocares fotos (o sync actualiza e remove o que já não existe).

Para necessidades meramente decorativas (moodboards, ilustrações abstractas, elementos de design), o Art Director continua a escrever um prompt de Nano Banana em vez de foto real.

---

## Tabela de temas

Preenche a coluna **"tem foto real?"** com `sim` / `não` / `parcial` à medida que fores organizando o Drive. A coluna **"notas"** serve para lembretes (ex.: "só temos ao entardecer", "faltam close-ups").

| Tema | Descrição | Tem foto real? | Notas |
|---|---|---|---|
| Piscina | Piscina exterior, com e sem pessoas | | |
| Pátio principal | Pátio central da casa, mesas, laranjeiras | | |
| Fachada / exteriores | Vista exterior da casa, entrada | | |
| Sala de pequenos-almoços | Zona A — pequeno-almoço servido na sala | | |
| Cozinha partilhada | Zona B — pequeno-almoço na cozinha partilhada | | |
| Brunch | Mesa posta com brunch (Pack Noiva/o ou extra) | | |
| Preparativos (noiva) | Noiva e madrinhas nos preparativos | | |
| Preparativos (noivo) | Noivo e padrinhos nos preparativos | | |
| Suíte Camel | Suíte principal (20 m², sofá, TV) | | |
| Quarto Bege | | | |
| Quarto Cinza | | | |
| Quarto Azul | | | |
| Quarto Ocre | Com acesso a cozinha partilhada, TV | | |
| Quarto Brick | Com acesso a cozinha partilhada, TV | | |
| Casas de banho | Duches privativos | | |
| Detalhes de arquitectura | Elementos da casa do séc. XIX (azulejos, madeiras, portas) | | |
| Envolvente | Alenquer, Serra de Montejunto, campo | | |
| Momentos com hóspedes | Grupos, convivência (com autorização) | | |

---

## Instruções para o Art Director

1. **Se o output mostra o espaço real** (qualquer tema desta tabela com "sim" ou "parcial"): output = `photoSuggestion: "usar foto real de <tema>"` e `imagePrompt: null`.
2. **Se o tema tem "não" ou está por preencher e é decorativo/ilustrativo**: pode escrever um `imagePrompt` do Nano Banana, deixando claro que **não representa o espaço real**.
3. **Nunca** gerar uma imagem que aparente ser uma foto real da casa quando não o é (rules.md §5).
4. **Formato do prompt de Nano Banana:** curto, em inglês, descritivo, com estilo ("warm natural light, film photography, rustic Portuguese estate") — a sócia cola no Gemini (app gratuita) para gerar.
