# Piloto real de composição e concorrência — 09/09/2026

**Resultado: ganho de diagnóstico confirmado; melhora estética e ganho de velocidade não demonstrados.** A seleção impediu duas combinações problemáticas, mas a única arte aceita ficou mais escura e levou mais tempo. Não ampliar para a carteira nem ativar automaticamente a seleção semanal com base neste piloto.

[Galeria antes/depois, lado a lado a 360 px](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/galeria.html) · [Métricas registradas](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/docs/piloto-compositor-2026-09-09/metricas.json) · [Diagnósticos completos](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/resultados-render.json).

Comparações em PNG para apresentar lado a lado: [TERO](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/3-comparacao.png), [Quintal](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/2-comparacao.png), [Real](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/1-comparacao.png).

## Insumos e fidelidade

Casos fixos: TERO, O Quintal Parrilla e Real Gelateria. Specs, textos e driveFileIds são os do ensaio original. Páginas completas, números, logos/fontes e Generation histórica foram capturados em **transação PostgreSQL READ ONLY**; ativos foram baixados por leitura. Não há credenciais no fixture nem nos arquivos versionados. Todas as páginas capturadas têm updatedAt anterior às gerações do ensaio.

Uma primeira passagem usou o arquivo original do Drive. A revisão do resolver mostrou que o ensaio usava a cópia de 1920 px registrada em `Generation.fieldValues.imageUrl`. Corrigi o **harness**, congelei essa cópia para as duas condições e repeti o piloto. Não alterei critérios, copy, halo, assinaturas ou código de produção para fazer o resultado passar. Os primeiros resultados, inclusive o resultado negativo, permanecem em `.tmp-medicao-compositor/primeira-passagem-originais/`.

Com os rasters corretos, **3/3 baselines locais reproduziram pixel a pixel os PNGs históricos**: dimensões e todos os canais iguais. Isso confirma concretamente a reprodução deste ensaio, além da conferência de ids/datas. [Conferência histórica](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/comparacao-historica.json).

Baseline: `compor.ts` e `assinatura.ts` de `7dfbde33`, usando os módulos auxiliares comuns do checkout. Atual: implementação integrada `0b94bd34`. Em ambas, mesma foto explícita e preferências originais. Atual habilita `fotosCandidatas` com **somente a mesma foto**, permitindo comparar variantes sem substituir uma escolha explícita. Não foi testada aqui uma curadoria com três fotos diferentes.

## Tempo medido

Preparação inicial: **27,97 s**, incluindo **6,03 s** de consultas de leitura. Downloads/preparação por cliente: Quintal 7,22 s; Real 8,15 s; TERO 6,56 s. A recuperação adicional dos três rasters históricos levou **2,76 s**, separada da composição. A primeira captura também conserva os originais para inspecionar a integridade fotográfica.

Comparação final: três execuções por condição/caso, ordem anterior→atual, atual→anterior, anterior→atual no mesmo processo. A primeira execução de uma condição não é um cold start isolado: imports e ativos já estão disponíveis. Medianas abaixo incluem montagem, registro local de fontes, medição, régua e PNG final quando há sucesso; excluem leitura remota, persistência e fila.

| Caso | Baseline: mediana | Atual: mediana | Desfecho atual |
|---|---:|---:|---|
| Quintal | 0,889 s | 0,0004 s | Recusa pelo metadado Brahma antes de renderizar |
| Real | 1,070 s | 4,016 s | Preview; quatro variantes avaliadas e composição final |
| TERO | 1,074 s | 0,697 s | Recusa de contraste após avaliar a variante disponível |

A recusa rápida **não é uma arte produzida mais rápido**. Na Real, o custo local foi aproximadamente **3,75×** o baseline. Não há ganho de produtividade demonstrado, p95 confiável, tempo de espera da fila ou estimativa válida para Vercel/21 peças. Os tempos históricos MCP incluem rede/armazenamento e não são comparáveis diretamente a estes tempos locais.

As 18 chamadas de comparação produziram 9 previews baseline, 3 atuais da Real e 6 recusas. Acrescentei duas imagens diagnósticas fora do benchmark para inspecionar as combinações recusadas; elas são idênticas ao baseline e não representam um resultado aceito. Todos os PNGs repetidos de cada condição bem-sucedida tiveram o mesmo hash. **12/12 previews bem-sucedidos conservaram a copy literal por papel**, com a headline/segunda voz reunidas e whitespace normalizado; uppercase continua sendo efeito da assinatura. Isso verifica camadas, não OCR nem aprovação estética.

## Inspeção visual, integral e a 360 px

| Caso | Antes | Atual / diagnóstico |
|---|---|---|
| Quintal | [PNG anterior](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/2-anterior-0.png) | [PNG da combinação recusada](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/2-atual-recusada.png) |
| Real | [PNG anterior](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/1-anterior-0.png) | [PNG atual](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/1-atual-0.png) |
| TERO | [PNG anterior](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/3-anterior-0.png) | [PNG da combinação recusada](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/3-atual-recusada.png) |

**Quintal:** duas vozes preservadas, título forte; apoio muito fino, e serviço/logo pequenos em celular. A marca Brahma é visível nos guarda-sóis, coerente com a análise do catálogo; a recusa não exigiu visão nova. A forte curvatura de fachada/mesas já existe na foto original 2250×4000 (9:16), portanto não é deformação introduzida pelo compositor. CTA não estava na spec; não é texto ausente. Não corrigi nem substituí a foto explícita.

**TERO:** título âmbar atravessa um teto claro/texturizado, com pouca separação em celular. A régua reprova a manchete (p98 131 contra alvo 78). CTA “RESERVE SUA MESA” está presente, porém pequeno; serviço preservado e legível sobre o rodapé escuro; logo presente, com subtítulo minúsculo. A única variante story disponível não resolveu a foto. Recusar é diagnóstico útil, não melhoria da imagem. A caixa estimada de assunto (aviso de 100%) não foi tomada como segmentação de pessoas/pratos nem usada como prova de oclusão.

**Real — resultado negativo preservado:** a seleção trocou a variante histórica `cmtm64ckl000bl2044uij1amu` por `cmtlonjfs0001jv047xrji2nr`. Moveu o apoio “Praia do Canto e Shopping Vitória” do topo para o rodapé, manteve a logo à direita e acrescentou escurecimento mais amplo em cima e embaixo. O apoio continua fino/pequeno a 360 px. Todos os textos estão presentes; não havia CTA ou horário na spec. A régua passou, mas **não há melhora estética demonstrada**; o escurecimento adicional é uma piora visual potencial diante da fotografia clara. A identidade foi executada com fundos já aprovados da variante, sem modificar suas configurações. O critério de escolha, e não o halo aprovado, precisa ser revisto antes de ampliar.

Os recortes preservam as cenas e ativos originais; nenhum produto, pessoa, logo ou texto foi regenerado. Não se afirma igualdade dos pixels de foto sob overlays. Não houve comparação paga com IA, julgamento cego de usuários nem aprovação do cliente.

## Adoção e critério que falta

Manter a escolha conjunta **em piloto explícito/observação**, apresentando baseline e candidata para revisão. Não recomendar sua promoção automática como “mais bonita” ou “mais rápida”. A conexão semanal atual ativa a seleção quando o item contém candidatas; antes de qualquer implantação ampla, essa ativação precisa de controle explícito por piloto/cliente, sem presumir que candidatas no card equivalem à autorização para mudar o layout.

O score mede calma, encaixe e contraste, mas não compara o custo visual de escurecer a foto nem a adequação relativa da posição do apoio/logo ao baseline. Na Real, variantes empatadas no score levam a uma escolha pela ordem, sem evidência de preferência estética. Falta um critério validado por marca que considere intervenção tonal, hierarquia em celular, relação entre foto/texto e preferência humana pareada. Não ajustar pesos só para esta amostra passar. Preservar recusas e obter revisão do cliente antes de calibrar.

## PostgreSQL real: concorrência e rollback

**Cinco cenários passaram em PostgreSQL 15.13 local**, porta 55439 apenas no loopback; instância agora **desligada**. Docker estava indisponível, então usei o PostgreSQL Homebrew. O harness sobrescreve DATABASE_URL/DIRECT_URL com a conexão local fixa e verifica `data_directory` antes de escrever. Não lê credenciais de produção.

1. Oito enfileiramentos simultâneos do mesmo item/revisão resultaram em uma Generation e um job, observados no banco real.
2. Reenvio depois de resposta perdida e depois de marcar o resultado concluído reutilizou o mesmo job, mesmo com a spec final resolvida.
3. Um trigger PostgreSQL injetou falha na inserção do job, depois da inserção da Generation. Ambas foram desfeitas; o item permaneceu sem vínculo; removido o trigger, a retomada funcionou.
4. Conteúdo revisado em estado executável criou outra geração.
5. Uma transação de edição segurou o lock do item; o callback chegou a aguardar lock (observado em `pg_stat_activity`). Depois do commit da edição, o compare-and-set não sobrescreveu o estado revisado.

[Resultados PostgreSQL](/Users/cirotrigo/.codex/worktrees/aedf/Studio-Lagosta-v2/.tmp-medicao-compositor/resultados-postgres.json).

São testes reais de banco das funções de enfileiramento/callback; o cenário de conclusão marca a Generation sinteticamente e não testa um render dentro da fila. Não provam exatamente uma página em toda interrupção de render, leases de múltiplos workers ou todos os escritores/reconciliadores. O schema descartável substituiu apenas os dois campos pgvector fora do escopo por Bytes, pois essa instalação não tem pgvector; tabelas/índices/relações de plano/Generation/job são os do Prisma. Não houve migração em produção.

## Reprodução e validação

Da raiz deste worktree:

```bash
node scripts/piloto-compositor/preparar-baseline.mjs
./node_modules/.bin/tsx scripts/piloto-compositor/coletar.ts /Users/cirotrigo/Documents/Studio-Lagosta-v2
./node_modules/.bin/vitest run --config scripts/piloto-compositor/vitest.config.ts scripts/piloto-compositor/render.test.ts
node scripts/piloto-compositor/conferir-historico.mjs
node scripts/piloto-compositor/resumir.mjs
# Em worktree limpo, sem cluster anterior do piloto:
bash scripts/piloto-compositor/postgres-local.sh
./node_modules/.bin/vitest run src/lib/compositor/__tests__ src/lib/planos/__tests__ src/lib/creatives/__tests__/ranquear-acervo.test.ts
npm run typecheck
npm run lint
```

402 testes de regressão passaram; o harness offline com ativos reais passou (o que inclui registrar recusas, não aceitar todas as artes); cinco cenários PostgreSQL reais passaram. Typecheck e lint aprovados, com avisos preexistentes. Os adaptadores de render bloqueiam persistência/uso de fotos/pastas e substituem DB/Drive pela captura, mas usam fontes, medição, régua e renderer reais. O resolver de produção pode gravar cache de foto no Blob; ele não foi chamado no piloto. PNGs, fontes, capturas e banco temporário ficam fora do Git; métricas e harness ficam versionados.

Nenhuma geração paga, upload de prova, alteração de DNA/assinatura, página em produção, publicação, agendamento, merge, deploy ou alteração no checkout compartilhado. O piloto permaneceu nos três casos definidos.
