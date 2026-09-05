/**
 * A/B das REGRAS DA CASA na melhoria: o prompt ANTES × DEPOIS de 04/09/2026,
 * na MESMA arte, com o MESMO pedido, n rodadas de cada.
 *
 * Nasceu da regressão da Wine Vix (geração `cmtndl3fa0003gm0a72w6bl0u`): a
 * arte é uma agenda de feriado, 6 dos 13 blocos são horário, e a regra antiga
 * mandava movê-los "para o rodapé" — o gpt-image cumpriu essa ordem E o
 * [TEXTO EXATO] ao mesmo tempo, devolvendo a programação inteira REPETIDA num
 * rodapé, nas duas rodadas. Uma delas com o pedido "Não inclua textos extras".
 *
 * O que ele mede, em números e não no olho:
 *  - BLOCOS A MAIS: quantos blocos a arte nova tem além dos da origem, e
 *    quantos são REPETIÇÃO de um bloco que já existe (o defeito central).
 *  - RÉGUA: a mesma `verifyImageTexts` da produção — o que faltou e o que
 *    sobrou com dado (endereço/horário inventado).
 *  - LUZ: a média de luminância contra a da origem. A melhoria de 04/09 levou
 *    a foto de 100,8 para 55,1 e 47,8, com a regra 9 no prompt dizendo que a
 *    fotografia é INTOCÁVEL.
 * E escreve uma folha de contato (origem | antes | depois) para o olho julgar
 * o que número nenhum julga.
 *
 * NÃO escreve no banco (só lê a Generation), NÃO cobra crédito e NÃO chama
 * nada que registre `LearningSignal`. O custo é a fatura da OpenAI: ~US$ 0,008
 * por rodada em `low`, 0,045 em `medium`, 0,165 em `high`.
 *
 * Uso:
 *   npx tsx scripts/medir-regras-da-melhoria.ts                     # dry-run: imprime os dois prompts e a conta
 *   npx tsx scripts/medir-regras-da-melhoria.ts --confirmar
 *   npx tsx scripts/medir-regras-da-melhoria.ts --confirmar --gen=<id> --rodadas=2 --tier=low
 *   npx tsx scripts/medir-regras-da-melhoria.ts --confirmar --pedido="não inclua ícones"
 *   npx tsx scripts/medir-regras-da-melhoria.ts --confirmar --so=depois
 */
import { PrismaClient } from '@prisma/client'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

const db = new PrismaClient()
const SAIDA = path.join(process.cwd(), '.tmp-medicao-regras')
const CUSTO: Record<string, number> = { low: 0.008, medium: 0.045, high: 0.165 }

/** A agenda de feriado da Wine Vix — a peça que quebrou a regra antiga. */
const GEN_PADRAO = 'cmtndl3fa0003gm0a72w6bl0u'

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1]
}

/**
 * O prompt de ANTES, verbatim. Reconstruído aqui e não importado de propósito:
 * a produção não deve carregar o texto que ela aposentou, e a linha de base de
 * uma medição precisa ficar congelada mesmo quando o módulo vivo mudar de novo.
 * A regra 1 vem da função legada, que segue exportada como caminho de volta.
 */
const TAREFA_ANTIGA = [
  '[A TAREFA]',
  'Esta é uma arte PRONTA desta marca. Crie uma versão melhor dela: ajuste o',
  'posicionamento, a hierarquia e o respiro dos textos para dar mais leitura.',
  'Use a MESMA copy da arte original, palavra por palavra.',
  'A composição é SUA: leia a fotografia, veja onde ela é calma, e decida onde',
  'cada bloco fica melhor. Variar a diagramação em relação à original é bom —',
  'o que não pode mudar é o conteúdo, a fotografia e a identidade da marca.',
].join('\n')

const REGRAS_ANTIGAS_2_A_7 = [
  '2. MARGEM: preserve a margem da arte original. Não aumente o respiro das bordas, não "centralize melhor" e não recue os blocos para dentro — se a arte já tem uma margem consistente, ela é a margem da marca e permanece exatamente como está. Corrija margem apenas quando um elemento estiver encostado na borda ou visivelmente desalinhado dos demais.',
  '3. HALO DE LEITURA, NÃO VÉU: quando o texto precisar de contraste, use uma mancha escura DESFOCADA só atrás do bloco de texto, sem borda visível, que desmancha para a foto em volta (a mancha inteira ocupa no máximo cerca de um terço do quadro) — nunca um gradiente de faixa de borda a borda, nunca uma tarja, nunca o topo ou o rodapé inteiros escurecidos. A foto continua nítida e tão clara quanto a original POR BAIXO do halo. ⛔ Nunca escureça a foto inteira nem baixe o brilho geral da cena para destacar texto. Se o texto não ficar legível com um halo leve, MUDE O TEXTO DE LUGAR em vez de adensar a mancha.',
  '4. LEIA A FOTO ANTES DE POSICIONAR O TEXTO. Identifique o assunto principal (o prato, a bebida, a pessoa, o produto) e onde a imagem é calma — desfocada, escura, lisa, sem informação. O bloco de texto vai na área calma, mesmo que isso signifique mudá-lo de lugar em relação à arte original: se o assunto está no topo, o texto desce; se está embaixo, o texto sobe. Nunca deixe texto sobre o assunto só porque a arte original o deixava ali. Nenhuma parte do assunto pode ser coberta.',
  '5. DESTAQUE AS PALAVRAS-CHAVE. Em todo bloco de texto com mais de três palavras, as palavras que carregam a informação (o prato, o dia, o preço, o benefício) recebem destaque por PESO da fonte ou pela cor de acento da marca — o resto fica no peso normal. Bloco inteiro no mesmo peso e na mesma cor é defeito: é o que transforma a peça num parágrafo. O destaque é de peso e cor, não de tamanho: a diferença de escala entre a palavra destacada e as vizinhas não passa de cerca de 20%.',
  '6. NÃO INVENTE DADO QUE VOCÊ NÃO CONSEGUE LER. Horário, endereço, telefone, preço e nome de prato são fatos do cliente: ou você os reproduz exatamente como estão na arte, ou os DEIXA DE FORA. Se um trecho estiver ilegível, cortado ou você tiver qualquer dúvida sobre o que está escrito, OMITA o bloco inteiro — nunca preencha com um valor parecido, plausível ou de outro estabelecimento. Faltar um dado é defeito pequeno; publicar o endereço errado do cliente é o maior de todos.',
  '7. TEXTO EM BLOCOS, NUNCA EM PARÁGRAFO. Quebre a informação em linhas curtas com hierarquia visível (manchete, apoio, serviço, CTA). Um bloco corrido de texto longo é defeito de leitura, mesmo quando cada palavra está correta. Nenhuma linha termina com palavra solta e sem sentido, e nenhuma palavra fica órfã numa linha só.',
]

const FIDELIDADE_ANTIGA = [
  '9. A FOTOGRAFIA É INTOCÁVEL NESTA PEÇA, E ESTA REGRA REVOGA AS LICENÇAS DE TRATAMENTO ACIMA.',
  'Ninguém pediu para mexer na imagem. Onde as diretrizes falam em buscar aparência profissional, priorizar textura, contraste, profundidade de campo, fundo desfocado, acabamento cinematográfico ou iluminação quente — nada disso vale aqui: são descrições do que a foto JÁ é, nunca ordens de refazê-la.',
  '⛔ Não relumie, não recolora, não mude o contraste, a saturação ou a nitidez, não desfoque o fundo, não troque o enquadramento e não substitua a imagem. A foto sai do jeito que entrou, pixel por pixel, e o seu trabalho é APENAS a camada gráfica por cima dela.',
  'Se para a sua composição ficar melhor a foto precisasse mudar, a resposta é mudar a composição.',
].join('\n')

function pedidoAntigo(userRequest: string): string {
  const t = userRequest.trim()
  if (!t) return ''
  return `[PEDIDO DO CLIENTE]\n${t}\n\nEste pedido tem prioridade sobre as diretrizes de diagramação acima, mas nunca\nsobre os limites (palavras, família tipográfica, paleta e logo).`
}

/** Normalização mínima para comparar bloco transcrito com bloco da origem. */
function norm(t: string): string {
  return t
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase()
}

/**
 * O defeito central, em número: quantos blocos a arte nova tem A MAIS, e
 * quantos deles são REPETIÇÃO de um bloco que a origem já tinha (a
 * programação duplicada no rodapé).
 *
 * 🔴 A contagem é por CONTINÊNCIA, não por igualdade — e a diferença decide.
 * A primeira versão comparava as strings normalizadas com `Map.get`, e por
 * isso só via a repetição quando a visão transcrevia o rodapé duplicado com
 * exatamente as mesmas quebras da origem. Rodada sobre a peça defeituosa REAL
 * (a que repete a programação inteira num rodapé), ela devolveu
 * `repetidos: 0` — a métrica dizia "limpo" sobre o defeito que ela existe para
 * medir. O rodapé agrupado costuma ser lido como UMA linha
 * ("SEXTA-FEIRA | Funcionamento - 10h às 22h"), que não casa com
 * "Funcionamento - 10h às 22h" por igualdade, mas o CONTÉM.
 *
 * Contar as ocorrências dos dois lados pelo MESMO critério mantém a linha de
 * base honesta: um bloco curto que aparece dentro de vários outros já aparecia
 * assim na origem, então ele não vira falso positivo.
 */
function duplicacao(transcrito: string[], origem: string[]) {
  const ocorrencias = (bloco: string, lista: string[]) => {
    const k = norm(bloco)
    if (!k) return 0
    return lista.reduce((t, item) => (norm(item).includes(k) ? t + 1 : t), 0)
  }
  const blocosDaOrigem = [...new Set(origem.map(norm).filter(Boolean))]
  let repetidos = 0
  const quais: string[] = []
  for (const k of blocosDaOrigem) {
    const naOrigem = ocorrencias(k, origem)
    const naArte = ocorrencias(k, transcrito)
    if (naArte > naOrigem) {
      repetidos += naArte - naOrigem
      quais.push(`${k.slice(0, 40)} (${naOrigem}→${naArte})`)
    }
  }
  return { blocos: transcrito.length, aMais: transcrito.length - origem.length, repetidos, quais }
}

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const genId = arg('gen') ?? GEN_PADRAO
  const rodadas = Number(arg('rodadas') ?? 2)
  const tier = (arg('tier') ?? 'low') as 'low' | 'medium' | 'high'
  const pedido = arg('pedido') ?? ''
  const so = arg('so') // 'antes' | 'depois' | undefined

  const gen = await db.generation.findUnique({
    where: { id: genId },
    select: { id: true, projectId: true, resultUrl: true, templateName: true, fieldValues: true, Project: { select: { name: true } } },
  })
  if (!gen?.resultUrl) throw new Error(`geração ${genId} não encontrada ou sem arte`)

  const { extractExpectedTexts, transcreverTextosDaArte, verifyImageTexts } = await import('../src/lib/ai/creative-text-verification')
  const { buildPromptSections } = await import('../src/lib/ai/openai-image-client')
  const { instrucaoDeServicoNaMelhoria } = await import('../src/lib/ai/regras-da-melhoria')
  const { loadImprovementAssets } = await import('../src/lib/ai/improvement-assets-loader')
  const { fetchImageSource } = await import('../src/lib/ai/fetch-image-source')
  const { aplicarCaixaDaOrigem, CAIXA_DA_MANCHETE } = await import('../src/lib/ai/caixa-da-copy')
  const { melhoriaCompoeLogo, finalizarLogoDaMelhoria } = await import('../src/lib/ai/logo-na-melhoria')
  const { inferFormatFromDimensions, OPENAI_INPUT_SIZE } = await import('../src/lib/ai/creative-improvement-format')
  const sharp = (await import('sharp')).default

  const assets = await loadImprovementAssets(gen.projectId, { selectedLogoIds: [], selectedElementIds: [] })
  const compoe = melhoriaCompoeLogo(gen.projectId) && assets.logos.length > 0
  /**
   * 🔴 A logo é colada por CÓDIGO depois da geração nos projetos em `compor`
   * (Wine Vix é um deles): o prompt manda NÃO desenhá-la e reserva o canto.
   * A primeira versão deste script chamava `runImageEdit` cru e parava aí — as
   * peças medidas saíam sem marca nenhuma, e a régua acusava "faltou WINE VIX"
   * nas quatro rodadas, ruído que esconderia uma falha de régua de verdade.
   * Medição tem de terminar na peça COMO ELA É ENTREGUE.
   */
  const logoBuffer = compoe ? (await fetchImageSource(assets.logos[0].fileUrl)).buffer : null
  const src = await fetchImageSource(gen.resultUrl)
  const meta = await sharp(src.buffer).metadata()
  /**
   * 🔴 O formato sai da MESMA função da produção. A primeira versão usava
   * `altura/largura > 1.5 ? story : feed`, sem ramo SQUARE — então uma arte
   * quadrada era medida em 4:5, e a medição deixava de representar o que o
   * cliente receberia justamente na proporção em que o corte aparece.
   */
  const formato = inferFormatFromDimensions(meta.width ?? 0, meta.height ?? 0)
  const size = OPENAI_INPUT_SIZE[formato]

  // A régua, como a produção monta: banco primeiro, visão como fallback.
  const doBanco = extractExpectedTexts(gen.fieldValues)
  const transcricaoDaOrigem = await transcreverTextosDaArte(src.buffer).catch(() => [] as string[])
  const regua = doBanco.length > 0 ? doBanco : transcricaoDaOrigem
  const textosParaPrompt = aplicarCaixaDaOrigem(regua, transcricaoDaOrigem, CAIXA_DA_MANCHETE.get(gen.projectId))

  const comum = {
    references: [] as never[],
    brandColors: assets.colors,
    artDirection: assets.artDirection,
    brand: assets.brand,
    expectedTexts: textosParaPrompt,
    instrucaoImagem: null,
    arteSemTexto: false,
    logoCompor: compoe,
  }

  // DEPOIS: o prompt de produção, tal como está hoje.
  const depois = buildPromptSections({ userRequest: pedido, ...comum }).map((s) => s.content).join('\n\n')

  // ANTES: as mesmas seções do sistema, com a tarefa, as regras e o pedido antigos.
  const antes = buildPromptSections({ userRequest: pedido, ...comum })
    .map((s) => {
      if (s.id === 'tarefa') return TAREFA_ANTIGA
      if (s.id === 'pedido') return pedidoAntigo(pedido)
      if (s.id !== 'regras-da-casa') return s.content
      const bloco = [
        '[REGRAS DA CASA — valem para esta peça e vencem a leitura que você fizer da arte original]',
        instrucaoDeServicoNaMelhoria(textosParaPrompt),
        ...REGRAS_ANTIGAS_2_A_7,
      ]
      const fatos = s.content.match(/\[FATOS DO CLIENTE[\s\S]*?(?=\n\n|$)/)?.[0]
      if (fatos) bloco.push(fatos)
      bloco.push(FIDELIDADE_ANTIGA)
      return bloco.join('\n\n')
    })
    .filter(Boolean)
    .join('\n\n')

  const variantes = (['antes', 'depois'] as const).filter((v) => !so || so === v)
  const luzOrigem = (await sharp(src.buffer).greyscale().stats()).channels[0].mean

  mkdirSync(SAIDA, { recursive: true })
  writeFileSync(path.join(SAIDA, 'prompt-antes.txt'), antes)
  writeFileSync(path.join(SAIDA, 'prompt-depois.txt'), depois)

  console.log(`peça: ${gen.templateName ?? gen.id} · ${gen.Project?.name} · ${formato} ${size}`)
  console.log(`régua: ${regua.length} blocos (${doBanco.length > 0 ? 'banco' : 'visão'})`)
  console.log(`pedido: ${pedido ? JSON.stringify(pedido) : '(vazio — o caso em que só as regras da casa falam)'}`)
  console.log(`luz média da origem: ${luzOrigem.toFixed(1)}`)
  console.log(`logo: ${compoe ? `composta por código depois da geração (${assets.logos.length} arquivo(s) oficiais)` : 'desenhada pelo modelo'}`)
  console.log(`prompt ANTES: ${antes.length} chars · DEPOIS: ${depois.length} chars (${SAIDA}/prompt-*.txt)`)
  console.log(`\nplano: ${variantes.join(' e ')} × ${rodadas} rodada(s) em ${tier} = ${(variantes.length * rodadas * CUSTO[tier]).toFixed(3)} USD`)
  if (!confirmar) {
    console.log('\nDRY-RUN. Com --confirmar roda e escreve as folhas em .tmp-medicao-regras/.')
    return
  }

  const { runImageEdit } = await import('../src/lib/ai/openai-image-client')
  const origemJpg = await sharp(src.buffer).jpeg({ quality: 88 }).toBuffer()
  writeFileSync(path.join(SAIDA, 'origem.jpg'), origemJpg)
  const quadros: Buffer[] = [origemJpg]
  const resumo: Array<Record<string, unknown>> = []

  for (const variante of variantes) {
    const prompt = variante === 'antes' ? antes : depois
    for (let r = 1; r <= rodadas; r++) {
      const t0 = Date.now()
      try {
        let buf = await runImageEdit({
          images: [{ buffer: src.buffer, mimeType: src.contentType, name: 'original.jpg' }],
          prompt, size, quality: tier,
        })
        if (compoe && logoBuffer) {
          buf = (await finalizarLogoDaMelhoria(buf, logoBuffer, formato)).buffer
        }
        const jpg = await sharp(buf).jpeg({ quality: 88 }).toBuffer()
        writeFileSync(path.join(SAIDA, `${variante}-r${r}.jpg`), jpg)
        quadros.push(jpg)

        const lidos = await transcreverTextosDaArte(buf).catch(() => [] as string[])
        const dup = duplicacao(lidos, transcricaoDaOrigem.length ? transcricaoDaOrigem : regua)
        const check = await verifyImageTexts(buf, regua, [], assets.brand?.projectName ?? null, transcricaoDaOrigem.length ? transcricaoDaOrigem : src.buffer)
        const luz = (await sharp(buf).greyscale().stats()).channels[0].mean

        const linha = {
          variante, rodada: r,
          blocosLidos: dup.blocos, blocosAMais: dup.aMais, repetidos: dup.repetidos, quaisRepetidos: dup.quais,
          reguaOk: check.passed, faltou: check.missing,
          aMaisComDado: check.blocosAMais.comDado, numeros: check.numerosNaoEsperados,
          luz: Number(luz.toFixed(1)), variacaoDaLuz: `${(((luz - luzOrigem) / luzOrigem) * 100).toFixed(0)}%`,
          segundos: Math.round((Date.now() - t0) / 1000),
        }
        resumo.push(linha)
        console.log(
          `  ${variante} r${r}: ${dup.blocos} blocos lidos (origem ${transcricaoDaOrigem.length}), ` +
          `${dup.repetidos} repetido(s) · régua ${check.passed ? 'OK' : `faltou ${check.missing.length}`}` +
          `${check.blocosAMais.comDado.length ? ` · A MAIS c/ dado: ${check.blocosAMais.comDado.join(' | ')}` : ''}` +
          ` · luz ${luz.toFixed(1)} (${linha.variacaoDaLuz}) · ${linha.segundos}s`,
        )
      } catch (e) {
        resumo.push({ variante, rodada: r, erro: (e as Error).message })
        console.log(`  ${variante} r${r} FALHOU: ${(e as Error).message}`)
      }
    }
  }

  // Folha de contato: origem | antes… | depois…
  const alt = 900
  const redim = await Promise.all(quadros.map((q) => sharp(q).resize({ height: alt }).toBuffer()))
  const metas = await Promise.all(redim.map((q) => sharp(q).metadata()))
  const larg = metas.reduce((t, m) => t + (m.width ?? 0) + 12, 12)
  let x = 12
  const composicao = metas.map((m, i) => { const item = { input: redim[i], left: x, top: 12 }; x += (m.width ?? 0) + 12; return item })
  const folha = await sharp({ create: { width: larg, height: alt + 24, channels: 3, background: '#111111' } })
    .composite(composicao).jpeg({ quality: 85 }).toBuffer()
  writeFileSync(path.join(SAIDA, 'folha.jpg'), folha)
  writeFileSync(path.join(SAIDA, 'resumo.json'), JSON.stringify({ genId, pedido, tier, luzOrigem, resumo }, null, 2))
  console.log(`\nfolha de contato e resumo em ${SAIDA}/`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
