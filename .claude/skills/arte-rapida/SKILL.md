---
name: arte-rapida
description: >
  Gera UM criativo (story ou post) sob demanda a partir de uma frase em PT que ja traz a imagem
  (link do Google Drive ou imagem anexada na mesma mensagem). Use sempre que o usuario pedir
  "crie uma arte", "faz um story", "gera um criativo", "monta uma arte rapida" — pedidos pontuais,
  nao planejamento de semana. Exemplos: "crie uma arte de almoco executivo com o salmao,
  drive.google.com/...", "faz um story do By Rock divulgando o happy hour [link drive]",
  "gera um criativo de delivery com essa foto [imagem]". Tambem se aplica a "monta um story rapido",
  "faz uma arte unica", "preciso de uma arte agora". NAO usar para batch/grade semanal —
  para isso use /content-planner.
---

# Arte Rapida — Criativo unico via linguagem natural

Voce gera UM criativo de Instagram (story ou post) a partir de UMA frase em portugues que ja contem
a imagem (Drive link ou anexo). O fluxo deve terminar em ~2 turnos: turno 1 mostra 3 opcoes de copy,
turno 2 entrega a URL do PNG renderizado.

**Status final do post: DRAFT (rascunho).** Nao agende a menos que o usuario peca explicitamente.

---

## Passo 1 — Parsear intent + extrair imagem da mesma mensagem

Da frase do usuario, extraia em uma so passada:

| Campo | Como extrair | Exemplo |
|------|-------------|---------|
| `theme` | tema central do criativo | "almoco executivo", "happy hour", "delivery" |
| `subjectHint` | foco/destaque mencionado (prato, item, oferta) | "salmao", "chopp gelado", "20% off" |
| `driveFileId` | id do link do Google Drive | extraido via regex (abaixo) |
| `attachedImage` | imagem anexada na mensagem | content block do tipo image |
| `day` | dia da semana (opcional) | "sexta", "sabado", "domingo" |
| `projectHint` | nome/substring do projeto (opcional) | "Tero", "By Rock", "Bacana" |

**Regex para Drive link:**
- `https://drive.google.com/open\?id=([\w-]+)`
- `https://drive.google.com/file/d/([\w-]+)/`
- `https://drive.google.com/uc\?id=([\w-]+)`

Aceite tambem variantes com `&usp=...`, `&authuser=...` no final.

**Se a mensagem tem anexo de imagem (sem link):** guarde a base64 para uso no Passo 5b.

---

## Passo 2 — Resolver projeto

Se `projectHint` ausente:
1. Olhe o contexto recente da sessao — se um projeto foi mencionado nas ultimas mensagens, use ele.
2. Se ainda ambiguo, faca **uma unica** pergunta com `AskUserQuestion`:
   - Liste os projetos ativos (chame `mcp__studio-lagosta__list-projects` para popular)
   - Pergunte qual e o projeto. Nao continue sem isso.

Se `projectHint` existe mas o `prepare-creative` retornar `AMBIGUOUS_PROJECT`:
- Apresente os candidatos e pergunte uma vez. Re-rode com o nome exato.

---

## Passo 2b — Escolher a forma da arte

Esta skill não é o único jeito de fazer uma peça. Antes de seguir, decida COMO
ela vai ser feita — a resposta muda por cliente.

1. Leia `src/lib/creatives/forma-de-arte.ts` e chame `recomendarFormaDeArte`
   com o `projectId`, mais `temModeloDoTema` (o `prepare-creative` do Passo 3
   responde isso) quando já souber.
2. **Diga a recomendação em UMA linha e siga.** `fraseDaRecomendacao` já monta
   o texto. Formato: escolha feita · motivo em meia frase · uma saída.

   > "Vou montar com a identidade do cliente (sem crédito), porque a IA vem
   > sendo reprovada no TERO. Prefere deixar a IA desenhar?"

3. **Não espere aprovação** — faça e mostre. Se a pessoa preferir a outra, o
   custo de refazer é baixo justamente porque as duas primeiras opções são
   grátis.

🔴 **Nunca devolva um menu.** Seis opções para quem não é técnica é pior que
nenhuma. E se ela já disse como quer ("gera pela IA", "faz no editor"),
obedeça sem recomendar nada.

O roteiro completo de cada forma — por quais tools passa, o que custa, qual
rende página editável — está em **`docs/FORMAS-DE-ARTE.md`**. Leia antes de
recomendar algo que não seja o caminho desta skill.

**O caso mais comum de recomendação errada:** a IA entrega uma IMAGEM, não uma
página com camadas. Se a pessoa quer ajustar depois, o certo é o compositor
("montar com a identidade do cliente"), que dá acabamento **e** página
editável — não o editor, que obriga a desenhar do zero.

Se a forma escolhida não for o modelo preenchido, **saia desta skill** e siga
o roteiro daquela forma no documento acima. Os Passos 3 a 7 abaixo valem para
a via do modelo.

---

## Passo 3 — Bundle gather (1 chamada MCP)

Chame:
```
mcp__studio-lagosta__prepare-creative({
  projectHint: "<resolvido>",
  theme: "<theme>",
  day: "<day se mencionado>"
})
```

Retorno (resumo):
- `project` — id, name, googleDriveImagesFolderId
- `page` — id, templateId, templateName, name, **slotFields** (lista de campos a preencher), tags
- `alternatives` — outras pages candidatas
- `brand` — colors, fonts, logo, brandStyle, cuisineType
- `knowledge` — tomDeVoz, estabelecimento, horarios, diferenciais, cardapio, campanhas

**Se erro `NO_TEMPLATE_MATCH`:** mostre os `availableTags` e `availableTemplates`. Pergunte ao
usuario se quer usar um template diferente OU criar/taggear um. Nao tente adivinhar.

**Se varios `alternatives`:** prefira a `page` retornada (best match). So pergunte se o usuario
demonstrar duvida ou se as tags dos alternatives forem mais especificas pro tema pedido.

---

## Passo 4 — Gerar EXATAMENTE 3 variacoes de copy

**Regra critica:** cada variacao preenche **todos** os `slotFields` do tipo `text` retornados em
`page.slotFields`. Nao deixe campo vazio que existe no template.

**Insumos para a copy:**
- `knowledge.tomDeVoz` — o como falar
- `knowledge.diferenciais`, `knowledge.cardapio` — o que destacar
- `subjectHint` — destaque pedido pelo usuario (ex: "salmao")
- `theme` — tema central
- `brand.cuisineType`, `brand.brandStyle` — contexto

**Variar registro entre as 3 opcoes:**
1. **Direta** — informacao seca, foco no que e e quando
2. **Sensorial/descritiva** — apela aos sentidos, descreve sabor/textura/atmosfera
3. **Humor leve / convidativa** — tom mais descontraido, brincadeira ou call-to-action criativo

**Limites visuais (convencao, sem validacao automatica):**
- Pre-titulo / Badge: 1-3 palavras (ex: "SEXTA", "NOVO", "PROMO")
- Titulo: ate ~25 caracteres, MAIUSCULO se o template ja vier assim
- Subtitulo: ate ~60 caracteres
- Rodape-1 / Rodape-2: horario, condicao, restricao (ex: "Seg a Sex 11h-15h")
- CTA: imperativo curto (ex: "Pede o teu", "Vem provar", "Reserva ja")

Ver `references/examples.md` para 3 exemplos completos de variacao de registro.

---

## Passo 5 — Apresentar via AskUserQuestion (3 opcoes + outro)

Use `AskUserQuestion` com **uma so pergunta**, 3 opcoes. O preview de cada opcao deve mostrar
**todos os campos preenchidos**, formatados como:

```
Pre-titulo: SEXTA
Titulo: SALMAO NA BRASA
Subtitulo: Filezinho na grelha com legumes da estacao
Rodape-1: Almoco Executivo • 11h-15h
CTA: Reserva tua mesa
```

Header curto: "Copy" ou "Variante".
Labels das opcoes (em 1-3 palavras): "Direta", "Sensorial", "Descontraida".

A 4a opcao automatica "Other" do harness cobre o caso "outro" (usuario digita copy custom).
Se o usuario escolher Other com texto livre, parseie nos mesmos `slotFields`. Se algum campo
ficar sem mapeamento claro, use a copy mais proxima das 3 opcoes como base (nao deixe vazio).

---

## Passo 5b — Resolver imagem em fileId

**Caso A — Drive link no prompt original:** ja tem o `driveFileId`, va direto pro Passo 6.

**Caso B — Imagem anexada na mensagem:** chame
```
mcp__studio-lagosta__upload-to-drive({
  projectId: <do prepare-creative>,
  imageBase64: "<base64 do anexo>",
  filename: "arte-rapida-<theme>-<YYYY-MM-DD>.jpg",
  mimeType: "image/jpeg"
})
```
Use o `fileId` retornado.

**Caso C — Nem link nem anexo:** so pergunte se o usuario realmente esqueceu. Em geral o usuario
manda no prompt inicial; nunca crie o passo de "ok agora me manda a imagem" como rotina.

---

## Passo 6 — Gerar a arte (1 chamada, atomico)

```
mcp__studio-lagosta__create-arte-rapida({
  projectId: <do prepare-creative>,
  sourcePageId: "<page.id da source page>",
  slotValues: JSON.stringify({
    "<layer1 name>": "...",
    "<layer2 name>": "...",
    // ...todos os slotFields do tipo text
    _driveImageId: "<fileId resolvido>"
  })
})
```

Esse tool faz tudo de uma vez:
1. Encontra (ou cria, na primeira vez) o template **"Arte Rápida"** do projeto
2. Cria uma nova page la dentro com texto + imagem ja resolvidos nas layers
3. Renderiza pra Vercel Blob
4. Cria um Generation visivel na aba **Criativos**

Retorna `{ url, editUrl, galleryUrl, pageId, generationId, templateId }`:
- `url` — URL publica do PNG (preview)
- `editUrl` — abre a page no editor (`/templates/{arte-rapida-id}/editor?pageId=...`) pra
  ajustar layout, texto, imagem
- `galleryUrl` — `/projects/{id}?tab=criativos` (busque "Arte Rapida" pra filtrar)

**Nada disso vira SocialPost** — a arte NAO aparece na Agenda. So vai pra agenda se o
usuario pedir explicitamente pra agendar (aí crie um SocialPost separado com
`create-post`, status SCHEDULED, com `mediaUrls: [<url do blob>]`).

---

## Passo 7 — Resposta no chat

Responda em formato curto, sempre incluindo os links:

```
Pronto. Arte gerada (aparece em Criativos):

🖼️  Preview: {url}
✏️  Editar:  {editUrl}
📂  Galeria: {galleryUrl} (busque "Arte Rápida")

Quer agendar pra alguma data?
```

Se o usuario disser "agenda pra sexta 12h" ou similar:
1. Chame `create-post` com `mediaUrls: [<url do blob>]`, `status: SCHEDULED`,
   `scheduledDatetime: <data BRT>`, `postType: STORY`
2. Esse SocialPost é o que aparece na Agenda — separado do Generation que ficou
   no Criativos. Os dois coexistem.

---

## Erros e bordas

| Caso | Acao |
|-----|------|
| Drive link malformado / regex falha | Pergunte o link direto (formato `https://drive.google.com/open?id=...`). |
| `prepare-creative` retorna `NO_TEMPLATE_MATCH` | Mostre `availableTags` + `availableTemplates`, pergunte qual usar. Nao adivinhe. |
| `upload-to-drive` falha (sem folder configurado) | Repasse a mensagem de erro do tool e oriente configurar no admin. |
| `render-story` falha | Mostre o erro do tool. Nao tente recriar o post — o `postId` ja existe e pode ser re-renderizado depois. |
| Usuario nao mandou imagem nem link | Pergunte uma unica vez: "manda o link do Drive ou anexa a foto". |
| Usuario pede agendamento | Use `update-post` com status SCHEDULED + scheduledDatetime BRT. |

---

## O que NAO fazer

- **Nao** rode `analyze-drive-images` ou `search-catalog` aqui — a imagem ja vem no prompt.
- **Nao** invente tags de tema. Se o template nao tem a tag, peca pro usuario escolher.
- **Nao** pergunte o tom de voz — ele ja esta em `knowledge.tomDeVoz`.
- **Nao** crie multiplos posts. Esta skill e para 1 criativo por vez.
- **Nao** pule a etapa das 3 opcoes. O usuario sempre escolhe entre 3 (ou escreve no Other).
- **Nao** agende automaticamente. DRAFT por default, sempre.
- **Nao** devolva um menu de formas de arte. Uma recomendacao + uma saida (Passo 2b).
- **Nao** recomende nada quando a pessoa ja disse como quer. Obedeca.
- **Nao** ofereca Higgsfield / `human-image` — decisao do Ciro, 09/09/2026.
