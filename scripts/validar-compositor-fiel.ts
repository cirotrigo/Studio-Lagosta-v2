/**
 * Prova de integração do PR 4 de "Marca simples, copy melhor" (F1, o compositor
 * consome o contrato sem conversão implícita), no BRANCH DE DEV do Neon.
 *
 * O que ela prova, com dados criados e apagados por ela (só ESTA rodada, no
 * projeto da prova):
 *  1. compor com contrato: nenhum bloco tem TEXTO diferente entre o escrito e o
 *     desenhado (o prefixo do CTA vem declarado e é descontado); a segunda voz
 *     segue a declaração do autor (ou avisa quando a variante não a tem);
 *     `medidasFinais` presentes, nenhuma fonte não carregada;
 *  2. recompor depois de editar o texto mantém a VARIANTE (por id) e a posição;
 *  3. o contrato recusa segunda voz fora do fim da manchete.
 *
 * USO: npx tsx scripts/validar-compositor-fiel.ts [--saida <pasta>]
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
const SAIDA = argumento('--saida') ?? '.tmp-validar-compositor-fiel'
const MARCA = `[PR4-FIEL ${new Date().toISOString()}]`
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
  const { comporPeca } = await import('../src/lib/compositor/compor')
  const { validarSpec } = await import('../src/lib/compositor/spec')
  const { recomporPaginaDefasada } = await import('../src/lib/compositor/recompor')
  const { lerCamadas } = await import('../src/lib/posts/page-layers')
  const { lerCopyAutoral, VERSAO_DO_CONTRATO } = await import('../src/lib/copy-autoral')
  const { copyDaArte } = await import('../src/lib/mcp/catalogo/ver-geracao-retorno')
  const { del } = await import('@vercel/blob')
  type CopyAutoral = import('../src/lib/copy-autoral').CopyAutoral

  const blobs = new Set<string>()
  const pages: string[] = []
  const posts: string[] = []
  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, userId: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)

  try {
    console.log('1) compor com contrato: texto escrito = texto desenhado (prefixo declarado descontado), voz 2 do autor, medidas finais')
    const foto = await db.generation.findFirst({
      where: { projectId: PROJETO, status: 'COMPLETED', resultUrl: { contains: 'blob.vercel-storage.com' }, fieldValues: { path: ['track'], equals: 'imagem' } },
      orderBy: { createdAt: 'desc' },
      select: { resultUrl: true },
    })
    const fotoUrl = foto?.resultUrl ?? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600'
    const contrato: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'claude', em: new Date().toISOString(), superficie: 'chat' },
      blocos: [
        { id: 'pre', funcao: 'pre', ordem: 0, linhas: ['Prova do compositor'] },
        { id: 'headline', funcao: 'headline', ordem: 1, linhas: ['Título fiel', 'ao contrato'], estilo: { linhasNaVoz2: [1] } },
        { id: 'apoio', funcao: 'apoio', ordem: 2, linhas: ['Peça criada pela prova de integração.', 'Pode apagar.'] },
        { id: 'cta', funcao: 'cta', ordem: 3, linhas: ['Conheça nossos pacotes'] },
        { id: 'servico', funcao: 'servico', ordem: 4, linhas: ['Seg a sex · 9h às 18h'] },
      ],
      revisoes: [],
    }
    const daqui7 = new Date(Date.now() + 7 * 86_400_000)
    const quando = `${daqui7.toISOString().slice(0, 10)} 10:00`
    const composta = await comporPeca({ projectId: PROJETO, formato: 'story', foto: { url: fotoUrl }, copyAutoral: contrato, nome: `${MARCA} peça`, quando, tema: `${MARCA} teste` } as never, { canal: 'claude-code' })
    const persistido = composta.persistido
    if (!persistido) abortar('a composição não persistiu nada')
    pages.push(persistido.pageId)
    blobs.add(persistido.url)
    const diag = composta.diagnostico as Record<string, any>
    const gen = await db.generation.findUnique({ where: { id: persistido.generationId }, select: { fieldValues: true } })
    const fv = (gen?.fieldValues ?? {}) as Record<string, any>
    const copy = copyDaArte(fv)
    conferir('nenhum bloco tem TEXTO diferente entre o escrito e o desenhado (a seta do CTA vem declarada e é descontada)', !!copy && copy.comparavel && copy.blocosDiferentes.length === 0, JSON.stringify(copy?.blocosDiferentes))
    const camadas = lerCamadas((await db.page.findUnique({ where: { id: persistido.pageId }, select: { layers: true } }))!.layers).camadas as Array<Record<string, any>>
    const cta = camadas.find((c) => c.metadata?.compositor?.papel === 'cta')
    const temPrefixo = typeof cta?.metadata?.compositor?.prefixo === 'string'
    conferir('o CTA desenhado carrega o prefixo DECLARADO (ou não tem prefixo nenhum)', !cta || (temPrefixo ? String(cta.content).startsWith(cta.metadata.compositor.prefixo) : String(cta.content) === 'Conheça nossos pacotes'), `content="${String(cta?.content).slice(0, 30)}" prefixo=${JSON.stringify(cta?.metadata?.compositor?.prefixo)}`)
    const temVoz2 = camadas.some((c) => c.metadata?.compositor?.papel === 'headline2')
    const h1 = camadas.find((c) => c.metadata?.compositor?.papel === 'headline')
    const h2 = camadas.find((c) => c.metadata?.compositor?.papel === 'headline2')
    conferir('a segunda voz segue a DECLARAÇÃO do autor: variante com headline2 → "Título fiel" / "ao contrato" (origem contrato); sem headline2 → manchete inteira na voz 1 com aviso', temVoz2 ? diag.segundaVoz === 'contrato' && String(h1?.content) === 'Título fiel' && String(h2?.content) === 'ao contrato' : diag.segundaVoz === 'nenhuma' && String(h1?.content) === 'Título fiel\nao contrato' && diag.avisos.some((a: string) => /headline2/.test(a)), `segundaVoz=${diag.segundaVoz}; h1="${String(h1?.content).replace('\n', '⏎')}" h2="${String(h2?.content ?? '')}"`)
    const efetiva = lerCopyAutoral(fv.copyAutoral?.efetiva).copy
    const estiloDaManchete = efetiva?.blocos.find((b) => b.id === 'headline')?.estilo
    conferir('a efetiva declara a voz 2 como foi DESENHADA (com headline2: [1]; sem: nenhuma) — nunca inventa', temVoz2 ? JSON.stringify(estiloDaManchete?.linhasNaVoz2) === '[1]' : !estiloDaManchete?.linhasNaVoz2, JSON.stringify(estiloDaManchete))
    const textos = camadas.filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.metadata?.compositor?.papel)
    // As medidas são casadas com as camadas FINAIS por id (sem repetição) e
    // comparadas campo a campo — contagem e "fontSize > 0" aceitavam medida de
    // antes do autofix, id repetido e linhas erradas (REV-02 da revisão do Codex).
    const porIdFinal = new Map(textos.map((c) => [String(c.id), c]))
    const medidas: Array<Record<string, unknown>> = Array.isArray(diag.medidasFinais) ? diag.medidasFinais : []
    const medidasBatem =
      medidas.length === textos.length &&
      new Set(medidas.map((m) => String(m.id))).size === medidas.length &&
      medidas.every((m) => {
        const l = porIdFinal.get(String(m.id))
        return !!l && m.naoMedido === false && Number(m.fontSize) === Number(l.style?.fontSize) && Number(m.width) === Math.round(Number(l.size?.width)) && Number(m.height) === Math.round(Number(l.size?.height)) && Number(m.linhas) === String(l.content ?? '').split('\n').length
      })
    conferir('medidasFinais: uma por texto FINAL, casada por id (sem repetição), com corpo, caixa e linhas iguais às camadas gravadas e nenhuma "não medida"', medidasBatem, JSON.stringify(medidas.map((m) => [m.id, m.fontSize, m.width, m.height, m.linhas, m.naoMedido])))
    conferir('nenhuma fonte da assinatura ficou sem carregar', !diag.fontesNaoCarregadas, JSON.stringify(diag.fontesNaoCarregadas ?? []))
    conferir('a variante usada está registrada pelo id da página', typeof diag.assinatura?.pageId === 'string' && diag.assinatura.pageId.length > 0, String(diag.assinatura?.pageId))

    console.log('2) editar o texto e recompor: a variante (por id) e a posição da composição original são mantidas')
    const carrossel = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} carrossel — pode apagar`, mediaUrls: [fotoUrl, persistido.url], scheduleType: 'SCHEDULED', scheduledDatetime: daqui7, status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
      select: { id: true },
    })
    posts.push(carrossel.id)
    const apoio = camadas.find((c) => c.metadata?.compositor?.papel === 'apoio')
    await db.page.update({ where: { id: persistido.pageId }, data: { layers: camadas.map((c) => (c.id === apoio?.id ? { ...c, content: 'Peça editada pela prova.\nPode apagar.' } : c)) as never } })
    const r2 = await recomporPaginaDefasada({ pageId: persistido.pageId, origem: 'editor' })
    if (r2.url) blobs.add(r2.url)
    const gen2 = await db.generation.findUnique({ where: { id: persistido.generationId }, select: { fieldValues: true } })
    const fv2 = (gen2?.fieldValues ?? {}) as Record<string, any>
    const carrosselDepois = await db.socialPost.findUnique({ where: { id: carrossel.id }, select: { mediaUrls: true } })
    conferir('recompôs e trocou o slide — relido no post: a posição 1 é a arte nova, a capa (posição 0) ficou, nenhuma mídia a menos', r2.recomposta === true && r2.trocados.length === 1 && !!r2.url && carrosselDepois?.mediaUrls.length === 2 && carrosselDepois.mediaUrls[0] === fotoUrl && carrosselDepois.mediaUrls[1] === r2.url, JSON.stringify({ recomposta: r2.recomposta, mediaUrls: carrosselDepois?.mediaUrls.map((u) => u.slice(-30)), avisos: r2.avisos.slice(0, 2) }))
    conferir('a spec da recomposição fixou a variante pelo id da página original, e a composição usou a mesma página', fv2.spec?.preferencias?.varianteOriginal === diag.assinatura.pageId && fv2.composicao?.assinatura?.pageId === diag.assinatura.pageId && fv2.composicao?.assinatura?.motivoDaVariante === 'fixada por id', JSON.stringify({ varianteOriginal: fv2.spec?.preferencias?.varianteOriginal, pageId: fv2.composicao?.assinatura?.pageId, motivo: fv2.composicao?.assinatura?.motivoDaVariante }))
    conferir('a posição da composição original foi mantida', fv2.composicao?.posicao?.ancora === diag.posicao.ancora && fv2.composicao?.posicao?.alinha === diag.posicao.alinha, `${diag.posicao.ancora}/${diag.posicao.alinha} → ${fv2.composicao?.posicao?.ancora}/${fv2.composicao?.posicao?.alinha}`)
    const copy2 = copyDaArte(fv2)
    // A prova editou o apoio DIRETO nas camadas (sem o PATCH, que revisaria o
    // contrato da página): a recomposição lê a página como está, e a diferença
    // entre o que o autor escreveu e o que a página mostra é REAL — ver-geracao
    // tem de apontá-la (só o apoio), com a revisão registrada.
    conferir('depois da recomposição, ver-geracao aponta EXATAMENTE o bloco que foi editado na página (apoio), nada mais', !!copy2 && JSON.stringify(copy2.blocosDiferentes) === JSON.stringify(['apoio']), JSON.stringify(copy2?.blocosDiferentes))
    const efetiva2 = lerCopyAutoral(fv2.copyAutoral?.efetiva).copy
    conferir('a efetiva recomposta tem "Peça editada pela prova." e uma revisão do sistema (recomposição) no apoio', !!efetiva2 && efetiva2.blocos.find((b) => b.id === 'apoio')!.linhas[0] === 'Peça editada pela prova.' && efetiva2.revisoes.some((r) => r.autor === 'sistema' && r.superficie === 'recomposicao' && r.blocos.includes('apoio')), JSON.stringify(efetiva2?.revisoes.map((r) => [r.autor, r.superficie, r.blocos])))

    console.log('3) o contrato recusa segunda voz fora do fim da manchete')
    const torto = validarSpec({ projectId: PROJETO, formato: 'story', copyAutoral: { ...contrato, blocos: contrato.blocos.map((b) => (b.id === 'headline' ? { ...b, estilo: { linhasNaVoz2: [0] } } : b)) } })
    conferir('linhasNaVoz2 [0] numa manchete de 2 linhas é recusado com a mensagem certa', !torto.spec && torto.problemas.some((p) => /ÚLTIMAS linhas/.test(p)), torto.problemas[0]?.slice(0, 100))
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou, no projeto da prova)')
    const apagados = { posts: 0, generations: 0, jobs: 0, pages: 0, blobs: 0 }
    const falhas: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const idsDePagina = new Set<string>(pages)
    await passo('páginas', async () => {
      // A thumbnail da página é o blob que `renderPageAndRegister` sobe ANTES
      // de criar a Generation: se a Generation falhar, é o único rastro dele
      // (REV-01 da revisão do Codex sobre a prova).
      for (const p of await db.page.findMany({ where: { OR: [{ id: { in: [...idsDePagina] } }, { name: { contains: MARCA }, Template: { projectId: PROJETO } }] }, select: { id: true, thumbnail: true } })) {
        idsDePagina.add(p.id)
        if (typeof p.thumbnail === 'string' && p.thumbnail.startsWith('http')) blobs.add(p.thumbnail)
      }
    })
    let gens: string[] = []
    await passo('generations', async () => {
      const lista = await db.generation.findMany({ where: { projectId: PROJETO, OR: [...[...idsDePagina].map((id) => ({ fieldValues: { path: ['pageId'], equals: id } })), { fieldValues: { path: ['spec', 'nome'], string_contains: MARCA } }] }, select: { id: true, resultUrl: true } })
      for (const g of lista) if (g.resultUrl) blobs.add(g.resultUrl)
      gens = lista.map((g) => g.id)
    })
    await passo('jobs', async () => { apagados.jobs = (await db.generationJob.deleteMany({ where: { generationId: { in: gens } } })).count })
    await passo('posts', async () => { apagados.posts = (await db.socialPost.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: posts } }, { caption: { contains: MARCA } }] } })).count })
    await passo('generations', async () => { apagados.generations = (await db.generation.deleteMany({ where: { id: { in: gens } } })).count })
    await passo('sinais', async () => { await db.learningSignal.deleteMany({ where: { projectId: PROJETO, OR: [{ pageId: { in: [...idsDePagina] } }, { generationId: { in: gens } }] } }) })
    await passo('páginas', async () => { apagados.pages = (await db.page.deleteMany({ where: { id: { in: [...idsDePagina] } } })).count })
    for (const url of blobs) await passo(`blob ${url.slice(-40)}`, async () => { await del(url); apagados.blobs++ })
    if (falhas.length) {
      console.error('  ✗ cleanup incompleto:', falhas.join(' | '))
      mau += falhas.length
    }
    console.log('  apagados:', JSON.stringify(apagados))
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ sha, branch, pendentes, banco: ENDPOINT, ok, falhas: mau, apagados, falhasDoCleanup: falhas }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
