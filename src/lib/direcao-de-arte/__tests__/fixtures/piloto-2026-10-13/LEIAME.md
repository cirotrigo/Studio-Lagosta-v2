# Fixture da peça piloto: direção de arte, CP0 (13/10/2026)

Esta fixture é a peça real que a auditoria de direção de arte de 13/10/2026 examinou. Ela foi convertida em dados locais e anonimizados, e a regressão por propriedades do CP0 roda sobre ela (`../../*.test.ts`).

| | |
|---|---|
| **Peça** | Story de 14/10/2026, 10:00 BRT. A primeira peça do piloto do Dot. |
| **Origem** | Page `cmv7brg8c0005ii06rdbe4vc4`, Generation v1 `cmv7bqyvd0002ii06n3iq5ef0` (compositor) e v2 `cmv7bur3d0008ii06nvxat755` (depois de `ajustar-arte`). |
| **Exportação** | Feita só com leitura (`default_transaction_read_only=on`) mais o download dos arquivos da peça. |
| **Geração** | `npx tsx scripts/fixtures/gerar-fixture-piloto-direcao-de-arte.ts <exports> <esta pasta>` |
| **Regeneração** | 29/10/2026, com o ok do Ciro: os mesmos registros e a foto lidos de novo em produção (só leitura; a Page não mudou desde 13/10 e a assinatura desde 03/09; `Project.assinatura` entrou como o snapshot de 13/10, não o reconciliado em 29/10). Só `foto.json` mudou, e só a janela `servico-v1`. |

Os testes **não dependem** de banco, Blob, Drive, rede nem do `projectId` real. A spec usa o projeto `9001`, e as candidatas do véu entram por mock a partir de `marca.json`.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `foto.json` | A foto **anonimizada**, já no enquadramento da peça (corte right-middle, 1080×1920). Também traz a `regiaoProtegida` anotada à mão: a vitrine de gelato. É região narrativamente relevante, o produto que o serviço não pode cobrir, e **não** "o assunto principal" da foto. Ela entra no compositor pela caixa `assunto` do catálogo, o único caminho que ele tem hoje para proteger uma região. |
| `peca.json` | A spec que o agente mandou, as camadas da v1 e da v2, o registro do ajuste (`ajustes`, `aplicados`, `recusados`) e o diagnóstico gravado pelo compositor (`composicaoRegistrada`). A "v2" são as camadas da Page no momento do export, sem snapshot próprio; o replay dos ajustes da v2 sobre a v1 reproduz essas posições. |
| `assinatura.json` | A página de assinatura de story (variante fixada por id), com os halos por grupo, e os números estruturados do projeto (`Project.assinatura`). |
| `marca.json` | Os pares de leitura do DNA, as candidatas do véu da biblioteca atual e as duas logos cadastradas, **pixel a pixel** (RGBA) no tamanho desenhado. Logo é ativo público da marca, não dado pessoal; a média da tinta escondia as partes creme do monograma. Não há variante escura cadastrada. |

Toda URL de arquivo foi trocada por um token `fixture:*`, e `suporte/fixture.ts` reconstrói os arquivos como data URL.

## Anonimização da foto

A foto original tem clientes reconhecíveis e **não entra** na fixture. No lugar dela entram:

- **Uma grade de luminância de 43×76.** Cada célula tem cerca de 25 px, então ninguém é reconhecível. A grade alimenta as heurísticas que leem a foto inteira, como luz média e mapa de calma.
- **Quatro janelas de medida** em meia resolução (a escala da régua), só sobre as caixas que as propriedades medem:
  - o texto do topo da v1 e da v2;
  - a logo;
  - o serviço da v1, no balcão — ampliada 80 px para cima em 29/10/2026 (1632–1837), para cobrir o `mover` que o revisor passou a propor com a margem da base em 160 (P9); a faixa nova mostra o balcão e um frasco, nenhum rosto;
  - o serviço da v2, na vitrine.

  Elas foram conferidas a olho e mostram teto, mezanino, decoração, balcão, vitrine e uma mão. Nenhum rosto.

Por que as janelas existem: a grade sozinha amacia os brilhos e baixava o p98 do serviço de 166 para 150. Com isso a peça "passaria sem véu", o que muda o sentido do caso.

Por isso a medida só vale dentro das janelas. Toda medida de texto ou de logo sobre a fixture passa antes por `exigirMedidaFiel`. Se uma correção futura levar um texto para fora das janelas, o teste quebra como **setup**: amplie as janelas no gerador. Ele nunca devolve uma medida otimista.

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

## O revisor sobre a fixture

O `revisarArte` real lê o assunto que o compositor gravou (`composicao.assunto`, mesma foto e mesmo corte), como em produção. Os testes entregam a ele a Generation da v1 com esse diagnóstico e a página de assinatura. A visão não roda (`visao: false`), e o achado `fonte-nao-carregada` vem do ambiente (as fontes da marca não estão no teste), então fica fora do "apta".

## O que a fixture NÃO caracteriza

- **A escolha do corte** (os 3 cortes avaliados e o right-middle vencedor) e o **assunto estimado por energia** ({0, 768, 900, 1152}). Os dois dependem da textura fina que a anonimização remove. Por isso a foto entra já cortada, e P5 usa a **região protegida** anotada.
- **A foto fora das janelas.** Ali só existe a grade, por isso a guarda acima.

## Decisões do owner incorporadas (13/10/2026)

- **Logo, critério regional.** O teste lê só os pixels opacos da logo (alfa ≥ 128) contra o fundo efetivo **no mesmo pixel** (foto, tratamentos e véus). Decide o **p10** de `|luz da logo − luz do fundo|` ≥ 45. Média e percentual de pixels no limiar ficam só como diagnóstico. Na peça, o monograma passaria pela média (46,3), mas o p10 é 21,3: as partes creme somem.
- **Limiar 45.** Fica mantido no CP0 e no início do CP3. Pode ser recalibrado depois do benchmark REA sem mudar a semântica regional.
- **Hierarquia.** Não há K como hard gate. `K_REFERENCIA_HIERARQUIA = 1,25` é só telemetria. A hierarquia dura testa ordem de leitura, papel e geometria.
- **Safe interface ≠ geometria de composição.** O piso hard é 188/224. `Project.assinatura.geometria.story` (250/350) é geometria de composição e configuração legada: não vira gate e deve ser reconciliada, nunca vencer em silêncio.
- **Portão, contrato alvo da V1.** Peça não apta **não cria rascunho**. Ela volta com `REVISAO_HUMANA_NECESSARIA`, o generationId, o pageId, o editUrl e os achados. Um ajuste que piora um rascunho existente é recusado antes de substituir a versão.
- **Polaridade mista na mesma borda.** Sem solução aprovada, o código é `SEM_COMBINACAO` com `motivo: POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA`. Se houver solução fora de uma preferência rígida, o código é `PREFERENCIA_INVIAVEL`.
