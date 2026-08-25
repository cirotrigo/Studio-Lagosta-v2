# Proposta: escopos reais no OAuth do conector MCP

**Status: PROPOSTA — não implementar sem aprovação do Ciro.**
Escrita em 25/08/2026, no fechamento do bloco de endurecimento do OAuth
(audiência RFC 8707, revogação RFC 7009, prazo de refresh, cache na porta).

## O problema

O escopo é binário: `mcp` significa TUDO. Um conector autorizado para "olhar a
agenda" pode aprovar rascunho, cancelar post e gravar DNA. A tela de
consentimento descreve três coisas ("ver", "criar artes", "consultar agenda"),
mas o token não distingue nenhuma delas.

## A proposta: três escopos

| Escopo | O que cobre | Exemplos |
|---|---|---|
| `mcp:ler` | leitura pura | ver-agenda, consultar-base, consultar-dna, listar-modelos, buscar-fotos |
| `mcp:criar` | produz conteúdo, gasta crédito, nada vai ao ar | gerar-imagem, criar-arte, melhorar-arte, criar-plano, criar-entrada-base |
| `mcp:publicar` | mexe no que vai ao ar ou apaga | colocar-na-agenda, aprovar-rascunhos, postar-agora, cancelar-post, atualizar-dna |

Três bastam: a divisão que importa na prática é "pode olhar / pode produzir /
pode publicar" — é a mesma fronteira que a casa já traça em outros lugares
(proposta nunca agenda nem cobra sozinha; publicar exige gesto explícito).

## Onde cada peça mora

- **Declaração por tool, no catálogo** (`src/lib/mcp/catalogo/`): campo novo
  `escopo: 'ler' | 'criar' | 'publicar'` em `definirTool`. NÃO derivar de
  `annotations.readOnlyHint` sozinho — ele separa `ler` do resto, mas não
  separa `criar` de `publicar`. O caminho é declarar e CONFERIR: sentinela no
  load (padrão `CATEGORIAS_DA_BASE`) recusa tool com `readOnlyHint: true` e
  escopo diferente de `ler`, e `validar-registro-mcp.ts` ganha a seção que
  trava o mapeamento por snapshot.
- **Gate na porta única** (`registro/porta.ts`): um ponto só, ao lado do gate
  de acesso que já existe. Token sem o escopo da tool → erro da taxonomia
  dizendo qual escopo falta e como reconectar. O gate mecânico de cobrança do
  `executar-plano` NÃO muda — escopo e confirmação são portas diferentes.
- **Acesso por projeto não muda**: escopo diz O QUE a tool pode fazer;
  `assertProjetoPermitido`/`assertCuradorDoProjeto` seguem dizendo ONDE.
- **Consentimento** (`/oauth/authorize`): a lista de bullets vira a lista dos
  escopos PEDIDOS, cada um com a frase do que significa. O `scope` pedido
  chega na query, o approve grava no código e a troca herda — a coluna
  `scope` já existe (TEXT) em código e token: **sem migration**.
- **Metadata**: `scopes_supported: ['mcp:ler', 'mcp:criar', 'mcp:publicar']`
  (mantendo `mcp` legado na lista enquanto houver token vivo com ele).

## Migração suave (mesma regra da audiência e do prazo)

- Token antigo com `scope: 'mcp'` continua valendo TUDO — endurecer sem
  quebrar ninguém. A rotação NÃO troca o escopo sozinha (trocaria o contrato
  que o usuário aprovou na tela).
- Escopo fino só nasce em conexão NOVA. Quem quiser o conector restrito
  reconecta.
- **Decisão em aberto para o Ciro**: `mcp` legado = tudo para sempre, ou
  anunciar uma data em que legado vira só `mcp:ler` (forçando reconexão de
  quem escreve)? A primeira é a suave; a segunda fecha o buraco de verdade.

## O que o claude.ai faz com isso

O cliente pede os escopos do `scopes_supported` e mostra a tela de
consentimento nossa — não há UI de escopo do lado de lá. Ou seja: na prática
todo conector do claude.ai vai pedir os três, e o valor real da mudança está
em (a) tokens de SERVIÇO e integrações futuras poderem nascer só-leitura, e
(b) a porta ter o gate pronto no dia em que alguém precisar de um conector
restrito. É trabalho de fundação, não de feature visível — mais um motivo
para não correr.

## Custo estimado

- Catálogo: +1 campo em 48 declarações (mecânico) + sentinela + snapshot.
- Porta: 1 checagem nova ao lado do gate de acesso.
- Consentimento/metadata/approve: pequenos.
- Risco maior: conector existente reconectando sem necessidade se a UI de
  consentimento mudar de forma confusa. Mitigação: legado intocado.
