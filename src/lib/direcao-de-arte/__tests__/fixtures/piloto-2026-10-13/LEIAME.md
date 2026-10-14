# Fixture da peça piloto: direção de arte, CP0 (13/10/2026)

Esta fixture é a peça real que a auditoria de direção de arte de 13/10/2026 examinou. Ela foi convertida em dados locais e anonimizados, e a regressão por propriedades do CP0 roda sobre ela (`../../*.test.ts`).

| | |
|---|---|
| **Peça** | Story de 14/10/2026, 10:00 BRT. A primeira peça do piloto do Dot. |
| **Origem** | Page `cmv7brg8c0005ii06rdbe4vc4`, Generation v1 `cmv7bqyvd0002ii06n3iq5ef0` (compositor) e v2 `cmv7bur3d0008ii06nvxat755` (depois de `ajustar-arte`). |
| **Exportação** | Feita só com leitura (`default_transaction_read_only=on`) mais o download dos arquivos da peça. |
| **Geração** | `npx tsx scripts/fixtures/gerar-fixture-piloto-direcao-de-arte.ts <exports> <esta pasta>` |

Os testes **não dependem** de banco, Blob, Drive, rede nem do `projectId` real. A spec usa o projeto `9001`, e as candidatas do véu entram por mock a partir de `marca.json`.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `foto.json` | A foto **anonimizada**, já no enquadramento da peça (corte right-middle, 1080×1920). Também traz a caixa do assunto anotada à mão: a vitrine de gelato. |
| `peca.json` | A spec que o agente mandou, as camadas da v1 e da v2, o registro do ajuste (`ajustes`, `aplicados`, `recusados`) e o diagnóstico gravado pelo compositor (`composicaoRegistrada`). |
| `assinatura.json` | A página de assinatura de story (variante fixada por id), com os halos por grupo, e os números estruturados do projeto (`Project.assinatura`). |
| `marca.json` | Os pares de leitura do DNA, as candidatas do véu da biblioteca atual e as duas logos cadastradas. Cada logo vem como máscara de alfa no tamanho desenhado mais a cor média da tinta. Não há variante escura cadastrada. |

Toda URL de arquivo foi trocada por um token `fixture:*`, e `suporte/fixture.ts` reconstrói os arquivos como data URL.

## Anonimização da foto

A foto original tem clientes reconhecíveis e **não entra** na fixture. No lugar dela entram:

- **Uma grade de luminância de 43×76.** Cada célula tem cerca de 25 px, então ninguém é reconhecível. A grade alimenta as heurísticas que leem a foto inteira, como luz média e mapa de calma.
- **Quatro janelas de medida** em meia resolução (a escala da régua), só sobre as caixas que as propriedades medem:
  - o texto do topo da v1 e da v2;
  - a logo;
  - o serviço da v1, no balcão;
  - o serviço da v2, na vitrine.

  Elas foram conferidas a olho e mostram teto, mezanino, decoração, balcão, vitrine e uma mão. Nenhum rosto.

Por que as janelas existem: a grade sozinha amacia os brilhos e baixava o p98 do serviço de 166 para 150. Com isso a peça "passaria sem véu", o que muda o sentido do caso.

## Fidelidade (tolerância de 4 níveis, de 0 a 255)

A régua de produção, rodando sobre a fixture, reproduz os números que ficaram gravados ou que foram medidos com a foto original:

| Medida | Produção | Fixture |
|---|---|---|
| serviço v1 (p98 sem véu → com véu, alvo 139) | 166 → 194 | 165 → 194 |
| apoio v1 (p02, alvo 130) | 33 → 121 | 34 → 122 |
| headline v1 (p02) | 71 → 182 | 71 → 185 |
| serviço v2 | 235 → 235* | 233 → 233 |
| headline v2 | 30 → 113* | 31 → 114 |

\* A v2 não tem medida gravada, porque o ajustar-arte não mede. Os números foram medidos com a foto **original** e a régua de `2fc0a319`, e batem com o p98 = 235 que o owner relatou. **Correção à auditoria:** o 235 vem dos brilhos da vitrine para onde o serviço foi movido (dy −230). Ele aparece **também sem o véu**. Não é a "luz do véu creme", como a §4 do relatório supôs.

O compositor real, rodando sobre a fixture, também reproduz os outros fatos gravados:

- véu `#F3EADC` no topo e no rodapé, com forças 0.9 e 0.45 e alturas 665 e 576;
- a posição e o tamanho de cada bloco e da logo;
- o aviso de contraste do serviço.

## O que a fixture NÃO caracteriza

- **A escolha do corte** (os 3 cortes avaliados e o right-middle vencedor) e o **assunto estimado por energia** ({0, 768, 900, 1152}). Os dois dependem da textura fina que a anonimização remove. Por isso a foto entra já cortada, e P5 usa o assunto **anotado**.
- **A tinta exata do monograma.** Ele é dourado e creme, e a fixture guarda só a cor média. O wordmark, que é a logo usada na peça, é de cor única e fica fiel.
