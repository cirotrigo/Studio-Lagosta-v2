/**
 * Prova o compositor montando peças com os ARRANJOS de páginas de assinatura
 * que ainda estão em espera — sem gravar nada (`provar: true`, só renderiza).
 *
 * Nasceu com os modelos recriados no editor (Quintal e TERO, 11/09/2026):
 * grupos com elementos (ícones, filete, losangos, a logo ao lado do serviço),
 * manchete com segunda voz, serviço em várias linhas. É o que se roda antes de
 * mover páginas para o template "Assinatura", onde a usina de produção passa a
 * usá-las.
 *
 * Cada página vira duas peças, com a copy QUE ELA MESMA traz (nada inventado):
 * a completa, e uma enxuta — só a manchete e o serviço — que prova que os
 * elementos do texto ausente somem junto. E toda peça é CONFERIDA: cada linha
 * da copy precisa estar numa camada de texto da peça, senão sai "FALTOU".
 * O formato da peça é o que a página declara (nome, tags ou tamanho), então
 * página de feed prova peça de feed.
 *
 *   npx tsx scripts/provar-combinacoes-no-compositor.ts --projeto 3 [--saida <pasta>] [--so <trecho do nome>]
 *
 * Sem `--paginas`, usa as páginas do template com a tag `modelos-da-marca` do
 * projeto; com `--paginas id1,id2`, só essas; com `--assinatura`, as do template
 * "Assinatura" (as que a usina lê).
 *
 * `--comparar` põe o MODELO renderizado como está no editor ao lado da peça
 * composta com a mesma copy e a mesma foto, e imprime, papel a papel, onde o
 * texto está e com que corpo e cor nos dois. É a conferência depois de a equipe
 * ajustar um modelo: a peça tem de seguir o ajuste.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { db } from '@/lib/db'
import { formatoDaPagina, NOME_DO_TEMPLATE_DE_ASSINATURA } from '@/lib/compositor/assinatura'
import { comporPeca } from '@/lib/compositor/compor'
import { copyDosPapeisComDestaque, fotoDaPagina } from '@/lib/compositor/defasagem'
import { semColchetes } from '@/lib/compositor/destaques'
import { papelDoNome } from '@/lib/compositor/papel-do-nome'
import { PAPEIS, type SpecDePeca } from '@/lib/compositor/spec'
import type { Layer } from '@/types/template'

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

interface Caso {
  nome: string
  pagina: string
  completa: boolean
  spec: SpecDePeca
}

interface PaginaDaProva {
  id: string
  name: string
  layers: unknown
  tags: string[]
  width: number
  height: number
  background: string | null
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
}

const normalizar = (texto: string) => texto.replace(/\s+/g, ' ').trim().toLowerCase()

/** As duas peças de uma página: a copy completa dela e a enxuta. */
function casosDaPagina(projectId: number, pagina: PaginaDaProva): Caso[] {
  const copy = copyDosPapeisComDestaque(pagina.layers)
  const foto = fotoDaPagina(pagina.layers)
  if (!copy) return []
  const linhas = (texto: string | undefined) => (texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const manchete = [...linhas(copy.headline), ...linhas(copy.headline2)]
  if (manchete.length === 0) return []
  const completa: SpecDePeca['blocos'] = PAPEIS.flatMap((papel) => {
    const texto = papel === 'headline' ? manchete : linhas(copy[papel])
    return texto.length > 0 ? [{ papel, linhas: texto.slice(0, 6) }] : []
  })
  const servico = linhas(copy.servico)
  const enxuta: SpecDePeca['blocos'] = [
    { papel: 'headline', linhas: manchete.slice(0, 6) },
    ...(servico.length > 0 ? [{ papel: 'servico' as const, linhas: servico.slice(0, 6) }] : []),
  ]
  const formato = formatoDaPagina(pagina) ?? 'story'
  const base = { projectId, formato, ...(foto ? { foto: { url: foto } } : {}) }
  const nome = `${slug(pagina.name.replace(/^Modelo\s*·\s*/, ''))}${formato === 'story' ? '' : `-${formato}`}`
  const casos: Caso[] = [{ nome, pagina: pagina.id, completa: true, spec: { ...base, blocos: completa, nome: pagina.name } }]
  // A enxuta só existe quando tira alguma coisa da completa
  if (enxuta.length < completa.length) casos.push({ nome: `${nome}-enxuta`, pagina: pagina.id, completa: false, spec: { ...base, blocos: enxuta, nome: `${pagina.name} (enxuta)` } })
  return casos
}

function camadasDaPagina(layers: unknown): Layer[] {
  let v: unknown = layers
  for (let i = 0; i < 2 && typeof v === 'string'; i++) v = JSON.parse(v)
  return Array.isArray(v) ? (v as Layer[]) : []
}

const papelDe = (l: Layer): string | null =>
  (l.metadata as { compositor?: { papel?: string } } | undefined)?.compositor?.papel ?? papelDoNome(l.name) ?? papelDoNome(l.id)

/** Os textos com papel, de cima para baixo: onde estão, com que corpo e cor. */
function textosPorPapel(camadas: Layer[]): Array<{ papel: string; y: number; x: number; corpo: number; cor: string }> {
  return camadas
    .filter((l) => (l.type === 'text' || l.type === 'rich-text') && l.visible !== false && papelDe(l))
    .map((l) => ({
      papel: papelDe(l)!,
      y: Math.round(l.position?.y ?? 0),
      x: Math.round(l.position?.x ?? 0),
      corpo: Math.round(Number(l.style?.fontSize ?? 0) * 10) / 10,
      cor: String(l.style?.color ?? ''),
    }))
    .sort((a, b) => a.y - b.y)
}

function tabelaDeComparacao(modelo: Layer[], peca: Layer[]): string[] {
  const doModelo = textosPorPapel(modelo)
  const daPeca = textosPorPapel(peca)
  const papeis = [...new Set([...doModelo, ...daPeca].map((t) => t.papel))]
  const linhas: string[] = []
  for (const papel of papeis) {
    const m = doModelo.filter((t) => t.papel === papel)
    const p = daPeca.filter((t) => t.papel === papel)
    for (let i = 0; i < Math.max(m.length, p.length); i++) {
      const fmt = (t?: { y: number; x: number; corpo: number; cor: string }) => (t ? `y=${t.y} x=${t.x} corpo=${t.corpo} ${t.cor}` : '—')
      const dy = m[i] && p[i] ? ` · Δy=${p[i].y - m[i].y} Δcorpo=${Math.round((p[i].corpo - m[i].corpo) * 10) / 10}` : ''
      linhas.push(`    ${papel.padEnd(9)} modelo ${fmt(m[i]).padEnd(38)} peça ${fmt(p[i])}${dy}`)
    }
  }
  return linhas
}

async function main() {
  const projectId = Number(argumento('--projeto') ?? 2)
  const saida = argumento('--saida') ?? path.join(process.cwd(), '.tmp-provas-combinacoes', String(projectId))
  const so = argumento('--so')
  const ids = argumento('--paginas')?.split(',').filter(Boolean) ?? null
  // `--assinatura`: as páginas que a usina de produção lê hoje (template "Assinatura")
  const daAssinatura = process.argv.includes('--assinatura')
  const comparar = process.argv.includes('--comparar')
  await fs.mkdir(saida, { recursive: true })

  const paginas = await db.page.findMany({
    where: ids
      ? { id: { in: ids }, Template: { projectId } }
      : daAssinatura
        ? { Template: { projectId, name: NOME_DO_TEMPLATE_DE_ASSINATURA } }
        : { Template: { projectId, tags: { has: 'modelos-da-marca' } } },
    select: { id: true, name: true, layers: true, tags: true, width: true, height: true, background: true },
    orderBy: { order: 'asc' },
  })
  const todos = paginas.flatMap((p) => casosDaPagina(projectId, p))
  // Variantes com o mesmo nome ("Assinatura — story" duplicada no editor) não podem sobrescrever o PNG uma da outra
  const repetidos = new Set(todos.filter((c) => todos.some((d) => d.nome === c.nome && d.pagina !== c.pagina)).map((c) => c.nome))
  const casos = todos
    .map((c) => (repetidos.has(c.nome) ? { ...c, nome: `${c.nome}-${c.pagina.slice(0, 6)}` } : c))
    // Na comparação só a completa tem par: a enxuta não tem modelo igual a ela
    .filter((c) => (!so || c.nome.includes(so)) && (!comparar || c.completa))
  console.log(`${paginas.length} página(s), ${casos.length} peça(s)${comparar ? ' comparadas ao modelo' : ''}`)

  if (comparar) {
    const { registerProjectFonts } = await import('@/lib/posts/register-project-fonts')
    await registerProjectFonts(projectId)
  }

  const arquivos: string[] = []
  let comFalta = 0
  for (const caso of casos) {
    try {
      const r = await comporPeca(caso.spec, { provar: true, paginasDeAssinatura: [caso.pagina] })
      const arquivo = path.join(saida, `${caso.nome}.png`)
      await fs.writeFile(arquivo, r.prova!)
      if (comparar) {
        const pagina = paginas.find((p) => p.id === caso.pagina)!
        const camadas = camadasDaPagina(pagina.layers)
        const { CanvasRenderer } = await import('@/lib/canvas-renderer')
        const png = await new CanvasRenderer(pagina.width, pagina.height).renderDesign(
          { canvas: { width: pagina.width, height: pagina.height, backgroundColor: pagina.background ?? '#000000' }, layers: camadas },
          {},
        )
        const doModelo = path.join(saida, `${caso.nome}-modelo.png`)
        await fs.writeFile(doModelo, png)
        arquivos.push(doModelo)
      }
      arquivos.push(arquivo)
      const d = r.diagnostico
      const elementos = r.layers.filter((l) => (l.metadata as { compositor?: { elementoDe?: string } } | undefined)?.compositor?.elementoDe)
      // Cada linha da copy precisa estar numa camada de texto visível da peça
      const escritas = r.layers
        .filter((l) => (l.type === 'text' || l.type === 'rich-text') && l.visible !== false)
        .flatMap((l) => String(l.content ?? '').split('\n'))
        .map(normalizar)
      const faltou = caso.spec.blocos
        .flatMap((b) => b.linhas.map((linha) => ({ papel: b.papel, linha: semColchetes(linha) })))
        .filter(({ linha }) => !escritas.some((escrita) => escrita.includes(normalizar(linha))))
      if (faltou.length > 0) comFalta++
      console.log(`\n${faltou.length > 0 ? '✗' : '✓'} ${caso.nome}`)
      console.log(`  copy: ${caso.spec.blocos.map((b) => `${b.papel}(${b.linhas.length})`).join(' ')}`)
      console.log(`  texto: ${faltou.length === 0 ? 'completo' : `FALTOU ${faltou.map((f) => `${f.papel} "${f.linha}"`).join(', ')}`}`)
      console.log(`  arranjos: ${(d.arranjos ?? []).map((a) => `${a.grupo} (${a.motivo})`).join(' | ')}`)
      console.log(`  posição: ${d.posicao.ancora}/${d.posicao.alinha} · logo: ${d.logo ? d.logo.canto : 'no arranjo ou nenhuma'} · elementos: ${elementos.length}`)
      if (d.avisos.length > 0) console.log(`  avisos: ${d.avisos.join(' · ')}`)
      if (comparar) {
        const pagina = paginas.find((p) => p.id === caso.pagina)!
        console.log('  modelo × peça, por papel:')
        for (const linha of tabelaDeComparacao(camadasDaPagina(pagina.layers), r.layers)) console.log(linha)
      }
    } catch (erro) {
      comFalta++
      console.log(`\n✗ ${caso.nome}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  if (arquivos.length > 0) {
    const largura = 270
    const altura = 480
    // Na comparação cada linha da folha tem pares modelo | peça
    const porLinha = comparar ? 6 : 8
    const vao = (i: number) => (comparar ? Math.floor(i / 2) * 18 : 0)
    const linhasDaFolha = Math.ceil(arquivos.length / porLinha)
    // `contain`: a peça de feed entra inteira na célula de story, sem esticar
    const miniaturas = await Promise.all(arquivos.map((a) => sharp(a).resize(largura, altura, { fit: 'contain', background: '#222222' }).png().toBuffer()))
    const colunas = Math.min(porLinha, arquivos.length)
    const folha = await sharp({
      create: { width: (largura + 12) * colunas + 12 + vao(colunas - 1), height: (altura + 12) * linhasDaFolha + 12, channels: 3, background: '#222222' },
    })
      .composite(miniaturas.map((input, i) => ({ input, left: 12 + (i % porLinha) * (largura + 12) + vao(i % porLinha), top: 12 + Math.floor(i / porLinha) * (altura + 12) })))
      .png()
      .toFile(path.join(saida, 'folha.png'))
    console.log(`\nFolha: ${path.join(saida, 'folha.png')} (${folha.width}x${folha.height})${comparar ? ' · em cada par, o modelo à esquerda e a peça à direita' : ''}`)
  }
  console.log(`\n${casos.length - comFalta} de ${casos.length} peça(s) com o texto completo.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
