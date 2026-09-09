# Primeira entrega: retomada da composição semanal

A proposta semanal já distribui cadência/pilares, escolhe fotos sem repetição e persiste itens com candidatas. `executar-plano` já filtra estados, aceita subconjunto de ids, apresenta a conta e separa falhas por item. `compor-leva` já utiliza jobs duráveis. Esta entrega mantém esses caminhos e não impõe 21 itens a toda marca.

## Comportamento implementado

- No `executar-plano`, a consulta `paginasDeAssinatura` é compartilhada pelos itens de composição da mesma chamada. Outra chamada faz nova consulta; não há TTL, cache global ou persistência de regras. Não muda a leitura de fatos, validade, unidade, campanha, serviço ou decisões de foto/copy. O runner continua lendo a assinatura ao compor.
- Composição com `itemDePlanoId`: bloqueio de linha PostgreSQL por item e uma transação gravam Generation, GenerationJob e vínculo/status do item. Uma interrupção antes do commit desfaz os três; depois do commit, o reenvio encontra o mesmo job.
- A revisão compara spec normalizada e conteúdo do item (copy, fotos, data, formato, tema, legenda, via, modelo, direção, referências, ajuste, cliente, escopo e campanha). A chave fica no payload durável do job, que não é substituído ao salvar a arte.
- Mesma revisão em processamento ou concluída com URL reutiliza a geração vinculada. Falha terminal permite nova tentativa. Revisão diferente exige estado executável; pronto/agendado/reprovado/em voo não inicia outra composição.
- O executor transmite `updatedAt` para recusar uma preparação que perdeu uma edição concorrente. Falhas só marcam erro se o snapshot ainda for atual. O callback de conclusão/falha confere o vínculo da geração e estado em voo antes de movimentar o item.
- Aprovação editorial continua distinta de geração e agendamento. Reenvio não aprova nem publica.

## Operação

1. Ler o plano e revisar os itens, mantendo fotos/copy e condições obrigatórias.
2. Executar pelo gate existente; em interrupção, ler novamente e chamar `executar-plano` com `confirmar: true`, opcionalmente restringindo `itemIds` às exceções.
3. Itens prontos/em voo ficam fora da nova execução; falhas mantêm seus próprios ids e podem ser retomadas. Revisar a arte no editor e aprovar pelo fluxo existente.

## Escopo e limites

A garantia transacional é do **enfileiramento de composição ligado a item de plano**. Peças avulsas, IA e render síncrono de modelo/bancada conservam os contratos anteriores. Não há chave externa nova para uma leva sem plano. Jobs legados sem revisão persistida não recebem retrospectivamente essa garantia. Não há migração de banco.

O lock serializa o enfileiramento por item; não é um lock global de edição ou de render. O callback verifica o vínculo antes das transições existentes, mas não torna todas as edições/reconciliações do sistema transacionais. Uma próxima etapa deve unificar compare-and-set nesses escritores. Interrupção durante o render/persistência continua sob a recuperação existente da fila; este incremento não promete exatamente uma gravação de página em todos os pontos de falha do renderer.

A revisão não certifica validade factual nem estética. Alteração externa de DNA/assinatura/fatos não invalida automaticamente uma arte pronta. Revalidar campanhas/serviço antes de aprovar; a precondição temporal cobre edição do item pelo executor, não um snapshot externo de regras. Não se alteraram o catálogo v3, ranking, análise visual, mapa de calma, seleção de assinatura ou `compor`.

## Grade de revisão: próxima entrega

`bancada-fila.tsx` já tem cards, miniaturas, estados, progresso e ações de geração/edição/agendamento. Evoluir essa superfície, sem criar outra fila:

- visão semanal com todas as peças e filtro de exceções, respeitando a cadência;
- apresentar geração/página e revisão corrente, diagnóstico técnico separado da aprovação humana;
- destacar fatos/validade/unidade e serviço obrigatório em cada card;
- ação de retomada somente das falhas e identificação de resultado reaproveitado;
- histórico de revisões e proteção atômica dos callbacks/reconciliação contra edições concorrentes.

## Validação local

Testes de planos e fila: 243 testes passaram, incluindo resposta perdida, resultado pronto reaproveitado, interrupção antes do job com rollback, falha parcial e continuidade de outro item aprovado, alteração concorrente, mudança de campanha e conclusão atrasada. Banco e compositor são simulados; o teste de rollback exercita o contrato do adaptador falso, não substitui um ensaio PostgreSQL concorrente real.

`npm run typecheck` e `npm run lint` executados; lint possui avisos preexistentes de alt text e diretivas eslint não utilizadas. Sem servidor, banco de produção, geração paga, publicação, merge ou deploy. Dependências e Prisma Client foram preparados somente neste worktree. O checkout original serviu apenas de fonte para relatório, galeria, evidências e plano de evolução.
