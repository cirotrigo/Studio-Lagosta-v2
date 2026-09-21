/**
 * Prova de integração do PR 3 de "Marca simples, copy melhor" (F1, persistência
 * do contrato da copy autoral), no BRANCH DE DEV do Neon.
 *
 * O que ela prova, com dados criados e apagados por ela:
 *  1. compor uma peça com `copyAutoral` grava o contrato na Page (original) e
 *     na Generation (`fieldValues.copyAutoral` = original + efetiva + comparável);
 *  2. a revisão da equipe pela função PURA que o PATCH do editor chama na
 *     mesma escrita das camadas (`revisaoDaPaginaComCamadas`) — o handler do
 *     PATCH em si NÃO é exercitado: exige sessão Clerk. É integração da
 *     função de persistência, não do endpoint;
 *  2b. editar o texto e RECOMPOR (a arte congelada de um carrossel) leva o
 *     contrato da página à spec e grava a efetiva nova na página e na arte;
 *  3. `ajustarArte` com texto novo vira revisão de quem pediu (claude no chat) e
 *     a Generation nova leva original e efetiva;
 *  4. item de plano com contrato grava o contrato e o espelho posicional; a
 *     edição só da lista vira revisão; a spec do item leva o contrato;
 *  5. `ver-geracao` devolve a copy escrita × desenhada e os blocos que diferem;
 *  6. página sem contrato continua sem contrato (nada é inventado).
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada). Sobe PNG
 * ao Blob de produção e apaga no cleanup (declarado).
 *
 * Cleanup: SÓ o que esta rodada criou (ids + a MARCA desta rodada, no projeto
 * da prova). `--varrer-antigas` apaga também o que rodadas anteriores
 * interrompidas deixaram com o prefixo da marca, SÓ neste projeto — nunca é o
 * padrão, porque alcançaria uma rodada concorrente. Falha de cleanup conta
 * como falha da prova (saída ≠ 0).
 *
 * USO: npx tsx scripts/validar-copy-autoral.ts [--saida <pasta>] [--varrer-antigas]
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
const SAIDA = argumento('--saida') ?? '.tmp-validar-copy-autoral'
const VARRER_ANTIGAS = process.argv.includes('--varrer-antigas')
const MARCA = `[PR3-COPY ${new Date().toISOString()}]`

let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  condicao ? ok++ : mau++
}

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  // O cabeçalho NOMEIA o que está pendente: "pendente: 1 arquivo(s)" fazia toda
  // revisão registrar "não dá para casar exatamente com o HEAD" sem ninguém
  // poder decidir se importava — e era, sempre, a própria pasta de saída desta
  // prova, que ela cria ao rodar. Ela sai contada à parte, por nome.
  const daSaidaDaProva = SAIDA.replace(/^\.\//, '').replace(/\/+$/, '')
  const linhas = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean)
  const caminho = (l: string) => l.slice(3).replace(/^"|"$/g, '')
  const pendentes = linhas.map(caminho).filter((p) => p !== daSaidaDaProva && !p.startsWith(`${daSaidaDaProva}/`))
  const daProva = linhas.length - pendentes.length
  const resumoDosPendentes = pendentes.length ? pendentes.join(', ') : 'nada'
  console.log(
    `código: ${sha} (${branch}) em ${ROOT}; pendente: ${resumoDosPendentes}${daProva ? ` (+ a saída desta prova, ${daSaidaDaProva})` : ''} | banco: ${ENDPOINT} | node ${process.version}`,
  )
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { comporPeca } = await import('../src/lib/compositor/compor')
  const { lerCamadas } = await import('../src/lib/posts/page-layers')
  const { ajustarArte } = await import('../src/lib/creatives/arte-rapida')
  const { registrarRevisaoDaPagina } = await import('../src/lib/copy-autoral/persistir')
  const { lerCopyAutoral, VERSAO_DO_CONTRATO, copyComparavel, espelhoPosicional } = await import('../src/lib/copy-autoral')
  const { criarPlano, atualizarItem } = await import('../src/lib/planos/plano-service')
  const { montarSpecDoItem } = await import('../src/lib/planos/spec-do-item')
  const { montarRetornoDaPagina } = await import('../src/lib/mcp/catalogo/ver-geracao-retorno')
  const { recomporPaginaDefasada } = await import('../src/lib/compositor/recompor')
  const { del } = await import('@vercel/blob')
  type CopyAutoral = import('../src/lib/copy-autoral').CopyAutoral

  const blobs = new Set<string>()
  const pages: string[] = []
  const planos: string[] = []
  const posts: string[] = []
  let planoId: string | null = null

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, userId: true, name: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)

  try {
    // ── 1. compor com o contrato ────────────────────────────────────────────
    console.log('1) compor uma peça com copyAutoral: contrato na Page e na Generation')
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
        { id: 'pre', funcao: 'pre', grupoDeLeitura: 'frase-1', ordem: 0, linhas: ['Prova da copy'] },
        { id: 'headline', funcao: 'headline', grupoDeLeitura: 'frase-1', ordem: 1, linhas: ['Título de teste', 'para [conferir]'] },
        { id: 'apoio', funcao: 'apoio', ordem: 2, linhas: ['Peça criada pela prova de integração.', 'Pode apagar.'] },
        { id: 'cta', funcao: 'cta', ordem: 3, linhas: ['Conheça nossos pacotes'] },
        { id: 'servico', funcao: 'servico', ordem: 4, linhas: ['Seg a sex · 9h às 18h'], fatos: [{ entradaId: 'prova', trecho: '9h às 18h' }] },
      ],
      revisoes: [],
    }
    const daqui7 = new Date(Date.now() + 7 * 86_400_000)
    const quando = `${daqui7.toISOString().slice(0, 10)} 10:00`
    const composta = await comporPeca(
      { projectId: PROJETO, formato: 'story', foto: { url: fotoUrl }, copyAutoral: contrato, nome: `${MARCA} peça`, quando, tema: `${MARCA} teste` } as never,
      { canal: 'claude-code' },
    )
    const persistido = composta.persistido
    if (!persistido) abortar('a composição não persistiu nada')
    pages.push(persistido.pageId)
    blobs.add(persistido.url)
    const pagina1 = await db.page.findUnique({ where: { id: persistido.pageId }, select: { copyAutoral: true, layers: true } })
    const gen1 = await db.generation.findUnique({ where: { id: persistido.generationId }, select: { fieldValues: true } })
    const fv1 = (gen1?.fieldValues ?? {}) as Record<string, any>
    const naPagina = lerCopyAutoral(pagina1?.copyAutoral).copy
    const original1 = lerCopyAutoral(fv1.copyAutoral?.original).copy
    const efetiva1 = lerCopyAutoral(fv1.copyAutoral?.efetiva).copy
    conferir('Generation.fieldValues.copyAutoral.original é o contrato do autor, EXATO (linhas, colchetes, grupo, fatos, autoria claude)', !!original1 && JSON.stringify(original1.blocos) === JSON.stringify(contrato.blocos) && original1.origem.autor === 'claude' && original1.revisoes.length === 0, original1 ? `${original1.blocos.length} blocos` : 'sem original')
    conferir('Generation.fieldValues.copyAutoral tem a efetiva e é comparável', !!efetiva1 && fv1.copyAutoral?.comparavel === true && copyComparavel(efetiva1))
    // O compositor deste branch ainda TRANSFORMA texto (a seta no CTA; o
    // destaque [] só sai com estilo de destaque cadastrado): o contrato existe
    // para expor isso, não para escondê-lo. O que a efetiva diz tem de bater
    // com o que as camadas mostram, bloco a bloco, e cada diferença tem de
    // estar registrada como revisão do SISTEMA — nunca sumir, nunca virar
    // culpa de quem editar depois. (O PR 4 tira as transformações.)
    const camadas1 = lerCamadas(pagina1!.layers).camadas as Array<Record<string, any>>
    const textoDesenhado = (papel: string) => camadas1.filter((c) => (c.type === 'text' || c.type === 'rich-text') && c.metadata?.compositor?.papel === papel).map((c) => String(c.content ?? '')).join('\n')
    // Diferença EXATA (o contrato é exato): o destaque [] pedido e não desenhado
    // (sem estilo de destaque cadastrado no projeto) CONTA como transformação.
    const diferentesNaPeca = contrato.blocos.filter((b) => JSON.stringify(b.linhas) !== JSON.stringify(efetiva1?.blocos.find((x) => x.id === b.id)?.linhas ?? null)).map((b) => b.id)
    const revisaoDoSistema = efetiva1?.revisoes.find((r) => r.autor === 'sistema')
    conferir('a efetiva reflete as camadas: cada bloco que o compositor transformou consta na revisão do SISTEMA (superfície compositor)', !!efetiva1 && (diferentesNaPeca.length === 0 ? !revisaoDoSistema : !!revisaoDoSistema && revisaoDoSistema.superficie === 'compositor' && diferentesNaPeca.every((id) => revisaoDoSistema.blocos.includes(id))), `transformados pelo compositor: ${JSON.stringify(diferentesNaPeca)}; revisão: ${JSON.stringify(revisaoDoSistema?.blocos ?? [])}`)
    conferir('o texto EXATO desenhado está na efetiva (o que a página mostra), bloco a bloco', !!efetiva1 && contrato.blocos.every((b) => efetiva1.blocos.find((x) => x.id === b.id)!.linhas.join('\n').replace(/\[|\]/g, '') === textoDesenhado(b.funcao)), efetiva1 ? JSON.stringify(efetiva1.blocos.map((b) => b.linhas)).slice(0, 200) : '')
    conferir('Page.copyAutoral é a EFETIVA (o contrato do que a página mostra), com a mesma autoria de origem', !!naPagina && !!efetiva1 && JSON.stringify(naPagina.blocos) === JSON.stringify(efetiva1.blocos) && naPagina.origem.autor === 'claude', naPagina ? `${naPagina.blocos.length} blocos, ${naPagina.revisoes.length} revisão(ões)` : 'sem contrato')
    conferir('sem lacunas na peça (todo bloco foi desenhado, nada a mais)', !Array.isArray(fv1.copyAutoral?.lacunas) || fv1.copyAutoral.lacunas.length === 0, JSON.stringify(fv1.copyAutoral?.lacunas ?? []))
    const retorno1 = montarRetornoDaPagina({ fieldValues: fv1, pagina: { id: persistido.pageId, name: 'x', templateId: 1, isTemplate: false }, appUrl: 'https://x', projectId: PROJETO, concluida: true })
    conferir('ver-geracao devolve a copy escrita × desenhada, comparável, e aponta EXATAMENTE os blocos que o compositor mudou', retorno1.copy?.comparavel === true && JSON.stringify([...retorno1.copy.blocosDiferentes].sort()) === JSON.stringify([...diferentesNaPeca].sort()) && retorno1.copy.original.length === 5, JSON.stringify(retorno1.copy?.blocosDiferentes))

    // ── 2. edição de texto pelo editor → revisão da equipe ─────────────────
    console.log('2) a função do PATCH do editor (revisão na mesma escrita das camadas): texto editado vira REVISÃO da equipe — o handler HTTP não é exercitado (sessão Clerk)')
    const apoio = camadas1.find((c) => c.type === 'text' && c.metadata?.compositor?.papel === 'apoio')
    const camadasEditadas = camadas1.map((c) => (c.id === apoio?.id ? { ...c, content: 'Peça editada pela equipe.\nPode apagar.' } : c))
    await db.page.update({ where: { id: persistido.pageId }, data: { layers: camadasEditadas as never } })
    const rev2 = await registrarRevisaoDaPagina({ pageId: persistido.pageId, camadas: camadasEditadas, quem: { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' } })
    conferir('revisão registrada, só no bloco do apoio', rev2.estado === 'registrada' && JSON.stringify(rev2.blocos) === JSON.stringify(['apoio']), `${rev2.estado} ${JSON.stringify(rev2.blocos)}`)
    const pagina2 = lerCopyAutoral((await db.page.findUnique({ where: { id: persistido.pageId }, select: { copyAutoral: true } }))?.copyAutoral).copy!
    const ultima2 = pagina2.revisoes[pagina2.revisoes.length - 1]
    conferir('o contrato da página tem a revisão com autor equipe e superfície editor, e o texto novo EXATO', !!ultima2 && ultima2.autor === 'equipe' && ultima2.superficie === 'editor' && JSON.stringify(pagina2.blocos.find((b) => b.id === 'apoio')!.linhas) === JSON.stringify(['Peça editada pela equipe.', 'Pode apagar.']), JSON.stringify(pagina2.revisoes.map((r) => [r.autor, r.blocos])))
    conferir('o resto do contrato ficou intacto (ids, grupo, fatos) e a revisão da equipe NÃO leva a culpa pelo que o compositor mudou', JSON.stringify(pagina2.blocos.find((b) => b.id === 'headline')!.linhas) === JSON.stringify(efetiva1!.blocos.find((b) => b.id === 'headline')!.linhas) && pagina2.blocos.find((b) => b.id === 'servico')!.fatos?.[0]?.trecho === '9h às 18h' && pagina2.blocos.find((b) => b.id === 'pre')!.grupoDeLeitura === 'frase-1' && pagina2.revisoes.filter((r) => r.autor === 'equipe').every((r) => JSON.stringify(r.blocos) === JSON.stringify(['apoio'])))
    const semMudanca = await registrarRevisaoDaPagina({ pageId: persistido.pageId, camadas: camadasEditadas, quem: { autor: 'equipe', motivo: 'autosave', superficie: 'editor' } })
    conferir('autosave sem mudança de texto não grava revisão', semMudanca.estado === 'sem-mudanca')

    // ── 2b. recompor com o contrato (R01 da revisão do Codex) ───────────────
    console.log('2b) editar o texto e RECOMPOR o slide de carrossel: a spec leva o contrato da página; página e arte recebem a efetiva nova')
    const carrossel = await db.socialPost.create({
      data: { projectId: PROJETO, userId: projeto.userId, postType: 'CAROUSEL', caption: `${MARCA} carrossel — pode apagar`, mediaUrls: [fotoUrl, persistido.url], scheduleType: 'SCHEDULED', scheduledDatetime: daqui7, status: 'DRAFT', publishType: 'REMINDER', renderStatus: 'NOT_NEEDED' },
      select: { id: true },
    })
    posts.push(carrossel.id)
    const camadas2b = lerCamadas((await db.page.findUnique({ where: { id: persistido.pageId }, select: { layers: true } }))!.layers).camadas as Array<Record<string, any>>
    const headline2b = camadas2b.find((c) => (c.type === 'text' || c.type === 'rich-text') && c.metadata?.compositor?.papel === 'headline')
    await db.page.update({ where: { id: persistido.pageId }, data: { layers: camadas2b.map((c) => (c.id === headline2b?.id ? { ...c, content: 'Título recomposto' } : c)) as never } })
    // a edição de texto pelo editor revisa o contrato na mesma escrita; aqui a função pura faz esse papel
    const camadasEditadas2b = lerCamadas((await db.page.findUnique({ where: { id: persistido.pageId }, select: { layers: true } }))!.layers).camadas
    await registrarRevisaoDaPagina({ pageId: persistido.pageId, camadas: camadasEditadas2b, quem: { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' } })
    const r2b = await recomporPaginaDefasada({ pageId: persistido.pageId, origem: 'editor' })
    if (r2b.url) blobs.add(r2b.url)
    const pagina2b = lerCopyAutoral((await db.page.findUnique({ where: { id: persistido.pageId }, select: { copyAutoral: true } }))?.copyAutoral).copy
    const gen2b = await db.generation.findUnique({ where: { id: persistido.generationId }, select: { fieldValues: true } })
    const fv2b = (gen2b?.fieldValues ?? {}) as Record<string, any>
    const efetiva2b = lerCopyAutoral(fv2b.copyAutoral?.efetiva).copy
    const original2b = lerCopyAutoral(fv2b.copyAutoral?.original).copy
    conferir('a recomposição RECOMPÔS (não recusou a spec) e trocou o slide', r2b.recomposta === true && r2b.trocados.length === 1, JSON.stringify({ recomposta: r2b.recomposta, trocados: r2b.trocados.length, avisos: r2b.avisos.slice(0, 2) }))
    conferir('a spec gravada leva o contrato da página e os blocos saem dele', !!fv2b.spec?.copyAutoral && Array.isArray(fv2b.spec?.blocos) && fv2b.spec.blocos.some((b: { papel: string; linhas: string[] }) => b.papel === 'headline' && b.linhas[0] === 'Título recomposto'))
    conferir('Page.copyAutoral é a efetiva RECOMPOSTA: manchete nova, revisão da equipe preservada, e nada atribuído à equipe além da manchete', !!pagina2b && pagina2b.blocos.find((b) => b.id === 'headline')!.linhas[0] === 'Título recomposto' && pagina2b.revisoes.some((r) => r.autor === 'equipe' && r.blocos.includes('headline')), JSON.stringify(pagina2b?.revisoes.map((r) => [r.autor, r.superficie, r.blocos])))
    conferir('Generation.copyAutoral: original INTACTO (o do autor) e efetiva atualizada com o texto novo', !!original2b && original2b.blocos.find((b) => b.id === 'headline')!.linhas[0] === 'Título de teste' && !!efetiva2b && efetiva2b.blocos.find((b) => b.id === 'headline')!.linhas[0] === 'Título recomposto' && fv2b.copyAutoral?.comparavel === true)
    const carrossel2b = await db.socialPost.findUnique({ where: { id: carrossel.id }, select: { mediaUrls: true } })
    conferir('só o slide da arte trocou; a capa ficou', carrossel2b?.mediaUrls[0] === fotoUrl && carrossel2b.mediaUrls[1] === r2b.url && carrossel2b.mediaUrls.length === 2)

    // ── 3. ajustarArte com texto novo → revisão de quem pediu ──────────────
    console.log('3) ajustarArte com texto: revisão de quem pediu (claude) e a Generation nova leva original + efetiva')
    const ctaId = String(camadas1.find((c) => c.type === 'text' && c.metadata?.compositor?.papel === 'cta')?.id)
    const ajustada = await ajustarArte({ projectId: PROJETO, pageId: persistido.pageId, slotValues: { [ctaId]: 'Fale com a gente' }, canal: 'claude-code' } as never)
    if (ajustada?.url) blobs.add(ajustada.url)
    const pagina3 = lerCopyAutoral((await db.page.findUnique({ where: { id: persistido.pageId }, select: { copyAutoral: true } }))?.copyAutoral).copy!
    const ultima3 = pagina3.revisoes[pagina3.revisoes.length - 1]
    conferir('a revisão do ajuste tem autor claude e só o bloco cta', pagina3.revisoes.length === (pagina2b?.revisoes.length ?? 0) + 1 && ultima3.autor === 'claude' && JSON.stringify(ultima3.blocos) === JSON.stringify(['cta']), JSON.stringify(pagina3.revisoes.map((r) => [r.autor, r.blocos])))
    const gen3 = await db.generation.findUnique({ where: { id: ajustada.generationId }, select: { fieldValues: true } })
    const fv3 = (gen3?.fieldValues ?? {}) as Record<string, any>
    const original3 = lerCopyAutoral(fv3.copyAutoral?.original).copy
    const efetiva3 = lerCopyAutoral(fv3.copyAutoral?.efetiva).copy
    conferir('a Generation do ajuste grava original (já revisado) e efetiva com "Fale com a gente"', !!original3 && !!efetiva3 && original3.blocos.find((b) => b.id === 'cta')!.linhas[0] === 'Fale com a gente' && efetiva3.blocos.find((b) => b.id === 'cta')!.linhas[0] === 'Fale com a gente' && fv3.copyAutoral?.comparavel === true)

    // ── 4. item de plano ─────────────────────────────────────────────────────
    console.log('4) item de plano: contrato + espelho posicional; edição só da lista vira revisão; a spec do item leva o contrato')
    const inicio = daqui7.toISOString().slice(0, 10)
    const { plano, avisos } = await criarPlano({
      projectId: PROJETO,
      titulo: `${MARCA} plano`,
      inicio,
      fim: inicio,
      origem: 'chat',
      itens: [{ quando: `${inicio} 10:00`, tema: `${MARCA} tema`, formato: 'story', via: 'compor', copyAutoral: contrato, copyProposta: ['ignorado'] }],
    } as never)
    planoId = plano.id
    planos.push(plano.id)
    const item = plano.itens[0]
    conferir('o item gravou o contrato e o espelho posicional (copyProposta) derivado dele', !!lerCopyAutoral(item.copyAutoral).copy && JSON.stringify(item.copyProposta) === JSON.stringify(espelhoPosicional(contrato)), `${JSON.stringify(item.copyProposta).slice(0, 120)} | avisos: ${avisos.length}`)
    const { item: item2, avisos: avisos2 } = await atualizarItem({ projectId: PROJETO, planoId: plano.id, itemId: item.id, patch: { copyProposta: ['Prova da copy', 'Título de teste\npara [conferir]', 'Peça editada na bancada.', 'Conheça nossos pacotes', 'Seg a sex · 9h às 18h'] } })
    const contratoDoItem2 = lerCopyAutoral(item2.copyAutoral).copy
    conferir('edição só da lista (bancada) virou revisão da EQUIPE no bloco apoio, contrato mantido', !!contratoDoItem2 && contratoDoItem2.revisoes.length === 1 && contratoDoItem2.revisoes[0].autor === 'equipe' && JSON.stringify(contratoDoItem2.revisoes[0].blocos) === JSON.stringify(['apoio']) && avisos2.length === 0, JSON.stringify(contratoDoItem2?.revisoes))
    const { item: item3, avisos: avisos3 } = await atualizarItem({ projectId: PROJETO, planoId: plano.id, itemId: item.id, patch: { copyProposta: ['Só a manchete'] } })
    conferir('lista com outro número de blocos DESCARTA o contrato com aviso (nunca mantém mentindo)', item3.copyAutoral === null && avisos3.some((a) => /descartado/.test(a)) && JSON.stringify(item3.copyProposta) === JSON.stringify(['Só a manchete']), avisos3[0]?.slice(0, 90))
    const { item: item4 } = await atualizarItem({ projectId: PROJETO, planoId: plano.id, itemId: item.id, patch: { copyAutoral: contrato }, autorDaCopy: 'claude' })
    conferir('contrato novo pelo chat substitui o inteiro e refaz o espelho', !!lerCopyAutoral(item4.copyAutoral).copy && JSON.stringify(item4.copyProposta) === JSON.stringify(espelhoPosicional(contrato)))
    const paginas = await db.page.findMany({ where: { Template: { projectId: PROJETO, category: 'assinatura' } }, select: { id: true } }).catch(() => [])
    const spec = montarSpecDoItem({ ...item4, copyAutoral: item4.copyAutoral } as never, PROJETO, [], false)
    conferir('a spec do item leva o contrato e os blocos saem dele (blocosParaOCompositor), sem transformar texto', !!spec.copyAutoral && spec.blocos?.length === 5 && spec.blocos![1].linhas[1] === 'para [conferir]', `${paginas.length} páginas de assinatura vistas; blocos: ${spec.blocos?.map((b) => b.papel).join(',')}`)
    const { validarSpec } = await import('../src/lib/compositor/spec')
    const v = validarSpec(spec)
    conferir('validarSpec aceita a spec do item com contrato', !!v.spec, v.problemas.join('; '))
    const livre = validarSpec({ ...spec, blocos: undefined, copyAutoral: { ...contrato, blocos: [...contrato.blocos, { id: 'solto', funcao: 'livre', ordem: 5, linhas: ['Texto sem papel'] }] } })
    conferir('bloco LIVRE com texto é recusado por validarSpec (nunca some em silêncio)', !livre.spec && livre.problemas.some((p) => /sem papel/.test(p)), livre.problemas[0]?.slice(0, 100))

    // ── 5. página sem contrato ───────────────────────────────────────────────
    console.log('5) página sem contrato continua sem contrato (nada é inventado)')
    const composta2 = await comporPeca(
      { projectId: PROJETO, formato: 'story', foto: { url: fotoUrl }, blocos: [{ papel: 'headline', linhas: ['Sem contrato'] }], nome: `${MARCA} peça 2`, quando, tema: `${MARCA} teste 2` } as never,
      { canal: 'claude-code' },
    )
    if (composta2.persistido) {
      pages.push(composta2.persistido.pageId)
      blobs.add(composta2.persistido.url)
      const p2 = await db.page.findUnique({ where: { id: composta2.persistido.pageId }, select: { copyAutoral: true, layers: true } })
      const g2 = await db.generation.findUnique({ where: { id: composta2.persistido.generationId }, select: { fieldValues: true } })
      const fv2 = (g2?.fieldValues ?? {}) as Record<string, any>
      const orig2 = lerCopyAutoral(fv2.copyAutoral?.original).copy
      conferir('spec só com blocos (legado): a Page grava o contrato ADAPTADO com autoria desconhecida e a Generation o marca NÃO comparável', !!orig2 && orig2.origem.autor === 'desconhecido' && fv2.copyAutoral?.comparavel === false && !!lerCopyAutoral(p2?.copyAutoral).copy, orig2 ? `origem ${orig2.origem.autor}; lacunas: ${(orig2.lacunas ?? []).length}` : 'sem original')
      const r5 = await registrarRevisaoDaPagina({ pageId: composta2.persistido.pageId, camadas: p2!.layers, quem: { autor: 'equipe', motivo: 'x', superficie: 'editor' } })
      conferir('revisão sobre página de contrato adaptado: registra (o adaptado é contrato válido) ou sem mudança — nunca inventa autoria do original', (r5.estado === 'sem-mudanca' || r5.estado === 'registrada') && lerCopyAutoral((await db.page.findUnique({ where: { id: composta2.persistido.pageId }, select: { copyAutoral: true } }))?.copyAutoral).copy?.origem.autor === 'desconhecido', r5.estado)
      const retorno2 = montarRetornoDaPagina({ fieldValues: fv2, pagina: { id: composta2.persistido.pageId, name: 'x', templateId: 1, isTemplate: false }, appUrl: 'https://x', projectId: PROJETO, concluida: true })
      conferir('ver-geracao diz que a copy NÃO é comparável (legado adaptado)', retorno2.copy?.comparavel === false)
    } else {
      conferir('peça 2 composta', false)
    }
    const semNada = await registrarRevisaoDaPagina({ pageId: 'nao-existe', camadas: [], quem: { autor: 'equipe', motivo: 'x', superficie: 'editor' } })
    conferir('página inexistente: sem-contrato, sem lançar', semNada.estado === 'sem-contrato')
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro)
    mau++
  } finally {
    console.log('\ncleanup (só o que ESTA rodada criou, no projeto da prova)')
    const apagados = { posts: 0, generations: 0, jobs: 0, pages: 0, planos: 0, blobs: 0 }
    const falhasDoCleanup: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        falhasDoCleanup.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // A marca desta rodada (com o carimbo) — nunca o prefixo: o prefixo alcançaria
    // uma rodada concorrente (R1 da revisão do Codex). `--varrer-antigas` é o
    // caminho explícito para o que rodadas interrompidas deixaram, só neste projeto.
    const marcas = VARRER_ANTIGAS ? ['[PR3-COPY '] : [MARCA]
    const filtroDePagina = { OR: [{ id: { in: pages } }, ...marcas.map((m) => ({ name: { contains: m }, Template: { projectId: PROJETO } }))] }
    const idsDePagina = new Set<string>(pages)
    await passo('páginas da rodada', async () => {
      for (const p of await db.page.findMany({ where: filtroDePagina, select: { id: true } })) idsDePagina.add(p.id)
    })
    let idsDeGeracao: string[] = []
    await passo('generations', async () => {
      const gens = await db.generation.findMany({
        where: { projectId: PROJETO, OR: [...[...idsDePagina].map((id) => ({ fieldValues: { path: ['pageId'], equals: id } })), ...marcas.map((m) => ({ fieldValues: { path: ['spec', 'nome'], string_contains: m } }))] },
        select: { id: true, resultUrl: true },
      })
      for (const g of gens) if (g.resultUrl) blobs.add(g.resultUrl)
      idsDeGeracao = gens.map((g) => g.id)
    })
    await passo('jobs', async () => { apagados.jobs = (await db.generationJob.deleteMany({ where: { generationId: { in: idsDeGeracao } } })).count })
    await passo('posts', async () => { apagados.posts = (await db.socialPost.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: posts } }, ...marcas.map((m) => ({ caption: { contains: m } }))] } })).count })
    await passo('generations', async () => { apagados.generations = (await db.generation.deleteMany({ where: { id: { in: idsDeGeracao } } })).count })
    await passo('sinais', async () => { await db.learningSignal.deleteMany({ where: { projectId: PROJETO, OR: [{ pageId: { in: [...idsDePagina] } }, { generationId: { in: idsDeGeracao } }] } }) })
    await passo('páginas', async () => { apagados.pages = (await db.page.deleteMany({ where: { id: { in: [...idsDePagina] } } })).count })
    await passo('planos', async () => { apagados.planos = (await db.planoDeConteudo.deleteMany({ where: { projectId: PROJETO, OR: [{ id: { in: planos } }, ...marcas.map((m) => ({ titulo: { contains: m } }))] } })).count })
    for (const url of blobs) {
      await passo(`blob ${url.slice(-40)}`, async () => {
        await del(url)
        apagados.blobs++
      })
    }
    if (falhasDoCleanup.length) {
      console.error('  ✗ cleanup incompleto:', falhasDoCleanup.join(' | '))
      mau += falhasDoCleanup.length
    }
    console.log('  apagados:', JSON.stringify(apagados))
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ sha, branch, pendentes, pendentesDaProva: daProva, banco: ENDPOINT, ok, falhas: mau, apagados, falhasDoCleanup }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
