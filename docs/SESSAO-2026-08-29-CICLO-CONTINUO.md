# Sessão 2026-08-29 (noite) — Ciclo contínuo: relatório semanal + sinal de legenda

As duas primeiras implementações do estudo "Ciclo Contínuo Lagosta"
(propostas 1 e 2, aprovadas pelo Ciro no mesmo dia). Commits `d3d6295b` e
`cb50efdc`.

## 1. Sinal de LEGENDA (`d3d6295b`)

**O vão**: `registrarCopyDoPost` captura os textos DA ARTE via `slotValues`,
mas o post do fluxo de canvas — carrossel de fotos + caption, o padrão da
carteira desde 29/08 — nasce SEM `slotValues` e a captura encerrava cedo. O
caminho que mais cresce era o único que não ensinava nada.

- Tipo novo **`legenda`** no vocabulário. Não cabe em `copy` de propósito: lá
  o shape são slots chaveados da arte com diff contra a dica; misturar faria
  os consumidores (perfil, mineração) contar caption como texto de arte.
- `src/lib/aprendizado/sinal-de-legenda.ts`: `registrarLegendaDoPost` no
  agendamento (escolha absoluta, chave `legenda:post:<id>`) e
  `registrarEdicaoDeLegenda`, que REVISA a mesma linha — molde do
  `feedback-de-arte`, porque o núcleo (`registrarDecisaoSemSugestao`) faz
  upsert com `update: {}` de propósito.
- 🔴 **O desfecho da linha editada segue `escolha-propria`**:
  `exigeSugestao('editada')` é verdadeiro e a linha NÃO tem sugestão do outro
  lado. A evidência da edição mora em `diff` + `escolhido.editada` +
  `revisoes`. Usar `editada` ali seria recusado pelo próprio vocabulário.
- **`legendaOriginal` preserva a PRIMEIRA proposta** através de N revisões —
  mesmo princípio do balde do editor: o lado "antes" mais valioso é o texto
  que a produção escreveu.
- Três ganchos: `agendarPost` (nascimento), `editarPost` do chat
  (agenda-acoes) e o PUT da agenda web — neste último o User é buscado só
  para LEITURA (criar ali é como nascem os Users fantasma).
- Trim igual = no-op (mover post de horário não é editar legenda). Teto de
  3.000 chars no Json.

## 2. Relatório semanal da carteira (`cb50efdc`)

Cron **`/api/cron/relatorio-semanal`**, toda segunda 08:00 BRT (`0 11 * * 1`).
Serviço em `src/lib/relatorios/semanal.ts`.

- Por cliente: alcance/engajamento medianos da semana vs as **8 anteriores**
  (`InstagramFeed`), melhor/pior post, aderência à cadência padrão (21
  stories + 3 feeds), dias sem publicação, e o resumo dos sinais de
  aprendizado emitidos na janela.
- **Grava em `InstagramWeeklyReport`** — a tabela da era dos webhooks
  externos, vazia desde sempre, reaproveitada SEM migration (upsert por
  `projectId_weekStart`).
- **UM resumo da carteira no WhatsApp**, nunca uma mensagem por cliente
  (regra da casa desde os avisos de falha). Evolution não configurada =
  grava e loga, nunca quebra.
- Semana em BRT: seg 00:00 BRT = 03:00Z (sem horário de verão desde 2019).
  Cliente sem token sai como "sem métricas", nunca com número falso; sem
  atividade na janela E na base, fica fora (é o que exclui o Ciro Trigo).
- **Honestidade da medição**: colhido na segunda de manhã, o fim de semana
  ainda acumula alcance — `metricsJson.colhidoEm` registra o instante, e a
  mensagem avisa. Comparar sempre com a mesma defasagem.
- Validado contra produção (semana 17–23/08, WhatsApp desligado): 10
  clientes, 10 linhas. A primeira rodada já apontou o que importava — Seu
  Quinto ▼52% e Empório ▼53% de alcance vs base, Wine Vix ▲42%, Lagosta
  Criativa parada. As linhas ficaram como baseline.

## O que fica combinado

- Primeiro relatório automático: **segunda 31/08** (cobre 24–30/08, semana
  pré-cadência — vira baseline). O primeiro que mede a cadência nova é o de
  **07/09**.
- Propostas 3 e 4 do estudo (comando "atualizar peça" do canvas e script
  lapidação→PADRAO.md) ficam para a semana 2, com a dor real mapeada.
- Tokens de Real/Bacana/By Rock seguem sendo o pré-requisito da medição.
