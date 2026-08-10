# Sessão 10/08/2026 — Fases 4 a 6: inventário, crivo, QA e o carrossel

> Fecha o que faltava do [plano de 09/08](PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md):
> o inventário do que só existia no `insta-automatico`, o crivo de aprovação por
> projeto, o QA por visão além do texto, o "virar regra" e a investigação do
> elemento gráfico que sumia entre slides do carrossel.
>
> O passo a passo do desligamento está em [DESLIGAMENTO-CLAUDINHO.md](DESLIGAMENTO-CLAUDINHO.md)
> — documento, não execução.

---

## 1. Inventário: o que só existia no insta-automatico

| Item | Onde vive lá | Existe no Studio? | Ação |
|---|---|---|---|
| **`brand-manual.png`** (manual feito por designer) | `templates/<slug>/assets/` — **os 10 clientes têm** | ❌ só o card auto-gerado | ✅ **feito**: coluna `Project.brandManualUrl`, o card passa a preferir o manual, `scripts/importar-brand-manuais.ts` sobe os 10 |
| **`LOGO_MAP`** (logo preferida por slug) | `src/gpt-image.js:545` | ⚠️ existia `Logo.isProjectLogo`, mas **6 dos 10 divergiam** | ✅ **alinhado em 10/08** pelo Ciro — e a decisão expôs 2 defeitos no compositor (§2.1) |
| **Referência de escala tipográfica** | `clientes/tero/referencias/escala-01*.jpg` — **só o TERO** | ❌ o papel `style` existe, mas fala de tom, não de escala | ⚠️ vale como âncora `style` do projeto 3; 1 arquivo não justifica mecanismo novo |
| **Anti-órfã** (nunca 1 palavra sozinha na última linha) | regra 4 do prompt normal | ❌ ausente | ✅ **feito** — ver §5 |
| **Teto de largura por palavra** (~35% da largura útil) | regra dura 3 | ❌ havia só teto de altura | ✅ **feito** |
| **"NÃO RELUMIE" + desambiguação do DNA** | `fidelidadeRegra` | ⚠️ havia "não reluza", faltava a ressalva | ✅ **feito** — era conflito real: o Studio injeta `visualStyle` inteiro, e DNA que diz "luz dramática" autorizava relumiar a foto |
| **Extensão de borda com continuidade** | `fidelidadeRegra` | ❌ ausente | ✅ **feito** |
| **Escopo da lista negativa** ("nunca é motivo para recolorir/omitir copy") | `nuncaBloco` | ❌ `contentRules` ia cru | ✅ **feito** |
| **Paleta com hex no prompt** | `paletaTexto` | ❌ só a imagem do card | ✅ **feito** |
| **Tipografia travada em peça avulsa** | `buildTypographyDescription` | ⚠️ só no carrossel | ✅ **feito** — o lock passou a valer em toda peça com texto |
| **Heurísticas de função por bloco** (preço/horário/badge/CTA) | `HEURISTICAS` | ❌ ausente | ❌ **não portado** — depende de heurística por regex sobre a copy, e o Studio já resolve isso melhor pelo DNA de cada marca. Registrado como possível se o preço voltar a sair como manchete |
| **Sanitização >4000px** | `MAX_INPUT_PHOTO_DIM` | ✅ `MAX_INPUT_DIM` | — |
| **Dedupe da lista negativa** | `nuncaItens` | n/a | ❌ desnecessário: o DNA do Studio é texto único por seção, não três listas concorrentes |
| Fila BullMQ / Redis | `queue*.js` | ✅ `after()` + polling | — |
| Agendamentos | Supabase | ✅ `SocialPost` | — |

## 2. Logo: 6 dos 10 projetos divergem

Comparação **visual** (não por nome de arquivo — os nomes no Studio são opacos,
do tipo "Ativo 4logo.png"). Esquerda: a marcada `isProjectLogo` no Studio.
Direita: a que o `LOGO_MAP` do Claudinho usa.

| Projeto | Studio | insta-automatico | Veredito |
|---|---|---|---|
| 1 Real Gelateria | selo R dourado | `logo-selo-R-dourado.png` | ✅ bate |
| 6 Espeto Gaúcho | logo-espeto-g | `logo.png` | ✅ bate |
| 7 By Rock | By Rock - logo | `logo.png` | ✅ bate |
| 11 Wine Vix | Logo | `logo.png` | ✅ bate |
| 2 O Quintal Parrilla | lockup **empilhado** | lockup **horizontal** | ⚠️ mesma marca, travamento diferente |
| 3 TERO | versão **preta** + "brasa e vinho" laranja | versão **branca** | ⚠️ a preta some em foto escura — e a foto do TERO é escura |
| 4 Seu Quinto | só o **ícone "Q"** | wordmark "Seu QUINTO BOTEQUIM" | ⚠️ ícone no lugar da assinatura |
| 8 Lagosta Criativa | só o **símbolo** (lagosta) | wordmark "Lagosta CRIATIVA" | ⚠️ idem |
| 12 Empório Fonseca | monograma **FE** em círculo | wordmark "EMPÓRIO FONSECA" | ⚠️ idem |
| 5 Bacana | ícone branco sobre **quadrado laranja OPACO** | wordmark branco, fundo transparente | 🔴 **pior caso**: o `logo-compositor` cola isso sobre a foto e vira um bloco laranja na arte |

**RESOLVIDO no mesmo dia**: o Ciro passou as URLs e os 6 foram alinhados com
`scripts/definir-logo-do-projeto.ts` (o Seu Quinto ficou com `Ativo 1branco.png`,
a mais próxima da `logo-amarelo.png` do Claudinho). Os 10 projetos agora apontam
para a **assinatura da marca**, não para um ícone.

Reproduzir a comparação: `scripts/.tmp-comparar-logos.ts` (leitura-só, monta
a folha de contato em `/tmp/comparacao-logos/`).

### 2.1 A decisão expôs dois defeitos no compositor

**O antigo, e o pior: a escolha de canto nunca funcionou.**
`sharp(arte).extract(regiao).greyscale().stats()` **ignora o `extract`** e
devolve a estatística da imagem inteira. Medido numa arte metade escura e
metade clara: recortar o topo e recortar a base davam o mesmo `mean 134,
stdev 108` (o do quadro todo); o recorte materializado com `.toBuffer()` dava
`mean 26, stdev 0`.

Ou seja, os quatro cantos sempre mediram igual. A "escolha do canto mais calmo"
era empate perpétuo resolvido só pelo `RESERVED_BONUS` — a logo ia sempre para
o canto reservado, e o mecanismo de fugir do bloco de copy, que a documentação
do módulo descreve como o que salvou a peça quando o modelo ignorou a área
reservada, **nunca chegou a existir**. Bate com o registro das runs:
`logoCanto` sempre `bottom-right`, `logoMudouDeCanto` sempre `false`.

**O novo, criado pela decisão de hoje: calma não basta.** Medindo a luminância
média dos pixels visíveis das logos marcadas:

| Projeto | Logo | Luminância |
|---|---|---|
| 2 O Quintal | Ativo 1logo.png | **255** ⚠️ |
| 3 TERO | TERO_brasaevinho-branco.png | **255** ⚠️ |
| 5 Bacana | bacana.png | **252** ⚠️ |
| 4 Seu Quinto | Ativo 1branco.png | 212 |
| 12 Empório Fonseca | Ativo 2icones.png | 178 |
| 1 Real Gelateria | Ativo 3real.png | 177 |
| 6 Espeto Gaúcho | logo-espeto-g.png | 143 |
| 8 Lagosta Criativa | logo-lagosta-criativa-preto.png | 137 |
| 7 By Rock | By Rock - logo.png | 89 |
| 11 Wine Vix | Logo.png | 54 |

O canto mais calmo de uma foto costuma ser uma parede lisa ou uma toalha — que
é também o mais claro. Logo branca ali é logo invisível, e a peça sai "sem
marca" sem que nada falhe. O score passou a somar calma **e** contraste, e
canto que engole a marca é descartado antes de competir por calma.

Validado com três casos sintéticos, sem gerar arte nenhuma: logo branca +
canto reservado claro **foge** para o escuro (contraste 229, `moveu=true`);
logo branca + canto reservado escuro **fica** (233); logo escura + canto
reservado claro **fica** (153).

## 3. O elemento gráfico do carrossel: não era falta de menção, era enterro

A hipótese registrada em 09/08 era "talvez precise citar o elemento na
INSTRUÇÃO, não só na descrição decodificada". **Os dados dizem outra coisa.**

Primeiro, o defeito **não é reproduzível pelo registro**: nenhum slide IRMÃO
chegou a existir. Produção tem 2 grupos, ambos capa + guia (um guia
`FAILED` com "Request was aborted", outro travado em `PROCESSING`); o branch
de dev não tem carrossel nenhum. A observação veio do olho, não de uma run.

O que dá para medir é o prompt que um irmão receberia. Montando um (By Rock,
slide 3 de 4, sem chamar API nenhuma):

| | antes | depois |
|---|---|---|
| prompt total | 13.008 chars | **9.112** |
| bloco de DNA | 8.503 (**65%**) | 2.969 (33%) |
| LOOK SPINE começa em | **85%** | 43% |
| regra dos elementos gráficos | 90% | 54% |
| guia decodificado | 95% | 61% |
| 1ª menção ao elemento, no imperativo | **98%** | 46% |

(O "depois" já inclui os ~1.500 chars de regras novas da §5 — a reordenação
sozinha levava o prompt a 7.555.)

E `"onda sonora"` **já aparecia 3 vezes** no prompt antigo — duas dentro do DNA
(o By Rock descreve a onda como divisor padrão em `visualStyle` e em
`contentRules`) e uma na descrição do guia. Citar não era o problema. O
problema era **onde**: a instrução que faz a série ser uma série vinha depois
de 8,5 mil caracteres de prosa sobre a marca, e o gpt-image reescreve o prompt
internamente — defeito que o próprio insta-automatico já tinha documentado no
refactor de 07/07/2026 ("responde mal a paredão de regras redundantes").

Três mudanças:

1. **O LOOK SPINE subiu**, para antes do bloco de identidade.
2. **No slide irmão, o guia VENCE o DNA genérico**: `visualStyle` e
   `composition` saem do prompt. O guia já é a marca aplicada e aprovada —
   descrever em prosa o que a imagem mostra é concorrência, não reforço.
   `contentRules` fica, porque proibição não é estilo e o guia não a contém.
3. **Os elementos gráficos viraram ordem curta no topo do LOOK SPINE**, com o
   nome do elemento. Quando o guia não tem nenhum, a ordem se inverte
   explicitamente ("não acrescente filete, onda, barra nem ícone") — antes,
   lista vazia era silêncio, e silêncio o modelo preenche.

Para isso o `carousel-guide-decoder` passou a devolver `{ descricao,
elementosGraficos }` em vez de só a string.

> **Falta validar com o olho.** A correção está apoiada em medida, não em
> geração — combinado com o Ciro para não gastar crédito à toa. O próximo
> carrossel real é o teste.

## 4. QA por visão além do texto (Fase 4)

`src/lib/ai/creative-qa.ts`, chamado dentro do laço de tentativas do runner.

**A proporção é a que mais machucava em silêncio.** A finalização faz
`sharp().resize(w, h, { fit: 'cover' })`: proporção divergente é **cortada** sem
erro e sem aviso, e numa peça 4:5 gerada como 1:1 o corte come ~20% da altura —
exatamente onde mora o bloco de texto. Agora há assert antes do resize, com
tolerância de 2% (cobre o arredondamento dos lados múltiplos de 16 do
gpt-image-2; 4:5 contra 1:1 é 25% de desvio, então não passa). Fora da
tolerância, **regera em vez de cortar**; persistindo, falha dizendo o desvio.

Depois do texto conferido, uma inspeção por visão pergunta duas coisas —
legibilidade e texto cortado/sangrando na borda — e é explicitamente proibida
de reclamar de gosto. Reprovou e ainda há tentativa? regera. Reprovou na
última? **entrega com a ressalva anotada**: o texto está certo, e descartar
arte legível-com-ressalva é pior do que entregar com o defeito registrado para
quem revisa. Visão fora do ar nunca derruba a peça, mesmo contrato da checagem
de texto.

Tudo vai para o `fieldValues` (`qa`, `qaResumo`, `qaAspecto`, `qaVisual`).

## 5. Regras de prompt portadas do gpt-image.js

Entraram em `buildArtePrompt`, e a mais importante é a que **desfaz um conflito
que existia**: o Studio injeta `visualStyle` inteiro no prompt, e DNA que diz
"luz dramática, golden hour" convivia com "não reluza". O insta-automatico já
tinha apanhado disso e resolvido com uma frase explícita — que agora existe
aqui: descrição de fotografia no DNA define o **padrão de escolha** da foto e a
atmosfera da camada gráfica, **nunca autoriza relumiar** esta foto.

Junto vieram: anti-órfã, teto de ~35% da largura útil por palavra isolada,
extensão de borda com continuidade, escopo da lista negativa (proíbe o que
você CRIA, não é motivo para omitir bloco da copy), paleta com hex no texto do
prompt, e o TYPOGRAPHY LOCK valendo também em peça avulsa.

## 6. Crivo de aprovação por projeto

Coluna nova: **`BrandDNA.approvalChecklist`**, uma pergunta por linha.

**Por que coluna e não texto dentro de `contentRules`** (era a alternativa
sugerida no plano): `contentRules` é injetado VERBATIM no prompt de imagem.
Quinze perguntas interrogativas ali seriam ruído num prompt que já era 65% DNA,
e "Existe mais de uma oferta na mesma peça?" lido por um gerador é, na melhor
das hipóteses, inútil — na pior, uma sugestão. O crivo é semântica de
**revisão**, não de geração. E precisa ser lido linha a linha pela UI, o que
prosa embutida torna frágil.

Na bancada ele **guarda o "Agendar", não o "Rascunho na agenda"** — rascunho é
o caminho de quem ainda não aprovou, e exigir crivo ali viraria pedágio, que se
paga sem ler.

**Não existe veredito automático, e isso é decisão, não preguiça**: a
polaridade das perguntas é MISTA nos DNAs reais. No By Rock convivem "O layout
é igual ao da peça anterior?" (reprova no SIM) e "A foto acontece dentro do
salão real da casa?" (reprova no NÃO). Um formulário pontuado precisaria
reescrever as perguntas, e pergunta reescrita é outra pergunta.

`scripts/importar-crivo-clientes.ts` extrai o crivo dos `DNA.md` de
`~/Documents/Clientes` — **sem LLM**, de propósito: o crivo já É uma lista, e
destilar reescreveria as perguntas. O cabeçalho tem nome diferente em cada DNA
("Crivo de aprovação", "Checklist antes de agendar", "Auditoria antes de
publicar", "Portões de revisão humana"…), então os candidatos são **pontuados**
— pegar o primeiro que casava levava 4 dos 9 para uma seção "Gates humanos em
automação" que aparece antes e fala de outra coisa.

Dry-run nos 9 clientes: 7 a 35 perguntas cada, todas na seção certa.
**Não aplicado** — importação de DNA passa por revisão.

## 7. "Virar regra"

`virarRegra()` em `brand-context.ts` + tool MCP `virar-regra`. Correção
aprovada na conversa vira linha permanente do DNA, com data e motivo, sob o
cabeçalho `Regras aprendidas na prática:`.

**ACRESCENTA**, ao contrário de `updateBrandDNA`, que substitui a seção
inteira — perder o DNA porque alguém quis somar uma linha seria o pior
resultado possível. E não grava sozinha: sem `confirmado`, devolve
`antes`/`depois` para a pessoa ver. Mesmo contrato do `atualizar-dna`.

## 8. Armadilhas medidas nesta sessão

- 🔴 **`DATABASE_URL=… npx prisma …` NÃO funciona: o Prisma CLI ignora a
  variável inline e usa o `.env`, que aponta para PRODUÇÃO.** Testado com uma
  URL propositalmente inválida (`postgres://dev-branch-teste`): o CLI reportou
  o endpoint de produção mesmo assim. Foi assim que a migration desta sessão
  foi para produção antes de passar pelo dev. É pior que a armadilha já
  registrada do `dotenv-cli`, porque a incantação *parece* explícita.
  **Use sempre `npx tsx scripts/dev-db.ts …`**, que compara o compute e recusa
  produção.
- **O branch de dev estava 3 migrations atrás** (`add_project_anchor_image`,
  `add_carousel_group` e a desta sessão) — as duas primeiras são de 09/08.
  `npm run dev` contra ele quebraria em qualquer coisa que tocasse
  `ProjectAnchorImage` ou `carouselGroupId`. Reconciliado com
  `npx tsx scripts/dev-db.ts prisma migrate deploy`.
- **Módulo que a bancada importa não pode puxar o Prisma.**
  `parseApprovalChecklist` nasceu em `brand-context.ts`, que importa `@/lib/db`
  no topo — o que arrastaria o banco para o bundle do navegador. Virou
  `src/lib/brand/approval-checklist.ts`, sem dependências, mesma razão pela
  qual `art-direction.ts` é módulo à parte.
- **O dev server do painel Browser roda no diretório do projeto original,
  mesmo depois de entrar num worktree** (confirmado por `lsof -d cwd`: o
  processo fica em `Studio-Lagosta-v2`). Trabalho feito em worktree não é
  verificável por ele. As classes Tailwind do componente novo foram conferidas
  por outra via: todas já são usadas em outros arquivos do repo, então são
  geradas.
- **`DialogContent` já traz `sm:max-w-lg` e `overflow-y-auto`** — repetir
  classe do mesmo grupo é onde o `tailwind-merge` costuma morder. O componente
  novo passa só `max-h-[85vh]`.
