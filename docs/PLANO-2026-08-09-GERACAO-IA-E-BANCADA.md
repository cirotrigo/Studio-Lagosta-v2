# Plano — Geração de arte por IA v2 + Bancada manual no Studio

> Escrito em 09/08/2026, a partir de quatro levantamentos: a bancada `/stories` e
> `/carrosseis` do insta-automatico, o estado atual do Studio, as skills
> `human-*` (Higgsfield CLI) e a pasta `~/Documents/Clientes` (DNAs + 35 runs
> reais de geração). Objetivo: descontinuar o Claudinho preservando (e
> melhorando) a criação de stories e carrosséis dentro do Studio.

---

## 1. Diagnóstico: quatro sistemas geram arte hoje

| Sistema | Motor | Identidade | Estado |
|---|---|---|---|
| **insta-automatico (bancada)** | gpt-image-2 `images.edit` (foto = IMAGEM 1, Brand Reference Card = IMAGEM 2, logo = IMAGEM 3) | brand-kit.json + DNA textual + referência de escala | Em produção; agenda JÁ desagua no Studio via `/api/external/posts` |
| **Studio — melhoria** | gpt-image-2 `images.edit` (arte pronta = IMAGEM 1) | BrandDNA via `loadBrandContext` + `buildBrandIdentitySection` | Em produção; **só refina, não cria** |
| **Studio — Gemini** | nano-banana-2/pro (`generate-image-service`) | **nenhuma** (prompt cru do usuário) | Sai em `AIGeneratedImage`, fora da galeria/agenda |
| **Skills human-\* (Mac)** | Higgsfield CLI: `nano_banana_2` (imagem sem texto) / `gpt_image_2` (arte com lettering) | DNA.md profundo + 1–3 fotos-âncora + typography lock | O mais avançado criativamente; manual, local, sem UI |

O sistema das skills + `Clientes/` é o que produz a melhor imagem — e o método
dele é portável: não depende do Higgsfield (é só o transporte), depende de
**como o prompt é montado e de como as referências são usadas**. O Studio já
tem os mesmos modelos por API direta (OpenAI gpt-image-2, Gemini nano-banana).

## 2. O que as skills ensinam (o que portar de verdade)

### 2.1 Duas trilhas de geração — nunca misturar

| | Trilha A — IMAGEM (foto/cena, sem texto) | Trilha B — ARTE (com lettering) |
|---|---|---|
| Modelo | nano-banana-2 (Gemini) ou gpt-image-2 sem texto | gpt-image-2, `quality: high` |
| Prompt | 12 parágrafos físicos, inglês, ≤1500 chars | curto (4–7 linhas) se há arte-mãe; blocos `═══` se do zero |
| Refs | 1–3 fotos-âncora, sujeito primeiro | arte-mãe primeiro (base-only) + refs de marca |
| Texto | **proibido** ("zero letras, números, logos") | obrigatório, transcrito verbatim, QA por visão |
| Logo | nunca (composto depois) | área reservada no prompt + composição posterior |

### 2.2 Anatomia do prompt de imagem (Trilha A)

12 parágrafos com header em CAPS, nesta ordem: `CAMERA / LENS / LIGHT / SUBJECT /
FOREGROUND / MIDGROUND / BACKGROUND / WARDROBE TONAL BEHAVIOR / MAKEUP SURFACE
PHYSICS (→ MATERIAL PHYSICS p/ comida) / POST BEHAVIOR / COMPOSITIONAL GEOMETRY /
MOOD & ART DIRECTION`.

Regras duras:
- **Física, não adjetivo**: Kelvin, IRE, graus, T-stop. 17 buzzwords banidas
  (`cinematic, epic, beautiful, dramatic, stunning, moody, 4k, 8k,
  hyperrealistic, masterpiece…`) — validador automático antes do envio.
- ≤1500 caracteres, denso; inglês sempre.
- Para prato: bloco **PRODUCT FIDELITY** adaptado — "Preserve the exact plating,
  garnish placement, portion size and serving vessel from the reference."
- Filtro de conteúdo (aprendido na prática): carne sempre "fully roasted,
  deeply browned", nunca "rare/pink/juicy"; área kids vazia; bloqueio tem
  componente aleatório — retry vale.

### 2.3 Referências com PAPÉIS — a regra-mãe

- **A âncora manda, o prompt só descreve a ação** (regra dura do Espeto,
  07/08/2026): descrever arquitetura por texto faz o modelo inventar um lugar
  genérico — o prompt correto manda **copiar** as fotos ("reproduce the
  restaurant EXACTLY as it appears in the reference photographs, it is a real
  existing place") e lista o que NÃO pode inventar.
- **1–3 âncoras**, sendo pelo menos uma de **ambiente** quando a cena é gerada.
- **Base-only como default**: "várias refs competindo causam deriva visual".
- O backend **prefixa** o prompt com o papel de cada imagem ("First image is…
  Secondary references, only for style context") — nunca confiar que o LLM
  lembre.
- **Refs mandam, assunto obedece**: estilo/luminosidade vêm do acervo do
  cliente, não do tema do post (corrige os dois vieses: escurecer demais e
  literalidade).
- Ajuste **pontual** (detalhe): manda a própria peça como ref + "keep this
  exact image, change only X". Ajuste **estrutural**: regenera do zero.

### 2.4 O que o DNA registra que o BrandDNA ainda não tem

Os DNAs de `Clientes/` têm profundidade que o `BrandDNA` (5 colunas TEXT) não
alcança hoje: paleta com **papéis e percentuais de uso**, setups de luz
nomeados com Kelvin, enquadramentos-assinatura numerados, louça/uniforme
descritos como figurino, **anti-fotografia** exaustiva, **anchor sheet**
(âncora por tipo de cena: mesa → foto X, salão → foto Y, chopp → foto Z) e
crivo de aprovação em perguntas binárias. E o ciclo: **feedback aprovado vira
regra escrita no DNA**, com data e motivo.

### 2.5 Registro atômico da run

Só 2 de 35 runs guardaram o prompt — e foram as únicas que permitiram
reconstruir os aprendizados (uniforme, toalha, filtro). No Studio, TODA
geração grava `{prompt, refs[], params, resultUrl, veredito}` em
`Generation.fieldValues`. É barato e é o que alimenta o loop de melhoria.

## 3. A bancada do insta-automatico (resumo do que portar)

- `/stories`: foto (acervo Drive ou upload) + copy em blocos + instrução de
  imagem opt-in ("por padrão a foto NÃO é alterada") + slot da cadência →
  fila de cards (gerar → ajustar → agendar → excluir), SSE/poll, conflito ±30min.
- `/carrosseis` modo IA (3–8): capa = foto pura SEM texto, slide 2 = **guia de
  design**; gera capa+guia → confirmar estilo → demais slides com o guia como
  referência visual + bloco LOOK SPINE. Modo fotos (2–10): center-crop 4:5,
  slides "arte" opcionais, legenda obrigatória, agenda direto.
- Geração: gpt-image-2 `images.edit`, 3 tentativas BullMQ, regen com arte
  anterior + instrução (linhagem `derivadaDe`).
- Já agenda no Studio via `/api/external/posts` quando configurado.

O que o Studio já tem pronto para reusar: fila com status
(`improve-queue-store` + polling), 4 fontes de imagem no wizard, catálogo
semântico do acervo (`acervo.ts`, só MCP), `agendarPost`, carrossel 2–10 no
Zernio, congelamento, créditos, verificação de texto por visão, motor de slots
(`sugerir-posts.ts`, sem UI).

## 4. Plano por fases

> **PLACAR EM 09/08/2026 (fim do dia)** — o relato completo, com os defeitos
> descobertos e as armadilhas medidas, está em
> [SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md](SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md).
>
> | Fase | Situação |
> |---|---|
> | 1 — Motor de geração v2 | ✅ no ar |
> | 2 — Multi-seleção + DNA profundo | ✅ no ar (falta o crivo por projeto) |
> | 3 — Bancada de stories | ✅ no ar |
> | 4 — QA pós-render + DNA vivo | ⚠️ parcial: verificação de texto e prévia no ar; "virar regra" não |
> | 5 — Carrossel | ✅ no ar (tela e chat) |
> | 6 — Paralelo e desligamento | ⬜ não começou |
>
> Estimativa original: ~4 semanas até a paridade. Fases 1, 2, 3 e 5 saíram em
> um dia porque o Studio já tinha mais pronto do que o levantamento sugeria —
> o que faltava era quase todo **método**, não infraestrutura.

### Fase 1 — Motor de geração v2 (`creative-generation-runner`) · ~1,5 semana

> **STATUS 09/08/2026: IMPLEMENTADA** (exceto item 3 parcial — o card
> auto-gerado existe; `brandManualUrl` ficou para a Fase 2 por exigir
> migration). Arquivos: `src/lib/ai/image-prompt-builder.ts`,
> `brand-reference-card.ts`, `creative-generation-service.ts`,
> `creative-generation-runner.ts`, `runImageEdit` no `openai-image-client.ts`,
> rota `/api/projects/[id]/arte-ia`, tool MCP `gerar-imagem` (com modo
> diretor `promptPronto`), custo `ai_art_generation: 25`. E2E real validado
> no projeto 8 (211s, textCheck divergiu na 1ª → retry → passed; cleanup ok):
> `scripts/.tmp-test-arte-ia-e2e.ts`. O LLM que escreve o prompt da trilha
> `imagem` usa `OPENAI_PROMPT_MODEL` (default gpt-4o).

O coração. Irmão do `creative-improvement-runner`, reaproveitando dele
download de insumos, verificação de texto, resize, Blob, créditos e polling.

1. **`src/lib/ai/image-prompt-builder.ts`** — módulo novo:
   - `buildImageBrief()` — LLM transforma pedido PT + BrandContext em
     `image_brief` JSON (subject, composition, lighting, color_treatment,
     style, mood, avoid) — prompt de "diretor de arte" do módulo 10 das skills.
   - `briefToPrompt()` — image_brief → 12 parágrafos físicos (Trilha A) ou
     blocos `═══` com TEXT CONTENT verbatim (Trilha B).
   - `validatePrompt()` — buzzwords banidas, teto de chars, regras de comida
     (fully roasted), presença dos parágrafos obrigatórios.
2. **Referências com papéis** (o pedido central):
   - Tipo `ReferenceRole = 'subject' | 'anchor-ambient' | 'anchor-dish' |
     'style' | 'brand-card' | 'logo'` — estende o
     `'background' | 'logo' | 'element'` atual.
   - Ordem no `image[]`: subject → âncoras → brand card → logo.
   - Prefixo automático de papéis no prompt (função tipo
     `prompt_with_reference_rules`).
   - Teto: 1 subject + até 3 âncoras + brand card + logo (~6). Aviso de
     deriva visual acima de 3 âncoras.
   - Ingestão via `resolveImageUrl`/Blob (o guard SSRF já exige host do Blob).
3. **Brand Reference Card**: render server-side (napi-rs canvas já existe)
   1080×1080 com logo + paleta com papéis + amostras tipográficas com as
   fontes reais do projeto; cache por hash do BrandDNA + assets; campo novo
   `Project.brandManualUrl` para upload do manual feito por designer
   (prioridade absoluta sobre o auto-gerado — "funciona MUITO melhor").
4. **Roteamento de modelo** (tabela do DNA §5.1.1 vira config):
   - Imagem/cena sem texto → Gemini nano-banana-2 (já integrado; passar a
     injetar BrandContext e a gravar como `Generation`, não `AIGeneratedImage`).
   - Arte com lettering → gpt-image-2 `quality: high`.
   - Melhoria de foto ("luz, cor, textura") → prompt de regen atual.
5. Sanitizar entrada >4000px/lado; sizes nativos já usados no improve.
6. Persistir SEMPRE `{prompt, refs, params, model}` em `fieldValues`;
   template coletor "Arte IA"; custo novo em `FEATURE_CREDIT_COSTS`.
7. **Expor como MCP tool** (`gerar-imagem` / variação de `criar-arte`): o fluxo
   conversacional das skills continua existindo — o Ciro dirige pelo chat
   (Claude como diretor de arte), mas a execução, o crédito, a galeria, a
   linhagem e a agenda ficam no Studio. Disparos em paralelo = N tool calls.

**Decisão prévia:** aposentar ou absorver as rotas órfãs
`/api/tools/generate-art` e `/api/projects/[id]/generations/carousel` — não
criar um quinto caminho.

### Fase 2 — Multi-seleção de acervo + DNA profundo · ~1 semana

> **STATUS 09/08/2026: itens 1, 2 e 3 implementados.** Anchor sheet no ar
> (`ProjectAnchorImage` + migration aplicada em produção, injeção automática
> da âncora "ambiente" na trilha imagem, tools MCP `definir-ancora` /
> `listar-ancoras`). DNAs dos 9 clientes **aplicados em produção** pelo
> `scripts/importar-dna-clientes.ts` (uma chamada LLM por seção com laço de
> correção; o conteúdo anterior está preservado nos `.md` de
> `scripts/.tmp-dna-import/` — é o rollback).
>
> **UI de multi-seleção no ar**: `arte-ia-image-picker.tsx` (acervo com busca
> por tema, chips de pasta do Drive, rodízio "menos usadas primeiro", upload,
> e o CHIP DE PAPEL por imagem com os tetos do backend) +
> `gerar-arte-ia-modal.tsx` (trilha, formato, copy verbatim, instrução de foto
> opt-in) + botão "Gerar com IA" na aba Criativos, que passou a se atualizar
> sozinha enquanto houver Generation PROCESSING. Rotas novas:
> `/api/projects/[id]/acervo` (expõe o catálogo semântico que só o MCP via,
> com fallback para a listagem crua) e `/api/projects/[id]/ancoras`.
> Verificado no navegador com o By Rock: 840 fotos do acervo, papel atribuído
> automaticamente (2ª foto → Ambiente), chip bloqueado quando o teto estoura,
> e POST real criando a Generation com as duas refs e a copy.
>
> ✅ **Duas galerias — unificado em 09/08/2026**: a rota
> `/projects/[id]/creativos` tinha uma cópia inline da galeria e ficou sem o
> botão. Agora ela é só cabeçalho + `<CreativesGallery/>`, o mesmo componente
> da aba. De quebra a rota deixou de tratar todo criativo como 1080x1080 (lia
> `generation.template`, minúsculo, enquanto a API devolve `Template`).
> Continua separada a galeria GLOBAL `/criativos`, que é cross-projeto.
>
> **STATUS 10/08/2026: item 4 (crivo por projeto) IMPLEMENTADO.** Coluna
> própria `BrandDNA.approvalChecklist` — e não texto dentro de `contentRules`,
> que vai VERBATIM para o prompt de imagem. Editável na aba Marca, exibido pela
> bancada antes de agendar (só no "Agendar", não no rascunho), sem veredito
> automático porque a polaridade das perguntas é mista nos DNAs reais.
> `scripts/importar-crivo-clientes.ts` extrai dos `DNA.md` de
> `~/Documents/Clientes` (dry-run; 7 a 35 perguntas por cliente nos 9).
>
> Fase 2 completa.

1. **UI multi-seleção**: no modal de geração/melhoria, o seletor de Drive e da
   galeria passam a multi-select; cada imagem escolhida ganha um chip de papel
   (Prato / Ambiente / Estilo). O catálogo semântico (`acervo.ts`) ganha
   superfície na UI (busca por tema, rotação "menos usada primeiro").
2. **Anchor sheet por projeto**: marcar fotos do acervo como âncoras
   canônicas por tipo de cena (mesa, salão, balcão, prato X). Modelagem
   sugerida: tabela `ProjectAnchorImage { projectId, blobUrl, driveFileId?,
   sceneTag, note }` — o gerador injeta automaticamente a âncora de ambiente
   quando a cena é gerada e o usuário não escolheu uma.
3. **Enriquecer o BrandDNA**: importar dos DNA.md de `Clientes/` o destilado
   por seção (visualStyle ← §3 + 3.3.1; photoDirection ← §3.8 com setups de
   luz, enquadramentos, louça/uniforme, anti-fotografia; contentRules ←
   regras duras + vetos). Script one-shot de importação assistida +
   conferência manual. As seções continuam TEXT — o que muda é a densidade.
4. **Crivo por projeto**: campo novo no DNA (ou seção em contentRules) com as
   perguntas binárias de aprovação — vira checklist exibido no card antes de
   agendar.

### Fase 3 — Bancada de Stories (UI) · ~1 semana

> **STATUS 09/08/2026: IMPLEMENTADA.** `/projects/[id]/bancada` — compositor
> (acervo com papéis + copy + horário) → fila de cards com a ação de cada
> estado. Rotas novas `/slots` (expõe `sugerirPosts`, o motor de cadência que
> só o MCP consumia) e `/agendar` (expõe `agendarPost`, a mesma função da tool
> `colocar-na-agenda`). Store em `src/stores/bancada-store.ts` (rascunho em
> localStorage; a verdade passa ao banco no "Gerar") e `use-bancada.ts`.
>
> Ciclo validado ponta a ponta no navegador com o By Rock: montar → fila →
> gerar (POST próprio por card, paralelo) → card vira "pronta" sozinho por
> polling → agendar → post rascunho criado na agenda. Dados do teste
> limpos do banco de dev.
>
> Armadilha medida: `sm:w-28` e `w-[7rem]` NÃO geram CSS neste repo
> (`w-28`/`h-36` geram) — a miniatura do card virava largura total.

Rota `/projects/[id]/bancada`: compositor (foto multi-fonte + copy em blocos +
instrução opt-in + dica de copy via `quick-generate` adaptado + slot de
cadência via `sugerir-posts` exposto em rota HTTP) + fila de cards
(gerar → ajustar → agendar → excluir) sobre a improve-queue existente.
Ajuste classificado: pontual (edit da própria peça) vs estrutural (regenera).
A fila client-side hoje processa **um job por vez** (`use-improve-queue-processor`
pega o primeiro `pending`) — subir para concorrência 3–5: o servidor já é
fire-and-forget (`after()` + polling), o serial é só escolha do cliente.

### Fase 4 — QA pós-render + loop DNA vivo · ~3 dias

> **STATUS 09/08/2026: PARCIAL.** A verificação de texto por visão já roda em
> toda arte com copy (herdada do improve), e a prévia em tamanho grande antes
> de agendar entrou junto com a bancada. **Faltam**: o QA de legibilidade e
> corte por visão, o checklist de reprovação de prato, e o botão "virar regra"
> que grava a correção aprovada no BrandDNA.
>
> **STATUS 10/08/2026: itens 1 e 3 IMPLEMENTADOS.**
> `src/lib/ai/creative-qa.ts` — assert de proporção (tolerância de 2%; fora
> dela REGERA em vez de deixar o `resize(fit:'cover')` cortar em silêncio) e
> inspeção por visão de legibilidade e texto cortado na borda, dentro do laço
> de tentativas do runner (≤2). Reprova na última tentativa → entrega com a
> ressalva gravada em `fieldValues`. `virarRegra()` em `brand-context.ts` +
> tool MCP `virar-regra`: acrescenta ao fim da seção com data e motivo, e só
> grava com `confirmado`.
>
> **Item 2 não foi feito**: o checklist de reprovação de prato exige comparar a
> arte com a foto de ENTRADA (outra chamada de visão, outro critério), e o
> crivo por projeto da Fase 2.4 já cobre a conferência humana. Registrado como
> próximo passo, não como pendência esquecida.

1. QA por visão além do texto: legibilidade, texto cortado, proporção
   (assert de aspect ratio — nunca resize de proporção errada), retry ≤2.
2. Checklist de reprovação de prato (forma mudou, logo inventado, reflexo
   contradiz luz, cara de render 3D).
3. Botão **"virar regra"**: correção aprovada numa conversa/ajuste grava
   proposta de atualização no BrandDNA (via `updateBrandDNA`), com data e
   motivo — o mecanismo que fez o DNA do Espeto ir de 1.0 a 2.6 em dois dias.

### Fase 5 — Carrossel · ~1,5 semana

> **STATUS 09/08/2026: modo IA IMPLEMENTADO**, na tela e no chat.
> `carouselGroupId` + `slideOrder` na Generation (migration
> `20260810020000`), capa recusa copy, `series-guide` + LOOK SPINE de 8 itens
> + typography lock, e o guia é DECODIFICADO POR VISÃO
> (`carousel-guide-decoder.ts`) para "copie o estilo" virar lista de decisões
> explícitas — sem isso o destaque de cor variava entre slides. Etapa de
> confirmação preservada nas duas superfícies. Tools MCP `criar-carrossel`,
> `confirmar-estilo-carrossel` e `ver-carrossel`.
>
> **Modo fotos NÃO foi feito** — e talvez não precise: o PostComposer já
> aceita 2–10 mídias e o Zernio publica. O que faltaria é o center-crop 4:5
> automático e o fluxo nomeado. Reavaliar quando alguém sentir falta.
>
> Sobra visível: o elemento gráfico (a onda sonora aparece no guia e não nos
> irmãos). Provavelmente exige citá-lo na instrução, não só na descrição.

1. **Modo fotos** (rápido): fluxo nomeado sobre o PostComposer CAROUSEL —
   2–10 fotos, center-crop 4:5 automático com EXIF, slides "arte" opcionais
   (motor da Fase 1), legenda obrigatória.
2. **Modo IA**: capa pura (prompt anti-texto dedicado) + slide-guia →
   confirmar estilo → demais slides em paralelo com o guia como referência +
   LOOK SPINE + **TYPOGRAPHY LOCK** (descrição travada das 2 fontes do
   projeto + tabela de tamanhos exatos, copiada verbatim em todo prompt).
   Modelagem: `carouselGroupId` + `slideOrder` na Generation. Logo composto
   depois via sharp (área reservada no prompt), nunca desenhado pelo modelo.
   Cada slide = uma Generation no padrão `after()` + polling (sem Redis).

### Fase 6 — Paralelo e desligamento · contínuo

> **STATUS 10/08/2026: preparação FEITA, desligamento NÃO executado (é decisão
> do Ciro).** Inventário completo na tabela §1 de
> `docs/SESSAO-2026-08-10-FASES-4-A-6.md`; passo a passo em
> `docs/DESLIGAMENTO-CLAUDINHO.md`.
>
> - `brand-manual.png`: os 10 existem lá e nenhum estava aqui. Coluna
>   `Project.brandManualUrl` criada, o brand card passou a preferi-la, e
>   `scripts/importar-brand-manuais.ts` sobe os arquivos (dry-run).
> - Logos preferidas: 6 dos 10 divergiam e foram **alinhadas pelo Ciro em
>   10/08** (`scripts/definir-logo-do-projeto.ts`). A decisão expôs dois
>   defeitos no `logo-compositor`: a escolha de canto NUNCA funcionou
>   (`extract().stats()` do sharp ignora o recorte, então os quatro cantos
>   mediam igual) e, com metade das logos agora em branco puro, calma sem
>   contraste colocaria a marca num canto que a engole. Os dois corrigidos.
> - Escala tipográfica: só o TERO tem. Cabe como âncora de papel `style`; um
>   arquivo não justifica mecanismo novo.
> - Regras de prompt do `gpt-image.js` sem equivalente aqui: portadas
>   (anti-órfã, teto de largura por palavra, não-relumiar com a ressalva do
>   DNA, extensão de borda, escopo da lista negativa, paleta em hex,
>   typography lock em peça avulsa). Duas ficaram de fora com motivo escrito.
> - **Ainda falta o paralelo de 1–2 semanas** comparando qualidade por cliente.

Rodar bancada nova vs Claudinho/skills por 1–2 semanas comparando qualidade
por cliente (TERO e Wine Vix como teste de aderência). Migrar o que só existe
fora: brand-manual.png, logos preferidas, âncoras. Desligar o insta-automatico
quando a fila esvaziar (o agendamento dele já aponta pro Studio).

## 5. Riscos e decisões abertas

- **Qualidade é fruto de micro-regras acumuladas** (uniforme, toalha, filtro
  de conteúdo, "plain black back"). O plano preserva isso em três lugares:
  prompt-builder (regras de comida), anchor sheet (âncora por cena) e DNA
  (regras por cliente). Reservar tempo de teste visual real por marca.
- **Custo**: gpt-image-2 high ≈ $0,04–0,10/img; carrossel IA de 8 = ~9
  gerações. Iterar em resolução menor, finalizar em alta (padrão das skills).
- **Sem fila/Redis na Vercel**: retry vive no runner (padrão do improve).
- **Gate editorial** (palavras proibidas/anti-slop do insta-automatico): fora
  do escopo inicial; o crivo por projeto (Fase 2.4) cobre parte como checklist.
- **Higgsfield**: não entra no Studio — as técnicas portam, o transporte não.
  O Studio usa OpenAI + Gemini por API própria.
