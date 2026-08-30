/**
 * Curadoria assistida da "prata da casa" — para o cliente cujo histórico de uso
 * ainda não semeou destaque nenhum.
 *
 * POR QUE ELE EXISTE: `semear-destaques.ts` colhe a curadoria que os DADOS já
 * fizeram (foto escolhida numa busca, arte elogiada, correção pós-produção).
 * Cliente novo — ou que produz fora do Studio — não tem esses dados: a Bacana
 * tinha 954 fotos e ZERO destaques, e o componente mais forte do ranking
 * (DESTAQUE, +40) nascia dormente justamente onde o acervo é menos conhecido.
 *
 * 🔴 O QUE ELE **NÃO** FAZ: julgar gosto. A casa já recusou "nota estética por
 * modelo" (docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md, § Fora do escopo) —
 * visão reprova EXECUÇÃO, nunca gosto, e "é bonita?" é a pergunta que ela erra.
 * Aqui a visão responde só fato verificável: está nítida? bem exposta? o
 * assunto está claro? existe região calma onde caberia texto? Adequação ao uso
 * e execução, não preferência.
 *
 * DOIS ESTÁGIOS (o primeiro é o que torna o segundo barato):
 *   1. ASSUNTO, por TEXTO — as descrições já estão no catálogo, de graça. Um
 *      LLM separa "casou por palavra" de "realmente mostra o assunto" e escolhe
 *      finalistas com diversidade (fotos diferentes, não 10 do mesmo prato).
 *   2. EXECUÇÃO, por VISÃO — só nas finalistas. Uma chamada por foto.
 *
 * `origem: 'curadoria-visao'` fica SEPARADA de 'humano' e 'semente' de
 * propósito — precedente de `PhotoUsage.origem = 'historico'`: dá para
 * auditar e desfazer sem tocar no que gente marcou. Despromover é `revogadoEm`
 * (nunca DELETE), e a revogação humana JAMAIS é sobrescrita aqui.
 *
 * USO
 *   npx tsx scripts/curar-destaques.ts                    # dry-run, todos os buracos
 *   npx tsx scripts/curar-destaques.ts --projeto 5        # só um cliente
 *   npx tsx scripts/curar-destaques.ts --por-pilar 5      # quantos por pilar (default 4)
 *   npx tsx scripts/curar-destaques.ts --confirmar        # grava
 *   npx tsx scripts/curar-destaques.ts --desfazer         # revoga o que ESTE script marcou
 *
 * Custo: ~1 chamada de texto por pilar + 1 de visão por finalista (gpt-4o-mini,
 * miniatura de 400px). Dry-run não chama visão à toa — ele chama, porque o
 * ponto do dry-run é justamente MOSTRAR o veredito antes de gravar.
 */
import 'dotenv/config'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '../src/lib/db'
import { lerCatalogoDoProjeto, type ImagemCatalogo } from '../src/lib/creatives/acervo'
import { palavrasDoTema, casaComTema, type PilarParaBusca } from '../src/lib/creatives/ranquear-acervo'
import { googleDriveService } from '../src/server/google-drive-service'

const MODELO = 'gpt-4o-mini'
/** Nossa marca de origem. Tudo que este script grava carrega ela. */
const ORIGEM = 'curadoria-visao'
/** Teto de candidatas que vão para o LLM de texto (amostra estratificada por pasta). */
const AMOSTRA_MAX = 120
/**
 * Quantas finalistas o estágio 1 devolve por pilar (o estágio 2 olha todas).
 *
 * 14 e não 10 porque as travas de variedade cortam bastante lá na frente: no
 * Quintal, 10 finalistas viraram 1 destaque só depois da rajada e do teto por
 * pasta. Cada finalista a mais é uma chamada de visão de miniatura — barato
 * perto de deixar o pilar com um destaque só.
 */
const FINALISTAS = 14
/** Concorrência da visão. O tempo é quase todo espera de rede. */
const CONCORRENCIA = 4
/**
 * Teto de escolhidas por PASTA dentro do mesmo pilar — variedade entre ensaios.
 *
 * A trava é de CÓDIGO, não de prompt: pedir variedade ao modelo não é trava —
 * ele responde com confiança alta para agradar (lição do classificador de
 * pilares e do crivo).
 */
const MAX_POR_PASTA = 2
/**
 * Distância mínima entre números de quadro para duas fotos contarem como
 * momentos DIFERENTES.
 *
 * 🔴 Medido na primeira rodada (Quintal, "Celebrações"): as 4 aprovadas saíram
 * de `Temáticos/Dia dos Pais` com nomes sequenciais (cmt07127, 07133, 07141,
 * 07147) e, ao OLHAR duas delas, são o MESMO INSTANTE — mesma mesa, mesmo
 * gesto, segundos de diferença. Como prata da casa isso é uma foto só, e o
 * rodízio não teria o que variar.
 *
 * `md5` não pega (são arquivos diferentes) e nenhuma pergunta de visão pegaria
 * — é relação ENTRE fotos. O número do quadro na câmera pega: rajada tem
 * números vizinhos. Um teto por PASTA sozinho seria grosseiro demais no outro
 * sentido — ensaio grande e variado (a mesma pasta com mesa, sobremesa e
 * brinde) merece contribuir mais de uma foto, e cortar por pasta jogava fora
 * variedade real junto com a repetida.
 */
const DISTANCIA_DE_RAJADA = 30
/**
 * Teto de finalistas por pasta no estágio 1, para a visão receber fotos de
 * pastas DIFERENTES. Sem isto o LLM entrega 10 finalistas do mesmo ensaio e as
 * travas de variedade lá na frente transformam a rodada num destaque só.
 */
const MAX_FINALISTAS_POR_PASTA = 4

// ── Estágio 1: assunto, pela descrição ──────────────────────────────────────

const finalistasSchema = z.object({
  escolhidas: z
    .array(
      z.object({
        // TODO campo opcional + reconciliação: schema rígido faz o zod recusar
        // a resposta INTEIRA quando o modelo omite um campo — lição do crivo.
        indice: z.number().optional().describe('O número da foto na lista'),
        motivo: z.string().optional().describe('Por que ela mostra bem o assunto, em poucas palavras'),
      }),
    )
    .optional(),
})

/**
 * Amostra estratificada por PASTA — sem isso o LLM recebe 120 fotos da mesma
 * pasta e devolve 10 variações do mesmo prato, que é o oposto de prata da casa
 * (o rodízio precisa de fotos DIFERENTES para variar de verdade).
 */
function amostrar(candidatas: ImagemCatalogo[], teto: number): ImagemCatalogo[] {
  const porPasta = new Map<string, ImagemCatalogo[]>()
  for (const c of candidatas) {
    const chave = c.folder ?? ''
    const lista = porPasta.get(chave) ?? []
    lista.push(c)
    porPasta.set(chave, lista)
  }
  const pastas = [...porPasta.values()]
  const amostra: ImagemCatalogo[] = []
  let i = 0
  // Rodízio entre as pastas: pega uma de cada, depois a segunda de cada...
  while (amostra.length < teto && pastas.some((p) => i < p.length)) {
    for (const p of pastas) {
      if (amostra.length >= teto) break
      if (i < p.length) amostra.push(p[i])
    }
    i++
  }
  return amostra
}

async function escolherFinalistas(
  candidatas: ImagemCatalogo[],
  pilar: { nome: string; exemplos: string[] },
  cliente: string,
): Promise<ImagemCatalogo[]> {
  const amostra = amostrar(candidatas, AMOSTRA_MAX)
  const lista = amostra
    .map((c, i) => `${i}. [${c.folder ?? 'sem pasta'}] ${c.description ?? c.fileName ?? 'sem descrição'}`)
    .join('\n')

  try {
    const { object } = await generateObject({
      model: openai(MODELO),
      temperature: 0,
      maxOutputTokens: 900,
      abortSignal: AbortSignal.timeout(90_000),
      schema: finalistasSchema,
      prompt: [
        `Você organiza o acervo de fotos do restaurante "${cliente}".`,
        `Preciso das melhores fotos para o assunto "${pilar.nome}"${
          pilar.exemplos.length ? ` (o assunto cobre: ${pilar.exemplos.join(', ')})` : ''
        }.`,
        '',
        'Abaixo, fotos do acervo com a pasta e a descrição de cada uma.',
        `Escolha até ${FINALISTAS} que REALMENTE mostram esse assunto — a lista veio de um filtro por palavra e traz muita foto que só casou de raspão.`,
        '',
        'REGRAS:',
        '- Prefira a foto em que o assunto é o PROTAGONISTA, não um detalhe ao fundo.',
        '- VARIEDADE é obrigatória: não escolha várias fotos do mesmo prato, da mesma mesa ou do mesmo ângulo. Uma de cada situação.',
        '- ESPALHE entre as PASTAS: a pasta aparece entre colchetes. Escolher tudo de uma pasta só entrega um ensaio só, e o acervo tem mais.',
        '- Se a descrição não deixa claro que a foto mostra o assunto, não escolha.',
        '- Julgue só o ASSUNTO pela descrição. Não tente adivinhar se a foto é bonita ou bem tirada — outra etapa cuida disso.',
        `- Se menos de ${FINALISTAS} servem, devolva menos. Não complete a lista com foto duvidosa.`,
        '',
        'FOTOS:',
        lista,
      ].join('\n'),
    })

    const vistos = new Set<number>()
    const porPasta = new Map<string, number>()
    const escolhidas: ImagemCatalogo[] = []
    for (const e of object.escolhidas ?? []) {
      // Reconciliação: índice fora da faixa ou repetido é DESCARTADO, não
      // corrigido — o índice que o modelo declara não é confiável (lição do
      // crivo, onde a lista inteira voltou deslocada em uma posição).
      if (typeof e.indice !== 'number' || !Number.isInteger(e.indice)) continue
      if (e.indice < 0 || e.indice >= amostra.length || vistos.has(e.indice)) continue
      vistos.add(e.indice)
      const foto = amostra[e.indice]
      // Variedade de pasta já no estágio 1 — ver MAX_FINALISTAS_POR_PASTA.
      const pasta = foto.folder ?? ''
      const usadas = porPasta.get(pasta) ?? 0
      if (usadas >= MAX_FINALISTAS_POR_PASTA) continue
      porPasta.set(pasta, usadas + 1)
      escolhidas.push(foto)
    }
    return escolhidas.slice(0, FINALISTAS)
  } catch (erro) {
    console.warn(`    [estágio 1] falhou (${(erro as Error).message}) — caindo nas primeiras do acervo`)
    return amostra.slice(0, FINALISTAS)
  }
}

// ── Estágio 2: execução, por visão ──────────────────────────────────────────

const execucaoSchema = z.object({
  nitida: z.boolean().optional().describe('true se está em foco, sem tremido nem borrão'),
  bemExposta: z.boolean().optional().describe('true se não está escura demais nem estourada de luz'),
  assuntoClaro: z.boolean().optional().describe('true se dá para ver de imediato qual é o assunto'),
  areaCalmaParaTexto: z.boolean().optional().describe('true se existe região grande e uniforme onde caberia texto'),
  problema: z.string().optional().describe('O defeito de execução, se houver. Vazio se não houver.'),
})

interface Veredito {
  foto: ImagemCatalogo
  nota: number
  detalhe: string
  pulada: boolean
}

/** Miniatura de 400px — igual à catalogação: basta para julgar execução e não baixa megabytes. */
async function baixarMiniatura(fileId: string): Promise<Buffer> {
  const meta = await googleDriveService.getFileMetadata(fileId, 'thumbnailLink')
  const link = (meta as { thumbnailLink?: string }).thumbnailLink
  if (!link) throw new Error('sem thumbnail no Drive')
  const resposta = await fetch(link.replace(/=s\d+/, '=s400'))
  if (!resposta.ok) throw new Error(`thumbnail HTTP ${resposta.status}`)
  return Buffer.from(await resposta.arrayBuffer())
}

async function avaliarExecucao(foto: ImagemCatalogo): Promise<Veredito> {
  try {
    const imagem = await baixarMiniatura(foto.driveFileId)
    const { object } = await generateObject({
      model: openai(MODELO),
      temperature: 0,
      maxOutputTokens: 300,
      abortSignal: AbortSignal.timeout(60_000),
      schema: execucaoSchema,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: imagem },
            {
              type: 'text',
              text: [
                'Você organiza o acervo de fotos de um restaurante. Responda só sobre EXECUÇÃO desta foto, nunca sobre gosto.',
                '',
                'NÍTIDA: está em foco, sem tremido nem borrão de movimento no assunto principal?',
                'BEM EXPOSTA: dá para ver os detalhes, sem estar escura demais nem com áreas brancas estouradas?',
                'ASSUNTO CLARO: dá para dizer de imediato do que é a foto, ou é uma cena confusa e bagunçada?',
                'ÁREA CALMA PARA TEXTO: existe alguma região grande e razoavelmente uniforme (parede, céu, toalha, fundo desfocado) onde caberia um texto por cima?',
                '',
                'NÃO julgue gosto: estilo, cor, enquadramento, decoração e escolha de prato NÃO são defeito.',
                'Não invente defeito. Foto correta devolve tudo true e problema vazio.',
              ].join('\n'),
            },
          ],
        },
      ],
    })

    // Reconciliação: campo ausente conta como NÃO afirmado (não vira ponto).
    const pontos =
      (object.nitida === true ? 3 : 0) +
      (object.bemExposta === true ? 3 : 0) +
      (object.assuntoClaro === true ? 3 : 0) +
      (object.areaCalmaParaTexto === true ? 1 : 0)
    const faltando: string[] = []
    if (object.nitida !== true) faltando.push('nitidez')
    if (object.bemExposta !== true) faltando.push('exposição')
    if (object.assuntoClaro !== true) faltando.push('assunto claro')
    if (object.areaCalmaParaTexto !== true) faltando.push('área para texto')

    return {
      foto,
      nota: pontos,
      detalhe: faltando.length === 0 ? 'execução ok' : `sem: ${faltando.join(', ')}${object.problema ? ` — ${object.problema}` : ''}`,
      pulada: false,
    }
  } catch (erro) {
    /**
     * Visão fora do ar NUNCA derruba a curadoria — mesmo contrato do QA de
     * arte. A foto sai da disputa (nota 0) em vez de entrar sem conferência:
     * marcar destaque sem olhar é pior do que marcar menos.
     */
    return { foto, nota: 0, detalhe: `visão indisponível: ${(erro as Error).message}`, pulada: true }
  }
}

/**
 * 🔴 O que NÃO é fotografia do lugar real — e por isso nunca é prata da casa.
 *
 * Medido no dry-run de 30/08: entre as aprovadas vieram `Prancheta 1.png`
 * (Bacana) — "prancheta" é ARTBOARD, uma arte pronta exportada — e um arquivo
 * da pasta `IA` do Empório, que é CENA GERADA por IA (o destino documentado da
 * trilha `imagem` é `Fotos/IA_LAGOSTA`).
 *
 * As duas passam em QUALQUER pergunta de execução: são nítidas, bem expostas e
 * com assunto claríssimo. Nenhuma pergunta de visão pegaria — a diferença não
 * está nos pixels, está na PROCEDÊNCIA. Marcá-las faria o sistema preferir uma
 * arte já publicada (que voltaria como se fosse foto) e um lugar que não
 * existe, na hora de propor a foto de uma peça nova.
 *
 * Por isso a trava é de CÓDIGO e olha o caminho, não a imagem.
 */
const PASTAS_QUE_NAO_SAO_ACERVO = /(^|\/)(ia|ia_lagosta|artes?|posts?|stories|criativos?|templates?)(\/|$)/i
const NOMES_QUE_NAO_SAO_FOTO = /^(prancheta|arte|post|story|template|banner|logo)\b/i

function ehFotografiaDoLugar(foto: ImagemCatalogo): boolean {
  const pasta = foto.folder ?? ''
  const nome = foto.fileName ?? ''
  if (PASTAS_QUE_NAO_SAO_ACERVO.test(pasta)) return false
  if (NOMES_QUE_NAO_SAO_FOTO.test(nome)) return false
  // PNG em acervo de restaurante é, quase sempre, exportação de design — foto
  // de câmera sai em JPEG. Barato de excluir e caro de deixar passar.
  if (/\.png$/i.test(nome)) return false
  return true
}

/**
 * O "momento" de uma foto: pasta + prefixo do arquivo + número do quadro.
 * `Dia dos Pais-cmt07141.jpg` → { serie: 'Temáticos/Dia dos Pais|Dia dos Pais-cmt', quadro: 7141 }.
 * Sem número no nome, `quadro` é null e a foto nunca casa como rajada.
 */
function momentoDaFoto(foto: ImagemCatalogo): { serie: string; quadro: number | null } {
  const nome = (foto.fileName ?? '').replace(/\.[a-z0-9]+$/i, '')
  const casa = nome.match(/^(.*?)(\d+)$/)
  const pasta = foto.folder ?? ''
  if (!casa) return { serie: `${pasta}|${nome}`, quadro: null }
  return { serie: `${pasta}|${casa[1]}`, quadro: Number(casa[2]) }
}

/** Duas fotos são o mesmo momento quando são da mesma série e de quadros vizinhos. */
function mesmaRajada(a: ImagemCatalogo, b: ImagemCatalogo): boolean {
  const ma = momentoDaFoto(a)
  const mb = momentoDaFoto(b)
  if (ma.quadro === null || mb.quadro === null) return false
  if (ma.serie !== mb.serie) return false
  return Math.abs(ma.quadro - mb.quadro) <= DISTANCIA_DE_RAJADA
}

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = []
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))))
  }
  return saida
}

// ── Orquestração ────────────────────────────────────────────────────────────

interface Escolha {
  projectId: number
  cliente: string
  pilar: string
  foto: ImagemCatalogo
  nota: number
  detalhe: string
}

async function desfazer() {
  const alvo = await db.photoDestaque.findMany({
    where: { origem: ORIGEM, revogadoEm: null },
    select: { id: true, projectId: true },
  })
  if (alvo.length === 0) {
    console.log(`Nada a desfazer — nenhum destaque com origem "${ORIGEM}" ativo.`)
    return
  }
  const r = await db.photoDestaque.updateMany({
    where: { origem: ORIGEM, revogadoEm: null },
    data: { revogadoEm: new Date() },
  })
  console.log(`✓ ${r.count} destaque(s) de "${ORIGEM}" revogado(s). Nada apagado — o que gente marcou ficou intacto.`)
}

async function main() {
  const args = process.argv.slice(2)
  const confirmar = args.includes('--confirmar')
  if (args.includes('--desfazer')) {
    await desfazer()
    await db.$disconnect()
    return
  }
  const porPilar = Number(args[args.indexOf('--por-pilar') + 1]) || 4
  const soProjeto = args.includes('--projeto') ? Number(args[args.indexOf('--projeto') + 1]) : null
  /**
   * Abaixo de quantos destaques um pilar entra na curadoria.
   *
   * 1 (o padrão) = só pilar ZERADO, que é a lacuna gritante. Subir para 3
   * alcança o cliente de curadoria RASA — o Seu Quinto tem 1 destaque por
   * pilar num acervo de 1.668 fotos, e com uma foto só o rodízio não tem o
   * que alternar dentro do assunto.
   */
  const minimo = Number(args[args.indexOf('--minimo') + 1]) || 1

  const projetos = await db.project.findMany({
    where: {
      ...(soProjeto ? { id: soProjeto } : {}),
      OR: [{ googleDriveImagesFolderId: { not: null } }, { googleDriveFolderId: { not: null } }],
    },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  console.log(`CURADORIA DA PRATA DA CASA — ${confirmar ? 'GRAVANDO' : 'dry-run (nada será gravado)'}`)
  console.log(`Até ${porPilar} foto(s) por pilar sem destaque. Origem: "${ORIGEM}".\n`)

  const escolhas: Escolha[] = []

  for (const projeto of projetos) {
    const pilares = await db.contentPillar.findMany({
      where: { projectId: projeto.id, aprovado: true },
      select: { slug: true, nome: true, exemplos: true },
      orderBy: { ordem: 'asc' },
    })
    if (pilares.length === 0) continue

    /**
     * TODA linha da tabela entra no "já tem", inclusive a REVOGADA: revogação
     * é decisão humana de despromover, e ressemear por cima seria desfazê-la
     * em silêncio — mesma regra de `semear-destaques.ts`.
     */
    const jaTem = await db.photoDestaque.findMany({
      where: { projectId: projeto.id },
      select: { driveFileId: true, revogadoEm: true },
    })
    const ativas = new Set(jaTem.filter((d) => !d.revogadoEm).map((d) => d.driveFileId))
    const conhecidas = new Set(jaTem.map((d) => d.driveFileId))

    let todas: ImagemCatalogo[]
    try {
      todas = (await lerCatalogoDoProjeto(projeto.id)).todas
    } catch {
      continue
    }

    const buracos = pilares
      .map((pilar) => {
        const comoBusca: PilarParaBusca = { slug: pilar.slug, nome: pilar.nome, exemplos: pilar.exemplos }
        const palavras = palavrasDoTema(`${pilar.nome} ${pilar.slug}`, [comoBusca])
        const candidatas = todas.filter((i) => ehFotografiaDoLugar(i) && casaComTema(i, palavras).casa)
        const comDestaque = candidatas.filter((i) => ativas.has(i.driveFileId)).length
        return { pilar, candidatas, comDestaque }
      })
      // Pilar SEM candidata nenhuma não é curadoria, é câmera — ele sai na
      // pauta dos fotógrafos, não aqui (o caso "Rolha free" do TERO).
      .filter((b) => b.comDestaque < minimo && b.candidatas.length > 0)

    if (buracos.length === 0) continue

    console.log(`${projeto.name} (${projeto.id}) — ${buracos.length} pilar(es) sem destaque:`)

    for (const buraco of buracos) {
      const finalistas = await escolherFinalistas(
        buraco.candidatas.filter((c) => !conhecidas.has(c.driveFileId)),
        buraco.pilar,
        projeto.name,
      )
      if (finalistas.length === 0) {
        console.log(`  ${buraco.pilar.nome}: nenhuma finalista — pulado.`)
        continue
      }

      const vereditos = await emLotes(finalistas, CONCORRENCIA, avaliarExecucao)
      const md5Vistos = new Set<string>()
      const porPasta = new Map<string, number>()
      const jaEscolhidas: ImagemCatalogo[] = []
      const aprovadas = vereditos
        .filter((v) => !v.pulada && v.nota >= 9) // nítida + exposta + assunto claro
        .sort((a, b) => b.nota - a.nota)
        .filter((v) => {
          // Duplicata por conteúdo não é variedade: o rodízio "variaria" entre
          // duas cópias do mesmo arquivo.
          if (v.foto.md5) {
            if (md5Vistos.has(v.foto.md5)) return false
            md5Vistos.add(v.foto.md5)
          }
          // Nem quadro vizinho da mesma rajada — ver DISTANCIA_DE_RAJADA.
          if (jaEscolhidas.some((e) => mesmaRajada(e, v.foto))) return false
          const pasta = v.foto.folder ?? ''
          const usadas = porPasta.get(pasta) ?? 0
          if (usadas >= MAX_POR_PASTA) return false
          porPasta.set(pasta, usadas + 1)
          jaEscolhidas.push(v.foto)
          return true
        })
        .slice(0, porPilar)

      const puladas = vereditos.filter((v) => v.pulada).length
      console.log(
        `  ${buraco.pilar.nome}: ${buraco.candidatas.length} candidata(s) → ${finalistas.length} finalista(s) → ${aprovadas.length} aprovada(s)` +
          (puladas ? ` (${puladas} sem visão)` : ''),
      )
      for (const a of aprovadas) {
        console.log(`      ✓ ${a.foto.fileName} [${a.foto.folder ?? '—'}] nota ${a.nota}/10`)
        escolhas.push({
          projectId: projeto.id,
          cliente: projeto.name,
          pilar: buraco.pilar.nome,
          foto: a.foto,
          nota: a.nota,
          detalhe: a.detalhe,
        })
      }
      const reprovadas = vereditos.filter((v) => !v.pulada && v.nota < 9)
      for (const r of reprovadas.slice(0, 2)) {
        console.log(`      · fora: ${r.foto.fileName} — ${r.detalhe}`)
      }
    }
    console.log('')
  }

  // Uma foto pode servir a dois pilares — grava uma vez só.
  const porFoto = new Map<string, Escolha>()
  for (const e of escolhas) {
    const chave = `${e.projectId}:${e.foto.driveFileId}`
    if (!porFoto.has(chave)) porFoto.set(chave, e)
  }
  const unicas = [...porFoto.values()]

  console.log(`Total: ${unicas.length} foto(s) para destacar em ${new Set(unicas.map((e) => e.projectId)).size} cliente(s).`)

  if (!confirmar) {
    console.log('\nDry-run — nada gravado. Rode com --confirmar para gravar.')
    await db.$disconnect()
    return
  }

  let gravadas = 0
  for (const e of unicas) {
    try {
      await db.photoDestaque.create({
        data: { projectId: e.projectId, driveFileId: e.foto.driveFileId, origem: ORIGEM, decididoPor: null },
      })
      gravadas++
    } catch {
      // Corrida com marcação humana: a chave única segura, e quem chegou
      // primeiro fica.
    }
  }
  console.log(`\n✓ ${gravadas} destaque(s) gravado(s) com origem "${ORIGEM}".`)
  console.log('  Para desfazer tudo: npx tsx scripts/curar-destaques.ts --desfazer')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
