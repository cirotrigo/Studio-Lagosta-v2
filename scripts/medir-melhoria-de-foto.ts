/**
 * A bancada da MELHORIA DE FOTO (17/11/2026, seção 9 do
 * `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`): para cada arte e cada
 * receita, UMA opção gerada pelo mesmo código da fila (`prepararMelhoriaDeFoto`
 * e `gerarFotoDaOpcao`, de `melhoria-de-foto-runner.ts`) e a prévia renderizada
 * com a foto trocada.
 *
 * Por caso grava a leitura e o prompt do diretor de foto, os avisos das
 * conferências, a área que mudou, o descarte (se houve), o tempo e os tokens.
 * E monta a folha de contato, uma linha por arte: origem | uma prévia por receita.
 *
 * Não escreve no banco, não sobe arquivo (nem Blob, nem Drive) e não registra
 * uso: a foto nova fica em disco e a prévia é renderizada a partir dela. O
 * custo é a fatura das APIs: uma imagem por caso e receita (US$ 0,05 no Nano
 * Banana 2.1 em 2K), mais o diretor de foto e a conferência por visão.
 *
 * 🔴 Roda contra o banco de DESENVOLVIMENTO. Sem o runner `dev-db.ts` o
 * `DATABASE_URL` é o do `.env` (produção) e o script se recusa.
 * 🔴 A saída fica FORA do repositório (ele é público e a folha mostra arte de
 * cliente): por padrão em `~/Documents/Clientes/_medicoes/2026-11-melhorar-foto/`.
 *
 * Uso:
 *   npx tsx scripts/dev-db.ts npx tsx scripts/medir-melhoria-de-foto.ts --casos=casos.json               # lista, não gera
 *   npx tsx scripts/dev-db.ts npx tsx scripts/medir-melhoria-de-foto.ts --casos=casos.json --confirmar
 *   ... --confirmar --so=byrock                              # uma arte só
 *   ... --confirmar --receitas=humanizar,foto-profissional   # só algumas receitas
 *   ... --saida=/outro/lugar
 *   ... --folha=/outro/lugar/folha-2.jpg                     # outra rodada sem apagar a folha anterior
 *
 * `casos.json`: [{ "nome": "byrock", "projectId": 7, "generationId": "cm..." }]
 * A arte precisa ter página própria com foto (compositor, modelo aplicado, ajuste).
 */
import 'dotenv/config'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { computeDe } from '../src/lib/compute-do-banco'
import { IDS_DAS_RECEITAS, RECEITAS_DE_FOTO, type IdDaReceita, type ReceitaPedida } from '../src/lib/ai/receitas-de-foto'

interface Caso {
  nome: string
  projectId: number
  generationId: string
}

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
}

const SAIDA = arg('saida') ?? path.join(os.homedir(), 'Documents', 'Clientes', '_medicoes', '2026-11-melhorar-foto')
const FOLHA = arg('folha') ?? path.join(SAIDA, 'folha.jpg')

/** O `DATABASE_URL` em uso é o do `.env`? Então é produção, e a medição não roda. */
function recusarProducao(): void {
  const linha = readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))
  const producao = linha ? computeDe(linha.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')) : null
  const emUso = computeDe(process.env.DATABASE_URL ?? '')
  if (!emUso || emUso === producao) {
    console.error('✗ Este script roda contra o banco de DESENVOLVIMENTO: npx tsx scripts/dev-db.ts npx tsx scripts/medir-melhoria-de-foto.ts …')
    process.exit(1)
  }
  if ([SAIDA, FOLHA].some((caminho) => path.resolve(caminho).startsWith(path.resolve(process.cwd()) + path.sep))) {
    console.error('✗ A saída não pode ficar dentro do repositório (ele é público e a folha mostra arte de cliente). Use --saida= com uma pasta de fora.')
    process.exit(1)
  }
  console.log(`banco: ${emUso} (desenvolvimento) · saída: ${SAIDA}`)
}

/** O que foi medido, em duas linhas curtas para a folha: o tratamento e o assunto. */
function notasDasMedidas(r: Record<string, unknown>): string[] {
  const m = (r.medidas ?? {}) as { tom?: number; nitidezDoAssunto?: number | null; nitidezDoFundo?: number; escalaDoAssunto?: number; dx?: number; dy?: number; correlacao?: number }
  const tratamento = [`tom ${m.tom ?? r.tom ?? '-'}`]
  if (m.nitidezDoAssunto != null) tratamento.push(`nitidez assunto x${m.nitidezDoAssunto}`)
  if (m.nitidezDoFundo != null) tratamento.push(`fundo x${m.nitidezDoFundo}`)
  const assunto =
    m.escalaDoAssunto != null
      ? `assunto: ${Math.round(m.escalaDoAssunto * 100)}% do tamanho, andou ${Math.round(Math.abs(m.dx ?? 0) * 100)}% / ${Math.round(Math.abs(m.dy ?? 0) * 100)}% (corr ${m.correlacao})`
      : 'assunto: sem caixa para medir'
  return [tratamento.join(' · '), assunto]
}

/** Altura da legenda de cada célula: o título e até três linhas de medida. */
const FAIXA = 104

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Uma célula da folha: a imagem com uma faixa de legenda em cima. */
async function celula(imagem: Buffer | null, titulo: string, notas: string | string[], largura: number, altura: number): Promise<Buffer> {
  const linhas = (Array.isArray(notas) ? notas : [notas]).slice(0, 3)
  const faixa = FAIXA
  const corpo = imagem
    ? await sharp(imagem).resize(largura, altura, { fit: 'contain', background: '#111111' }).toBuffer()
    : await sharp({ create: { width: largura, height: altura, channels: 3, background: '#2a1515' } }).png().toBuffer()
  const legenda = Buffer.from(
    `<svg width="${largura}" height="${faixa}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/>` +
      `<text x="10" y="26" font-family="Helvetica, Arial" font-size="20" font-weight="700" fill="#fff">${escapar(titulo)}</text>` +
      linhas.map((nota, i) => `<text x="10" y="${50 + i * 20}" font-family="Helvetica, Arial" font-size="14" fill="#f5c26b">${escapar(nota.slice(0, Math.floor(largura / 7.2)))}</text>`).join('') +
      '</svg>',
  )
  return sharp({ create: { width: largura, height: altura + faixa, channels: 3, background: '#111111' } })
    .composite([
      { input: legenda, left: 0, top: 0 },
      { input: corpo, left: 0, top: faixa },
    ])
    .jpeg({ quality: 88 })
    .toBuffer()
}

async function main() {
  recusarProducao()
  const arquivoDeCasos = arg('casos')
  if (!arquivoDeCasos || !existsSync(arquivoDeCasos)) throw new Error('--casos=<arquivo.json> é obrigatório')
  const so = arg('so')
  const casos = (JSON.parse(readFileSync(arquivoDeCasos, 'utf8')) as Caso[]).filter((c) => !so || c.nome === so)
  const ids = (arg('receitas')?.split(',') ?? ['humanizar', 'foto-profissional', 'abrir-espaco']) as IdDaReceita[]
  for (const id of ids) if (!IDS_DAS_RECEITAS.includes(id)) throw new Error(`receita desconhecida: ${id}`)

  // Só depois da guarda: `@/lib/db` abre a conexão no import.
  const { db } = await import('../src/lib/db')
  const { prepararMelhoriaDeFoto, gerarFotoDaOpcao, renderizarPrevia } = await import('../src/lib/ai/melhoria-de-foto-runner')
  const { pageIdDaArte, camadasComFotoTrocada, rotaDaMelhoriaDeFoto } = await import('../src/lib/ai/quadro-da-foto')
  const { fetchImageSource } = await import('../src/lib/ai/fetch-image-source')

  try {
    const prontos: Array<{ caso: Caso; origem: { id: string; resultUrl: string; fieldValues: unknown; projectName: string | null }; pageId: string }> = []
    for (const caso of casos) {
      const origem = await db.generation.findFirst({ where: { id: caso.generationId, projectId: caso.projectId }, select: { id: true, resultUrl: true, fieldValues: true, projectName: true } })
      const pageId = origem ? pageIdDaArte(origem.fieldValues) : null
      const pagina = pageId ? await db.page.findFirst({ where: { id: pageId, Template: { projectId: caso.projectId } }, select: { isTemplate: true, layers: true } }) : null
      const rota = origem ? rotaDaMelhoriaDeFoto(origem, pagina) : null
      console.log(`${caso.nome}: ${origem ? `${origem.projectName} · ${origem.id}` : 'NÃO ENCONTRADA'} · ${rota?.via === 'pagina' ? `página ${pageId}` : `fora da bancada (${rota && rota.via === 'reserva' ? rota.motivo : 'sem arte'})`}`)
      if (origem?.resultUrl && pageId && rota?.via === 'pagina') prontos.push({ caso, origem: { ...origem, resultUrl: origem.resultUrl }, pageId })
    }
    console.log(`${prontos.length} arte(s) × ${ids.length} receita(s) = ${prontos.length * ids.length} imagem(ns), perto de US$ ${(prontos.length * ids.length * 0.08).toFixed(2)}`)
    if (!process.argv.includes('--confirmar')) return console.log('(sem --confirmar: só listei)')

    mkdirSync(SAIDA, { recursive: true })
    // Rodada parcial (`--so`, `--receitas`) atualiza o que rodou e mantém o resto: a tabela é da bancada inteira.
    const arquivoDeResultados = path.join(SAIDA, 'resultados.json')
    const resultados: Array<Record<string, unknown>> = existsSync(arquivoDeResultados) ? JSON.parse(readFileSync(arquivoDeResultados, 'utf8')) : []
    const guardar = (r: Record<string, unknown>) => {
      const i = resultados.findIndex((x) => x.caso === r.caso && x.receita === r.receita)
      if (i === -1) resultados.push(r)
      else resultados[i] = r
    }
    const ALTURA = 760

    for (const { caso, origem, pageId } of prontos) {
      const arte = (await fetchImageSource(origem.resultUrl)).buffer
      writeFileSync(path.join(SAIDA, `${caso.nome}-origem.jpg`), await sharp(arte).jpeg({ quality: 92 }).toBuffer())

      // As receitas de uma arte em paralelo; uma arte por vez.
      const feitas = await Promise.all(
        ids.map(async (id) => {
          const receitas: ReceitaPedida[] = [{ id }]
          const t0 = Date.now()
          try {
            const preparo = await prepararMelhoriaDeFoto({
              projectId: caso.projectId,
              projectName: origem.projectName ?? caso.nome,
              pageId,
              arteUrl: origem.resultUrl,
              originalGenerationId: origem.id,
              receitas,
              pedido: '',
              promptPronto: null,
            })
            const g = await gerarFotoDaOpcao(preparo, receitas, () => 240_000)
            writeFileSync(path.join(SAIDA, `${caso.nome}-quadro.jpg`), preparo.quadro.buffer)
            // Página editada depois da arte: o "antes" da folha é a página de hoje.
            if (preparo.antes) writeFileSync(path.join(SAIDA, `${caso.nome}-antes.jpg`), await sharp(preparo.antes).jpeg({ quality: 92 }).toBuffer())
            // A descartada fica em disco para calibrar o limiar (não entra na folha como opção).
            if (g.fotoDescartada) writeFileSync(path.join(SAIDA, `${caso.nome}-${id}-descartada.jpg`), g.fotoDescartada)
            let previa: Buffer | null = null
            if (g.foto) {
              const arquivoDaFoto = path.join(SAIDA, `${caso.nome}-${id}-foto.jpg`)
              writeFileSync(arquivoDaFoto, g.foto)
              // A prévia sai da foto em disco: nada sobe para lugar nenhum.
              previa = await sharp(await renderizarPrevia(preparo.pagina, camadasComFotoTrocada(preparo.pagina.layers, preparo.foto.camadaId, arquivoDaFoto), caso.projectId))
                .jpeg({ quality: 92 })
                .toBuffer()
              writeFileSync(path.join(SAIDA, `${caso.nome}-${id}-previa.jpg`), previa)
            }
            return {
              id,
              previa,
              registro: {
                caso: caso.nome,
                receita: id,
                desfecho: g.foto ? 'opção' : (g.descartada ?? 'sem foto'),
                areaAlterada: g.areaAlterada ?? null,
                tom: g.tom ?? null,
                medidas: g.medidas ?? null,
                assunto: preparo.assunto,
                genteNaFoto: preparo.genteNaFoto,
                avisos: g.avisos.map((a) => `${a.destaque ? '[DESTAQUE] ' : ''}[${a.tipo}] ${a.texto}`),
                leitura: preparo.leitura,
                planejador: preparo.infoDoPrompt.planejador,
                rostoEmFoco: preparo.rostoEmFoco,
                quadro: `${preparo.quadro.width}x${preparo.quadro.height}`,
                proporcao: preparo.proporcao,
                segundosDaGeracao: g.segundos,
                segundosNoTotal: Math.round((Date.now() - t0) / 1000),
                tokens: g.tokens ?? null,
                prompt: preparo.prompt,
              },
            }
          } catch (erro) {
            return { id, previa: null, registro: { caso: caso.nome, receita: id, desfecho: `erro: ${erro instanceof Error ? erro.message : String(erro)}` } }
          }
        }),
      )
      for (const f of feitas) {
        const r = f.registro as Record<string, unknown>
        guardar(r)
        console.log(`  ${caso.nome} · ${f.id}: ${r.desfecho}${r.areaAlterada != null ? ` · mudou ${Math.round(Number(r.areaAlterada) * 100)}% · tom ${r.tom ?? '-'}` : ''} · ${r.segundosNoTotal ?? '-'}s`)
      }
      writeFileSync(arquivoDeResultados, JSON.stringify(resultados, null, 2))
    }

    // A folha sai do que está em disco, da bancada inteira: rodada parcial não apaga as outras linhas.
    const todos = JSON.parse(readFileSync(arquivoDeCasos, 'utf8')) as Caso[]
    const receitasDaFolha = [...new Set(resultados.map((r) => String(r.receita)))] as IdDaReceita[]
    const linhasDaFolha: Buffer[] = []
    for (const caso of todos) {
      const arquivo = (sufixo: string) => path.join(SAIDA, `${caso.nome}-${sufixo}.jpg`)
      // Página editada depois da arte: o "antes" é a página de hoje, o par certo da prévia.
      const antes = existsSync(arquivo('antes')) ? arquivo('antes') : existsSync(arquivo('origem')) ? arquivo('origem') : null
      if (!antes) continue
      const metaDoAntes = await sharp(antes).metadata()
      const largura = Math.round((ALTURA * (metaDoAntes.width ?? 1080)) / (metaDoAntes.height ?? 1920))
      const celulas: Buffer[] = [await celula(readFileSync(antes), `${caso.nome} · antes`, antes.endsWith('-antes.jpg') ? 'a página como está hoje (editada depois da arte)' : 'a arte de origem', largura, ALTURA)]
      for (const id of receitasDaFolha) {
        const r = resultados.find((x) => x.caso === caso.nome && x.receita === id)
        if (!r) continue
        const previa = existsSync(arquivo(`${id}-previa`)) && r.desfecho === 'opção' ? readFileSync(arquivo(`${id}-previa`)) : null
        const conferencias = ((r.avisos as string[] | undefined) ?? []).filter((a) => !a.startsWith('[risco]')).length
        const notas = previa ? [`elemento novo em ${Math.round(Number(r.areaAlterada ?? 0) * 100)}% do quadro · ${conferencias} aviso(s) de conferência`, ...notasDasMedidas(r)] : [String(r.desfecho), ...notasDasMedidas(r)]
        celulas.push(await celula(previa, RECEITAS_DE_FOTO[id].rotulo, notas, largura, ALTURA))
      }
      const metas = await Promise.all(celulas.map((c) => sharp(c).metadata()))
      let x = 0
      const composicao = celulas.map((c, i) => {
        const item = { input: c, left: x, top: 0 }
        x += (metas[i].width ?? largura) + 8
        return item
      })
      linhasDaFolha.push(await sharp({ create: { width: x, height: ALTURA + FAIXA, channels: 3, background: '#000000' } }).composite(composicao).jpeg({ quality: 88 }).toBuffer())
    }

    if (linhasDaFolha.length > 0) {
      const metas = await Promise.all(linhasDaFolha.map((l) => sharp(l).metadata()))
      const W = Math.max(...metas.map((m) => m.width ?? 0))
      let y = 0
      const composicao = linhasDaFolha.map((l, i) => {
        const item = { input: l, left: 0, top: y }
        y += (metas[i].height ?? 0) + 12
        return item
      })
      await sharp({ create: { width: W, height: y, channels: 3, background: '#000000' } }).composite(composicao).jpeg({ quality: 86 }).toFile(FOLHA)
    }
    const tabela = ['| arte | receita | desfecho | elemento novo | tom | nitidez do assunto | nitidez do fundo | tamanho do assunto | andou (x / y) | avisos de conferência | s |', '|---|---|---|---|---|---|---|---|---|---|---|']
    for (const r of resultados) {
      const avisos = ((r.avisos as string[] | undefined) ?? []).filter((a) => !a.startsWith('[risco]'))
      const m = (r.medidas ?? {}) as { nitidezDoAssunto?: number | null; nitidezDoFundo?: number; escalaDoAssunto?: number; dx?: number; dy?: number }
      const pct = (n: number | undefined) => (n == null ? '-' : `${Math.round(n * 100)}%`)
      tabela.push(
        `| ${r.caso} | ${r.receita} | ${r.desfecho} | ${pct(r.areaAlterada as number | undefined)} | ${r.tom ?? '-'} | ${m.nitidezDoAssunto ?? '-'} | ${m.nitidezDoFundo ?? '-'} | ${pct(m.escalaDoAssunto)} | ${m.dx == null ? '-' : `${pct(m.dx)} / ${pct(m.dy)}`} | ${avisos.join(' / ') || '-'} | ${r.segundosNoTotal ?? '-'} |`,
      )
    }
    writeFileSync(path.join(SAIDA, 'tabela.md'), `${tabela.join('\n')}\n`)
    console.log(`\nfolha: ${FOLHA}\n${tabela.join('\n')}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((erro) => {
  console.error('ERRO:', erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
