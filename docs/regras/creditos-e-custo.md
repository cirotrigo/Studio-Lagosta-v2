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

### Modo interno: o saldo não bloqueia nem é debitado (13/10/2026)

O Studio virou ferramenta INTERNA: quem decide se uma operação roda é a
**autorização** (acesso ao projeto), nunca o saldo. A chave é
`CREDITOS_APLICADOS` (`src/lib/credits/aplicados.ts`), env **só do servidor**,
lida a cada chamada. **Padrão: desligada** (qualquer valor que não seja `true`).

- **Desligada**: `validateCreditsForFeature` devolve na hora, sem banco e sem
  `getUserFromClerkId`. `deductCreditsForFeature` não cria nem debita saldo e
  nunca lança `InsufficientCreditsError`, mas **segue gravando** a
  `UsageHistory` (mesmo `creditsUsed` de `creditosADebitar`) ou a
  `OrganizationUsage`, e roda o `noMesmoCommit` na mesma transação — a marca
  `creditsDeducted` do vídeo continua saindo junto. O User é só LIDO
  (`findUnique`): sem User, sem registro, mas o gancho roda. O CreditBalance
  pessoal ainda é criado se faltar, porque a `UsageHistory` tem FK para ele.
  `refundCreditsForFeature` grava a linha negativa e não devolve ao saldo.
- **A interface** lê a flag por `/api/credits/settings` (`creditosAplicados`) —
  `NEXT_PUBLIC_` seria embutida no build, e o módulo vive ao lado do Prisma.
  `useCredits().canPerformOperation` decide por `podeExecutar`; as checagens
  diretas de saldo (painel de imagens, IA do Drive, remover fundo, chat)
  respeitam a mesma flag. Billing, planos e telas de admin ficaram como estavam.
- **Endurecimentos que valem com a flag ligada ou desligada**:
  - `sendToLater` cobra **depois** de gravar `laterPostId`/status. Antes, a
    cobrança ficava entre o `createPost` do Zernio e esse update, e qualquer
    erro marcava FAILED um post já publicado, sem `laterPostId` — o retry o
    reenviaria. Falha da cobrança agora vira `PostLog` SENT com
    `{ cobrancaFalhou: true, laterPostId }`, nunca falha do post. Falha antes do
    Zernio segue FAILED + `handlePublishFailure`.
  - O job de vídeo com `InsufficientCreditsError` conclui sem cobrar
    (`creditsDeducted: false`, que agora reflete a cobrança real) e a arte ganha
    `cobrancaAviso: 'saldo-insuficiente'` por merge no banco. `cobrarUmaVez`
    manteve o contrato.
  - `POST /api/video-processing/queue` confere o acesso ao projeto **antes** de
    `getUserFromClerkId` e da validação de créditos: sem acesso, o mesmo 404 com
    ou sem saldo, e nenhum User criado.
- **Religar a cobrança**: `CREDITOS_APLICADOS=true` no env do servidor (Vercel)
  e redeploy. O comportamento volta ao de antes, com os endurecimentos acima.
