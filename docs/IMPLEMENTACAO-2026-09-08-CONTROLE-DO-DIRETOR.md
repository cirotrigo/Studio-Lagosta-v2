# Primeira entrega: orçamento e auditoria do diretor

Implementação inicial do plano de evolução de artes de 08/09/2026. Escopo: parte da telemetria e controle de tempo das fases 0 e 1; as demais fases continuam pendentes. Não representa a implantação de todo o plano.

## Problema e comportamento

Três rodadas do diretor podiam consumir até 225 segundos, além de downloads e leitura da foto, num runner com orçamento total de 290 segundos. A chamada de imagem ainda recebia um mínimo de 30 segundos mesmo quando esse tempo já não estava disponível. Falhas do diretor retornavam `null` sem um registro estruturado das tentativas.

Agora os dois runners reservam 120 segundos para geração e mantêm os 35 segundos existentes para finalização. O diretor recebe um deadline absoluto e limita cada chamada ao tempo restante. Com menos de cinco segundos disponíveis para outra rodada, usa o fallback existente. Essa reserva inicial é conservadora e precisa ser calibrada pela duração real das gerações; não é garantia de que toda imagem termine em 120 segundos.

As retentativas internas do SDK do diretor estão desativadas; o laço externo de até três rodadas governa tentativas e auditoria. Chamadores antigos, como scripts, continuam recebendo prompt ou `null`; sem controle explícito mantêm o teto por rodada.

Antes de cada chamada de imagem, inclusive a retentativa da melhoria após recusa do provedor, o runner recalcula o tempo restante. Com menos de 30 segundos antes da reserva de finalização, não inicia uma chamada paga. A falha usa o tratamento já existente do runner.

## Registro

`Generation.fieldValues.diretor` registra versão do controle, estado, causa de fallback e tentativas com duração, limite, resultado e motivos. Registra também modelo e hashes SHA-256 do system prompt, contexto e imagens na ordem recebida. Os hashes permitem detectar alterações; não substituem snapshots nem permitem reconstruir imagens ou contexto perdidos.

Erros arbitrários do provedor não são copiados para essa nova estrutura. Recusas do validador preservam seus motivos. Os registros existentes de prompt, copy, marca e QA permanecem compatíveis. Geração que não usa o diretor fica como `nao-executado`. O caminho de falha da geração agora preserva também as decisões do planejador, antes perdidas.

## Validação e limites

Testes novos cobrem orçamento esgotado, limite de rodada, fallback após recusa, falhas nos dois planejadores, aprovação após recusa, timeout, compatibilidade da copy e identificação do contexto. Provedores são simulados: nenhuma chamada paga.

Verificação concluída: 38 testes aprovados (11 novos e 27 existentes), `npm run typecheck` sem erros e `npm run lint` sem erros. O lint mantém cinco avisos em arquivos não alterados. `git diff --check` também passou. Não houve ensaio ponta a ponta com os provedores reais nem medição de latência em produção.

Esta entrega não altera identidade cadastrada, seleção de referências, parâmetros de qualidade, tratamento tonal, composição, publicação ou cobrança. Ainda não preserva imagens brutas, não executa o inventário de produção e não resolve as contradições do DNA. Esses itens seguem nas próximas entregas do plano. A versão não foi implantada em produção.

Próxima entrega: inventário somente de leitura e resolução da identidade efetiva por escopo, com casos reais das quatro marcas piloto, antes de modificar orientações visuais.
