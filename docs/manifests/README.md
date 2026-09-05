# Manifestos: o rollback de mudanças feitas em produção

Cada arquivo aqui é o registro do que uma operação **já alterou no banco de
produção** — e, por isso, o único caminho de volta. Não são artefatos de
trabalho: são dados operacionais.

| arquivo | o que desfaz | quem grava |
|---|---|---|
| `troca-fotos-2026-08-02*.json` | a troca das fotos das páginas órfãs da curadoria de julho | (operação manual de 02/08) |
| `lh3-fix-2026-08-01*.json`, `lh3-groups.json` | o reapontamento das 77 páginas com URL `lh3` expirada | `scripts/reparar-lh3-legado.ts` |
| `curadoria-modelos-2026-08-10*.json` | a despromoção dos 22 modelos | `scripts/inventario-uso-modelos.ts` |
| `dna-import/<cliente>.{json,md}` | a importação do DNA dos 9 clientes | `scripts/importar-dna-clientes.ts` |

O sufixo `-dryrun` é a simulação; sem sufixo é o que foi aplicado de verdade.

## Por que eles não moram em `scripts/.tmp-*`

Moravam, e isso quase custou caro. O prefixo `.tmp-` é a convenção da casa para
"apague no fim", então toda limpeza de entulho mira nele — e uma dessas
limpezas, em 05/09/2026, chegou a listar estes arquivos para exclusão junto com
55 scripts descartáveis. O que os salvou foi um plano antigo
(`docs/PLANO-2026-08-10-PROXIMA-EVOLUCAO.md`) que já dizia: os manifestos vão
para pasta versionada **antes** de o glob `.tmp-*` entrar no `.gitignore`.

🔴 **Dado que serve de rollback nunca deve ter nome de arquivo descartável.**
Se você escrever um script novo que altera produção em lote, grave o manifesto
aqui — os três scripts da tabela acima já fazem isso.
