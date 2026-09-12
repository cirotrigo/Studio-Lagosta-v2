/**
 * PROVA de integração do PR 8 de "Marca simples, copy melhor" (F2 — variantes
 * completas e `medir-copy`), contra o BRANCH DE DEV do Neon. Recusa produção
 * pelo compute. Não grava NADA: nem página, nem Generation, nem sinal, nem
 * Blob — e confere isso contando as tabelas antes e depois.
 *
 * O que prova:
 *  1. `ver-assinatura` devolve CADA variante com os próprios estilos, a fonte
 *     disponível no servidor, a área útil do formato e o orçamento por papel;
 *  2. `medir-copy` mede a copy com a régua da composição: cabe / cabe reduzido /
 *     não cabe (com orçamento por linha) / papel ausente; `aproximado` com
 *     [colchetes]; `naoMedido` só quando a fonte não carregou;
 *  3. FIDELIDADE: para a mesma copy e a mesma variante, os blocos que
 *     `comporPeca` monta (escala, caixa) são os que `medir-copy` mediu — é o
 *     MESMO medidor;
 *  4. nada foi gravado.
 *
 * USO: npx tsx scripts/validar-medir-copy.ts [--saida <pasta>] [--projeto <id>]
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
/** O projeto é ESCOLHIDO na hora: o primeiro (nesta ordem) com pelo menos duas variantes de story na assinatura. */
const CANDIDATOS = [6, 3, 2, 8, 7, 1, 5, 4, 9, 10, 11, 12]
const SAIDA = argumento('--saida') ?? '.tmp-validar-medir-copy'

let ok = 0
let mau = 0
let pendentesDaProva = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (condicao) ok++
  else mau++
}
/** Caso que o banco de dev não permite exercitar: contado à parte, nunca como sucesso nem como falha. */
function pendente(titulo: string, detalhe = '') {
  console.log(`  ○ NÃO EXERCITADO: ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  pendentesDaProva++
}

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { executarToolLocal } = await import('../src/lib/mcp/catalogo/integracao')
  const { descreverVariantes, medirCopyDoProjeto } = await import('../src/lib/compositor/medir-copy-service')
  const { comporPeca } = await import('../src/lib/compositor/compor')
  const principal = { kind: 'service' as const, clientId: 'claude-code-local' }
  const tool = async (nome: string, args: Record<string, unknown>) => {
    const r = await executarToolLocal(nome, args, principal)
    const texto = String((r.content[0] as { text?: unknown } | undefined)?.text ?? '{}')
    if (r.isError) throw new Error(`${nome}: ${texto.slice(0, 300)}`)
    return JSON.parse(texto) as Record<string, any>
  }

  // Escolha do projeto: leitura pura.
  const pedido = argumento('--projeto')
  let PROJETO = pedido ? Number(pedido) : 0
  if (!PROJETO) {
    for (const id of CANDIDATOS) {
      const existe = await db.project.findUnique({ where: { id }, select: { id: true } })
      if (!existe) continue
      const { variantes } = await descreverVariantes(id, 'story')
      if (variantes.filter((v) => v.formato === 'story').length >= 2) {
        PROJETO = id
        break
      }
    }
  }
  if (!PROJETO) abortar('nenhum projeto do dev tem duas variantes de story na assinatura')
  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, name: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)
  console.log(`projeto da prova: ${PROJETO} (${projeto.name})`)

  const contar = async () => ({
    generations: await db.generation.count({ where: { projectId: PROJETO } }),
    pages: await db.page.count({ where: { Template: { projectId: PROJETO } } }),
    sinais: await db.learningSignal.count({ where: { projectId: PROJETO } }),
    posts: await db.socialPost.count({ where: { projectId: PROJETO } }),
  })
  const antes = await contar()
  const registro: Record<string, unknown> = { sha, branch, banco: ENDPOINT, projeto: PROJETO }

  try {
    // ── 1. ver-assinatura por variante ──────────────────────────────────────
    console.log('1) ver-assinatura: cada variante com estilos, fonte disponível, área útil e orçamento')
    const va = await tool('ver-assinatura', { projectId: PROJETO, formato: 'story' })
    const variantes = va.variantes as Array<Record<string, any>>
    const deStory = variantes.filter((v) => v.formato === 'story')
    conferir('há 2+ variantes de story, e a carregada é uma delas', deStory.length >= 2 && !!va.varianteCarregada && deStory.some((v) => v.id === va.varianteCarregada.id), JSON.stringify({ variantes: deStory.map((v) => v.nome), carregada: va.varianteCarregada?.nome }))
    conferir('TODA variante traz estilos por papel (fonte, tamanho, cor, caixa, fonteDisponivel), a área útil e o orçamento por papel', variantes.every((v) => v.papeis.length > 0 && Object.keys(v.estilos).length > 0 && Object.values(v.estilos as Record<string, any>).every((e) => typeof e.fonte === 'string' && typeof e.tamanho === 'number' && typeof e.cor === 'string' && typeof e.fonteDisponivel === 'boolean') && typeof v.areaUtil?.colunaUtil === 'number' && Array.isArray(v.orcamento) && v.orcamento.length === Object.keys(v.estilos).length), JSON.stringify(variantes[0]?.estilos?.headline))
    const orcHeadline = deStory.map((v) => v.orcamento.find((o: any) => o.papel === 'headline')).filter(Boolean)
    conferir('o orçamento da headline é número (caracteres por linha e linhas na altura útil) onde a fonte está disponível, e nulo + naoMedido onde não está', orcHeadline.every((o: any) => (o.naoMedido ? o.caracteresPorLinha === null : typeof o.caracteresPorLinha === 'number' && o.caracteresPorLinha > 3 && typeof o.linhasNaAlturaUtil === 'number')), JSON.stringify(orcHeadline.map((o: any) => ({ v: o.fonte, c: o.caracteresPorLinha, l: o.linhasNaAlturaUtil, nm: o.naoMedido }))))
    conferir('as variantes DIFEREM entre si em estilo ou papéis (não é a mesma assinatura repetida)', new Set(deStory.map((v) => JSON.stringify([v.papeis, Object.values(v.estilos as Record<string, any>).map((e) => [e.fonte, e.tamanho, e.cor])]))).size >= 2)
    conferir('a área útil de story é coerente com os números (coluna = 1080 − 2·margem; altura = 1920 − safe topo − safe rodapé; escala 1 para página de story)', deStory.every((v) => v.areaUtil.colunaUtil === 1080 - 2 * v.areaUtil.margemH && v.areaUtil.alturaUtil === 1920 - v.areaUtil.safeTopo - v.areaUtil.safeRodape && v.areaUtil.escalaDoFormato === 1))
    writeFileSync(resolve(SAIDA, 'ver-assinatura.json'), JSON.stringify(va, null, 2))

    // ── 2. medir-copy ─────────────────────────────────────────────────────
    console.log('2) medir-copy: cabe / cabe reduzido / não cabe com orçamento / papel ausente / aproximado')
    const alvo = deStory.find((v) => v.orcamento.find((o: any) => o.papel === 'headline' && !o.naoMedido && typeof o.caracteresPorLinha === 'number')) ?? deStory[0]
    const n = Number(alvo.orcamento.find((o: any) => o.papel === 'headline')?.caracteresPorLinha ?? 12)
    // A largura de UMA letra "a" na fonte da headline, medida pela própria tool: os comprimentos das linhas de
    // teste saem dela (o orçamento por amostra é aproximado de propósito — letras diferentes têm larguras diferentes).
    const sonda = await tool('medir-copy', { projectId: PROJETO, formato: 'story', variante: alvo.id, blocos: [{ papel: 'headline', linhas: ['aaaaaaaaaa'] }] })
    const coluna = Number(sonda.blocos[0].linhas[0].coluna)
    const larguraDoA = Number(sonda.blocos[0].linhas[0].largura) / 10
    conferir(`a sonda mede: coluna ${coluna}px e a letra "a" da headline com ${larguraDoA.toFixed(1)}px (fonte ${sonda.blocos[0].fonte}, não medido = ${sonda.naoMedido})`, coluna > 0 && larguraDoA > 0 && sonda.naoMedido === false)
    const letras = (fracaoDaColuna: number) => 'a'.repeat(Math.max(3, Math.round((coluna * fracaoDaColuna) / larguraDoA)))
    const curta = letras(0.7)
    const comprida = letras(1.1) // entre a coluna e a coluna ÷ 0,8: cabe só reduzida
    const enorme = letras(1.5) // além de 1,25 × coluna: não cabe nem a 80%
    const mCurta = await tool('medir-copy', { projectId: PROJETO, formato: 'story', variante: alvo.id, blocos: [{ papel: 'headline', linhas: [curta] }] })
    conferir(`copy curta (${curta.length} letras; orçamento por amostra ${n}) CABE em escala 1, com corpo e caixa medidos, na variante pedida`, mCurta.cabeTudo === true && mCurta.blocos[0].situacao === 'cabe' && mCurta.blocos[0].escala === 1 && mCurta.blocos[0].caixa?.altura > 0 && mCurta.blocos[0].linhas[0].cabe === true && mCurta.variante.id === alvo.id && mCurta.naoMedido === false, JSON.stringify({ situacao: mCurta.blocos[0].situacao, escala: mCurta.blocos[0].escala, caixa: mCurta.blocos[0].caixa, largura: mCurta.blocos[0].linhas[0].largura, coluna: mCurta.blocos[0].linhas[0].coluna }))
    const mComprida = await tool('medir-copy', { projectId: PROJETO, formato: 'story', variante: alvo.id, blocos: [{ papel: 'headline', linhas: [comprida] }] })
    conferir(`linha comprida (${comprida.length} letras ≈ 110% da coluna) cabe só REDUZIDA (escala entre 0,8 e 1) e a linha diz que não cabe no tamanho da assinatura`, mComprida.blocos[0].situacao === 'cabe-reduzido' && mComprida.blocos[0].escala < 1 && mComprida.blocos[0].escala >= 0.8 && mComprida.blocos[0].linhas[0].cabe === false && mComprida.cabeTudo === true, JSON.stringify({ situacao: mComprida.blocos[0].situacao, escala: mComprida.blocos[0].escala, largura: mComprida.blocos[0].linhas[0].largura }))
    const mEnorme = await tool('medir-copy', { projectId: PROJETO, formato: 'story', variante: alvo.id, blocos: [{ papel: 'headline', linhas: [enorme] }] })
    const orc = mEnorme.blocos[0].orcamento?.[0]
    conferir(`linha enorme (${enorme.length} letras ≈ 150% da coluna) NÃO cabe nem a 80%: volta com o orçamento por linha (caracteres que cabem = ⌊letras × coluna ÷ largura⌋, menor que a linha) e cabeTudo false`, mEnorme.cabeTudo === false && mEnorme.blocos[0].situacao === 'nao-cabe' && !!orc && orc.caracteresQueCabem === Math.floor((enorme.length * orc.coluna) / orc.largura) && orc.caracteresQueCabem < enorme.length && /reescreva/.test(mEnorme.nota), JSON.stringify({ orcamento: orc, nota: mEnorme.nota?.slice(0, 60) }))
    const mDestaque = await tool('medir-copy', { projectId: PROJETO, formato: 'story', variante: alvo.id, blocos: [{ papel: 'headline', linhas: [`[${curta}]`] }] })
    const semEstiloDeDestaque = (mDestaque.blocos[0].avisos ?? []).some((a: string) => /não tem estilo de destaque/.test(a))
    conferir('destaque entre [colchetes]: a medida vira APROXIMADA — ou, quando a marca não tem estilo de destaque, o bloco AVISA que saiu sem destaque (nunca em silêncio); a linha volta como foi escrita', ((mDestaque.aproximado === true && mDestaque.blocos[0].aproximado === true) || semEstiloDeDestaque) && mDestaque.blocos[0].linhas[0].linha === `[${curta}]`, JSON.stringify({ aproximado: mDestaque.aproximado, semEstiloDeDestaque, situacao: mDestaque.blocos[0].situacao }))
    const PAPEIS = ['pre', 'headline', 'apoio', 'cta', 'servico'] as const
    const faltante = deStory.flatMap((v) => PAPEIS.filter((p) => !v.papeis.includes(p)).map((p) => ({ v, p }))).find(Boolean)
    if (faltante) {
      const mAusente = await tool('medir-copy', { projectId: PROJETO, formato: 'story', variante: faltante.v.id, blocos: [{ papel: 'headline', linhas: [curta] }, { papel: faltante.p, linhas: ['Sexta, 19h'] }] })
      conferir(`papel "${faltante.p}" que a variante "${faltante.v.nome}" não tem é declarado (papel-ausente), cabeTudo false, e outrasVariantes diz quem o tem`, mAusente.cabeTudo === false && mAusente.papeisAusentes?.includes(faltante.p) && mAusente.blocos.find((b: any) => b.papel === faltante.p)?.situacao === 'papel-ausente' && Array.isArray(mAusente.outrasVariantes), JSON.stringify({ ausentes: mAusente.papeisAusentes, outras: (mAusente.outrasVariantes as any[]).map((o) => [o.nome, o.papeisAusentes]) }))
    } else {
      pendente('papel-ausente pela tool', `todas as ${deStory.length} variantes de story deste projeto têm os cinco papéis — o caso está coberto pelo teste unitário (medir-copy.test.ts)`)
    }
    const semVariante = await tool('medir-copy', { projectId: PROJETO, formato: 'story', blocos: [{ papel: 'headline', linhas: [curta] }] })
    conferir('sem variante pedida, medir-copy escolhe como a composição (motivo declarado) e mede as OUTRAS variantes do formato', typeof semVariante.variante.motivo === 'string' && Array.isArray(semVariante.outrasVariantes) && semVariante.outrasVariantes.length === deStory.length - 1 && semVariante.outrasVariantes.every((o: any) => typeof o.cabeTudo === 'boolean'), JSON.stringify({ variante: semVariante.variante, outras: semVariante.outrasVariantes.length }))
    conferir('as fontes NÃO carregadas são declaradas por nome, e todo bloco naoMedido é de uma delas', (mCurta.fontesNaoCarregadas ?? []).every((f: string) => typeof f === 'string') && mCurta.blocos.every((b: any) => !b.naoMedido || (mCurta.fontesNaoCarregadas ?? []).includes(b.fonte)), JSON.stringify(mCurta.fontesNaoCarregadas ?? []))
    writeFileSync(resolve(SAIDA, 'medir-copy.json'), JSON.stringify({ mCurta, mComprida, mEnorme, mDestaque, semVariante }, null, 2))

    // ── 3. fidelidade: a mesma régua da composição ──────────────────────────
    console.log('3) fidelidade: comporPeca (provar: true, sem gravar) monta os blocos com as MESMAS medidas que medir-copy devolveu')
    const blocos = [{ papel: 'headline' as const, linhas: [curta] }, ...(alvo.papeis.includes('apoio') ? [{ papel: 'apoio' as const, linhas: ['Sexta é dia de churrasco'] }] : [])]
    const medida = await medirCopyDoProjeto({ projectId: PROJETO, formato: 'story', variante: alvo.id, blocos })
    const composicao = await comporPeca({ projectId: PROJETO, formato: 'story', blocos, preferencias: { variante: alvo.id } }, { provar: true })
    const porPapelMedido = new Map(medida.medicao.blocos.map((b) => [b.papel, b]))
    const porPapelComposto = new Map(composicao.diagnostico.blocos.map((b) => [b.papel, b]))
    const papeis = [...porPapelMedido.keys()]
    const iguais = papeis.every((p) => {
      const m = porPapelMedido.get(p)!
      const c = porPapelComposto.get(p)
      return !!c && m.escala === c.escala && m.width === c.width && m.height === c.height
    })
    conferir('para cada papel, escala, largura e altura do bloco são IDÊNTICAS entre medir-copy e a composição (mesmo medidor, mesma régua)', iguais && composicao.diagnostico.assinatura.pageId === alvo.id, JSON.stringify(papeis.map((p) => ({ p, medido: [porPapelMedido.get(p)!.escala, porPapelMedido.get(p)!.width, porPapelMedido.get(p)!.height], composto: porPapelComposto.get(p) ? [porPapelComposto.get(p)!.escala, porPapelComposto.get(p)!.width, porPapelComposto.get(p)!.height] : null }))))
    conferir('o "não medido" bate: o bloco que a composição marca naoMedido é o que medir-copy marcou', papeis.every((p) => Boolean(porPapelComposto.get(p)?.naoMedido) === porPapelMedido.get(p)!.naoMedido), JSON.stringify(papeis.map((p) => [p, porPapelMedido.get(p)!.naoMedido])))
    conferir('a composição provou (PNG em memória) e não persistiu nada', !!composicao.prova && !composicao.persistido)
    registro.fidelidade = papeis.map((p) => ({ papel: p, medido: porPapelMedido.get(p), composto: porPapelComposto.get(p) }))

    // ── 4. nada gravado ─────────────────────────────────────────────────────
    const depois = await contar()
    conferir('NADA foi gravado: Generation, Page, LearningSignal e SocialPost com as mesmas contagens de antes', JSON.stringify(antes) === JSON.stringify(depois), `${JSON.stringify(antes)} → ${JSON.stringify(depois)}`)
    registro.contagens = { antes, depois }
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
    mau++
  } finally {
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ ...registro, pendentes, ok, falhas: mau, naoExercitados: pendentesDaProva }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s)${pendentesDaProva ? `, ${pendentesDaProva} não exercitado(s)` : ''}. Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
