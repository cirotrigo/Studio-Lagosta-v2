/**
 * Relatório de LACUNAS do acervo, por cliente — o brief do fotógrafo.
 *
 * F5.1 de docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md: "temas onde toda
 * proposta foi trocada/expirou; pilares sem nenhum destaque; % do acervo nunca
 * proposto. Vira o brief do fotógrafo — o gargalo vira entregável para o
 * cliente." O relatório NÃO julga se a foto não existe ou se o ranking não a
 * acha — lista os números e deixa a conclusão para quem conhece o acervo.
 *
 * O que sai, por projeto com pasta de imagens:
 *
 *  1. TEMAS REJEITADOS EM PESO — temas de busca (`sugerido.criterios.theme`
 *     dos sinais `tipo: 'foto'`) com 2+ sinais FECHADOS e NENHUM
 *     `aceita-como-veio`: toda proposta foi trocada ou expirou.
 *  2. PILARES APROVADOS SEM DESTAQUE — as palavras de cada `ContentPillar`
 *     aprovado (nome + slug + exemplos, via `palavrasDoTema`) casadas contra
 *     as fotos DESTAQUE (`PhotoDestaque` ativa × catálogo). Pilar sem nenhuma
 *     destacada que case = lacuna de curadoria. Enquanto a tabela estiver
 *     vazia (a semente ainda não foi confirmada), o relatório diz isso em vez
 *     de listar todo pilar como lacuna.
 *  3. % DO ACERVO NUNCA PROPOSTO — driveFileIds distintos vistos em
 *     `sugerido.propostas` × total do catálogo. Honestidade: a proposta
 *     registrada guarda só o top-10 de cada busca, então o rótulo certo é
 *     "nunca apareceu no top-10 registrado" — não "nunca foi visto".
 *
 * REGRAS DA CASA respeitadas aqui:
 *  - SOMENTE LEITURA — nenhuma escrita no banco, nenhuma no Drive.
 *  - 🔴 NUNCA chama `buscarNoAcervo` (ela REGISTRA um sinal por busca — mesma
 *    armadilha de `validar-cadencia-f2.ts`): o catálogo é lido direto, pelo
 *    mesmo caminho de `acervo.ts` (findFileInFolder + readFileAsJson).
 *  - Json (`sugerido`, `escolhido`) é lido LINHA A LINHA em código, nunca por
 *    filtro de path no SQL — linha sem o campo sumiria do resultado.
 *
 * USO (na raiz do repo — o `.env` de produção é carregado pelo dotenv)
 *   npx tsx scripts/relatorio-lacunas-do-acervo.ts          # relatório legível
 *   npx tsx scripts/relatorio-lacunas-do-acervo.ts --json   # a mesma medição em JSON
 */
import 'dotenv/config'
import { db } from '../src/lib/db'
import { googleDriveService } from '../src/server/google-drive-service'
import {
  casaComTema,
  palavrasDoTema,
  type PilarParaBusca,
} from '../src/lib/creatives/ranquear-acervo'
import { normalizar } from '../src/lib/posts/dia-semana'

const emJson = process.argv.includes('--json')

const CATALOG_FILE = '_image-catalog.json'

/** Mínimo de sinais fechados para um tema entrar na lista de rejeitados. */
const MINIMO_FECHADOS = 2

// ── Formas dos dados ───────────────────────────────────────────────────────

/** Só o que o relatório usa do `_image-catalog.json` (forma de `acervo.ts`). */
interface ImagemCatalogo {
  driveFileId: string
  fileName?: string
  folder?: string
  tags?: string[]
  bestFor?: string[]
}

interface Catalogo {
  lastUpdated?: string
  regeneradoEm?: string
  images?: ImagemCatalogo[]
}

/** Forma do `sugerido` que `buscarNoAcervo` grava (ver `acervo.ts`). */
interface PropostaDeFoto {
  criterios?: { theme?: string | null }
  propostas?: Array<{ driveFileId?: unknown }>
}

interface SinalDeFoto {
  projectId: number
  sugerido: unknown
  desfecho: string | null
}

interface TemaRejeitado {
  tema: string
  fechadas: number
  trocadas: number
  expiradas: number
  /** Fechadas que não são aceita/trocada/expirada (ex.: descartada). */
  outrasFechadas: number
  pendentes: number
}

interface PilarMedido {
  slug: string
  nome: string
  destacadasQueCasam: number
  lacuna: boolean
}

interface RelatorioDoProjeto {
  projectId: number
  cliente: string
  catalogo:
    | { status: 'ok'; total: number; atualizadoEm: string | null }
    | { status: 'sem-pasta' | 'sem-catalogo' | 'vazio' | 'erro'; detalhe?: string }
  buscasRegistradas: number
  temasRejeitados: TemaRejeitado[]
  /** Temas de busca distintos vistos nos sinais (com tema preenchido). */
  temasBuscados: number
  pilares: {
    aprovados: number
    destacadasAtivas: number
    /** Destacadas cujo id não está (mais) no catálogo — não têm como casar. */
    destacadasForaDoCatalogo: number
    medidos: PilarMedido[]
    /** true quando não há nenhuma destacada — a medição não se aplica. */
    semDestaques: boolean
  } | null
  cobertura: {
    totalCatalogo: number
    /** Distintos do catálogo que já apareceram em algum top-10 registrado. */
    propostasNoTop10: number
    nuncaPropostas: number
    pctNuncaPropostas: number | null
  } | null
}

// ── Miúdos ─────────────────────────────────────────────────────────────────

function pct(numerador: number, denominador: number): number | null {
  if (denominador === 0) return null
  return Math.round((numerador / denominador) * 1000) / 10
}

function fmtPct(valor: number | null): string {
  return valor === null ? '—' : `${valor.toFixed(1)}%`
}

function temaDe(sugerido: unknown): string | null {
  const t = (sugerido as PropostaDeFoto | null)?.criterios?.theme
  return typeof t === 'string' && t.trim() ? t.trim() : null
}

function idsPropostos(sugerido: unknown): string[] {
  const p = (sugerido as PropostaDeFoto | null)?.propostas
  if (!Array.isArray(p)) return []
  return p
    .map((x) => (x && typeof x === 'object' ? x.driveFileId : null))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

// ── Item 1: temas rejeitados em peso ───────────────────────────────────────

function temasRejeitadosDoProjeto(sinais: SinalDeFoto[]): {
  rejeitados: TemaRejeitado[]
  temasBuscados: number
} {
  interface Balde {
    exibicao: string
    fechadas: number
    aceitas: number
    trocadas: number
    expiradas: number
    outrasFechadas: number
    pendentes: number
  }
  const porTema = new Map<string, Balde>()

  for (const sinal of sinais) {
    const tema = temaDe(sinal.sugerido)
    if (!tema) continue
    const chave = normalizar(tema)
    let balde = porTema.get(chave)
    if (!balde) {
      balde = { exibicao: tema, fechadas: 0, aceitas: 0, trocadas: 0, expiradas: 0, outrasFechadas: 0, pendentes: 0 }
      porTema.set(chave, balde)
    }
    if (sinal.desfecho === null) {
      balde.pendentes++
      continue
    }
    balde.fechadas++
    if (sinal.desfecho === 'aceita-como-veio') balde.aceitas++
    else if (sinal.desfecho === 'trocada') balde.trocadas++
    else if (sinal.desfecho === 'expirada') balde.expiradas++
    else balde.outrasFechadas++
  }

  const rejeitados = [...porTema.values()]
    .filter((b) => b.fechadas >= MINIMO_FECHADOS && b.aceitas === 0)
    .sort((a, b) => b.fechadas - a.fechadas || a.exibicao.localeCompare(b.exibicao))
    .map((b) => ({
      tema: b.exibicao,
      fechadas: b.fechadas,
      trocadas: b.trocadas,
      expiradas: b.expiradas,
      outrasFechadas: b.outrasFechadas,
      pendentes: b.pendentes,
    }))

  return { rejeitados, temasBuscados: porTema.size }
}

// ── Item 2: pilares aprovados × fotos destacadas ───────────────────────────

function medirPilares(
  pilares: PilarParaBusca[],
  destacadas: ImagemCatalogo[],
): PilarMedido[] {
  return pilares.map((pilar) => {
    // As palavras do PILAR: nome + slug como tema (o slug pode divergir do
    // nome), e o próprio pilar como expansão — é o que puxa os `exemplos`
    // ("picanha na brasa", "costela") para dentro do casamento.
    const palavras = palavrasDoTema(`${pilar.nome} ${pilar.slug.split('-').join(' ')}`, [pilar])
    const destacadasQueCasam = destacadas.filter((foto) => casaComTema(foto, palavras).casa).length
    return {
      slug: pilar.slug,
      nome: pilar.nome,
      destacadasQueCasam,
      lacuna: destacadasQueCasam === 0,
    }
  })
}

// ── Item 3: cobertura do top-10 registrado ─────────────────────────────────

function coberturaDoTop10(
  catalogo: ImagemCatalogo[],
  sinais: SinalDeFoto[],
): NonNullable<RelatorioDoProjeto['cobertura']> {
  const propostos = new Set<string>()
  for (const sinal of sinais) for (const id of idsPropostos(sinal.sugerido)) propostos.add(id)

  let propostasNoTop10 = 0
  for (const img of catalogo) if (propostos.has(img.driveFileId)) propostasNoTop10++
  const nuncaPropostas = catalogo.length - propostasNoTop10

  return {
    totalCatalogo: catalogo.length,
    propostasNoTop10,
    nuncaPropostas,
    pctNuncaPropostas: pct(nuncaPropostas, catalogo.length),
  }
}

// ── Leitura do catálogo (mesmo caminho de acervo.ts, SEM registrar nada) ───

async function lerCatalogo(
  folderId: string,
): Promise<RelatorioDoProjeto['catalogo'] & { imagens?: ImagemCatalogo[] }> {
  try {
    const catalogId = await googleDriveService.findFileInFolder(folderId, CATALOG_FILE)
    if (!catalogId) return { status: 'sem-catalogo' }

    const catalogo = await googleDriveService.readFileAsJson<Catalogo>(catalogId)
    const imagens = (catalogo.images ?? []).filter(
      (i): i is ImagemCatalogo => !!i && typeof i.driveFileId === 'string' && i.driveFileId.length > 0,
    )
    // Catálogo VAZIO ≠ catálogo nenhum, mas para este relatório os dois
    // significam o mesmo: não há acervo catalogado para medir.
    if (imagens.length === 0) return { status: 'vazio' }

    return {
      status: 'ok',
      total: imagens.length,
      atualizadoEm: catalogo.lastUpdated ?? catalogo.regeneradoEm ?? null,
      imagens,
    }
  } catch (error) {
    return { status: 'erro', detalhe: error instanceof Error ? error.message : String(error) }
  }
}

// ── Relatório ──────────────────────────────────────────────────────────────

async function main() {
  // Projetos com pasta de imagens — o mesmo `?? ` de `pastaDeImagens`.
  const projetos = await db.project.findMany({
    where: {
      OR: [{ googleDriveImagesFolderId: { not: null } }, { googleDriveFolderId: { not: null } }],
    },
    select: { id: true, name: true, googleDriveImagesFolderId: true, googleDriveFolderId: true },
    orderBy: { id: 'asc' },
  })

  // Os insumos de banco saem em TRÊS findMany e são agregados em código.
  const [sinais, pilaresAprovados, destaquesAtivos] = await Promise.all([
    db.learningSignal.findMany({
      where: { tipo: 'foto' },
      select: { projectId: true, sugerido: true, desfecho: true },
    }),
    db.contentPillar.findMany({
      where: { aprovado: true },
      select: { projectId: true, slug: true, nome: true, exemplos: true },
      orderBy: [{ projectId: 'asc' }, { ordem: 'asc' }],
    }),
    db.photoDestaque.findMany({
      where: { revogadoEm: null },
      select: { projectId: true, driveFileId: true },
    }),
  ])

  const sinaisPorProjeto = new Map<number, SinalDeFoto[]>()
  for (const s of sinais) {
    const lista = sinaisPorProjeto.get(s.projectId) ?? []
    lista.push(s)
    sinaisPorProjeto.set(s.projectId, lista)
  }
  const pilaresPorProjeto = new Map<number, PilarParaBusca[]>()
  for (const p of pilaresAprovados) {
    const lista = pilaresPorProjeto.get(p.projectId) ?? []
    lista.push({ slug: p.slug, nome: p.nome, exemplos: p.exemplos ?? [] })
    pilaresPorProjeto.set(p.projectId, lista)
  }
  const destaquesPorProjeto = new Map<number, Set<string>>()
  for (const d of destaquesAtivos) {
    const set = destaquesPorProjeto.get(d.projectId) ?? new Set<string>()
    set.add(d.driveFileId)
    destaquesPorProjeto.set(d.projectId, set)
  }

  const relatorios: RelatorioDoProjeto[] = []

  for (const projeto of projetos) {
    const cliente = projeto.name ?? `projeto ${projeto.id}`
    const sinaisDoProjeto = sinaisPorProjeto.get(projeto.id) ?? []
    const { rejeitados, temasBuscados } = temasRejeitadosDoProjeto(sinaisDoProjeto)

    const base: RelatorioDoProjeto = {
      projectId: projeto.id,
      cliente,
      catalogo: { status: 'sem-pasta' },
      buscasRegistradas: sinaisDoProjeto.length,
      temasRejeitados: rejeitados,
      temasBuscados,
      pilares: null,
      cobertura: null,
    }

    const folderId = projeto.googleDriveImagesFolderId ?? projeto.googleDriveFolderId
    if (!folderId) {
      relatorios.push(base)
      continue
    }

    const catalogo = await lerCatalogo(folderId)
    const { imagens, ...statusDoCatalogo } = catalogo
    base.catalogo = statusDoCatalogo as RelatorioDoProjeto['catalogo']

    // Sem catálogo legível, os itens 2 e 3 não têm o que medir — a linha
    // honesta sai na impressão. (Item 1 fica: os sinais existem por si.)
    if (!imagens) {
      relatorios.push(base)
      continue
    }

    const pilares = pilaresPorProjeto.get(projeto.id) ?? []
    const destaqueIds = destaquesPorProjeto.get(projeto.id) ?? new Set<string>()
    const porId = new Map(imagens.map((i) => [i.driveFileId, i]))
    const destacadasNoCatalogo = [...destaqueIds]
      .map((id) => porId.get(id))
      .filter((i): i is ImagemCatalogo => !!i)

    base.pilares = {
      aprovados: pilares.length,
      destacadasAtivas: destaqueIds.size,
      destacadasForaDoCatalogo: destaqueIds.size - destacadasNoCatalogo.length,
      medidos: destaqueIds.size > 0 ? medirPilares(pilares, destacadasNoCatalogo) : [],
      semDestaques: destaqueIds.size === 0,
    }
    base.cobertura = coberturaDoTop10(imagens, sinaisDoProjeto)

    relatorios.push(base)
  }

  if (emJson) {
    console.log(JSON.stringify({ geradoEm: new Date().toISOString(), projetos: relatorios }, null, 2))
    return
  }

  imprimir(relatorios)
}

// ── Saída humana ───────────────────────────────────────────────────────────

function imprimir(relatorios: RelatorioDoProjeto[]) {
  console.log('LACUNAS DO ACERVO — insumo do brief do fotógrafo')
  console.log('(o relatório não julga: onde toda proposta foi trocada, ou o acervo')
  console.log(' não tem a foto boa, ou o ranking não a acha — os números ficam, a')
  console.log(' conclusão é de quem conhece o acervo)')

  for (const r of relatorios) {
    console.log(`\n${'═'.repeat(64)}`)
    console.log(`${r.cliente} (projeto ${r.projectId})`)

    // Estado do catálogo
    if (r.catalogo.status === 'ok') {
      const quando = r.catalogo.atualizadoEm ? ` — atualizado em ${r.catalogo.atualizadoEm.slice(0, 10)}` : ''
      console.log(`Catálogo: ${r.catalogo.total} fotos${quando}`)
    } else {
      const motivo: Record<string, string> = {
        'sem-pasta': 'projeto sem pasta de imagens no Drive',
        'sem-catalogo': 'sem catálogo de imagens (a análise nunca rodou aqui)',
        vazio: 'catálogo VAZIO (a análise falhou inteira — mesmo caso de 10/08)',
        erro: `erro ao ler o catálogo${'detalhe' in r.catalogo && r.catalogo.detalhe ? `: ${r.catalogo.detalhe}` : ''}`,
      }
      console.log(`Catálogo: ${motivo[r.catalogo.status]} — pulado (só o item 1 sai, se houver sinal).`)
    }

    // 1. Temas rejeitados em peso
    console.log(`\n1) Temas rejeitados em peso (2+ buscas fechadas, nenhuma aceita):`)
    if (r.buscasRegistradas === 0) {
      console.log('   — nenhuma busca com registro de aprendizado ainda (a captura nasceu em 11/08).')
    } else if (r.temasRejeitados.length === 0) {
      console.log(`   — nenhum (${r.temasBuscados} tema(s) distintos buscados, ${r.buscasRegistradas} buscas registradas).`)
    } else {
      for (const t of r.temasRejeitados) {
        const partes = [`${t.trocadas} trocada(s)`, `${t.expiradas} expirada(s)`]
        if (t.outrasFechadas > 0) partes.push(`${t.outrasFechadas} outra(s)`)
        if (t.pendentes > 0) partes.push(`${t.pendentes} pendente(s), fora da conta`)
        console.log(`   • "${t.tema}" — ${t.fechadas} busca(s) fechada(s): ${partes.join(', ')}`)
      }
    }

    // 2. Pilares aprovados sem destaque
    console.log(`\n2) Pilares aprovados × fotos destacadas:`)
    if (!r.pilares) {
      console.log('   — sem catálogo legível, o cruzamento não tem o que medir.')
    } else if (r.pilares.aprovados === 0) {
      console.log('   — este projeto não tem pilar aprovado (taxonomia ainda não existe aqui).')
    } else if (r.pilares.semDestaques) {
      console.log(`   — nenhuma foto destacada ainda — rode scripts/semear-destaques.ts (e confirme)`)
      console.log(`     para a curadoria nascer dos dados. Sem destaque, os ${r.pilares.aprovados} pilares`)
      console.log('     aprovados ficariam TODOS como lacuna, o que não diria nada.')
    } else {
      const lacunas = r.pilares.medidos.filter((p) => p.lacuna)
      const cobertos = r.pilares.medidos.filter((p) => !p.lacuna)
      console.log(`   ${r.pilares.destacadasAtivas} destacada(s) ativa(s); ${cobertos.length}/${r.pilares.aprovados} pilar(es) com destaque que casa.`)
      if (r.pilares.destacadasForaDoCatalogo > 0) {
        console.log(`   (${r.pilares.destacadasForaDoCatalogo} destacada(s) não estão mais no catálogo — não têm como casar.)`)
      }
      if (lacunas.length === 0) {
        console.log('   — nenhuma lacuna: todo pilar tem ao menos uma destacada no assunto.')
      } else {
        for (const p of lacunas) {
          console.log(`   • LACUNA DE CURADORIA: "${p.nome}" (${p.slug}) — nenhuma destacada casa com o tema.`)
        }
        for (const p of cobertos) {
          console.log(`     ok: "${p.nome}" — ${p.destacadasQueCasam} destacada(s).`)
        }
      }
    }

    // 3. Cobertura do top-10 registrado
    console.log(`\n3) Acervo nunca proposto:`)
    if (!r.cobertura) {
      console.log('   — sem catálogo legível, não há denominador.')
    } else if (r.buscasRegistradas === 0) {
      console.log(`   — sem busca registrada, 100% do acervo (${r.cobertura.totalCatalogo} fotos) nunca apareceu`)
      console.log('     no top-10 registrado. O número só passa a dizer algo quando houver buscas.')
    } else {
      console.log(
        `   ${r.cobertura.nuncaPropostas} de ${r.cobertura.totalCatalogo} fotos (${fmtPct(r.cobertura.pctNuncaPropostas)}) nunca apareceram no top-10 registrado`,
      )
      console.log(
        `   das buscas (${r.buscasRegistradas} busca(s) desde 11/08). É o que o dado permite afirmar —`,
      )
      console.log('   a foto pode ter sido vista por pasta, fora do registro.')
    }
  }

  console.log(`\n${'═'.repeat(64)}`)
  console.log('Fim. Somente leitura — nada foi gravado.')
}

main()
  .catch((error) => {
    console.error('Falha no relatório:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
