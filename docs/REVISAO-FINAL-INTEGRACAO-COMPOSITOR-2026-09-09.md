# Revisão final da integração — 09/09/2026

**Pronto para revisão de integração, sem bloqueador identificado nesta inspeção.** Não é confirmação de funcionamento em produção. Revisão manual dos 48 arquivos da faixa `7dfbde33d74be7424202e3170fc61997d3c8a02d..41807cbdec6b7faaac70fadad5c91f60ead5986d`, incluindo todos os commits de seleção, fila, ponte semanal, pilotos e preset. Acrescentada a correção de diagnóstico descrita abaixo. Texto de PR preparado em [PR-COMPOSITOR-INTEGRADO-2026-09-09.md](PR-COMPOSITOR-INTEGRADO-2026-09-09.md), sem publicação.

## Achado corrigido

A escolha explícita de variante inexistente já não fazia fallback, porém o erro subsequente dizia que o projeto não tinha assinatura. Isso poderia induzir a criar uma assinatura em vez de corrigir o identificador. `carregarAssinatura` agora informa a variante/formato solicitados e orienta consultar `ver-assinatura`. Conserva `ASSINATURA_INCOMPLETA`/422, portanto não altera a classificação determinística da fila. Teste focal confirma a mensagem/detalhes e ausência de régua/persistência. Nenhuma mudança em SQL, seleção de foto ou parâmetros do gradiente.

## Contratos conferidos

| Fronteira | Conclusão |
|---|---|
| HTTP/MCP → spec | Booleano experimental transmitido explicitamente; false/ausência normalizados. Candidatas sozinhas não acionam seleção. Tratamento de texto validado na spec e nos dois contratos MCP de composição. Guardas de projeto/autenticação existentes não foram removidas. |
| Item semanal → copy/spec | Ponte preserva foto preenchida, ordem de candidatas, vínculos e horários. Mapeamento estrito recusa excedentes/papéis incompatíveis em vez de omitir condições. União dos papéis das variantes não é garantia de que uma única página acomode a copy: a validação posterior continua necessária. |
| Spec → fila | Job, Generation e vínculo do item no mesmo commit sob lock da linha. Revisão inclui conteúdo do item e spec original do payload. O preset e opt-in participam dessa spec. Não há render dentro da transação. |
| Reenvio → retomada | Mesma revisão reutiliza PROCESSING ou COMPLETED com resultado, usando payload original do job, não a spec resolvida pela seleção. Revisão incompatível em item que já avançou recusa; não sobrescreve vínculo. |
| Worker → seleção → persistência | `generationId`, autor e vínculos sobrevivem à reentrada. Avaliações não criam página/Generation; composição final reavalia bloqueios antes de persistir. Resolver de produção ainda pode criar cache de foto no Blob — avaliação não é sinônimo de zero escrita externa. |
| Seleção → baseline | Baseline é escolhido pelo mesmo compositor, não pela ordem da lista. Foto/variante explícitas restringem tentativas. Ganho tonal/contraste não compensa regressões, outra foto/cor/estrutura requer revisão, empate conserva baseline válido. Sem resultado sustentado, recusa com diagnóstico. |
| Erros → retry | SEM_COMBINACAO/PAPEIS_INCOMPATIVEIS são determinísticos. Régua/download indisponíveis permitem retry. Recusa não é preview aprovado. |
| Callback → item | CAS confere Generation esperada, estado e updatedAt numa escrita, após validar transição. Não rebaixa revisão que venceu a disputa. |
| Preset → editor/render | Helper puro compartilhado, layer gradient normal, topo explícito, rodapé preservado. Context executa um gesto de histórico; controles existentes editam os stops. Persistência recebe layer editável e spec. Renderer já suporta o tipo. |
| Sem opt-in | O preset e busca de combinações ficam desligados. Há mudanças globais intencionais nesta faixa: copy incompatível passa a recusar; variante ausente não faz fallback; caixa legada é projetada pelo crop real. Não afirmar equivalência pixel a pixel de toda a carteira. |

## Limites e riscos residuais

- O teto de seis avaliações é rígido em contagem; 30 segundos são conferidos entre tentativas, não cancelam chamada em andamento. O opt-in pode aumentar a latência.
- Metadata de catálogo pode estar ausente/incorreta. O falso negativo de marca de terceiro encontrado no Quintal foi recusado visualmente no piloto. O código não executa nova visão e não certifica a foto.
- Comparação tonal e fontes são proxies; logo, peso, nitidez, microcontraste e preferência estética não ficam certificados. Só a variante Real original recebeu aprovação humana. Preset de topo não resolve serviço no rodapé claro.
- CAS desta faixa protege o callback COMPOR. Não prova proteção de todo escritor/reconciliador nem da execução síncrona herdada. A transação de enqueue não garante exatamente uma página em toda interrupção do renderer/lease.
- Reenvios de jobs legados sem `planoRevisao` não recebem a nova equivalência por conteúdo; itens já avançados são recusados em vez de criar novo vínculo. Não há backfill silencioso.
- Ensaios de renderer são locais; smoke de Chromium usa painel/Context reais com leitura de cores substituída. Não houve salvar/recarregar/exportar autenticado em ambiente implantado. Essa etapa permanece no plano de preview antes de produção.

## Arquivos e dados

Conferidos nomes e conteúdo dos arquivos novos/alterados. Varredura localizada procurou chaves privadas, tokens de provedores, Bearer literal, JWT e URL PostgreSQL com senha: nenhum achado. Não foram versionados `.env`, snapshot, catálogo bruto, fotos/fontes, banco, bundle do navegador ou diretório temporário. Os scripts de coleta leem credenciais de arquivos locais em memória e omitem valores em logs de erro; nenhum valor de credencial está no diff.

As métricas/documentos contêm nomes comerciais, copy do piloto, ids de fotos/variantes, hashes e caminhos absolutos locais, deliberadamente usados para rastreabilidade. Esses ids não são credenciais. Links locais de previews exigem os artefatos deste worktree e não funcionarão num clone limpo. A varredura não substitui auditoria de todo o histórico do repositório.

Todos os módulos necessários ao produto foram incluídos: helper compartilhado, Context, painel, spec, MCP, compositor, régua, seletor, assunto/crop, ponte/fila e testes. `git status` antes da revisão mostrava somente `.codex/environments/` não rastreado, preservado. A correção desta revisão e os dois documentos de entrega são commitados juntos; não há dependência de arquivo de produto ignorado.

## Validação proporcional

Evidências anteriores conservadas: 428 regressões acumuladas; typecheck/lint; reprodução exata do PNG aprovado; 19 renders finais de diversidade; Chromium aplicar/dirty/undo/redo/editar opacidade/sem duplicar; cinco cenários PostgreSQL reais anteriores, com limites documentados.

Por causa da correção de mensagem, rodados apenas os dois arquivos afetados de avaliação/seleção: **23 testes passaram**, incluindo um teste novo. Typecheck e lint passaram novamente, com avisos preexistentes. Não repetidos suite completa, fotos, Chromium ou PostgreSQL: nenhuma alteração nessas superfícies justifica nova rodada nesta revisão.

Implantação/rollback continuam em [GRADIENTE-SUAVE-REAL-2026-09-09.md](GRADIENTE-SUAVE-REAL-2026-09-09.md). Nenhum PR publicado, merge, deploy ou alteração no checkout compartilhado.
