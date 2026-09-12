/**
 * Prova de integração do PR 14 de "Marca simples, copy melhor" (F5, a aba
 * Marca em três áreas), no BRANCH DE DEV do Neon. Não toca no Blob nem em API
 * paga. Não há teste de UI neste repo (vitest só em node): o que se prova é a
 * CAMADA que a tela chama — o serviço `aba-marca.ts` (o mesmo das rotas) — e
 * que a consulta seguinte do CONECTOR traz a alteração feita pela tela.
 *
 * O que ela prova, com dados criados e apagados por ela (projeto 8):
 *  1. sem voz gravada, a leitura da aba diz `fonte: legado`, sem registro, com
 *     o DNA de texto no `legado`;
 *  2. voz inválida vinda do formulário é recusada ANTES de escrever
 *     (`VOZ_INVALIDA`, com os problemas), e nada muda no banco;
 *  3. a primeira gravação pelo caminho da tela (formulário → contrato) cria a
 *     voz (versão 1); a consulta seguinte do conector (`consultar-voz`) traz o
 *     MESMO conteúdo e a versão; o loader (`loadBrandContext`) a vê como
 *     PRÉVIA (`vozPendente`), com o legado ainda mandando;
 *  4. gravar com a versão que a tela leu (1) → versão 2; gravar de novo com a
 *     versão velha (1) → `VOZ_DIVERGENTE` (409) e a versão continua 2 — a edição
 *     concorrente não sobrescreve em silêncio; sem versão → obrigatória;
 *  5. uma regra SUBSTITUÍDA pelo formulário chega ao conector com a antiga
 *     inativa e a nova apontando para ela, e o prompt de copy da voz só carrega
 *     a ativa;
 *  6. "Fatos da casa": o resumo da base bate com a contagem real por categoria
 *     e aponta os atalhos (nunca devolve conteúdo de entrada);
 *  7. "Identidade visual": as assinaturas listadas são as páginas do template
 *     Assinatura do projeto, com atalho ao editor e sem miniatura `data:`.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada). A linha
 * de `BrandVoice` criada é apagada no cleanup (a que existisse antes é
 * recriada como estava).
 *
 * USO: npx tsx scripts/validar-aba-marca.ts [--saida <pasta>]
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
const SAIDA = argumento('--saida') ?? '.tmp-validar-aba-marca'
const MARCA = `[PR14-ABA-MARCA ${new Date().toISOString()}]`

let ok = 0
let mau = 0
const linhas: string[] = []
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  const l = `  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`
  console.log(l)
  linhas.push(l)
  if (condicao) ok++
  else mau++
}
async function erroDe<T>(p: Promise<T>): Promise<{ code?: string; status?: number; message: string; details?: unknown } | null> {
  try {
    await p
    return null
  } catch (e) {
    const err = e as { code?: string; status?: number; message: string; details?: unknown }
    return { code: err.code, status: err.status, message: err.message, details: err.details }
  }
}

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().split('\n').filter((l) => l.trim() && !/prisma\/generated/.test(l)).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { lerVozDaMarca, salvarVozDaMarca, resumoDosFatos, assinaturasDaMarca } = await import('../src/lib/brand/aba-marca')
  const { vozParaFormulario, formularioParaVoz, substituirRegraNoFormulario, regraEmBranco } = await import('../src/lib/brand/voz-formulario')
  const { loadBrandContext } = await import('../src/lib/brand/brand-context')
  const { vozParaPrompt } = await import('../src/lib/brand/voz')
  const { executarToolLocal } = await import('../src/lib/mcp/catalogo/integracao')

  const principal = { kind: 'service', clientId: 'claude-code-local' } as const
  const tool = async (nome: string, args: Record<string, unknown>) => {
    const r = await executarToolLocal(nome, args, principal)
    const texto = String((r.content[0] as { text?: unknown } | undefined)?.text ?? '{}')
    if (r.isError) throw new Error(`${nome}: ${texto.slice(0, 200)}`)
    return JSON.parse(texto) as Record<string, any>
  }

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, name: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no dev`)
  const registroAntes = await db.brandVoice.findUnique({ where: { projectId: PROJETO } })
  if (registroAntes) {
    console.log(`  (o projeto já tinha BrandVoice v${registroAntes.versao}; a prova a guarda e recria no cleanup)`)
    await db.brandVoice.delete({ where: { projectId: PROJETO } })
  }

  try {
    console.log('1) sem voz: a aba lê o legado')
    const l1 = await lerVozDaMarca(PROJETO)
    conferir('fonte legado (ou nenhuma), sem registro, com o DNA de texto em `legado`', (l1.contexto.fonte === 'legado' || l1.contexto.fonte === 'nenhuma') && l1.registro === null && 'toneOfVoice' in l1.legado, JSON.stringify({ fonte: l1.contexto.fonte, tone: l1.legado.toneOfVoice?.length ?? null }))

    console.log('2) voz inválida vinda do formulário é recusada antes de escrever')
    const formRuim = vozParaFormulario(null)
    formRuim.descricao = ''
    formRuim.antesDepois = [{ antes: 'só antes, sem depois', depois: '', motivo: '' }]
    const e2 = await erroDe(salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz(formRuim), versaoEsperada: null }))
    const semRegistro2 = (await db.brandVoice.count({ where: { projectId: PROJETO } })) === 0
    conferir('VOZ_INVALIDA (400) com os problemas listados; nenhuma linha criada', e2?.code === 'VOZ_INVALIDA' && e2.status === 400 && Array.isArray((e2.details as { problemas?: unknown[] } | undefined)?.problemas) && semRegistro2, `${e2?.code} · ${((e2?.details as { problemas?: Array<{ caminho: string }> })?.problemas ?? []).map((p) => p.caminho).join(', ')}`)

    console.log('3) primeira gravação pela tela: cria v1; o conector e o loader a veem como prévia')
    const form = vozParaFormulario(null)
    form.descricao = `${MARCA} Direta e quente; fala de comida como quem convida para a mesa.`
    form.tratamento = 'você'
    form.exemplos = ['Sexta é dia de costela.', 'Vem pra cá.']
    form.antesDepois = [{ antes: 'Venha conhecer nossas opções', depois: 'Vem provar', motivo: 'menos institucional' }]
    form.termos = ['costela no bafo', 'happy em dobro']
    form.proibicoes = ['"o melhor da cidade"']
    form.regras = [{ ...regraEmBranco([], '2026-09-04'), texto: 'Pré-título, manchete e apoio se leem como UMA frase.', motivo: 'Ciro, 03/09', escopo: 'copy' }]
    const g3 = await salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz(form), versaoEsperada: null })
    const c3 = await tool('consultar-voz', { projectId: PROJETO })
    const brand3 = await loadBrandContext(PROJETO)
    conferir('criou v1; `consultar-voz` traz a MESMA descrição, os termos e a regra, e diz que o legado ainda manda', g3.gravada.criada && g3.gravada.versao === 1 && c3.versao === 1 && c3.voz?.descricao === form.descricao && JSON.stringify(c3.voz?.termos) === JSON.stringify(['costela no bafo', 'happy em dobro']) && c3.voz?.regras?.[0]?.texto === form.regras[0].texto && c3.fonte !== 'voz' && c3.vozPendente === true, JSON.stringify({ versao: c3.versao, fonte: c3.fonte, pendente: c3.vozPendente }))
    conferir('o loader único vê a voz como PRÉVIA (vozPendente) e a copy continua no legado', brand3.voz.vozPendente === true && brand3.voz.fonte !== 'voz', JSON.stringify({ fonte: brand3.voz.fonte, pendente: brand3.voz.vozPendente }))

    console.log('4) CAS: a versão lida pela tela protege a edição concorrente')
    const form4 = vozParaFormulario(g3.registro!.voz)
    form4.proibicoes = [...form4.proibicoes, 'emoji na manchete']
    const g4 = await salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz(form4), versaoEsperada: 1 })
    const e4 = await erroDe(salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz({ ...form4, tratamento: 'tu' }), versaoEsperada: 1 }))
    const e4b = await erroDe(salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz(form4), versaoEsperada: null }))
    const reg4 = await db.brandVoice.findUnique({ where: { projectId: PROJETO }, select: { versao: true, voz: true } })
    conferir('com a versão lida (1) grava v2; com a versão velha (1) de novo → VOZ_DIVERGENTE 409; sem versão → VOZ_VERSAO_OBRIGATORIA; a versão fica 2 e o tratamento continua "você"', g4.gravada.versao === 2 && e4?.code === 'VOZ_DIVERGENTE' && e4.status === 409 && e4b?.code === 'VOZ_VERSAO_OBRIGATORIA' && reg4?.versao === 2 && (reg4.voz as { tratamento?: string }).tratamento === 'você', JSON.stringify({ v: reg4?.versao, e4: e4?.code, e4b: e4b?.code }))
    const c4 = await tool('consultar-voz', { projectId: PROJETO })
    conferir('a consulta seguinte do conector traz a alteração da tela (v2, a proibição nova)', c4.versao === 2 && (c4.voz?.proibicoes as string[]).includes('emoji na manchete'), JSON.stringify(c4.voz?.proibicoes))

    console.log('5) regra SUBSTITUÍDA pelo formulário chega ao conector com a antiga inativa')
    const form5 = vozParaFormulario(reg4!.voz as never)
    const idAntiga = form5.regras[0].id
    form5.regras = substituirRegraNoFormulario(form5.regras, idAntiga, { texto: 'Pré-título e manchete se leem como uma frase; o apoio é livre.', motivo: 'Ciro, 12/09', em: '2026-09-12', escopo: 'copy' })
    const g5 = await salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz(form5), versaoEsperada: 2 })
    const c5 = await tool('consultar-voz', { projectId: PROJETO })
    const regras5 = (c5.voz?.regras ?? []) as Array<{ id: string; ativa: boolean; substitui?: string; texto: string }>
    const antiga = regras5.find((r) => r.id === idAntiga)
    const nova = regras5.find((r) => r.substitui === idAntiga)
    const prompt5 = vozParaPrompt(g5.registro!.voz!, { escopo: 'copy' })
    conferir('v3: a antiga está inativa, a nova aponta para ela, e o prompt de copy só carrega a nova', g5.gravada.versao === 3 && antiga?.ativa === false && !!nova && nova.ativa && prompt5.includes('o apoio é livre') && !prompt5.includes('se leem como UMA frase.'), JSON.stringify({ antiga: antiga?.ativa, nova: nova?.id }))

    console.log('5b) PR14-01: travessão, seta, marcador e quebra interna atravessam a tela e chegam LITERAIS ao conector; editar só a descrição não mexe no resto')
    const form5b = vozParaFormulario(g5.registro!.voz!)
    form5b.exemplos = ['Fogo\nna mesa', '- costela, não "costelinha"', 'Vem → hoje']
    form5b.antesDepois = [{ antes: 'Venha', depois: 'Vem — hoje', motivo: 'mais direto' }, { antes: 'a -> b', depois: 'a → b -- c', motivo: 'seta e travessão são conteúdo' }]
    form5b.termos = ['• happy em dobro', 'costela no bafo — a da casa']
    const g5b = await salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz(form5b), versaoEsperada: 3 })
    const c5b = await tool('consultar-voz', { projectId: PROJETO })
    conferir('v4: exemplos, reescritas e termos voltam do conector EXATAMENTE como digitados', g5b.gravada.versao === 4 && JSON.stringify(c5b.voz?.exemplos) === JSON.stringify(form5b.exemplos) && JSON.stringify(c5b.voz?.antesDepois) === JSON.stringify(form5b.antesDepois) && JSON.stringify(c5b.voz?.termos) === JSON.stringify(form5b.termos), JSON.stringify({ depois: (c5b.voz?.antesDepois as Array<{ depois: string }> | undefined)?.map((r) => r.depois), exemplo0: c5b.voz?.exemplos?.[0] }))
    const form5c = vozParaFormulario(g5b.registro!.voz!)
    form5c.descricao = `${form5c.descricao} Curta.`
    const g5c = await salvarVozDaMarca({ projectId: PROJETO, voz: formularioParaVoz(form5c), versaoEsperada: 4 })
    const { descricao: _d1, ...restoAntes } = g5b.registro!.voz!
    const { descricao: _d2, ...restoDepois } = g5c.registro!.voz!
    conferir('v5: editar SÓ a descrição pela tela deixa todos os outros campos idênticos (byte a byte)', g5c.gravada.versao === 5 && JSON.stringify(restoAntes) === JSON.stringify(restoDepois) && g5c.registro!.voz!.descricao.endsWith('Curta.'), JSON.stringify({ iguais: JSON.stringify(restoAntes) === JSON.stringify(restoDepois) }))

    console.log('6) Fatos da casa: o resumo bate com a base e não copia conteúdo')
    const r6 = await resumoDosFatos(PROJETO)
    const grupos = await db.knowledgeBaseEntry.groupBy({ by: ['category'], where: { projectId: PROJETO, status: 'ACTIVE' }, _count: { _all: true } })
    const totalReal = grupos.reduce((s, g) => s + g._count._all, 0)
    const contagensBatem = grupos.every((g) => r6.porCategoria.find((c) => c.categoria === g.category)?.total === g._count._all)
    const semConteudo = !JSON.stringify(r6).includes('"content"')
    conferir('total e contagens por categoria iguais ao banco; vencidas/vencendo são listas; atalhos apontam para a base e para /knowledge; nenhum `content` na resposta', r6.total === totalReal && contagensBatem && Array.isArray(r6.vencendo) && Array.isArray(r6.vencidas) && r6.atalhos.base.endsWith(`/projects/${PROJETO}/base`) && r6.atalhos.conhecimento.includes(`projectId=${PROJETO}`) && semConteudo, JSON.stringify({ total: r6.total, categorias: r6.porCategoria.length, vencendo: r6.vencendo.length, vencidas: r6.vencidas.length }))

    console.log('7) Identidade visual: as assinaturas são as páginas do template Assinatura')
    const a7 = await assinaturasDaMarca(PROJETO)
    const template = await db.template.findFirst({ where: { projectId: PROJETO, name: 'Assinatura' }, select: { id: true } })
    const paginasNoTemplate = template ? await db.page.count({ where: { templateId: template.id } }) : 0
    conferir('template e contagem batem; toda variante tem formato, papéis e editorUrl com o pageId; nenhuma miniatura `data:`', (template ? a7.templateId === template.id && a7.variantes.length === paginasNoTemplate : a7.templateId === null) && a7.variantes.every((v) => ['story', 'feed', 'quadrado'].includes(v.formato) && Array.isArray(v.papeis) && !!v.editorUrl?.includes(`pageId=${encodeURIComponent(v.id)}`) && (v.miniatura === null || !v.miniatura.startsWith('data:'))), JSON.stringify({ template: a7.templateId, variantes: a7.variantes.length, comMiniatura: a7.variantes.filter((v) => v.miniatura).length }))
  } finally {
    console.log('\ncleanup (a voz da prova sai; a anterior volta como estava)')
    await db.brandVoice.deleteMany({ where: { projectId: PROJETO } })
    if (registroAntes) {
      await db.brandVoice.create({ data: { projectId: PROJETO, versao: registroAntes.versao, voz: registroAntes.voz as never, migradaEm: registroAntes.migradaEm, dnaArquivado: registroAntes.dnaArquivado as never } })
    }
    const depois = await db.brandVoice.findUnique({ where: { projectId: PROJETO }, select: { versao: true } })
    conferir('BrandVoice como antes', registroAntes ? depois?.versao === registroAntes.versao : depois === null)
    writeFileSync(resolve(SAIDA, 'resultado.txt'), `${sha}\n${linhas.join('\n')}\n${ok} ok, ${mau} falha(s)\n`)
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
  }
  if (mau > 0) process.exit(1)
}

main().catch(async (e) => {
  console.error('\na prova parou:', e)
  process.exit(1)
})
