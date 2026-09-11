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
 * a completa, e uma enxuta — só a manchete e a primeira linha do serviço — que
 * prova que os elementos de texto ausente somem junto.
 *
 *   npx tsx scripts/provar-combinacoes-no-compositor.ts --projeto 3 [--saida <pasta>] [--so <trecho do nome>]
 *
 * Sem `--paginas`, usa as páginas do template com a tag `modelos-da-marca` do
 * projeto; com `--paginas id1,id2`, só essas.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import { db } from '@/lib/db'
import { comporPeca } from '@/lib/compositor/compor'
import { copyDosPapeisComDestaque, fotoDaPagina } from '@/lib/compositor/defasagem'
import { PAPEIS, type SpecDePeca } from '@/lib/compositor/spec'

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

interface Caso {
  nome: string
  pagina: string
  spec: SpecDePeca
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

/** As duas peças de uma página: a copy completa dela e a enxuta. */
function casosDaPagina(projectId: number, pagina: { id: string; name: string; layers: unknown }): Caso[] {
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
    ...(servico.length > 0 ? [{ papel: 'servico' as const, linhas: servico.slice(0, 1) }] : []),
  ]
  const base = { projectId, formato: 'story' as const, ...(foto ? { foto: { url: foto } } : {}) }
  const nome = slug(pagina.name.replace(/^Modelo\s*·\s*/, ''))
  return [
    { nome: `${nome}`, pagina: pagina.id, spec: { ...base, blocos: completa, nome: pagina.name } },
    { nome: `${nome}-enxuta`, pagina: pagina.id, spec: { ...base, blocos: enxuta, nome: `${pagina.name} (enxuta)` } },
  ]
}

async function main() {
  const projectId = Number(argumento('--projeto') ?? 2)
  const saida = argumento('--saida') ?? path.join(process.cwd(), '.tmp-provas-combinacoes', String(projectId))
  const so = argumento('--so')
  const ids = argumento('--paginas')?.split(',').filter(Boolean) ?? null
  await fs.mkdir(saida, { recursive: true })

  const paginas = await db.page.findMany({
    where: ids ? { id: { in: ids }, Template: { projectId } } : { Template: { projectId, tags: { has: 'modelos-da-marca' } } },
    select: { id: true, name: true, layers: true },
    orderBy: { order: 'asc' },
  })
  const casos = paginas.flatMap((p) => casosDaPagina(projectId, p)).filter((c) => !so || c.nome.includes(so))
  console.log(`${paginas.length} página(s), ${casos.length} peça(s)`)

  const arquivos: string[] = []
  for (const caso of casos) {
    try {
      const r = await comporPeca(caso.spec, { provar: true, paginasDeAssinatura: [caso.pagina] })
      const arquivo = path.join(saida, `${caso.nome}.png`)
      await fs.writeFile(arquivo, r.prova!)
      arquivos.push(arquivo)
      const d = r.diagnostico
      const elementos = r.layers.filter((l) => (l.metadata as { compositor?: { elementoDe?: string } } | undefined)?.compositor?.elementoDe)
      console.log(`\n✓ ${caso.nome}`)
      console.log(`  copy: ${caso.spec.blocos.map((b) => `${b.papel}(${b.linhas.length})`).join(' ')}`)
      console.log(`  arranjos: ${(d.arranjos ?? []).map((a) => `${a.grupo} (${a.motivo})`).join(' | ')}`)
      console.log(`  posição: ${d.posicao.ancora}/${d.posicao.alinha} · logo: ${d.logo ? d.logo.canto : 'no arranjo ou nenhuma'} · elementos: ${elementos.length}`)
      if (d.avisos.length > 0) console.log(`  avisos: ${d.avisos.join(' · ')}`)
    } catch (erro) {
      console.log(`\n✗ ${caso.nome}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  if (arquivos.length > 0) {
    const largura = 270
    const altura = 480
    const porLinha = 8
    const linhasDaFolha = Math.ceil(arquivos.length / porLinha)
    const miniaturas = await Promise.all(arquivos.map((a) => sharp(a).resize(largura, altura).png().toBuffer()))
    const folha = await sharp({
      create: { width: (largura + 12) * Math.min(porLinha, arquivos.length) + 12, height: (altura + 12) * linhasDaFolha + 12, channels: 3, background: '#222222' },
    })
      .composite(miniaturas.map((input, i) => ({ input, left: 12 + (i % porLinha) * (largura + 12), top: 12 + Math.floor(i / porLinha) * (altura + 12) })))
      .png()
      .toFile(path.join(saida, 'folha.png'))
    console.log(`\nFolha: ${path.join(saida, 'folha.png')} (${folha.width}x${folha.height}) — ${arquivos.map((a) => path.basename(a, '.png')).join(', ')}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
