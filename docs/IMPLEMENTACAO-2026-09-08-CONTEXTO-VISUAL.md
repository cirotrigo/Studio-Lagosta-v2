# Segunda entrega: contexto visual e fallbacks coerentes

Continuação do controle de tempo e auditoria do diretor. Implementado localmente, sem deploy e sem alterar cadastros.

## Comportamento

O contexto da geração passa por um resolvedor puro que cria uma cópia da marca. Descrições estéticas claramente voltadas a tratamento da fotografia saem da prosa enviada ao diretor. O campo histórico `tratamentoDaFoto` do estilo observado não é enviado como instrução. O cadastro original permanece intacto.

Regras explícitas, copy, pedido, fatos e efeitos tipográficos são preservados. Frases com negação, números, hierarquia ou conteúdo misto permanecem e aparecem como `revisao` na auditoria. Isso é intencional: remover uma frase inteira sobre layout para eliminar a menção a gradiente apagaria uma decisão válida. O resolvedor não é um interpretador completo de linguagem natural e não elimina todos os conflitos de marca.

`fieldValues.diretor.identidade` registra versão, escopo, estado de ativação, origem e trechos suprimidos ou mantidos para revisão. `ARTE_CONTEXTO_VISUAL=off` restaura o contexto anterior. Esse flag não reintroduz os defeitos corrigidos nos fallbacks.

O fallback do manual deixou de prescrever degradê para legibilidade. Usa posição e cor do texto. Quando a referência foi vista apenas pelo diretor e o gerador recebeu foto + manual, o fallback agora descreve o manual, não uma suposta arte aprovada. `fallbackPorta` registra esse caminho efetivo sem perder o valor da porta escolhida originalmente.

O compositor e o prompt da melhoria não passam pelo resolvedor. Efeitos aprovados nas páginas do editor permanecem como estavam. O formatador compartilhado apenas deixa de imprimir a linha de foto quando o campo está vazio.

## Inventário real

O script `scripts/inventariar-contexto-das-artes.ts` executa somente consultas. Foi rodado contra o banco configurado no arquivo de ambiente operacional, lendo 11 projetos. Não verifica se URLs de ativos respondem, nem quais flags estão implantados. O relatório detalhado ficou local em `/tmp/lagosta-contexto-visual-2026-09-08.json`.

Na simulação do contexto resolvido:

| Cliente piloto | Trechos/campos suprimidos do contexto | Menções preservadas para revisão |
|---|---:|---:|
| Real Gelateria | 3 | 4 |
| TERO | 2 | 3 |
| By Rock | 3 | 2 |
| Wine Vix | 2 | 3 |

As menções para revisão não são contagem de erros: incluem proibições válidas e frases ambíguas. O inventário revelou que “gradiente de leitura” na Real também nomeia hierarquia tipográfica; esse caso foi protegido com teste. Nenhuma remoção foi gravada no banco.

## Validação

262 testes aprovados em 27 arquivos, incluindo 18 testes novos. TypeScript sem erros; lint sem erros e com cinco avisos em arquivos não alterados; diff sem problemas de whitespace. Testes cobrem conservação da marca original, fatos, copy, efeitos de letras, casos reais mistos, rollback e escolha do fallback.

Sem ensaio pago ou julgamento visual de novas gerações. Ganho de aprovação e redução de recusas em produção ainda precisam ser medidos após implantação controlada.

## Próximos itens do plano

Persistência dos candidatos brutos e derivados, métricas agregadas, contrato completo da peça e aplicação das correções editáveis continuam pendentes. A resolução de identidade desta entrega é deliberadamente restrita ao conflito de tratamento fotográfico; conflitos entre fontes, paletas e regras explícitas continuam sujeitos à revisão de marca.
