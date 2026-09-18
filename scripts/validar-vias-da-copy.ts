/**
 * Prova de integração do PR 5 de "Marca simples, copy melhor" (F1, as vias
 * consomem o contrato), no BRANCH DE DEV do Neon.
 *
 * O que ela prova, com dados criados e apagados por ela (só ESTA rodada, no
 * projeto da prova):
 *  1. via de MODELO: o contrato casa com os campos por PAPEL (posição só em
 *     campo sem papel; bloco sem campo declarado em `semCampo`), a arte grava
 *     `Page.copyAutoral` (efetiva) e `fieldValues.copyAutoral` (original +
 *     efetiva, comparável por CAMADAS), as camadas saem carimbadas com papel e
 *     bloco, e a releitura da página é estável;
 *  2. via de IA: `startArtGeneration` com contrato deriva a copy dele
 *     (quebra do autor preservada), grava original × enviada com a lacuna das
 *     camadas declarada (comparável por VISÃO só depois da conferência), e
 *     recusa `copy` divergente e contrato inválido ANTES de gravar. A geração
 *     NÃO é enfileirada (não gasta o modelo de imagem): a Generation
 *     PROCESSING é apagada no cleanup.
 *
 * USO: npx tsx scripts/validar-vias-da-copy.ts [--saida <pasta>]
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const DB_KEYS = ['DATABASE_URL', 'DIRECT_URL'] as const
function parseEnvFile(caminho: string): Record<string, string> {
  if (!existsSync(caminho)) return {}
  const out: Record<string, string> = {}
  for (const linhaCrua of readFileSync(caminho, 'utf8').split('\n')) {
    const linha = linhaCrua.trim()
    if (!linha || linha.startsWith('#')) continue
    const m = linha.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}
function endpointDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}
function abortar(titulo: string, linhas: string[] = []): never {
  console.error(`\n✗ ${titulo}\n`)
  for (const l of linhas) console.error(`  ${l}`)
  process.exit(1)
}
function apontarParaODev(): string {
  const prod = parseEnvFile(resolve(ROOT, '.env'))
  const dev = parseEnvFile(resolve(ROOT, '.env.development.local'))
  if (!existsSync(resolve(ROOT, '.env'))) abortar('não há .env aqui para dizer qual compute é PRODUÇÃO.')
  if (!dev.DATABASE_URL) abortar('.env.development.local não define DATABASE_URL.', ['Rode  npm run db:dev:setup  antes.'])
  for (const [k, v] of Object.entries(prod)) if (!(k in process.env)) process.env[k] = v
  for (const k of DB_KEYS) if (dev[k]) process.env[k] = dev[k]
  const alvo = endpointDe(process.env.DATABASE_URL)
  const producao = new Set(DB_KEYS.map((k) => endpointDe(prod[k])).filter((e): e is string => e !== null))
  if (producao.size === 0) abortar('o .env não tem DATABASE_URL/DIRECT_URL reconhecível: não dá para saber qual compute é PRODUÇÃO.')
  if (!alvo || producao.has(alvo)) abortar('O banco resolvido é o de PRODUÇÃO.', [`DATABASE_URL aponta para ${alvo ?? '(ilegível)'}.`])
  return alvo
}
const ENDPOINT = apontarParaODev()
function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}
const PROJETO = 8
const SAIDA = argumento('--saida') ?? '.tmp-validar-vias-da-copy'
const MARCA = `[PR5-VIAS ${new Date().toISOString()}]`
let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (condicao) ok++
  else mau++
}

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { createArteRapida } = await import('../src/lib/creatives/arte-rapida')
  const { mapearContratoParaCampos } = await import('../src/lib/planos/execucao')
  const { camposDeTextoDaPagina } = await import('../src/lib/planos/executar-plano')
  const { startArtGeneration } = await import('../src/lib/ai/creative-generation-service')
  const { lerCopyAutoral, copyEfetivaDasCamadas, VERSAO_DO_CONTRATO, LACUNA_SEM_CAMADAS, LACUNA_PROMPT_AINDA_NAO_MONTADO } = await import('../src/lib/copy-autoral')
  const { copyDaArte } = await import('../src/lib/mcp/catalogo/ver-geracao-retorno')
  const { lerCamadas } = await import('../src/lib/posts/page-layers')
  const { del } = await import('@vercel/blob')
  type CopyAutoral = import('../src/lib/copy-autoral').CopyAutoral
  type Layer = import('../src/types/template').Layer

  const blobs = new Set<string>()
  const pages: string[] = []
  const gens: string[] = []
  const limpeza: Array<() => Promise<void>> = []
  const naoAvaliado: string[] = []
  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, userId: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)
  const dono = await db.user.findUniqueOrThrow({ where: { id: projeto.userId }, select: { id: true, clerkId: true } })

  const camada = (id: string, nome: string, conteudo: string, y: number, fontSize: number, ordem: number) => ({
    id,
    type: 'text',
    name: nome,
    visible: true,
    locked: false,
    order: ordem,
    content: conteudo,
    position: { x: 120, y },
    size: { width: 840, height: Math.round(fontSize * 1.2 * 2) },
    style: { fontSize, fontFamily: 'Montserrat', fontWeight: 700, fontStyle: 'normal', color: '#ffffff', textAlign: 'left', lineHeight: 1.2 },
    textboxConfig: { autoWrap: { lineHeight: 1.2 }, autoExpand: true },
  })

  try {
    console.log('1) via de MODELO: casamento por PAPEL, arte com original × efetiva, camadas carimbadas')
    // Modelo de teste com campos NOMEADOS pelo papel (como a equipe nomeia), um
    // campo sem papel reconhecível e nenhum campo de pré-título.
    const template = await db.template.create({
      data: { name: `${MARCA} modelo de teste`, type: 'STORY', dimensions: '1080x1920', projectId: PROJETO, createdBy: dono.id, designData: {} as never, dynamicFields: [] as never, tags: ['prova'] },
    })
    limpeza.push(async () => { await db.template.deleteMany({ where: { id: template.id } }) })
    const modelo = await db.page.create({
      data: {
        name: `${MARCA} página-modelo`, width: 1080, height: 1920, isTemplate: true, templateId: template.id, background: '#101010', tags: ['prova'],
        layers: [
          camada('titulo-1', 'Título', 'TÍTULO DO MODELO', 700, 88, 1),
          camada('chamada-1', 'Chamada', 'chamada do modelo', 1000, 48, 2),
          camada('texto-3', 'Texto 3', 'texto sem papel', 1150, 40, 3),
          camada('horario-1', 'Horário', 'Seg a sex · 9h às 18h', 1500, 36, 4),
        ] as never,
      },
      select: { id: true },
    })
    pages.push(modelo.id)
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'claude', em: new Date().toISOString(), superficie: 'chat' },
      blocos: [
        { id: 'pre', funcao: 'pre', ordem: 0, linhas: ['Só hoje'] },
        { id: 'headline', funcao: 'headline', ordem: 1, linhas: ['Milk-shake', 'em [dobro]'] },
        { id: 'apoio', funcao: 'apoio', ordem: 2, linhas: ['Peça criada pela prova de integração.'] },
        { id: 'cta', funcao: 'cta', ordem: 3, linhas: ['Vem pra cá'] },
        { id: 'servico', funcao: 'servico', ordem: 4, linhas: ['Ter a dom · 11h às 23h'] },
      ],
      revisoes: [],
    }
    const campos = await camposDeTextoDaPagina(modelo.id)
    const mapa = mapearContratoParaCampos(campos, contrato)
    const por = Object.fromEntries(mapa.vinculos.map((v) => [v.blocoId, `${v.layerId}:${v.por}`]))
    conferir('manchete, chamada e horário casam pelo PAPEL do nome do campo', por.headline === 'titulo-1:papel' && por.cta === 'chamada-1:papel' && por.servico === 'horario-1:papel', JSON.stringify(por))
    // Dois blocos sem campo do papel (pre e apoio) e UMA vaga sem papel: o
    // primeiro na ordem de leitura a toma (declarado como posição); o outro
    // fica em semCampo, com aviso — nunca some em silêncio.
    conferir('o pré-título (primeiro sem campo, na ordem de leitura) vai para o campo SEM papel, declarado como posição', por.pre === 'texto-3:posicao', String(por.pre))
    conferir('o apoio não tem campo nem vaga: fica em semCampo, com aviso (nunca some em silêncio)', mapa.semCampo.length === 1 && mapa.semCampo[0] === 'apoio' && mapa.avisos.some((a) => a.includes('Peça criada')), JSON.stringify(mapa.semCampo))
    conferir('o slot leva o conteúdo SEM colchetes, com a quebra do autor, e o bloco/papel de origem', (mapa.slotValues['titulo-1'] as { content: string; bloco: string; papel?: string })?.content === 'Milk-shake\nem dobro' && (mapa.slotValues['titulo-1'] as { bloco: string }).bloco === 'headline', JSON.stringify(mapa.slotValues['titulo-1']))

    const arte = await createArteRapida({
      projectId: PROJETO,
      sourcePageId: modelo.id,
      slotValues: { ...mapa.slotValues, ...Object.fromEntries(mapa.ocultar.map((id) => [id, { hidden: true }])) },
      copyAutoral: contrato,
      name: `${MARCA} arte de modelo`,
      canal: 'claude-code',
      decididoPor: dono.id,
      createdBy: dono.id,
      layoutFixo: true,
    })
    pages.push(arte.pageId)
    gens.push(arte.generationId)
    blobs.add(arte.url)
    const pagina = await db.page.findUniqueOrThrow({ where: { id: arte.pageId }, select: { copyAutoral: true, layers: true, thumbnail: true } })
    if (typeof pagina.thumbnail === 'string' && pagina.thumbnail.startsWith('http')) blobs.add(pagina.thumbnail)
    const gen = await db.generation.findUniqueOrThrow({ where: { id: arte.generationId }, select: { fieldValues: true } })
    const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
    const registro = (fv.copyAutoral ?? null) as Record<string, unknown> | null
    const efetivaDaPagina = lerCopyAutoral(pagina.copyAutoral).copy
    conferir('a Generation guarda o ORIGINAL do autor, byte a byte', JSON.stringify(lerCopyAutoral(registro?.original).copy) === JSON.stringify(contrato), registro ? Object.keys(registro).join(',') : 'sem registro')
    conferir('a página guarda a EFETIVA (contrato válido, revisão do sistema pelo que o modelo desenhou)', !!efetivaDaPagina && efetivaDaPagina.revisoes.some((r) => r.autor === 'sistema'), efetivaDaPagina ? `${efetivaDaPagina.revisoes.length} revisão(ões)` : 'ilegível')
    const copyLida = copyDaArte(fv)
    conferir('ver-geracao: comparável por CAMADAS; cta e serviço desenhados como escritos; manchete com o destaque não desenhado em blocosDiferentes; o apoio não desenhado em lacuna', !!copyLida && copyLida.comparavel && copyLida.comparadoPor === 'camadas' && JSON.stringify(copyLida.desenhada.find((b) => b.id === 'cta')?.linhas) === JSON.stringify(['Vem pra cá']) && JSON.stringify(copyLida.desenhada.find((b) => b.id === 'servico')?.linhas) === JSON.stringify(['Ter a dom · 11h às 23h']) && copyLida.blocosDiferentes.includes('headline') && copyLida.lacunas.some((l) => l.includes('"apoio"')), JSON.stringify({ comparavel: copyLida?.comparavel, por: copyLida?.comparadoPor, diferentes: copyLida?.blocosDiferentes, lacunas: copyLida?.lacunas }).slice(0, 220))
    const camadas = lerCamadas(pagina.layers).camadas as unknown as Layer[]
    const carimbo = (id: string) => (camadas.find((c) => String(c.id) === id)?.metadata as { compositor?: { papel?: string; bloco?: string } } | undefined)?.compositor
    conferir('as camadas saem CARIMBADAS com papel e bloco (é o que a releitura usa com id UUID)', carimbo('titulo-1')?.bloco === 'headline' && carimbo('titulo-1')?.papel === 'headline' && carimbo('texto-3')?.bloco === 'pre' && carimbo('texto-3')?.papel === 'pre', JSON.stringify({ titulo: carimbo('titulo-1'), texto3: carimbo('texto-3') }))
    const releitura = efetivaDaPagina ? copyEfetivaDasCamadas(efetivaDaPagina, camadas, { superficie: 'editor' }) : null
    conferir('reler a página com a efetiva gravada não muda nada (autosave idêntico não vira revisão)', !!releitura && releitura.mudancas.length === 0, releitura ? JSON.stringify(releitura.mudancas.map((m) => m.id)) : '—')

    console.log('2) via de IA: contrato deriva a copy, grava original × enviada com a lacuna das camadas, recusa divergência')
    const saldoAntes = await db.creditBalance.findUnique({ where: { userId: dono.id }, select: { creditsRemaining: true } })
    if (saldoAntes && saldoAntes.creditsRemaining < 50) {
      await db.creditBalance.update({ where: { userId: dono.id }, data: { creditsRemaining: 50 } })
      limpeza.push(async () => { await db.creditBalance.update({ where: { userId: dono.id }, data: { creditsRemaining: saldoAntes.creditsRemaining } }) })
      console.log(`  saldo de dev elevado de ${saldoAntes.creditsRemaining} para 50 (será restaurado)`)
    }
    // Sem o pré-título; a ORDEM é renumerada porque o contrato exige leitura contígua a partir de 0.
    const contrato2: CopyAutoral = { ...contrato, blocos: contrato.blocos.filter((b) => b.id !== 'pre').map((b, i) => ({ ...b, ordem: i })) }
    const started = await startArtGeneration({
      projectId: PROJETO,
      track: 'arte',
      copyAutoral: contrato2,
      formato: 'story',
      referencias: [{ role: 'subject', url: arte.url } as never],
      actorClerkId: dono.clerkId,
      canal: 'claude-code',
    })
    gens.push(started.jobGenerationId)
    const genIA = await db.generation.findUniqueOrThrow({ where: { id: started.jobGenerationId }, select: { status: true, fieldValues: true } })
    const fvIA = (genIA.fieldValues ?? {}) as Record<string, unknown>
    const regIA = (fvIA.copyAutoral ?? null) as Record<string, unknown> | null
    conferir('a Generation de IA nasce PROCESSING (não enfileirada pela prova) com o registro do contrato', genIA.status === 'PROCESSING' && !!regIA && JSON.stringify(lerCopyAutoral(regIA.original).copy) === JSON.stringify(contrato2), regIA ? Object.keys(regIA).join(',') : 'sem registro')
    // A copy derivada do contrato é a régua (slotValues); o `enviada` só existe depois que o runner monta o prompt (PR5-10).
    conferir('a copy derivada do contrato vai para a régua (blocos com texto, em ordem, quebra do autor, colchetes fora) e o registro da CRIAÇÃO não declara enviada', JSON.stringify(Object.values((fvIA.slotValues ?? {}) as Record<string, string>)) === JSON.stringify(['Milk-shake\nem dobro', 'Peça criada pela prova de integração.', 'Vem pra cá', 'Ter a dom · 11h às 23h']) && !('enviada' in (regIA ?? {})) && (regIA?.lacunas as string[] | undefined)?.includes(LACUNA_PROMPT_AINDA_NAO_MONTADO) === true, JSON.stringify({ slot: fvIA.slotValues, enviada: regIA?.enviada }))
    conferir('a lacuna das camadas é DITA e o slotValues (régua) leva a quebra', Array.isArray(regIA?.lacunas) && (regIA!.lacunas as string[])[0] === LACUNA_SEM_CAMADAS && (fvIA.slotValues as Record<string, string>)?.bloco1 === 'Milk-shake\nem dobro', JSON.stringify(regIA?.lacunas).slice(0, 120))
    const lidaIA = copyDaArte(fvIA)
    conferir('ver-geracao: ainda NÃO comparável (nem prompt nem conferência)', !!lidaIA && lidaIA.comparavel === false && lidaIA.enviada === undefined, JSON.stringify({ por: lidaIA?.comparadoPor, comparavel: lidaIA?.comparavel }))
    const erroDe = async (fn: () => Promise<unknown>): Promise<{ code?: string; message: string } | null> => { try { await fn(); return null } catch (e) { return e as { code?: string; message: string } } }
    const antesDaRecusa = await db.generation.count({ where: { projectId: PROJETO } })
    const div = await erroDe(() => startArtGeneration({ projectId: PROJETO, track: 'arte', copy: ['outro texto'], copyAutoral: contrato2, formato: 'story', referencias: [{ role: 'subject', url: arte.url } as never], actorClerkId: dono.clerkId, canal: 'claude-code' }))
    const inv = await erroDe(() => startArtGeneration({ projectId: PROJETO, track: 'arte', copyAutoral: { versao: 'copy-autoral-v1', origem: { autor: 'claude', superficie: 'chat' }, blocos: [{ id: 'a', funcao: 'headline', ordem: 0, linhas: ['x'] }, { id: 'a', funcao: 'cta', ordem: 1, linhas: ['y'] }], revisoes: [] }, formato: 'story', referencias: [{ role: 'subject', url: arte.url } as never], actorClerkId: dono.clerkId, canal: 'claude-code' }))
    const depoisDaRecusa = await db.generation.count({ where: { projectId: PROJETO } })
    conferir('`copy` que diverge do contrato é recusada ANTES de gravar (COPY_DIVERGE_DO_CONTRATO)', div?.code === 'COPY_DIVERGE_DO_CONTRATO', `${div?.code}: ${String(div?.message ?? '').slice(0, 80)}`)
    conferir('contrato inválido (id repetido) é recusado ANTES de gravar (COPY_AUTORAL_INVALIDA)', inv?.code === 'COPY_AUTORAL_INVALIDA', `${inv?.code}: ${String(inv?.message ?? '').slice(0, 80)}`)
    conferir('as duas recusas não criaram Generation', depoisDaRecusa === antesDaRecusa, `${antesDaRecusa} → ${depoisDaRecusa}`)
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou, no projeto da prova)')
    const apagados = { generations: 0, jobs: 0, pages: 0, blobs: 0 }
    const falhas: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => { try { await fn() } catch (e) { falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`) } }
    await passo('páginas (thumbnails)', async () => {
      for (const p of await db.page.findMany({ where: { OR: [{ id: { in: pages } }, { name: { contains: MARCA }, Template: { projectId: PROJETO } }] }, select: { id: true, thumbnail: true } })) {
        if (!pages.includes(p.id)) pages.push(p.id)
        if (typeof p.thumbnail === 'string' && p.thumbnail.startsWith('http')) blobs.add(p.thumbnail)
      }
    })
    await passo('generations (lista)', async () => {
      const lista = await db.generation.findMany({ where: { projectId: PROJETO, OR: [{ id: { in: gens } }, ...pages.map((id) => ({ fieldValues: { path: ['pageId'], equals: id } }))] }, select: { id: true, resultUrl: true } })
      for (const g of lista) { if (g.resultUrl) blobs.add(g.resultUrl); if (!gens.includes(g.id)) gens.push(g.id) }
    })
    await passo('jobs', async () => { apagados.jobs = (await db.generationJob.deleteMany({ where: { generationId: { in: gens } } })).count })
    await passo('generations', async () => { apagados.generations = (await db.generation.deleteMany({ where: { id: { in: gens } } })).count })
    await passo('sinais', async () => { await db.learningSignal.deleteMany({ where: { projectId: PROJETO, OR: [{ pageId: { in: pages } }, { generationId: { in: gens } }] } }) })
    await passo('páginas', async () => { apagados.pages = (await db.page.deleteMany({ where: { id: { in: pages } } })).count })
    for (const fn of limpeza.reverse()) await passo('limpeza', fn)
    for (const url of blobs) await passo(`blob ${url.slice(-40)}`, async () => { await del(url); apagados.blobs++ })
    if (falhas.length) { console.error('  ✗ cleanup incompleto:', falhas.join(' | ')); mau += falhas.length }
    console.log('  apagados:', JSON.stringify(apagados))
    if (naoAvaliado.length) console.log('  não avaliado:', naoAvaliado.join(' | '))
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ sha, branch, pendentes, banco: ENDPOINT, ok, falhas: mau, naoAvaliado, apagados, falhasDoCleanup: falhas }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
