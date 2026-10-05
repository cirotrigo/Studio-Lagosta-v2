# Créditos e custo

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Custo de imagem: a tabela existia e nunca era alcançada (12/08/2026)

`estimateUsdCost` (`src/lib/credits/cost-estimates.ts`) alimenta
`/api/admin/spending`. Medido em 12/08: das **68 linhas** `AI_IMAGE_GENERATION`
do histórico, **68 caíam no fallback** de $0,012/crédito. Nenhuma precisa.

- 🔴 **A causa era o `details`, não o preço.** A dedução do arte-ia gravava só
  `{generationId, track, model, formato, elapsedSeconds}` — sem `resolution`
  (trilha imagem) e sem `inputSize`/`quality` (trilha arte), nada casava chave.
  E como `ai_art_generation` e `ai_image_generation` mapeiam para o **mesmo**
  OperationType (`feature-config.ts:23,31`), o maior consumidor do sistema era
  exatamente o que o painel estimava no chute. Efeito: **o painel lia 4,7× a
  mais** (US$ 47,70 contra US$ 10,14 reais).
- **Os preços antigos não eram chute — eram do Replicate.** O que envelheceu foi
  a arquitetura: `gemini-image-client.ts` chama o SDK do Google direto. Eles
  ficaram preservados sob o prefixo `replicate.` e são usados quando
  `details.apiProvider === 'replicate'`, que hoje é só o fallback de
  `generate-image/route.ts`. **O provider muda o preço do MESMO modelo** — por
  isso ele entra na chave, e não numa nota de rodapé.
- **A trilha `arte` cai no ramo `AI_IMAGE_GENERATION`, não no
  `AI_CREATIVE_IMPROVEMENT`** (mesmo OperationType), e usa gpt-image, cobrado
  por tamanho e qualidade. O ramo passou a tratar `model.startsWith('gpt-image')`
  com a chave da melhoria.
- ⚠️ **As 68 linhas antigas continuam no fallback** — elas não têm os campos
  novos, e só rodada nova nasce precisa. O painel vai mostrar um degrau. Dá para
  backfillar a partir de `Generation.fieldValues` (que sempre teve `resolution`
  e `inputSize`); não foi feito.
- Preços oficiais do Google levantados em 12/08/2026: `nano-banana-pro` US$
  0,134 em 1K/2K e **US$ 0,24 em 4K**; `nano-banana-2` US$ 0,101; gpt-image-2
  high em 1088x1936 US$ 0,165. Em créditos: 10 / 15 / 30 na trilha imagem e 25
  na arte. A tool `gerar-imagem` devolve `creditosCobrados` e declara o preço —
  sem isso, quem escolhe modelo e resolução escolhe às cegas, que foi como uma
  leva de 12 peças custou R$ 15,68 para entregar o mesmo arquivo de R$ 6,60.

### 🔴 `quantity` multiplica; preço de TABELA vai em `creditsTotal` (12/08/2026)

`deductCreditsForFeature`/`validateCreditsForFeature` calculam
`getFeatureCost(feature) * Math.max(1, quantity)`. Os três caminhos de imagem
passavam em `quantity` o retorno de `calculateCreditsForModel`, que já é um
valor **em créditos** — então ele era multiplicado pelo custo da feature
(`ai_image_generation` = 5). Cobrança real medida na `UsageHistory` antes do
conserto: **50** onde deveria ser 10, e **150** onde deveria ser 30 (12 linhas
a 150, 31 a 50). As doze peças do By Rock custaram 1.800 créditos.

- **`creditsTotal` é o caminho para preço de TABELA** (`creditosADebitar`, em
  `credits/deduct.ts`): quando presente, ele É o total e o custo da feature não
  entra na conta. Usado por `startArtGeneration`, `generateStoredAiImage` e
  `POST /api/ai/generate-image`.
- **`quantity` continua sendo multiplicador, e isso está CERTO** para feature de
  preço fixo — `POST /api/ai/image` passa `quantity = count` (3 imagens × 5 = 15)
  e não foi tocada. Não unifique os dois: são semânticas diferentes de propósito.
- **A trilha `arte` escapava por acidente** (passava `quantity: 1` e o custo de
  `ai_art_generation` já é 25). É o único ponto onde os dois modelos mentais
  coincidiam — e é por isso que ninguém tinha percebido.
- **Os estornos (`refundCreditsForFeature`) seguem só com multiplicador**, e
  isso basta hoje: nenhum dos três caminhos de imagem estorna. Caminho novo que
  cobre por `creditsTotal` **e** estorne precisa levar o total para o estorno,
  senão devolve 5× o cobrado.
- **Validação e dedução usam o MESMO helper**, então nunca divergem: quem passou
  na validação debita exatamente aquilo.
- ⚠️ **As 68 linhas antigas da `UsageHistory` ficam com o valor velho** — o
  conserto vale daqui para frente. Quem for ler série histórica de créditos
  precisa saber que há um degrau em 12/08/2026.

### O registro de uso só existe desde 30/07/2026

`UsageHistory` tem **87 linhas no total**, a mais antiga de 30/07/2026 — mas
`AIGeneratedImage` tem **788**, de out/2025 a ago/2026. O painel de gastos cobre
duas semanas, não dez meses.

- **O cron de limpeza não explica**: `cleanup-db` (semanal, `0 2 * * 0`) apaga
  `UsageHistory` com mais de **90 dias**, e maio/junho/julho estão DENTRO da
  janela. Na janela há **101 imagens e ZERO linhas com `aiImageId`**.
- **As 68 linhas de `AI_IMAGE_GENERATION` têm todas `generationId`** — são do
  arte-ia, que nasceu em 09/08. Nenhuma veio de `generateStoredAiImage` nem da
  rota `/api/ai/generate-image`, embora as duas chamem `deductCreditsForFeature`.
- **Nem todo criador de `AIGeneratedImage` cobra, e alguns não devem mesmo**:
  `POST /api/projects/[id]/ai-images` só REGISTRA uma URL pronta e
  `tools/generate-art` também não deduz. O que falta explicar é por que os dois
  caminhos que DEDUZEM não deixaram linha na janela de retenção — ficou em
  aberto.
