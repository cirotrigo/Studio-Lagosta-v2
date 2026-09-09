# Revisão conservadora do piloto — 09/09/2026

**O padrão voltou a conservar o baseline: candidatas no card não ativam seleção.** O opt-in explícito também conservou o baseline do Real; duas alternativas ficam disponíveis no diagnóstico, sem aprovação estética. Quintal e TERO continuam recusados pelo experimento. Há uma alternativa clara do Real para avaliação humana, mas não há melhora estética aprovada nem ganho de velocidade demonstrado.

[Galeria para revisão](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/revisao.html) · [Real: opções A/B em 360px](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/1-opcoes-revisao.png) · [Métricas e decisões](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/docs/piloto-compositor-2026-09-09/metricas-conservadoras.json).

## Ativação e compatibilidade

`selecaoExperimental: true` é o único acionamento da comparação. Ausência ou `false` conserva o caminho anterior; false é normalizado para ausência, sem criar revisão artificial na fila. `fotosCandidatas` continua sendo metadado compatível e não altera o layout por si só. Sem foto explícita e sem opt-in, permanece o comportamento anterior de composição sobre fundo liso.

O contrato existe na spec do compositor, `compor-peca`, itens de `compor-leva`, `executar-plano` MCP e no corpo HTTP de `/api/projects/[projectId]/executar-plano`. O fluxo semanal transmite a escolha explícita à spec durável de cada item. Nenhuma UI ativa o flag automaticamente. O opt-in vale para aquela execução, não é uma configuração persistida de cliente. Mudar o flag muda a revisão; repetir a mesma spec conserva a retomada existente. Jobs antigos sem flag passam a usar baseline, mesmo contendo candidatas.

Foto preenchida continua explícita e não é substituída. Variante explícita restringe a execução àquela variante, sem troca silenciosa. Copy, condições obrigatórias, papéis e preferências continuam preservados. A proteção contra papéis incompatíveis permanece: compatibilidade não significa voltar a omitir texto. O compositor não altera o halo definido na assinatura para obter aprovação.

## Comparação explicável

A primeira avaliação usa a mesma escolha automática do compositor anterior, com a primeira foto curada se não houver escolha explícita. A ordem de páginas não define mais o baseline. O teto continua em seis avaliações e janela de 30s conferida entre tentativas; não é timeout rígido de uma chamada em andamento.

A régua reaproveita os dois rasters reais com/sem fundos de texto, sem glifos. Em cinza a 180px, mede a diferença absoluta média e a parcela média de escurecimento, normalizadas por 255. Clareamento e escurecimento não se cancelam. Não há renders extras para a métrica, nem custo dessa medição no default.

Uma candidata só pode ter preferência técnica automática se houver ganho relativo mensurável sem regressão: mesma foto, recorte, canto da logo, papéis, cor dos textos e faixas verticais; fontes efetivas não menores em 360px; margem de contraste não pior; alteração tonal e escurecimento não maiores. Dados ausentes ou inválidos impedem dominância. Cor diferente exige revisão: margens de texto claro e escuro não são tratadas como equivalentes. As tolerâncias são de quantização (1/255 tonal, um nível de cinza no contraste, 0,01px de fonte), não pesos ajustados para esses clientes.

Empate, ganhos conflitantes ou ausência de dominância única conservam o baseline válido. Se o baseline não passar nos bloqueios e não houver escolha sustentada, o experimento recusa e devolve alternativas para revisão. Outra foto nunca recebe substituição automática neste piloto. Há no máximo duas alternativas no diagnóstico, ordenadas por menor alteração tonal e id para desempate; isso reduz a lista, não classifica beleza. Nem dominância técnica equivale a aprovação estética.

Limites: fonte em pixels é proxy relativo, não teste de leitura; a régua usa percentis/retângulos, não contraste em cada glifo nem certificação WCAG. A média tonal pode esconder mudanças locais e exclui efeitos da logo. Mesmo canto de logo não significa mesma posição/tamanho. Fontes, cor, peso, nitidez, tratamento de foto e composição completa ainda exigem inspeção humana.

## Comparação controlada

Reutilizei exclusivamente a captura congelada do piloto 073a612a: mesmas três specs, fotos históricas de 1920px, páginas, fontes e logos. Não houve nova consulta ao banco ou ao Drive. Baseline permanece `compor.ts`/`assinatura.ts` de `7dfbde33`, com auxiliares comuns. As duas condições alternaram ordem por rodada, três vezes por caso, no mesmo processo. Preparação remota, persistência e fila não integram os tempos.

**3/3 PNGs do default atual com candidatas são idênticos por hash aos baselines, já conferidos pixel a pixel contra os históricos no piloto anterior.** Também o Real com opt-in terminou com esse mesmo PNG baseline. Os 12 previews bem-sucedidos das rodadas conservaram copy literal por papel e hashes repetíveis. A alternativa visual adicional conserva a copy; foi renderizada fora do benchmark, assim como os dois diagnósticos recusados.

| Caso | Baseline agora | Opt-in agora | Opt-in 073a612a | Resultado agora |
|---|---:|---:|---:|---|
| Quintal | 0,885 s | 0,0004 s | 0,0004 s | Recusa por Brahma, antes do render |
| Real | 0,986 s | 3,833 s | 4,016 s | Baseline conservado; quatro variantes medidas |
| TERO | 0,997 s | 0,697 s | 0,697 s | Recusa de contraste |

São medianas de três rodadas. Variações de tempo entre ensaios não demonstram otimização; o Real custa cerca de 3,9× o baseline para terminar na mesma arte. Recusa rápida não é produção mais rápida. Não há p95, cold start, espera de fila, medição em Vercel nem extrapolação à carteira.

## Real: duas opções para aprovação estética

A: [baseline conservado em 1080px](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/1-anterior-0.png), variante `cmtm64ckl000bl2044uij1amu`.
B: [alternativa clara em 1080px](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/1-alternativa.png), variante existente `cmtm5hghk0003l204jkbooymg`.

| Medida relativa dos fundos de texto | A: baseline | Experimento negativo 073 | B: alternativa clara |
|---|---:|---:|---:|
| Alteração absoluta média / 255 | 8,11% | 11,23% | 6,51% |
| Escurecimento médio / 255 | 8,11% | 11,02% | 0,09% |
| Headline em 360px | 28px | 28px | 28px |
| Apoio em 360px | 11,33px | 11,33px | 13,33px |
| Faixa do apoio | Topo | Rodapé | Topo |

Essas porcentagens não representam área de foto escurecida nem opacidade do halo. As medidas da variante negativa foram calculadas novamente com o mesmo fixture, não estavam disponíveis no critério de 073.

B reduz escurecimento e amplia o apoio, mantendo cena/recorte e a copy no topo. Em compensação, cobre a parte superior com mancha clara esverdeada, troca texto creme por verde e muda o posicionamento/tamanho efetivo da logo dentro do canto inferior direito. A foto continua visível, mas com outra relação entre texto e ambiente. O apoio permanece fino; a assinatura pequena da logo segue difícil em celular. Essas diferenças impedem a troca automática e justificam a comparação A/B. Não há CTA/horário na entrada.

Uma primeira passagem deste desenvolvimento considerou B tecnicamente dominante; a inspeção evidenciou que a troca da cor tornava as margens de contraste não comparáveis. A regra geral de cor foi acrescentada com teste sintético e o ensaio repetido. O resultado intermediário permanece em `.tmp-medicao-compositor/comparacao-sem-trava-de-cor/`; o negativo 073 em `.tmp-medicao-compositor/piloto-073a612a/`. Não foram editados pesos, assinaturas, copy ou haloes para aprovar a amostra.

## Casos sem alternativa válida

[TERO: comparação diagnóstica](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/3-comparacao.png): a única variante não resolve o título âmbar no teto claro/texturizado. Margem de contraste da headline −51 níveis; CTA 10px e serviço 12px em 360px. O default mantém o baseline com seus avisos; o experimento recusa. Sem nova foto autorizada ou revisão de assinatura, não há opção válida para aprovar.

[Quintal: comparação diagnóstica](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/2-comparacao.png): Brahma continua visível nos guarda-sóis e bloqueia a foto antes de medir outras variantes. Não afrouxei a rejeição nem substituí a foto explícita. As duas vozes e serviço continuam no diagnóstico; a distorção panorâmica já pertence ao original. Sem alternativa válida com o insumo congelado.

## Validação e escopo

423 testes de regressão passaram em 16 arquivos, cobrindo opt-in/default, normalização, transmissão e revisão na fila, escolhas explícitas, baseline fora da primeira posição, empate, regressões tonais/tipográficas, mudança de cor/estrutura/foto, dados inválidos e recusas. O harness real offline passou com fontes, régua, medição e renderer reais. Typecheck e lint passaram; apenas avisos preexistentes de ESLint.

PostgreSQL não foi reexecutado: schema, enfileiramento transacional e callback CAS não foram alterados. Permanecem as evidências e limites dos cinco cenários reais do relatório anterior. Os novos testes da flag usam o harness simulado da fila e não são apresentados como novos testes de banco real.

Reprodução com o fixture já presente: executar `vitest` com `scripts/piloto-compositor/vitest.config.ts` e o arquivo `render.test.ts`, depois `node scripts/piloto-compositor/resumir.mjs` e `node scripts/piloto-compositor/revisao.mjs`. Não reexecutar a coleta ou PostgreSQL para repetir apenas a comparação visual.

Tudo permaneceu no worktree isolado. Nenhum deploy/merge, geração paga, publicação/agendamento, mudança de DNA/assinatura, gravação de arte em produção ou alteração do checkout compartilhado. A próxima decisão é estética sobre A/B do Real; TERO/Quintal precisam de outro insumo ou revisão de assinatura para continuar.
