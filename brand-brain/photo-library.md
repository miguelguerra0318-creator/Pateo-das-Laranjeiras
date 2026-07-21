# Biblioteca de Fotografias — Páteo das Laranjeiras

> Referência para o **Art Director** decidir quando usar **foto real** e quando pedir uma **imagem gerada (Nano Banana)**.
> **Regra de ouro (rules.md §5):** para mostrar o espaço real (quartos, piscina, pátio, pequeno-almoço) **usar sempre fotografia real**. Imagens geradas são **só** para conteúdo decorativo/ilustrativo que não represente falsamente o espaço nem pessoas reais.

---

## Onde vivem as fotos

As fotografias reais do Páteo estão numa pasta partilhada do Google Drive.

**Link do Google Drive:** _[a preencher pelo dono — colar aqui o URL público ou de partilha da pasta]_

Enquanto o link não estiver preenchido, o Art Director assume que **pode existir foto real** para os temas do espaço (piscina, pátio, quartos, brunch, exteriores) e sugere `"usar foto real de X"` no output — a sócia confirma no Drive e escolhe a que preferir. Para necessidades meramente decorativas (moodboards, ilustrações abstractas, elementos de design), o Art Director escreve um prompt de Nano Banana.

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
