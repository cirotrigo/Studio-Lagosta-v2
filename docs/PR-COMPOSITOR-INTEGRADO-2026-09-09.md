# Título

Corrige retomada semanal e preserva baseline com seleção e gradiente explícitos

# Descrição

Reenviar a composição do mesmo item semanal podia criar outra Generation, e candidatas no card passaram a trocar o layout sem uma escolha explícita. Esta integração torna item/Generation/job uma transação com retomada por revisão, protege o callback contra edição concorrente e exige `selecaoExperimental: true` para buscar combinações. Sem ganho relativo sustentado, mantém o baseline válido; recusas e alternativas são apresentadas para revisão, sem aprovação estética automática.

A copy semanal passa por mapeamento estrito: papéis ou condições excedentes geram erro em vez de desaparecer. Foto e variante explícitas são preservadas; variante ausente recebe diagnóstico específico. A caixa legada de assunto passa a considerar o crop real. São mudanças de contrato que também devem ser consideradas nas chamadas sem seleção experimental.

Inclui `preferencias.tratamentoDeTexto: "gradiente-suave-topo"`, baseado no preview aprovado da Real. O preset é compartilhado entre compositor e painel Gradientes do editor, cria uma layer editável, preserva o rodapé e participa do fluxo normal de dirty/undo/redo/persistência. Não ativa tratamento por cliente nem muda o default das outras marcas.

## Validação

- 428 testes de regressão acumulados antes da revisão final; 23 testes focais de avaliação/seleção passaram após a correção de diagnóstico, incluindo um novo.
- Typecheck e lint passaram; avisos preexistentes permanecem.
- Cinco cenários PostgreSQL locais anteriores: enqueue simultâneo, reenvio/conclusão, rollback, nova revisão e disputa real de callback. Não repetidos para o preset/mensagem, pois SQL/schema/CAS não mudaram nessas etapas.
- PNG integrado idêntico ao gradiente aprovado. Piloto diverso com 19 renders finais, copy preservada e recusas documentadas.
- Chromium com painel e Context reais: aplicar, dirty, undo/redo, editar opacidade e reaplicar sem duplicar. Leitura de cores substituída por fixture; sem autenticação/persistência externa.

## Escopo e limites

A seleção tem até seis avaliações e janela conferida entre chamadas; pode ser mais lenta que o baseline. Passar na régua não demonstra preferência estética, ausência de marca ou legibilidade em todas as telas. Os testes diversos conservaram falhas de contraste e uma recusa visual de marca não sinalizada pelo catálogo. O gradiente não deve ser imposto universalmente.

Não há migração ou variável de ambiente nova. A faixa inclui os commits de fila/ponte/seleção/pilotos anteriores ao preset; revisar o conjunto, não apenas a última mudança visual. A transação de enqueue e o CAS não demonstram exatamente uma página em toda interrupção do renderer. Jobs legados sem revisão gravada não recebem backfill automático.

Antes de produção, validar preview autenticado com uma cópia de página: aplicar/editar/salvar/recarregar/exportar, e conferir chamadas MCP com/sem preferências. Rollback do preset não altera automaticamente páginas já salvas; layers gradient continuam compatíveis com o renderer anterior.

Evidências e plano: [entrega do gradiente](GRADIENTE-SUAVE-REAL-2026-09-09.md), [revisão final](REVISAO-FINAL-INTEGRACAO-COMPOSITOR-2026-09-09.md) e relatórios em `docs/piloto-compositor-2026-09-09/`. Previews/fixtures brutos são locais e não estão no Git. Nenhum merge/deploy ou publicação de conteúdo executado nesta preparação.
