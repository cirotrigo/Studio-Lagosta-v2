---
name: arte-pelo-mcp
description: >
  Cria e ajusta uma arte do Studio Lagosta de ponta a ponta pelo MCP, só com dados, sem clicar no editor:
  monta a peça, lê as camadas (ver-pagina), corrige posição, tamanho, cor, texto e camadas (ajustar-arte
  com camadas/pagina), confere o PNG renderizado e devolve o link do editor para o Ciro ajustar à mão.
  Use em pedidos como "cria uma arte do Espeto pelo MCP", "ajusta a logo dessa arte", "move o título",
  "troca a cor do texto da arte", "aumenta o título e sobe a logo", "monta e confere a arte pelo editor
  sem clicar", "arruma essa arte e me passa o link". Vale para arte NOVA ou já criada pelo MCP. Não use para
  agendar (use /agendar-artes), nem para a copy dos stories (use /revisar-copy), nem para o fluxo de
  UMA arte a partir de foto do Drive em 2 turnos (use /arte-rapida).
---

# Arte pelo MCP — criar, ver, ajustar, conferir

O Claude monta e corrige a arte **pelos dados** (camadas como JSON), olha o **PNG que o servidor renderizou**
e entrega o **`editUrl`** para o Ciro terminar à mão. O resultado fica **sempre como rascunho**.

Contrato completo (parâmetros, faixas, allowlist por tipo de camada, códigos de recusa): `docs/regras/mcp.md`,
seção "`ver-pagina` e as `camadas`/`pagina` de `ajustar-arte`". Não decore: **`ver-pagina` devolve os ids** e
`comoAjustar` diz o que dá para mexer. Esta skill só diz **a ordem** e **os limites**.

---

## 1. Regras duras (valem antes de qualquer passo)

- 🔴 **Nunca** chame `postar-agora`, `colocar-na-agenda`, `aprovar-rascunhos` ou `cancelar-post` sem pedido
  explícito do Ciro **neste turno**. `agendar-leva` só com `simular: true`. Esta skill termina em rascunho.
- 🔴 **Nunca `ajustar-arte` numa arte de cliente que a equipe já editou à mão** sem perguntar antes
  (a equipe corrige no editor e o MCP sobrescreveria). Arte criada nesta conversa pode mexer à vontade.
- 🔴 **Máximo 2 ciclos** `revisar-arte` → `ajustar-arte`. Se ainda não passou, pare, mostre o PNG, diga o que
  falta e peça revisão humana pelo `editUrl`. Não fique polindo em loop.
- 🔴 **Recusa: leia `details.erros`** (cada item traz `indice`, `op`, `camada`, `codigo`, `motivo`), corrija
  e mande outra chamada. **Nunca repita a mesma chamada igual.** Recusa grava nada (o pedido misto é recusado inteiro).
- 🔴 **`versaoEsperada` é obrigatória** com `camadas`/`pagina`. Pegue em `ver-pagina` (a mesma do `revisar-arte`).
  Depois de cada `ajustar-arte`, a **`versao` nova vem na resposta**: use-a na chamada seguinte.
  `VERSAO_DIVERGENTE` (409) = a página mudou (alguém editou): rele com `ver-pagina` e reavalie, não force.
- Fatos da peça (preço, horário, prato, promoção) vêm de `consultar-base`, **na data de hoje**. Não invente.

---

## 2. O ciclo

1. **Contexto do cliente**: `consultar-dna`, `consultar-voz`, `consultar-base`. O que é fato (horário, preço,
   regra de campanha) sai daqui.
2. **Foto**: `buscar-fotos` (acervo do cliente). Guarde o `driveImageId` da escolhida.
3. **Montar**: `escolher-modelo` → `criar-arte-de-modelo` (modelo + `slotValues`), ou `compor-arte` (spec →
   camadas pela assinatura do cliente), ou `criar-arte` (texto livre). Anote `generationId`/`pageId` e o `editUrl`.
4. **Ler como dados**: `ver-pagina` (por `pageId` ou `generationId`). Guarde `versao` e, por camada, `id`, `name`,
   `type`, posição e tamanho. Leia os `avisos` e o `comoAjustar`.
5. **Conferir a peça**: `revisar-arte` (medidas + visão). Devolve `achados` e `ajustes` prontos; a `versao` é a mesma.
6. **Corrigir**: `ajustar-arte` com `projectId`, `versaoEsperada` e `camadas` e/ou `pagina` (exemplos abaixo),
   e/ou os `ajustes` do revisor. Pode vir junto de `slotValues`, foto e `name` na mesma chamada. Ordem aplicada:
   textos/foto → `camadas` → `ajustes` do revisor.
7. **Ver o resultado**: `ver-geracao` devolve o PNG (`url`); ou `conferir-arte` (visão). **Olhe o PNG**, não confie
   só no "ajustada: true".
8. **Se for mexer mais** (até o limite de 2 ciclos): `ver-pagina` de novo, ou use a `versao` nova da resposta do ajuste.
9. **Entregar**: mostre o PNG e o **`editUrl`** ao Ciro, diga em 2 linhas o que mudou e o que ainda pode precisar
   de mão. Deixe como **rascunho**.

Texto/foto simples (trocar uma frase, outra foto) não precisa de `camadas`: `slotValues`/foto do `ajustar-arte` já cobrem.

---

## 3. Exemplos de `ajustar-arte` com `camadas`

Mover a logo para o canto e mudar a cor/tamanho do título:

```json
{
  "projectId": 8,
  "pageId": "…",
  "versaoEsperada": "v1:…",
  "camadas": [
    {
      "op": "definir",
      "camada": "logo",
      "campos": {
        "position": { "x": 72, "y": 72 },
        "size": { "width": 160, "height": 160 }
      }
    },
    {
      "op": "definir",
      "camada": "headline",
      "campos": {
        "style": { "color": "#F2C94C", "fontSize": 84, "textAlign": "left" }
      }
    }
  ]
}
```

Adicionar um texto, trazê-lo para perto do fundo da pilha e mudar o fundo da página:

```json
{
  "projectId": 8,
  "pageId": "…",
  "versaoEsperada": "v1:…",
  "camadas": [
    {
      "op": "adicionar",
      "tipo": "texto",
      "id": "nota",
      "campos": {
        "content": "Reservas pelo link",
        "position": { "x": 72, "y": 1700 },
        "style": { "fontSize": 28 }
      }
    },
    { "op": "reordenar", "camada": "nota", "ordem": 2 }
  ],
  "pagina": { "background": "#111111" }
}
```

`camada` aceita **id ou nome**; nome repetido dá `CAMADA_AMBIGUA` (use o id de `ver-pagina`). `position`/`size`
podem vir parciais. Faixas e campos permitidos por tipo: seção de `docs/regras/mcp.md` acima.

---

## 4. O que só existe na tela (avise, não automatize)

Se o pedido cair aqui, **diga ao Ciro que é no editor e passe o `editUrl`**. Não tente contornar por `camadas`:

- rich-text por trecho (modal de texto com estilos por trecho) — `rich-text` só aceita os campos comuns;
- grade de fotos (`grade: true`) e camadas de **grupo** (`grupo`): `remover`/`reordenar` são recusados;
- vídeo, música, motion, linha do tempo, transições — o render do servidor não desenha vídeo (`TIPO_NAO_EDITAVEL`);
- **página-modelo** (`isTemplate`): `ajustar-arte` recusa (`PAGINA_E_MODELO`); modelo se edita na tela;
- arte de IA/melhoria (sem página): `ver-pagina` devolve `GERACAO_SEM_PAGINA`.

🔴 **Ação que só existe na tela: avisar, nunca automatizar clique.** Não abra o editor para clicar nada no lugar do Ciro.

---

## 5. Modo só-rascunho (stdio)

Para o Claude Code operar sem risco de publicar, suba o stdio com `STUDIO_SO_RASCUNHO=1` (defina em `env` da
entrada `studio-lagosta` do `.mcp.json`; o `scripts/mcp-wrapper.sh` repassa o ambiente). Só ficam as tools de leitura e
as de produção até rascunho (`postar-agora` e afins nem aparecem). O que muda nas tools desta skill:

- **foto só por `driveImageId`** (do acervo); qualquer `fileUrl` é recusada (`URL_EXTERNA_RECUSADA`);
- **copy nunca apagada**: esconder, esvaziar, remover ou fazer sumir um texto com conteúdo é recusado
  (`CONTEUDO_NAO_PODE_SER_REMOVIDO`); para tirar texto, peça ao Ciro;
- **o gate de autonomia mede a versão final antes de gravar**: se piorar, volta `REVISAO_HUMANA_NECESSARIA` e
  nada é gravado — mostre o motivo e deixe o ajuste para o editor.
