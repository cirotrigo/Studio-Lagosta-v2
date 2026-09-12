/**
 * Prova de integração do PR 7 de "Marca simples, copy melhor" (F2/F5, a
 * fundação da voz compacta e a precedência da identidade de TEXTO), no BRANCH
 * DE DEV do Neon. Não toca no Blob nem em API paga.
 *
 * O que ela prova, com dados criados e apagados por ela (projeto 8):
 *  1. sem voz gravada, o loader entrega o LEGADO (o DNA de texto) e o
 *     `contextoDeVoz` diz o mesmo;
 *  2. voz inválida não é gravada (`VOZ_INVALIDA`, todos os problemas);
 *  3. a primeira gravação cria (versão 1); a segunda exige a versão lida
 *     (`VOZ_VERSAO_OBRIGATORIA`), recusa a versão errada (`VOZ_DIVERGENTE`) e
 *     duas gravações concorrentes com a MESMA versão deixam passar só uma;
 *  4. voz gravada e NÃO migrada é prévia: o legado continua mandando e
 *     `vozPendente` avisa — no serviço e no `loadBrandContext`;
 *  5. `virarRegra` no cliente não migrado segue para o DNA e traz `conflitos`
 *     (as linhas da seção sobre o mesmo assunto), sem gravar sem `confirmado`;
 *  6. migrar exige a versão lida, arquiva o DNA de texto e liga a precedência;
 *     migrar de novo diz `jaEstava`;
 *  7. migrado, o loader entrega a VOZ (fonte, versão, texto compacto, regras
 *     de arte) e o DNA de texto sai da copy;
 *  8. `virarRegra` migrado: conflito RECUSADO (`CONFLITO_DE_REGRA`), proposta
 *     com `substitui` sem gravar, gravação com CAS (versão sobe, a antiga fica
 *     inativa e fora do prompt); seção de ARTE continua indo ao DNA;
 *  9. a tool `consultar-voz` do catálogo responde com a precedência;
 * 10. desfazer a migração devolve o legado; voz e snapshot ficam.
 *
 * Só roda contra o branch de dev (guard por compute, falha fechada). O DNA
 * do projeto tem `contentRules` trocado durante a prova e RESTAURADO no
 * cleanup; a linha de `BrandVoice` criada é apagada (a que existisse antes é
 * recriada como estava).
 *
 * USO: npx tsx scripts/validar-voz-compacta.ts [--saida <pasta>]
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
const SAIDA = argumento('--saida') ?? '.tmp-validar-voz-compacta'
const MARCA = `[PR7-VOZ ${new Date().toISOString()}]`

let ok = 0
let mau = 0
function conferir(titulo: string, condicao: boolean, detalhe = '') {
  console.log(`  ${condicao ? '✓' : '✗'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (condicao) ok++
  else mau++
}
async function erroDe<T>(p: Promise<T>): Promise<{ code?: string; status?: number; message: string; details?: unknown } | null> {
  try {
    await p
    return null
  } catch (e) {
    const x = e as { code?: string; status?: number; message?: string; details?: unknown }
    return { code: x.code, status: x.status, message: String(x.message ?? e), details: x.details }
  }
}

async function main() {
  const { execSync } = await import('node:child_process')
  const sha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
  const branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim()
  const pendentes = execSync('git status --porcelain', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean).length
  console.log(`código: ${sha} (${branch}) em ${ROOT}; pendente: ${pendentes} arquivo(s) | banco: ${ENDPOINT} | node ${process.version}`)
  mkdirSync(SAIDA, { recursive: true })

  const { db } = await import('../src/lib/db')
  const { loadBrandContext, virarRegra } = await import('../src/lib/brand/brand-context')
  const { contextoDeVoz, gravarVoz, lerRegistroDaVoz, migrarParaVoz, desfazerMigracao } = await import('../src/lib/brand/voz-service')
  const { vozVazia, TETO_DO_PROMPT_DA_VOZ } = await import('../src/lib/brand/voz')
  const { executarToolLocal } = await import('../src/lib/mcp/catalogo/integracao')
  type VozCompacta = import('../src/lib/brand/voz').VozCompacta

  const projeto = await db.project.findUnique({ where: { id: PROJETO }, select: { id: true, userId: true, name: true } })
  if (!projeto) abortar(`projeto ${PROJETO} não existe no banco de dev`)
  const dnaAntes = await db.brandDNA.findUnique({ where: { projectId: PROJETO }, select: { toneOfVoice: true, contentRules: true } })
  const vozAntes = await db.brandVoice.findUnique({ where: { projectId: PROJETO } })
  if (vozAntes) await db.brandVoice.delete({ where: { projectId: PROJETO } })
  const registro: Record<string, unknown> = { sha, branch, banco: ENDPOINT }
  const templates: number[] = []
  const paginas: string[] = []

  try {
    // ── 1. sem voz: legado ─────────────────────────────────────────────────
    console.log('1) sem voz gravada, quem manda na copy é o DNA de texto (legado)')
    const c1 = await contextoDeVoz(PROJETO)
    const b1 = await loadBrandContext(PROJETO)
    const esperadoSemVoz = dnaAntes?.toneOfVoice?.trim() || dnaAntes?.contentRules?.trim() ? 'legado' : 'nenhuma'
    conferir(`contextoDeVoz: fonte "${esperadoSemVoz}", sem prévia, texto = toneOfVoice do DNA`, c1.fonte === esperadoSemVoz && c1.vozPendente === false && c1.texto === (dnaAntes?.toneOfVoice?.trim() || null) && c1.regrasDaMarca === (dnaAntes?.contentRules?.trim() || null) && c1.regrasDeArte === null, JSON.stringify({ fonte: c1.fonte, pendente: c1.vozPendente, chars: c1.texto?.length ?? 0 }))
    conferir('loadBrandContext.voz diz o mesmo (a precedência é UMA)', !!b1 && JSON.stringify(b1.voz) === JSON.stringify(c1))

    // ── 2. voz inválida ────────────────────────────────────────────────────
    console.log('2) voz inválida não é gravada, com todos os problemas')
    const invalida = { ...vozVazia(`${MARCA} voz de prova`), regras: [{ id: 'r1', texto: 'a', motivo: 'b', em: '2026-09-01', escopo: 'copy', ativa: true }, { id: 'r1', texto: 'c', motivo: 'd', em: '2026-09-02', escopo: 'copy', ativa: true, substitui: 'nao-existe' }] }
    const e2 = await erroDe(gravarVoz({ projectId: PROJETO, voz: invalida }))
    const problemas2 = ((e2?.details as { problemas?: Array<{ mensagem: string }> } | undefined)?.problemas ?? []).map((p) => p.mensagem).join(' | ')
    conferir('VOZ_INVALIDA (400) com id repetido E substituída inexistente na mesma resposta; nada criado', e2?.code === 'VOZ_INVALIDA' && e2.status === 400 && /repetido/.test(problemas2) && /não existe/.test(problemas2) && !(await db.brandVoice.findUnique({ where: { projectId: PROJETO } })), `${e2?.code}: ${problemas2.slice(0, 120)}`)
    // Dentro dos tetos POR CAMPO do schema (12 exemplos, 12 reescritas) e mesmo assim acima do teto do PROMPT: é a coerência, não o schema, que recusa.
    const grande = { ...vozVazia(`${MARCA} grande`), exemplos: Array.from({ length: 12 }, (_, i) => `${'exemplo comprido de prova '.repeat(7)}${i}`.slice(0, 195)), antesDepois: Array.from({ length: 12 }, (_, i) => ({ antes: 'a'.repeat(190), depois: 'b'.repeat(190), motivo: `m${i}` })) }
    const e2b = await erroDe(gravarVoz({ projectId: PROJETO, voz: grande }))
    conferir(`voz acima do teto do prompt (${TETO_DO_PROMPT_DA_VOZ}) é recusada como síntese`, e2b?.code === 'VOZ_INVALIDA' && /passa de/.test(String((e2b?.details as { problemas?: Array<{ mensagem: string }> } | undefined)?.problemas?.[0]?.mensagem)), String(e2b?.message).slice(0, 100))

    // ── 3. gravar com CAS ──────────────────────────────────────────────────
    console.log('3) a primeira gravação cria; depois só com a versão lida')
    const voz: VozCompacta = {
      ...vozVazia(`${MARCA} Fala de dono de churrascaria: direto, caloroso, sem gíria de agência.`),
      tratamento: 'você',
      termos: ['Costela no Bafo'],
      proibicoes: ['emoji na arte', 'promessa sem base'],
      exemplos: ['Costela no bafo, doze horas de fogo baixo.'],
      regras: [
        { id: 'regra-2026-09-06-1', texto: 'Nunca usar "Vem pro fogo" como CTA', motivo: 'o Ciro reprovou em 06/09', em: '2026-09-06', escopo: 'copy', ativa: true },
        { id: 'regra-2026-09-01-1', texto: 'Horário e CTA vão para o rodapé', motivo: 'peça de happy hour empilhada', em: '2026-09-01', escopo: 'arte', ativa: true },
      ],
    }
    const g3 = await gravarVoz({ projectId: PROJETO, voz })
    conferir('criada com versão 1', g3.criada && g3.versao === 1, JSON.stringify({ criada: g3.criada, versao: g3.versao }))
    const e3a = await erroDe(gravarVoz({ projectId: PROJETO, voz }))
    conferir('segunda gravação SEM versão → VOZ_VERSAO_OBRIGATORIA (400)', e3a?.code === 'VOZ_VERSAO_OBRIGATORIA' && e3a.status === 400, `${e3a?.code}`)
    const e3b = await erroDe(gravarVoz({ projectId: PROJETO, voz, versaoEsperada: 7 }))
    conferir('versão errada → VOZ_DIVERGENTE (409) e a versão do banco não muda', e3b?.code === 'VOZ_DIVERGENTE' && e3b.status === 409 && (await lerRegistroDaVoz(PROJETO))?.versao === 1, `${e3b?.code}`)
    const g3c = await gravarVoz({ projectId: PROJETO, voz: { ...voz, tratamento: 'tu' }, versaoEsperada: 1 })
    conferir('com a versão lida grava e a versão sobe para 2', !g3c.criada && g3c.versao === 2 && (await lerRegistroDaVoz(PROJETO))?.voz?.tratamento === 'tu')
    const corrida = await Promise.allSettled([
      gravarVoz({ projectId: PROJETO, voz: { ...voz, tratamento: 'você' }, versaoEsperada: 2 }),
      gravarVoz({ projectId: PROJETO, voz: { ...voz, tratamento: 'vocês' }, versaoEsperada: 2 }),
    ])
    const passaram = corrida.filter((r) => r.status === 'fulfilled')
    const recusadas = corrida.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => (r.reason as { code?: string }).code)
    const r3 = await lerRegistroDaVoz(PROJETO)
    conferir('duas gravações concorrentes com a MESMA versão lida: só UMA passa (a outra é VOZ_DIVERGENTE) e a versão fica em 3', passaram.length === 1 && recusadas[0] === 'VOZ_DIVERGENTE' && r3?.versao === 3, JSON.stringify({ passaram: passaram.length, recusadas, versao: r3?.versao }))

    // ── 4. prévia: gravada, não migrada ────────────────────────────────────
    console.log('4) voz gravada e NÃO migrada é prévia: o legado continua mandando')
    const c4 = await contextoDeVoz(PROJETO)
    const b4 = await loadBrandContext(PROJETO)
    conferir(`fonte continua "${esperadoSemVoz}", texto continua o do DNA e vozPendente = true — no serviço e no loader`, c4.fonte === esperadoSemVoz && c4.vozPendente === true && c4.texto === c1.texto && c4.versao === null && b4?.voz.vozPendente === true && b4.voz.fonte === esperadoSemVoz, JSON.stringify({ fonte: c4.fonte, pendente: c4.vozPendente }))

    // ── 5. virarRegra no cliente NÃO migrado: DNA, com conflitos ───────────
    console.log('5) virarRegra antes da migração vai para o DNA e traz as linhas do mesmo assunto como AVISO')
    const regrasDeProva = `${MARCA} regras de prova\n\nRegras aprendidas na prática:\n- Nunca usar "Vem pro fogo" no CTA (2026-09-06 — reprovado)\n- Horário no rodapé (2026-09-01 — peça empilhada)`
    await db.brandDNA.update({ where: { projectId: PROJETO }, data: { contentRules: regrasDeProva } })
    const v5 = await virarRegra({ projectId: PROJETO, regra: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: `${MARCA} o Ciro liberou para o evento`, secao: 'contentRules', confirmado: false })
    const dna5 = await db.brandDNA.findUnique({ where: { projectId: PROJETO }, select: { contentRules: true } })
    conferir('destino DNA, proposta com a linha nova, `conflitos` aponta a linha sobre "Vem pro fogo" (só ela), nada gravado', v5.destino === 'dna' && v5.gravado === false && v5.conflitos.length === 1 && /Vem pro fogo/.test(v5.conflitos[0]) && /Pode usar "Vem pro fogo"/.test(v5.depois) && dna5?.contentRules === regrasDeProva, JSON.stringify(v5.destino === 'dna' ? { conflitos: v5.conflitos } : v5).slice(0, 160))
    const e5 = await erroDe(virarRegra({ projectId: PROJETO, regra: 'Regra sem seção', motivo: 'm', confirmado: false }))
    conferir('sem seção e sem migração: continua exigindo a seção (o caminho da voz só vale para o cliente migrado)', !!e5 && /informe a seção/.test(e5.message), String(e5?.message).slice(0, 80))

    // ── 6. migrar ──────────────────────────────────────────────────────────
    console.log('6) migrar exige a versão lida, arquiva o DNA de texto e liga a precedência')
    const e6 = await erroDe(migrarParaVoz({ projectId: PROJETO, versaoEsperada: 1 }))
    conferir('versão errada → VOZ_DIVERGENTE e nada migrado', e6?.code === 'VOZ_DIVERGENTE' && !(await lerRegistroDaVoz(PROJETO))?.migradaEm, `${e6?.code}`)
    const m6 = await migrarParaVoz({ projectId: PROJETO, versaoEsperada: 3 })
    const r6 = await lerRegistroDaVoz(PROJETO)
    const arq6 = r6?.dnaArquivado as { toneOfVoice?: string | null; contentRules?: string | null; arquivadoEm?: string } | null
    conferir('migrada: `migradaEm` gravado, versão intacta (3), `dnaArquivado` com o toneOfVoice e o contentRules DO MOMENTO', !m6.jaEstava && !!r6?.migradaEm && r6.versao === 3 && arq6?.toneOfVoice === (dnaAntes?.toneOfVoice ?? null) && arq6?.contentRules === regrasDeProva && !!arq6?.arquivadoEm, JSON.stringify({ migradaEm: r6?.migradaEm, arquivadoEm: arq6?.arquivadoEm }))
    const m6b = await migrarParaVoz({ projectId: PROJETO, versaoEsperada: 3 })
    conferir('migrar de novo diz `jaEstava` e não regrava', m6b.jaEstava && (await lerRegistroDaVoz(PROJETO))?.migradaEm?.getTime() === r6?.migradaEm?.getTime())
    const dna6 = await db.brandDNA.findUnique({ where: { projectId: PROJETO }, select: { toneOfVoice: true, contentRules: true } })
    conferir('o DNA NÃO foi apagado pela migração', dna6?.toneOfVoice === (dnaAntes?.toneOfVoice ?? null) && dna6?.contentRules === regrasDeProva)

    // ── 7. migrado: a voz manda ────────────────────────────────────────────
    console.log('7) migrado, o loader entrega a VOZ e o DNA de texto sai da copy')
    const c7 = await contextoDeVoz(PROJETO)
    const b7 = await loadBrandContext(PROJETO)
    conferir('fonte "voz", versão 3, texto compacto (COMO A MARCA FALA, sem o toneOfVoice do DNA), regrasDaMarca null, regrasDeArte com a regra de arte', c7.fonte === 'voz' && c7.versao === 3 && !!c7.texto && /COMO A MARCA FALA/.test(c7.texto) && !c7.texto.includes(String(dnaAntes?.toneOfVoice?.slice(0, 40) ?? '@@')) && c7.regrasDaMarca === null && !!c7.regrasDeArte && /rodapé/.test(c7.regrasDeArte) && !/Vem pro fogo/.test(c7.regrasDeArte), JSON.stringify({ fonte: c7.fonte, versao: c7.versao, chars: c7.texto?.length, arte: c7.regrasDeArte?.length }))
    conferir('loadBrandContext.voz é o mesmo contexto; o texto da voz tem menos caracteres que o toneOfVoice legado', !!b7 && b7.voz.fonte === 'voz' && b7.voz.texto === c7.texto && (c7.texto?.length ?? 0) < (dnaAntes?.toneOfVoice?.length ?? 0), `${c7.texto?.length} × ${dnaAntes?.toneOfVoice?.length}`)
    conferir('a regra de COPY entra no texto da voz; a de ARTE não', !!c7.texto && /Vem pro fogo/.test(c7.texto) && !/rodapé/.test(c7.texto))
    registro.textoDaVoz = c7.texto

    // ── 8. virarRegra migrado: conflito, substituição, CAS, seção de arte ──
    console.log('8) virarRegra no cliente migrado vai para a VOZ: conflito recusado, substituição gravada com CAS')
    const v8a = await virarRegra({ projectId: PROJETO, regra: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: `${MARCA} o Ciro liberou para o evento`, escopo: 'copy', confirmado: true, versaoDaVoz: 3 })
    conferir('sem dizer o que fazer: destino voz, ok false, CONFLITO_DE_REGRA com a regra antiga listada, NADA gravado mesmo com confirmado', v8a.destino === 'voz' && v8a.ok === false && v8a.erro === 'CONFLITO_DE_REGRA' && v8a.conflitos.map((c) => c.id).join() === 'regra-2026-09-06-1' && v8a.gravado === false && (await lerRegistroDaVoz(PROJETO))?.versao === 3, JSON.stringify(v8a.destino === 'voz' && v8a.ok === false ? { erro: v8a.erro, conflitos: v8a.conflitos.map((c) => c.id) } : v8a).slice(0, 160))
    const v8b = await virarRegra({ projectId: PROJETO, regra: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: `${MARCA} o Ciro liberou para o evento`, escopo: 'copy', substitui: 'regra-2026-09-06-1', confirmado: false })
    conferir('com `substitui` e SEM confirmar: proposta (antes/depois), substituída identificada, versão não muda', v8b.destino === 'voz' && v8b.ok === true && v8b.gravado === false && v8b.versaoGravada === null && v8b.substituida?.id === 'regra-2026-09-06-1' && v8b.antes.some((l) => /Nunca usar/.test(l)) && !v8b.depois.some((l) => /Nunca usar/.test(l)) && (await lerRegistroDaVoz(PROJETO))?.versao === 3, JSON.stringify(v8b.destino === 'voz' && v8b.ok ? { antes: v8b.antes, depois: v8b.depois } : v8b).slice(0, 200))
    const e8semVersao = await erroDe(virarRegra({ projectId: PROJETO, regra: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: `${MARCA} o Ciro liberou para o evento`, escopo: 'copy', substitui: 'regra-2026-09-06-1', confirmado: true }))
    conferir('confirmar SEM a versão da proposta → VOZ_VERSAO_OBRIGATORIA (400), nada gravado (PR7-04)', e8semVersao?.code === 'VOZ_VERSAO_OBRIGATORIA' && e8semVersao.status === 400 && (await lerRegistroDaVoz(PROJETO))?.versao === 3, `${e8semVersao?.code}`)
    const e8versaoVelha = await erroDe(virarRegra({ projectId: PROJETO, regra: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: `${MARCA} o Ciro liberou para o evento`, escopo: 'copy', substitui: 'regra-2026-09-06-1', confirmado: true, versaoDaVoz: 2 }))
    conferir('confirmar com a versão de uma proposta ANTIGA → VOZ_DIVERGENTE (409), nada gravado (PR7-04)', e8versaoVelha?.code === 'VOZ_DIVERGENTE' && e8versaoVelha.status === 409 && (await lerRegistroDaVoz(PROJETO))?.versao === 3, `${e8versaoVelha?.code}`)
    const v8comprida = await virarRegra({ projectId: PROJETO, regra: 'x'.repeat(241), motivo: 'm', escopo: 'copy', confirmado: false })
    conferir('regra que a gravação recusaria já é recusada NA PRÉVIA (VOZ_RESULTANTE_INVALIDA) (PR7-03)', v8comprida.destino === 'voz' && v8comprida.ok === false && v8comprida.erro === 'VOZ_RESULTANTE_INVALIDA', JSON.stringify(v8comprida.destino === 'voz' && v8comprida.ok === false ? v8comprida.erro : v8comprida).slice(0, 80))
    const v8c = await virarRegra({ projectId: PROJETO, regra: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: `${MARCA} o Ciro liberou para o evento`, escopo: 'copy', substitui: 'regra-2026-09-06-1', confirmado: true, versaoDaVoz: 3 })
    const r8 = await lerRegistroDaVoz(PROJETO)
    const antiga8 = r8?.voz?.regras.find((r) => r.id === 'regra-2026-09-06-1')
    const nova8 = r8?.voz?.regras.find((r) => r.substitui === 'regra-2026-09-06-1')
    conferir('confirmado: gravado com CAS (versão 3 → 4), a antiga fica INATIVA no histórico e a nova aponta `substitui`', v8c.destino === 'voz' && v8c.ok === true && v8c.gravado && v8c.versaoGravada === 4 && r8?.versao === 4 && antiga8?.ativa === false && !!nova8 && nova8.ativa && nova8.escopo === 'copy', JSON.stringify({ versao: r8?.versao, antiga: antiga8?.ativa, nova: nova8?.id }))
    const c8 = await contextoDeVoz(PROJETO)
    conferir('no prompt da copy a regra antiga SAIU e a nova entrou', !!c8.texto && !/Nunca usar "Vem pro fogo"/.test(c8.texto) && /Pode usar "Vem pro fogo"/.test(c8.texto) && c8.versao === 4)
    const v8d = await virarRegra({ projectId: PROJETO, regra: 'Horário e CTA no rodapé sempre, mesmo sem endereço', motivo: `${MARCA} peça empilhada de novo`, escopo: 'arte', conviver: true, confirmado: false })
    conferir('regra de ARTE do mesmo assunto com `conviver`: aceita (as duas ficam), sem gravar', v8d.destino === 'voz' && v8d.ok === true && v8d.conflitos.length === 1 && v8d.gravado === false)
    const v8e = await virarRegra({ projectId: PROJETO, regra: `${MARCA} a logo sempre no canto inferior direito`, motivo: 'm', secao: 'composition', confirmado: false })
    conferir('seção de ARTE do DNA no cliente migrado continua indo ao DNA (a voz não substitui composition)', v8e.destino === 'dna' && v8e.secao === 'composition' && v8e.gravado === false)

    // ── 8b. prepareCreative entrega a identidade EFETIVA de texto (PR7-01) ──
    console.log('8b) prepareCreative (escolher-modelo / API externa) entrega a voz no cliente migrado — com um modelo de prova cadastrado só para isto')
    const { prepareCreative } = await import('../src/lib/creatives/arte-rapida')
    const templateDeProva = await db.template.create({
      data: { name: `${MARCA} template`, type: 'STORY', dimensions: '1080x1920', designData: {} as never, projectId: PROJETO, createdBy: projeto.userId, tags: ['prova-voz'] },
      select: { id: true },
    })
    templates.push(templateDeProva.id)
    const modeloDeProva = await db.page.create({
      data: {
        name: `${MARCA} modelo`,
        width: 1080,
        height: 1920,
        templateId: templateDeProva.id,
        isTemplate: true,
        tags: ['prova-voz'],
        layers: [{ id: 'prova-headline', name: 'headline', type: 'text', content: 'Título de prova', visible: true, locked: false, order: 1, position: { x: 100, y: 300 }, size: { width: 880, height: 120 }, style: { fontSize: 72, color: '#ffffff' } }] as never,
      },
      select: { id: true },
    })
    paginas.push(modeloDeProva.id)
    const prep = await prepareCreative({ projectId: PROJETO, theme: 'prova-voz' })
    conferir('brand.dna.toneOfVoice é o texto da VOZ (não o toneOfVoice do DNA), contentRules null, brand.voz.fonte "voz", e o modelo de prova foi o escolhido', !!prep.brand.dna && prep.brand.dna.toneOfVoice === c8.texto && prep.brand.dna.contentRules === null && prep.brand.voz.fonte === 'voz' && prep.page.id === modeloDeProva.id, JSON.stringify({ fonte: prep.brand.voz.fonte, chars: prep.brand.dna?.toneOfVoice?.length, page: prep.page.id === modeloDeProva.id }))
    // o mesmo chamador com a migração desfeita volta ao DNA (o caminho de volta); depois remigra para os passos seguintes
    await desfazerMigracao({ projectId: PROJETO })
    const prepLegado = await prepareCreative({ projectId: PROJETO, theme: 'prova-voz' })
    conferir('com a migração desfeita, prepareCreative volta ao DNA (toneOfVoice e contentRules do DNA, voz.fonte "legado" com vozPendente)', !!prepLegado.brand.dna && prepLegado.brand.dna.toneOfVoice === (dnaAntes?.toneOfVoice ?? null) && prepLegado.brand.dna.contentRules === regrasDeProva && prepLegado.brand.voz.fonte === 'legado' && prepLegado.brand.voz.vozPendente === true, JSON.stringify({ fonte: prepLegado.brand.voz.fonte }))
    const remigrada = await migrarParaVoz({ projectId: PROJETO, versaoEsperada: 4 })
    conferir('remigrada para os passos seguintes (versão 4)', !remigrada.jaEstava && !!(await lerRegistroDaVoz(PROJETO))?.migradaEm)

    // ── 9. a tool consultar-voz ────────────────────────────────────────────
    console.log('9) consultar-voz pelo catálogo do conector')
    const r9 = await executarToolLocal('consultar-voz', { projectId: PROJETO }, { kind: 'service', clientId: 'claude-code-local' })
    const texto9 = String((r9.content[0] as { text?: unknown } | undefined)?.text ?? '{}')
    const t9 = (r9.isError ? { erro: texto9 } : JSON.parse(texto9)) as Record<string, unknown>
    conferir('consultar-voz: fonte "voz", versão 4, voz presente, caracteres no prompt e do legado, mensagem de cliente MIGRADO', t9?.fonte === 'voz' && t9?.versao === 4 && !!t9?.voz && typeof t9?.caracteresNoPrompt === 'number' && /MIGRADO/.test(String(t9?.mensagem)), JSON.stringify({ fonte: t9?.fonte, versao: t9?.versao, chars: t9?.caracteresNoPrompt, legado: t9?.legado }).slice(0, 160))
    writeFileSync(resolve(SAIDA, 'consultar-voz.json'), JSON.stringify(t9, null, 2))

    // ── 10. desfazer ───────────────────────────────────────────────────────
    console.log('10) desfazer a migração devolve o legado; voz e snapshot ficam')
    const d10 = await desfazerMigracao({ projectId: PROJETO })
    const c10 = await contextoDeVoz(PROJETO)
    const r10 = await lerRegistroDaVoz(PROJETO)
    conferir(`desfeita: fonte volta a "${esperadoSemVoz}" com vozPendente, e a voz (versão 4) e o dnaArquivado continuam gravados`, d10.desfeita && c10.fonte === esperadoSemVoz && c10.vozPendente === true && r10?.migradaEm === null && r10.versao === 4 && !!r10.dnaArquivado, JSON.stringify({ fonte: c10.fonte, versao: r10?.versao }))
    conferir('desfazer de novo não desfaz nada', (await desfazerMigracao({ projectId: PROJETO })).desfeita === false)
  } catch (erro) {
    console.error('\n✗ a prova parou:', erro instanceof Error ? erro.stack ?? erro.message : erro)
    mau++
  } finally {
    console.log('\ncleanup (a voz da prova sai; o DNA volta ao que era)')
    const falhasDoCleanup: string[] = []
    const passo = async (nome: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        falhasDoCleanup.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await passo('modelo e template de prova', async () => {
      await db.learningSignal.deleteMany({ where: { projectId: PROJETO, pageId: { in: paginas } } })
      await db.page.deleteMany({ where: { id: { in: paginas } } })
      await db.template.deleteMany({ where: { id: { in: templates }, projectId: PROJETO } })
    })
    await passo('voz da prova', async () => { await db.brandVoice.deleteMany({ where: { projectId: PROJETO } }) })
    if (vozAntes) {
      await passo('voz anterior recriada', async () => {
        const { id: _id, createdAt: _c, updatedAt: _u, ...resto } = vozAntes as Record<string, unknown> & { id: number; createdAt: Date; updatedAt: Date }
        await db.brandVoice.create({ data: resto as never })
      })
    }
    await passo('DNA restaurado', async () => { await db.brandDNA.update({ where: { projectId: PROJETO }, data: { contentRules: dnaAntes?.contentRules ?? null } }) })
    const dnaDepois = await db.brandDNA.findUnique({ where: { projectId: PROJETO }, select: { toneOfVoice: true, contentRules: true } })
    if (dnaDepois?.contentRules !== (dnaAntes?.contentRules ?? null) || dnaDepois?.toneOfVoice !== (dnaAntes?.toneOfVoice ?? null)) falhasDoCleanup.push('o DNA não voltou ao que era')
    if ((await db.brandVoice.count({ where: { projectId: PROJETO } })) !== (vozAntes ? 1 : 0)) falhasDoCleanup.push('BrandVoice não voltou ao estado anterior')
    if (falhasDoCleanup.length) {
      console.error('  ✗ cleanup incompleto:', falhasDoCleanup.join(' | '))
      mau += falhasDoCleanup.length
    } else console.log('  ✓ BrandVoice e DNA como antes')
    writeFileSync(resolve(SAIDA, 'resultado.json'), JSON.stringify({ ...registro, pendentes, ok, falhas: mau, falhasDoCleanup }, null, 2))
    console.log(`\n${ok} ok, ${mau} falha(s). Saída em ${resolve(SAIDA)}`)
    await db.$disconnect()
    process.exit(mau > 0 ? 1 : 0)
  }
}

main()
