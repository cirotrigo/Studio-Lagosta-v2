# Plano — Evolução da catalogação e da busca de fotos do acervo

> **Executado em 07/09/2026** (branch `busca-de-fotos`): F0, F1, F2 e F4 no
> código; a indexação dos vetores e o reenriquecimento v3 da carteira rodaram
> no Mac. F3 (re-rank por visão) ficou de fora — ver §8 para o placar.

Data: 07/09/2026. Origem: relatório de pauta de fotografia de segunda-feira
(07/09), com "AS BUSCAS MORRERAM" para croissant, gelato e crepe na Real
Gelateria — fotos que EXISTEM no acervo.

## 1. O que foi medido (somente leitura, produção)

### 1.1 O catálogo não é o problema

| projeto | fotos | sem descrição | sem tags | tags/foto | vocab. de tags | chars de descrição |
|---|---:|---:|---:|---:|---:|---:|
| Real Gelateria | 3.054 | 0 | 0 | 8,7 | 1.071 | 158 |
| O Quintal Parrilla | 1.697 | 0 | 0 | 8,4 | 854 | 150 |
| TERO | 1.398 | 0 | 0 | 7,7 | 885 | 155 |
| Seu Quinto | 1.668 | 0 | 0 | 11,0 | 1.124 | 243 |
| Bacana | 958 | 0 | 0 | 8,2 | 786 | 163 |
| Espeto Gaúcho | 552 | 0 | 0 | 11,7 | 564 | 239 |
| By Rock | 1.076 | 0 | 0 | 11,4 | 1.112 | 235 |
| Lagosta Criativa | 124 | 0 | 0 | 13,5 | 515 | 202 |
| Wine Vix | 1.019 | 0 | 0 | 8,6 | 685 | 163 |
| Empório Fonseca | 1.148 | 0 | 0 | 8,5 | 1.011 | 163 |
| **carteira** | **12.694** | 0 | 0 | | | |

Na Real Gelateria, o casamento de tema de hoje encontra **113 fotos de
croissant, 145 de crepe e 2.380 marcadas "gelato"**. As fotos estão lá, e
estão descritas. `md5` está vazio em 100% das entradas (a detecção de
duplicata nunca foi backfillada).

### 1.2 "AS BUSCAS MORRERAM" mede outra coisa

A linha nasce de `temasRejeitadosDosSinais` (`src/lib/relatorios/pauta-fotografos.ts:46-65`):
agrupa os `LearningSignal` de foto por `criterios.theme` e acusa o tema quando
houve ≥ 2 buscas fechadas e **nenhuma aceita**. Só que "fechada" inclui
`expirada` — o desfecho que o cron das 04:00 carimba em toda proposta que
ninguém reconciliou em 24h.

Carteira, sinais de foto desde 08/08/2026 (603):

| desfecho | sem tema | com tema |
|---|---:|---:|
| expirada | 343 | 145 |
| trocada | 92 | 10 |
| aceita-como-veio | 9 | 4 |

**81% das buscas expiram.** No mesmo período `PhotoUsage` registrou **1.131
usos reais de foto** (586 arte-ia, 281 externo, 193 compositor, 49
arte-rapida). As fotos são usadas; o que não acontece é o FECHAMENTO da
busca: `fecharSugestaoDeFoto` só é chamada por `createArteRapida` e pelo
picker da bancada. O compositor (`compor.ts:829`) registra uso mas não fecha
a busca; `upload-creative`, `gerar-imagem` e `marcar-foto-como-usada` idem.
Toda busca do chat (`buscar-fotos`, o caminho de quem produz a semana) morre
por construção.

Prova na Real: a busca "crepe" de 31/08 tinha no topo quatro fotos da pasta
Crepes, todas destacadas — e expirou. Não faltou foto; faltou alguém fechar.

**Efeito colateral grave** (`sinal-de-foto-contrato.ts:242-254`): `expirada`
transforma as 3 fotos do topo em REJEIÇÃO (−12 no tema, −5 global). 488
expirações desde 08/08 são ~1.460 rejeições fabricadas contra as fotos que
o ranking considera as melhores. O aprendizado está se envenenando com o
próprio ruído.

### 1.3 Onde a busca falha de verdade

Refazendo, sem registrar nada, as 17 buscas reais da Real Gelateria com o
ranking de produção (`filtrarAcervo` + `ranquearAcervo`, insumos de hoje):

| tema | passam no filtro | top-5 com TODAS as palavras |
|---|---:|---:|
| crepe, croissant, pistache, waffle, vitrine, gelato, kinder, pote, ambiente | 31–2.380 | 5/5 |
| piemont | 4 | 4/5 |
| ambiente loja vitrine fachada | 606 | 0/5 |
| noite fachada noturna luzes | 20 | 0/5 |
| pistache pistacchio taça sobremesa especial | 2.589 | 0/5 |
| pistacchio gelato taça | 2.388 | 0/5 |
| torta chocolate belga | 1.293 | 0/5 |
| café croissant pausa | 2.985 | 1/5 |
| gelato taça casquinha mesa | 2.692 | 0/5 |

**Tema de UMA palavra funciona. Tema composto falha em 7 de 7.** As causas,
todas em `src/lib/creatives/ranquear-acervo.ts`:

1. **OR entre as palavras** (`casaComTema`): "pistacchio gelato taça" passa
   2.388 fotos porque basta casar "gelato". A relevância (2 a 3 pontos por
   palavra) é engolida por destaque (+40) e escolhas (+25): o topo de
   "pistacchio gelato taça" é uma foto de **panini** destacada.
2. **A descrição não é lida.** O casamento olha só `bestFor`, `tags` e
   `folder`. O prompt do `enriquecer-catalogo` diz à visão que "esta frase é
   o que a busca por tema vai encontrar" — e não é.
3. **`casaPalavra` é substring bidirecional**: "cheio" casa "recheio", e
   "salão cheio" devolve 11 fotos de crepe com recheio. Sem stem, sem plural
   real, sem IDF: "gelato" (78% do acervo) vale o mesmo que "croissant" (4%).
4. **Sem sinônimo fora dos pilares**: "sorvete" acha 7 fotos num acervo com
   2.380 "gelato"; "pistacchio" (como o cliente escreve) não acha "pistache";
   "salão" não existe no vocabulário do catálogo (ele diz "ambiente",
   "interior", "clientes").
5. **Vocabulário de tags aberto**: ~1.000 tags distintas por cliente, sem
   taxonomia. A mesma coisa aparece como "cafe-da-manha", "café da manhã",
   "desjejum" e "cafe da manha" no MESMO catálogo.
6. **Sem entendimento visual na consulta**: "fachada noturna", "salão cheio",
   "mesa posta vista de cima" são perguntas sobre a IMAGEM, e o catálogo só
   responde o que a visão escreveu na hora — uma descrição de 150 chars.

### 1.4 Protótipo lexical (30 linhas, sem custo)

Indexando a descrição, exigindo a maioria das palavras, pesando por raridade
(IDF), stem simples e um dicionário de 6 sinônimos, sobre o MESMO catálogo:

| tema | hoje | protótipo |
|---|---:|---:|
| pistacchio gelato taça | 0/5 | 5/5 |
| torta chocolate belga | 0/5 | 5/5 |
| café croissant pausa | 1/5 | 5/5 |
| gelato taça casquinha mesa | 0/5 | 4/5 |
| gelato de pistache | 0/5 | 5/5 |
| noite fachada noturna luzes | 0/5 | 0/5 (3 fotos no acervo) |
| salão cheio | 0/5 | 0 fotos (vocabulário) |

Metade do problema é lexical e barata. A outra metade ("salão cheio",
"fachada à noite") exige busca pela IMAGEM, não pelo texto — é aí que entra
embedding multimodal.

## 2. Conclusão do diagnóstico

São três problemas distintos, e o relatório os apresenta como um só:

1. **O laço não fecha** — 81% das buscas expiram porque quem usa a foto
   (compositor, canvas, chat) não avisa a busca. O relatório lê isso como
   "nenhuma foto serviu" e o ranking lê como rejeição. É defeito de
   instrumentação, e é o mais urgente porque corrompe o aprendizado.
2. **A busca é lexical fraca** — OR, substring, descrição ignorada, sem
   sinônimo, sem IDF. Resolve-se com texto, sem modelo novo, em 1–2 dias.
3. **A busca não vê a foto** — "salão cheio", "fachada à noite", "mesa posta
   vista de cima" só saem com embedding de imagem. É a evolução de verdade.

## 3. O que existe fora (pesquisa de 07/09/2026)

### 3.1 Open-source

| Projeto | Licença | Serve? | Por quê |
|---|---|---|---|
| **immich** (`immich-machine-learning`) | AGPL-3.0 | **Sim, como serviço à parte** | Container FastAPI+ONNX, CPU, com modelos multilíngues prontos. Para português o melhor é `ViT-SO400M-16-SigLIP2-384__webli` (82% recall no XM3600, 57 ms, ~4 GB RAM). `POST /predict` recebe imagem ou texto. É a via open mais madura. |
| **SigLIP 2** (Google, HF) | Apache-2.0 | Sim (é o modelo por trás do immich) | 109 idiomas; a query em PT funciona sem traduzir. Python; roda em CPU. |
| Weaviate `multi2vec-clip` | BSD-3 | Só self-host | Traz imagem Docker com SigLIP2-so400m; não existe no Weaviate Cloud. Infra a mais para 12k fotos. |
| open_clip + XLM-R (LAION-5B) | MIT-like | Só para indexar | Biblioteca-mãe; multilíngue mais fraco que SigLIP 2. |
| jina-clip-v2 | **CC-BY-NC** (pesos) | Não self-hosted | Uso comercial exige a API paga. |
| txtai, chroma, LanceDB, vespa, clip-retrieval, rclip | Apache/MIT | Não para este caso | Ou são Python embutido (não roda na Vercel), ou infra de bilhões de imagens, ou CLIP inglês. |
| Marqo, clip-as-service, Multilingual-CLIP | — | **Não** | Marqo declarou o open-source deprecated; os outros estão dormentes desde 2023–24. |
| PhotoPrism | AGPL | Não | Não tem CLIP; gera legenda e busca por texto, como o Studio faz hoje. |
| ColPali, AIMv2, Nomic Vision, MobileCLIP | — | Não | Documento/PDF, encoder sem retrieval, inglês, sem multilíngue. |

Nenhum deles roda DENTRO de uma função da Vercel (Python/ONNX; teto de 250 MB
por função). O desenho é sempre o mesmo: **indexar fora → guardar vetor no
banco → consultar por vetor**, com o encoder de texto numa API ou num
container pequeno sempre ligado.

### 3.2 APIs hospedadas (custo para 12,7k fotos, uma vez)

| API | Multilíngue | Imagem | 12,7k fotos | Observação |
|---|---|---|---:|---|
| **Gemini Embedding 2** (`gemini-embedding-2`) | 100+ idiomas, texto e imagem no MESMO espaço | ~US$ 0,00012 | **≈ US$ 1,50** | Mesma chave e mesma API que já descreve as fotos. Lançado maio/2026; a doc diz "stable" desde abril. Dimensão MRL 768/1536/3072. Até 6 imagens por chamada. ⚠️ No free tier os dados alimentam o Google — usar a chave PAGA. |
| Voyage `multimodal-3.5` | sim | US$ 0,60/bilhão de pixels | **US$ 0** (free de 150 B px) | Boa alternativa; segunda conta a manter. |
| Cohere `embed-v4.0` | 100+ idiomas | ~US$ 0,0008 | ≈ US$ 10 | Mais caro por imagem grande; trial 1k chamadas/mês. |
| Jina `jina-clip-v2` API | 89 idiomas | ~US$ 0,0003 | ≈ US$ 4 | Preço só em fontes de terceiros. |
| Vertex `multimodalembedding@001` | não confirmado | US$ 0,0001 | ≈ US$ 1,3 | Não achei nota de idioma na doc. |
| Titan Multimodal (Bedrock) | **inglês** | — | — | Descartado. |
| Replicate / HF Inference / Cloudflare | — | — | — | Sem SigLIP2 pronto; Cloudflare não tem embedding imagem↔texto. |

Consulta de texto (2k/mês) custa centavos em qualquer uma.

### 3.3 Onde guardar o vetor

| | Neon + pgvector | Upstash Vector (já contratado) |
|---|---|---|
| Disponível | `vector` 0.8.0, `pg_trgm` e `unaccent` estão em `pg_available_extensions` (medido 07/09; nenhuma instalada) | índice atual é de 1.536 dims (base de conhecimento) — foto exigiria índice NOVO, com envs novas |
| Filtro por cliente | `WHERE "projectId" = ?` no mesmo SQL que junta `PhotoUsage`, `PhotoDestaque` e texto | namespace por projeto ou metadata |
| Híbrido texto+vetor | `tsvector('portuguese')` + `unaccent` + RRF numa query só | hybrid index nativo (doc e página de preço divergem sobre sparse) |
| Custo | 12,7k × 1.536 × 4 B ≈ 78 MB — já pago | free cobre |
| **Veredito** | **pgvector no Neon**: uma fonte de verdade, join com o que o ranking já lê, backtest em SQL | reserva |

Regras da casa que se aplicam: migration à mão + `db:deploy`; `CREATE
EXTENSION IF NOT EXISTS vector` idempotente; coluna `Unsupported("vector")`
no Prisma com `$queryRaw`.

## 4. O plano, por fase

Cada fase entrega sozinha e é medida antes da seguinte. Pesos e ordem
seguem a lição do plano de 29/08: **corpus é a alavanca, não peso** — e
corpus envenenado é pior que corpus pequeno.

### F0 — Fechar o laço e parar de envenenar o ranking (1 dia, US$ 0)

1. **Todo caminho que registra `PhotoUsage` fecha a busca**: o compositor
   (`compor.ts:829`), `upload-creative` com `entrega.json`, o runner de
   `arte-ia` e `marcar-foto-como-usada` chamam `fecharSugestaoDeFoto` antes
   de gravar o uso, com `fotoDoCard` quando houver. Mesma janela de 6h.
2. **Expiração deixa de virar rejeição.** `expirada` passa a ser desfecho
   NEUTRO no `sinal-de-foto-contrato.ts` (hoje derruba as 3 do topo em −12).
   Rejeição só existe quando alguém escolheu OUTRA foto da lista (`trocada`)
   ou tirou o item da fila (`descartada`). Backfill: recalcular as
   preferências ignorando as 488 expirações — como o ranking lê os sinais na
   hora, basta a regra mudar.
3. **A pauta separa "ninguém fechou" de "nenhuma serviu"**: `busca-morta` só
   com `trocadas ≥ 2 e aceitas = 0`; expiradas viram a linha "N buscas sem
   desfecho" em cor de aviso, nunca crítico. E busca com resultado VAZIO
   passa a registrar sinal (`total: 0`), porque é exatamente ela que diz
   "falta no acervo" — hoje é a única que não deixa rastro.
4. Medição: `scripts/medir-busca-de-fotos.ts` (criado nesta sessão, só
   leitura) passa a rodar no relatório de domingo com a taxa de fechamento.

### F1 — Busca lexical de verdade (1–2 dias, US$ 0)

Tudo em `ranquear-acervo.ts` (puro), com backtest antes de subir:

1. **Descrição entra no casamento**, com peso próprio (`CASAMENTO_DESCRICAO`,
   entre pasta e tags).
2. **Palavra casa por TOKEN com stem leve**, nunca substring: "cheio" não
   casa "recheio"; "gelatos"/"gelato" casam. Vale a lição do `casaComDia`
   (02/09: "quinta" dentro de "Quintal").
3. **Tema composto exige a MAIORIA das palavras** (2 de 2, 2 de 3, 3 de 4),
   e a relevância pesa por raridade (IDF calculado sobre o catálogo do
   cliente na hora — 12k entradas em memória, custo zero). "gelato" deixa de
   valer o mesmo que "pistache".
4. **Dicionário de sinônimos por domínio** em módulo puro
   (`sinonimos-do-acervo.ts`): pistacchio↔pistache, sorvete↔gelato,
   salão↔ambiente/interior/clientes/mesas, taça↔copo/pote, noturna↔noite,
   picanha↔carne/churrasco… Curto (≤ 60 pares), editável, e os pilares
   continuam sendo a expansão por cliente.
5. **A relevância sobe de patamar** em `PESOS`: hoje 2 pontos por palavra
   contra +40 de destaque. Um destaque que não casa o tema não pode vencer
   uma foto que casa todas as palavras. Calibrar no backtest com os 17 temas
   reais da Real e os equivalentes dos outros clientes (pegar de
   `LearningSignal.sugerido.criterios.theme`).

Meta medida: top-5 completo ≥ 4/5 nos temas compostos (hoje 0/5).

### F2 — Embedding: a busca passa a ver a foto (3–5 dias, ≈ US$ 2 uma vez + centavos/mês)

Recomendação: **Gemini Embedding 2 + pgvector no Neon**, híbrido com a F1.

1. **Tabela `PhotoEmbedding`** (`projectId`, `driveFileId`, `md5`, `modelo`,
   `versao`, `vetorImagem vector(1536)`, `vetorTexto vector(1536)`,
   `geradoEm`). Sem FK, precedente de `PhotoUsage`. Índice HNSW por coluna;
   com 12k linhas a busca exata já é sub-segundo, o índice é conforto.
2. **Dois vetores por foto, no MESMO modelo**: o da IMAGEM (o que a busca
   por "salão cheio" precisa) e o da DESCRIÇÃO+TAGS (o que ancora o nome do
   prato, que a imagem sozinha confunde: pudim × gelato de caramelo).
3. **Indexação inicial** por script (dry-run por padrão, `--projeto`,
   `--confirmar`), 6 imagens por chamada, miniatura `=s400` do Drive (a
   mesma que a visão já lê). Depois, o cron `reconciliar-catalogos` embeda
   só a foto NOVA — é ele que já sabe o que entrou.
4. **Consulta híbrida**: embedding do tema → top-50 por imagem ∪ top-50 por
   texto ∪ top-50 lexical (F1) → fusão por RRF → entra em `ranquearAcervo`
   como insumo pré-calculado (`similaridade: Map<driveFileId, number>`),
   igual `ultimoUso` e `destaques`. O módulo continua puro e sem rede; quem
   busca o vetor é `acervo.ts`. Score aprendido (destaque, escolha, rejeição)
   continua mandando POR CIMA da similaridade.
5. **Safra `acervo-v3`** na chave do sinal: mudou a heurística, sobe a
   versão.
6. Falha do embedding degrada para a F1, nunca derruba a busca (mesmo
   contrato de `lerDestaques`).

Alternativa open-source se não quiser depender do Google: **SigLIP 2 via
container do immich** num Fly.io/VPS (1–2 semanas, US$ 5–15/mês). Mesmo
desenho de tabela e consulta; só troca quem gera o vetor. Fica como caminho
de volta documentado, não como primeira escolha: infra nova para operar e o
Studio já roda na API do Gemini.

### F3 — Re-rank por visão do top-20 (1 dia, ≈ US$ 1/mês)

Para buscas de tema composto, Gemini 2.5 Flash-Lite olha as 20 miniaturas do
topo e reordena pela pergunta ("qual mostra melhor um croissant com café?").
Custa ~US$ 0,0005 por busca. **Ordena, nunca veta** (regra da casa), e só
liga quando o tema tem ≥ 2 palavras ou quando a F2 devolve baixa confiança.
Só depois de medir a F2: se ela já entrega top-5 ≥ 4/5, a F3 não paga.

### F4 — Catálogo: o que a visão escreve (2–3 dias, ≈ US$ 15 para reenriquecer 12,7k)

Depende da F2 estar no ar, porque com embedding de imagem a descrição deixa
de precisar prever toda pergunta futura — ela precisa ser CERTA no que
afirma.

1. **Uma interface só, com zod**, no lugar das três divergentes
   (`acervo.ts`, `reconciliar-catalogo.ts`, `enriquecer-catalogo.ts`).
2. **Campos que a busca de hoje não tem**: `assunto` (o item principal, um
   só), `elementos[]` (o que mais está no quadro), `enquadramento` (close /
   médio / aberto / vista de cima), `momento` (dia / noite / golden), `lotacao`
   (vazio / ocupação moderada / cheio), `pessoas` (nenhuma / mãos / rosto).
   São as perguntas que a equipe faz e que hoje só a foto responde.
3. **Vocabulário de tags fechado por cliente**: pilares aprovados + pastas +
   lista canônica do domínio (o `montarVocabulario` do enriquecer já é
   metade disso). Tag fora do vocabulário vai para `tagsLivres`, não para
   `tags`. Mata "cafe-da-manha / café da manhã / desjejum" no mesmo acervo.
4. **Backfill de `md5`** (está vazio em 100% das entradas): a detecção de
   duplicata existe e nunca funcionou.
5. Reenriquecer com o prompt novo é `enriquecer-catalogo.ts --forcar`, por
   cliente, dry-run por padrão.

### F5 — Medição contínua

- `scripts/medir-busca-de-fotos.ts`: precisão top-5 nos temas reais do
  cliente (sem registrar sinal), taxa de fechamento das buscas, % de
  expiradas. Entra no relatório de domingo.
- Backtest de pesos: `validar-ranking-do-acervo.ts` ganha a via vetorial.
- KPI de partida (07/09/2026, Real Gelateria, 30 dias, 23 temas reais):
  precisão top-5 em tema simples **98%**, em tema composto **16%**;
  fechamento das buscas com decisão **28%** (113 buscas, 81 expiradas,
  264 usos de foto).

## 5. Ordem e esforço

| fase | esforço | custo | entrega |
|---|---|---|---|
| F0 laço + ranking sem veneno | 1 dia | 0 | relatório honesto, aprendizado limpo |
| F1 lexical | 1–2 dias | 0 | tema composto passa a funcionar |
| F2 embedding híbrido | 3–5 dias | ≈ US$ 2 + centavos/mês | busca pela imagem, sinônimos por semântica |
| F3 re-rank por visão | 1 dia | ≈ US$ 1/mês | opcional, só se a F2 não bastar |
| F4 catálogo v3 | 2–3 dias | ≈ US$ 15 | descrição estruturada, tags fechadas, md5 |

F0 e F1 podem ir juntas na mesma semana. F2 é a evolução que o pedido
descreve ("encontrar a foto ideal para cada postagem"); F4 vem depois dela
de propósito.

## 6. Decisões

**Decidido pelo Ciro em 07/09/2026: Gemini Embedding 2, com a chave API paga.** Ficam abertas as demais:

1. **Gemini Embedding 2 (recomendado) ou SigLIP 2 self-hosted?** A primeira
   é a mesma conta e zero infra; a segunda é open e independente, com um
   serviço a mais para operar.
2. **Chave paga do Gemini para o embedding** — no free tier as fotos dos
   clientes alimentam o modelo do Google.
3. **`expirada` neutra no ranking** (F0.2) muda o comportamento do score de
   hoje; é o que o diagnóstico recomenda, mas mexe em preferência
   registrada.

## 7. Scripts desta sessão

- `scripts/medir-busca-de-fotos.ts` — somente leitura; reproduz as tabelas
  da seção 1 para qualquer cliente. Nunca chama `buscarNoAcervo`.

## 8. Placar da execução (07/09/2026)

Juiz de visão (`scripts/julgar-busca-de-fotos.ts`, gemini-2.5-flash olhando
as 5 do topo), Real Gelateria. Dois conjuntos: os 13 temas compostos REAIS
dos sinais (sopa de palavras vinda do chat) e 5 temas VISUAIS em linguagem
natural ("salão cheio", "fachada à noite", "criança tomando sorvete", "mesa
posta vista de cima", "gelato de pistache na casquinha").

Com o catálogo v3 ESTÁVEL na Real (reenriquecimento concluído, 3.053 de
3.054 fotos), medição final de 07/09/2026 à noite:

| via | temas reais | temas visuais |
|---|---:|---:|
| lexical antiga (OR, substring) | 16% pela régua lexical | — |
| lexical F1 | 40% | 12% |
| só vetor de imagem | 43% | 32% |
| só vetor de texto | 31% | 24% |
| **F1 + F2 (peso 60, imagem 0,9, corte 0,5)** | **46%** | **24%** |

(A primeira calibração, feita com o catálogo mudando debaixo da medição, deu
45%/28% com peso 40 · imagem 0,8 · corte 0,6; remedida no catálogo estável
ela caiu a 46%/20%, e a varredura moveu o ponto para 60 · 0,9 · 0,5.)

- Nos temas reais tudo fica no ruído (±5%, 65 vereditos) — e **5 dos 13 são
  impossíveis** (0/5 em TODO método: "pistacchio gelato taça" pede taça num
  acervo de potes; "noite fachada noturna luzes" não tem foto noturna).
- Nos temas visuais o vetor de IMAGEM é o que acerta; "criança tomando
  sorvete" sai de 0/5 (lexical) para 4/5. Por isso a imagem pesa 0,8.
- A Real foi remedida com o catálogo v3 estável (tabela acima). Os outros
  clientes ainda estavam sendo reenriquecidos.
- Não feito: F3 (re-rank por visão do top-20). O juiz mostra que ele pegaria
  os temas visuais, mas a um custo por busca; fica para quando o KPI de
  fechamento (F0) disser o que a equipe de fato escolhe.
