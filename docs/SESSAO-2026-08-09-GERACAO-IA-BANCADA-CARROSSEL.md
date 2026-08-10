# Sessão 09/08/2026 — Geração de arte por IA, bancada e carrossel

> O Studio passou a **criar** arte por IA, não só melhorar. Com isso vieram a
> bancada (a tela onde a leva do dia é produzida), o carrossel com visual
> coerente entre slides, e o conserto de defeitos que estavam escondidos há
> meses. O plano que originou o trabalho está em
> [PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md](PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md).

Motivação: descontinuar o Claudinho (`insta-automatico`) preservando as duas
funcionalidades que valiam a pena — as telas `/stories` e `/carrosseis` — e
trazendo para dentro do produto o método das skills `human-*`, que é o que
produzia as melhores imagens da casa.

---

## 1. O que passou a existir

### 1.1 Motor de geração do zero

`src/lib/ai/creative-generation-service.ts` + `creative-generation-runner.ts`,
irmãos do pipeline de melhoria e reaproveitando dele download de insumos,
verificação de texto por visão, resize, Blob, créditos e polling.

**Duas trilhas que nunca se misturam** — a divisão veio das skills e do
insta-automatico, e misturá-las degrada as duas:

| | `imagem` | `arte` |
|---|---|---|
| O que é | cena/fotografia SEM texto | peça com a copy desenhada |
| Modelo | Gemini nano-banana | gpt-image-2 `quality: high` |
| Prompt | 12 parágrafos físicos em inglês (Kelvin, graus, IRE), ≤1500 chars, escrito por LLM e validado | template PT com a copy verbatim |
| Texto | proibido | obrigatório e conferido por visão |
| Logo | não entra | composta pelo sistema depois |

O prompt da trilha `imagem` passa por `validateImagePrompt`: **17 buzzwords
banidas** (`cinematic`, `stunning`, `8k`…), termos de comida que disparam o
filtro de conteúdo (`rare meat` → "fully roasted, deeply browned") e os
parágrafos obrigatórios. Prompt reprovado é reescrito uma vez; persistindo, as
buzzwords são removidas mecanicamente — prompt imperfeito é melhor que
geração derrubada pelo redator.

### 1.2 Referências com PAPÉIS

`subject` · `anchor-ambient` · `anchor-dish` · `style` · `series-guide` ·
`brand-card` · `logo`, sempre nessa ordem no `image[]`, com um **preâmbulo
escrito pelo backend** declarando o papel de cada imagem — nunca deixado a
cargo do LLM.

A regra-mãe, aprendida a caro no Espeto Gaúcho em 07/08: **a âncora manda, o
prompt só descreve a ação**. Descrever a arquitetura por texto faz o modelo
inventar um lugar genérico; o preâmbulo manda COPIAR a foto ("it is a real
existing place") e o resto do prompt gasta as palavras na ação.

Tetos: 1 subject, 3 âncoras, 2 style. Não é decoração — várias referências
competindo causam deriva visual.

### 1.3 Brand Reference Card

`src/lib/ai/brand-reference-card.ts` renderiza (napi-rs canvas, cache em /tmp)
um card 1080×1080 com logo, paleta e amostras tipográficas nas fontes reais do
projeto. Entra como referência na trilha `arte`. Instrução textual de fonte o
modelo aproxima; referência visual ele copia.

### 1.4 Anchor sheet por projeto

Tabela `ProjectAnchorImage` (migration `20260809180000`): fotos-âncora
canônicas por tipo de cena. A trilha `imagem` **injeta sozinha** a âncora de
tipo `ambiente` quando a cena é gerada e ninguém escolheu uma. Tools MCP
`definir-ancora` e `listar-ancoras`.

### 1.5 Bancada

Rota `/projects/[id]/bancada` (aba do projeto, no padrão da Agenda: aba que
navega para a tela cheia).

Montar e gerar são passos **separados** de propósito: a leva inteira é
preparada na fila e revisada antes de gastar crédito. Cada card oferece só a
ação do seu estado — rascunho gera, pronta agenda, erro tenta de novo. Gerar é
fire-and-forget: cada clique é um POST próprio, então várias artes tocam em
paralelo; um único intervalo acompanha.

O rascunho vive em localStorage (mesmo contrato da fila de melhorias) e a
verdade passa ao banco no "Gerar".

Duas peças que já existiam no backend e ganharam superfície:
- **`/slots`** expõe `sugerirPosts`, que deriva a cadência do histórico. O
  compositor abre no próximo horário livre, mostra o motivo no card ("costuma
  postar segunda por volta das 10:30") e **avança o slot a cada item**, para
  dois posts da mesma leva não nascerem no mesmo horário.
- **`/agendar`** expõe `agendarPost`, a mesma função da tool
  `colocar-na-agenda` — as regras de mídia, `renderStatus` e horário em BRT não
  podem divergir entre a UI e o chat.

### 1.6 Carrossel

`Generation.carouselGroupId` + `slideOrder` (migration `20260810020000`).

A capa é **foto pura** — o serviço RECUSA copy no slide 1. Capa com texto fazia
o modelo completar a peça com frases e dados que ninguém pediu. O primeiro
slide COM texto é o **guia**, e é ele que define o visual da série.

A coerência vem de três peças que andam juntas:
1. a **arte do guia como referência de imagem** (`series-guide`);
2. o **LOOK SPINE**, checklist de 8 itens que manda replicar o concreto
   (posição do bloco, alinhamento, hierarquia, caixa, cor de cada nível,
   elementos gráficos, véu, tratamento) e variar só sujeito e textos;
3. o **guia decodificado por visão** (`carousel-guide-decoder.ts`), que
   converte "copie o estilo" numa lista de decisões explícitas.

Sem o item 3, o modelo escolhia sozinho onde pôr o destaque: num teste o guia
saiu com a manchete toda branca e o slide seguinte com a segunda linha em
vermelho — as duas dentro da paleta, mas a série deixou de parecer uma peça só.

O ponto do desenho é a **etapa do meio**: capa e guia primeiro, a pessoa OLHA,
e só então os demais são gerados em paralelo. Gerar seis slides no estilo
errado custa seis vezes mais que perguntar.

### 1.7 Superfícies

| Onde | O que dá para fazer |
|---|---|
| Bancada (tela) | montar a leva, gerar, ver em tamanho grande, agendar; peça única e carrossel |
| Galeria de Criativos | "Gerar com IA" para uma peça avulsa; a galeria se atualiza sozinha enquanto há geração |
| MCP (chat) | `gerar-imagem` (com **modo diretor**: prompt escrito à mão, validado), `criar-carrossel` → `confirmar-estilo-carrossel` → `ver-carrossel`, `definir-ancora`, `listar-ancoras` |

---

## 2. Defeitos que estavam escondidos

### 2.1 Nenhum projeto entregava a logo ao gerador

`Project.logoUrl` está **NULL nos 10 projetos** — a logo real mora na tabela
`Logo` (aba Assets), e `loadBrandContext` lia só o campo do Project. Na
melhoria isso passava despercebido (a arte original já trazia a logo
desenhada); na geração do zero o modelo **inventou** a logomarca do By Rock.

Consertado no loader, o que vale para todos os consumidores do BrandContext.

### 2.2 A logo nunca deve ser desenhada pela IA

Regra canônica das skills, ignorada na primeira versão: modelo de imagem
distorce logotipo. Hoje o prompt PROÍBE desenhar qualquer marca e o sistema
compõe o PNG oficial com sharp (`logo-compositor.ts`).

Reservar área no prompt **não basta**: no primeiro teste o modelo escreveu a
copy por cima do canto reservado e a logo cobriu o "20h". Duas defesas: o
prompt exige que toda linha de copy TERMINE antes do canto, e o compositor
mede o desvio-padrão de luminância dos quatro cantos para fugir do bloco de
texto (texto tem contraste alto e denuncia a região ocupada). O canto reservado
tem vantagem de 20% para a logo não pular de lugar entre peças da mesma leva.

Falha ao compor não derruba a arte: sai sem marca, com o motivo em
`fieldValues`. Arte sem logo é editável; logo inventada é lixo.

### 2.3 Orçamento de retentativa era chute

Os dois runners decidiam retentar por divergência de texto com um teto **fixo**
de 45s. Com a geração levando 131s (formato feed), a retentativa passava no
teste com 117s e **abortava no meio** — dois minutos e uma chamada da OpenAI
queimados para terminar no mesmo FAILED.

Agora exigem o tempo **medido** da geração anterior × 1,2, com 45s de piso.
Geração de 131s recusa a retentativa e falha rápido dizendo o motivo; a de 96s,
que é o caso comum de story, continua retentando.

### 2.4 Carrossel voltava para "na fila" ao recarregar

O guard de reidratação da bancada olhava só `item.generationId`, mas no
carrossel o id fica nos SLIDES. Toda recarga jogava a série de volta ao início
com capa e guia **já pagos** — e quem clicasse em Gerar pagaria de novo. Há
agora a rede de segurança inversa: rascunho que já tem geração no servidor
volta para "gerando" e deixa o polling reconciliar.

### 2.5 A bancada não tinha link

A tela existia e só chegava quem digitasse a URL. Virou aba do projeto.

---

## 3. Armadilhas medidas (valem para código novo)

- **`sm:w-28`, `w-[7rem]`, `lg:max-w-sm` e `sm:ml-auto` NÃO geram CSS neste
  repo**; `w-28`, `h-36`, `sm:max-w-sm` geram. A miniatura do card virava
  largura total e engolia o card. Meça antes de confiar — a família de classes
  mortas já estava registrada e ganhou membros novos.
- **Nunca rodar `npm run build` com o dev server ligado**: os dois disputam o
  `.next` e o servidor quebra com "Cannot find module ./vendor-chunks/@clerk.js"
  até `rm -rf .next` + restart.
- **Rótulo montado por regex sobre string formatada quebra**: recortar o
  `quandoBRT` produzia "segunda /08/2026, 10:30 · 10:30". Monte dos campos
  estruturados.
- **Dedupe por hash do pedido precisa incluir o slide**: sem `groupId` e
  `slideOrder` no hash, slides de fotos parecidas caem no dedupe uns dos outros
  e o carrossel sai incompleto.
- **`migrate dev` continua pedindo reset** contra o branch com drift: as duas
  migrations desta sessão foram escritas à mão (padrão idempotente do `0_init`),
  validadas no branch de dev e aplicadas com `db:deploy`.

---

## 4. Registro atômico da run

Toda geração grava `{prompt, refs[], params, modelo, veredito}` em
`Generation.fieldValues`, no sucesso e na falha. Das 35 runs das skills, só 2
guardaram o prompt — e foram exatamente as que permitiram reconstruir os
aprendizados de uniforme, toalha e filtro de conteúdo. É barato e é o que
alimenta o loop de melhoria.

---

## 5. DNA profundo dos 9 clientes

Os `DNA.md` de `~/Documents/Clientes` (350–1600 linhas por marca) foram
destilados nas 5 seções do `BrandDNA` e **aplicados em produção**
(`scripts/importar-dna-clientes.ts`). O conteúdo anterior está preservado nos
`.md` de `scripts/.tmp-dna-import/` — é o rollback.

Calibragens que o script precisou:
- **uma chamada de LLM POR SEÇÃO**: em chamada única multi-seção o modelo
  comprime demais e o destilado perde o detalhe executável (louça exata,
  "costas da polo lisas", Kelvin);
- **laço de correção** para recusa espúria (a moldura "vetos/proibições"
  dispara falso positivo no gpt-4o), resposta curta e resposta acima do teto —
  e o reenquadre precisa acompanhar as retentativas seguintes, senão a recusa
  volta pela retentativa de tamanho.

---

## 6. O que falta para desligar o Claudinho

- **Fase 6**: rodar as duas bancadas em paralelo por 1–2 semanas comparando a
  qualidade por cliente, migrar o que só existe lá (brand-manual.png, logos
  preferidas por slug, referência de escala tipográfica) e desligar. O
  agendamento do insta-automatico já desagua no Studio, então o ciclo fecha
  sozinho.
- **Crivo de aprovação por projeto** (item 4 da Fase 2): as perguntas binárias
  do DNA viram checklist antes de agendar.
- **Variação do elemento gráfico no carrossel**: a onda sonora aparece no guia
  e não nos irmãos. Provavelmente exige mencionar o elemento na instrução, não
  só na descrição decodificada.
