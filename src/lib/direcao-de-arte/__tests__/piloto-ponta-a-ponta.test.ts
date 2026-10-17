/**
 * CP5e § 3 — a PROVA PONTA A PONTA sintética do fluxo autônomo: compor → revisar → ajustar → revisar → agendar DRAFT,
 * pelos serviços REAIS (`comporPeca`, `revisarArte`, `ajustarArte`, `agendarItensDoLote`, `agendar.ts`) sobre o banco
 * falso com travas (`suporte/banco-com-travas.ts`) e a MEDIÇÃO REAL (renderer de produção, medidor real de texto).
 *
 * O que é REAL aqui: compositor, revisor (com o gate como informação), CP4, gate dos produtores, agendar.ts (até o DRAFT),
 * recompor (alvo e trava). O que é FALSO (dito): `@/lib/db` (banco em memória com travas), Blob, fontes (sem rede; as
 * famílias da fixture declaradas presentes), persistência do render (cria/fecha a Generation no banco falso), efeitos
 * pós-commit (espionados: NÃO rodam no draft-only — E8), aprendizado, pastas (`garantirPasta`).
 * O que banco falso + medição real NÃO provam: a semântica real das travas/SQL no Postgres, persistência e render no Blob,
 * autorização MCP, o comportamento do chat, custo/repetibilidade (§ 4.8).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Linha } from './suporte/banco-com-travas'

const harness = await vi.hoisted(async () => (await import('./suporte/banco-com-travas')).criarBancoComTravas())
const banco = harness.banco
const espioes = vi.hoisted(() => ({
  invalidar: vi.fn(async () => ({ invalidados: 0, congelados: [] as string[] })),
  efeitos: vi.fn(async () => ({ falhas: [] as unknown[] })),
  renders: [] as Array<{ generationId?: string | null; pageId: string }>,
  /** E7: a conferência de fontes FALHA (não é fonte ausente — é a leitura que não roda). */
  fontesFalham: false,
  /** I3: a DECISÃO do gate lança (fail-closed → `nao-medida`; a revisão humana sai do mesmo jeito). */
  decisaoFalha: false,
  /** E-div: as medidas feitas pelos produtores (fora do revisar-arte). */
  medidasDeFora: [] as Array<{ corrigir: boolean; contraste: string }>,
  /** E8: nenhum `fetch` para fora em caso algum. */
  fetchs: 0,
}))

vi.mock('@/lib/db', () => ({ db: harness.db }))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (c: string) => ({ url: `https://blob.test/${c}` })), del: vi.fn(async () => undefined) }))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: (...a: unknown[]) => espioes.invalidar(...(a as [])) }))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null), registrarSugestao: vi.fn(async () => null), registrarSugestoes: vi.fn(async () => null), registrarSinal: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ fecharDicaDeCopyDaPagina: async () => ({ estado: 'sem-plano' }), caiNaEscolhaPropria: () => false }))
vi.mock('@/lib/creatives/text-autofix', () => ({ aplicarAutofixOuFalhar: async (a: { layers: unknown[] }) => ({ layers: a.layers, autocorrecao: { necessaria: false, aplicada: false, iteracoes: 0, ajustes: [], pendencias: [] }, avisos: [] }) }))
vi.mock('@/lib/creatives/uso-de-foto', () => ({ registrarUsoDeFoto: async () => undefined }))
vi.mock('@/lib/creatives/acervo', () => ({ lerCatalogoDoProjeto: async () => ({ catalogo: null, todas: [] }) }))
vi.mock('@/lib/assets/gradients-library', async (original) => {
  const { fixture } = await import('./suporte/fixture')
  return {
    ...(await original<typeof import('@/lib/assets/gradients-library')>()),
    gradientesDoProjeto: () => ({
      daMarca: fixture.marca().candidatasDoVeuNaBibliotecaAtual.map((cor: string, i: number) => ({ id: `fixture-veu-${i}`, label: `fixture ${cor}`, gradientType: 'linear' as const, gradientAngle: 0, gradientStops: [{ id: `p-${i}`, color: cor, opacity: 1, position: 0 }] })),
      gerais: [],
    }),
  }
})
// Sem rede: a foto/logo vêm de data URLs da fixture; as famílias da marca contam como carregadas.
vi.mock('@/lib/posts/register-project-fonts', () => ({
  registerProjectFonts: async () => undefined,
  fetchBuffer: async (url: string) => {
    if (url.startsWith('data:image/png;base64,')) return Buffer.from(url.slice('data:image/png;base64,'.length), 'base64')
    throw new Error(`sem rede para ${url.slice(0, 40)}`)
  },
  familiasNaoCarregadas: async () => new Set<string>(),
}))
vi.mock('@napi-rs/canvas', async (original) => {
  const m = await original<typeof import('@napi-rs/canvas')>()
  const daFixture = ['Branley GC', 'StageGrotesk Thin', 'StageGrotesk Regular'].map((family) => ({ family, styles: [400, 700].map((weight) => ({ weight, width: 'normal', style: 'normal' })) }))
  // Um objeto próprio (não um Proxy: `has` e `registerFromPath` são propriedades não configuráveis do objeto nativo e o Proxy
  // violaria o invariante ao devolvê-las ligadas) com o que a produção usa: `families`, `has`, `registerFromPath`.
  const real = m.GlobalFonts
  const GlobalFonts = {
    get families() {
      // E7: a CONFERÊNCIA de fontes falha (não é fonte ausente): `fontesQueFaltam` lê `GlobalFonts.families`.
      if (espioes.fontesFalham) throw new Error('a conferência de fontes caiu (simulado)')
      return [...(real as any).families, ...daFixture]
    },
    has: (familia: string) => real.has(familia) || daFixture.some((d) => d.family === familia),
    registerFromPath: (...a: Parameters<typeof real.registerFromPath>) => real.registerFromPath(...a),
  }
  return { ...m, GlobalFonts }
})
// A persistência do render sobre o banco falso: a Page nasce (compor) e a Generation é criada/fechada com a versão.
vi.mock('@/lib/creatives/persist', async (original) => {
  const real = await original<typeof import('@/lib/creatives/persist')>()
  const { versaoDaPagina } = await import('@/lib/creatives/revisao/versao')
  const render = async (input: { project: { id: number }; templateId: number; templateName: string; page: Linha; fieldValues: Record<string, unknown>; generationId?: string | null; authorName?: string }) => {
    const db = harness.db as unknown as Linha
    const url = `https://blob.test/${input.page.id}-${++banco.seq}.png`
    const versaoRenderizada = versaoDaPagina(input.page as never)
    const fieldValues = { ...input.fieldValues, pageId: input.page.id, versaoRenderizada }
    let generationId = input.generationId ?? null
    espioes.renders.push({ generationId, pageId: input.page.id })
    if (generationId) {
      const g = banco.generations.get(generationId)!
      await db.generation.update({ where: { id: generationId }, data: { status: 'COMPLETED', resultUrl: url, completedAt: new Date(), fieldValues: { ...g.fieldValues, ...fieldValues } } })
    } else {
      const g = await db.generation.create({ data: { status: 'COMPLETED', resultUrl: url, projectId: input.project.id, templateId: input.templateId, templateName: input.templateName, authorName: input.authorName ?? 'teste', sourcePageId: null, fieldValues }, select: { id: true } })
      generationId = g.id
    }
    await db.page.update({ where: { id: input.page.id }, data: { thumbnail: url } })
    return { generationId, pageId: input.page.id, templateId: input.templateId, templateName: input.templateName, url, editUrl: `https://studio.test/templates/${input.templateId}/editor?pageId=${input.page.id}`, galleryUrl: 'https://studio.test/galeria', width: input.page.width, height: input.page.height, sizeKB: 1 }
  }
  return {
    ...real,
    getPublicAppUrl: () => 'https://studio.test',
    resolveImageUrl: async () => ({ url: null }),
    renderPageAndRegister: render,
    persistAndRenderCreative: async (input: Linha) => {
      const db = harness.db as unknown as Linha
      const template = banco.templates.get(String(input.templateId))!
      const page = await db.page.create({
        data: { name: input.pageName, width: input.width, height: input.height, layers: input.layers, background: input.background ?? null, order: input.pageOrder ?? 0, templateId: input.templateId, isTemplate: false, tags: input.pageTags ?? ['arte-rapida'], copyAutoral: input.copyAutoral ?? null, thumbnail: null, audio: null, updatedAt: new Date('2026-10-17T00:00:00Z'), Template: { id: template.id, name: template.name, projectId: template.projectId } },
      })
      return render({ project: input.project, templateId: input.templateId, templateName: input.templateName, page, fieldValues: input.fieldValues, generationId: input.generationId ?? null, authorName: input.authorName })
    },
  }
})
vi.mock('@/lib/compositor/pastas', async (original) => ({
  ...(await original<typeof import('@/lib/compositor/pastas')>()),
  garantirPasta: async () => ({ id: 42, name: 'Pasta da semana' }),
  refilarPaginasDoPost: async () => ({ avisos: [], falhou: false }),
}))
// E-div: a medida que os PRODUTORES (agendar-leva, ajustar-arte) fazem fica registrada (`corrigir` e o `contraste`), para
// comparar com a medida fiel do gate informativo. A chamada INTERNA do revisar-arte não passa por aqui (mesmo módulo).
vi.mock('@/lib/creatives/revisao/revisar-arte', async (original) => {
  const real = await original<typeof import('@/lib/creatives/revisao/revisar-arte')>()
  return {
    ...real,
    medirCamadasDaPeca: async (...a: Parameters<typeof real.medirCamadasDaPeca>) => {
      const m = await real.medirCamadasDaPeca(...a)
      espioes.medidasDeFora.push({ corrigir: a[2]?.corrigir !== false, contraste: JSON.stringify(m.contraste) })
      return m
    },
  }
})
// I3: a decisão do gate pode ser derrubada de propósito (o resto do gate-registro é o real).
vi.mock('@/lib/creatives/revisao/gate-registro', async (original) => {
  const real = await original<typeof import('@/lib/creatives/revisao/gate-registro')>()
  return {
    ...real,
    decidirEMontarRegistro: (...a: Parameters<typeof real.decidirEMontarRegistro>) => {
      if (espioes.decisaoFalha) throw new Error('a decisão caiu (simulado)')
      return real.decidirEMontarRegistro(...a)
    },
  }
})
vi.mock('@/lib/compositor/recompor', async (original) => ({ ...(await original<typeof import('@/lib/compositor/recompor')>()), pedirRecomposicaoDaArteCongelada: vi.fn(async () => null) }))
// agendar.ts REAL até o DRAFT; os efeitos pós-commit são espionados (E8: no draft-only NÃO rodam).
vi.mock('@/lib/creatives/agendar', async (original) => ({ ...(await original<typeof import('@/lib/creatives/agendar')>()), efeitosDoAgendamento: (...a: unknown[]) => espioes.efeitos(...(a as [])) }))

import type { Layer } from '@/types/template'
import type { Ajuste } from '@/lib/creatives/revisao/contrato'
import { comporPeca } from '@/lib/compositor/compor'
import { revisarArte, medirCamadasDaPeca, contextoDaMedicao } from '@/lib/creatives/revisao/revisar-arte'
import { ajustarArte } from '@/lib/creatives/arte-rapida'
import { agendarItensDoLote } from '@/lib/lotes/agendar-itens'
import { CreativeError } from '@/lib/creatives/errors'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { lerGateDaArte } from '@/lib/creatives/revisao/gate-registro'
import { CONFERENCIAS_DO_GATE, REGRAS_CRITICAS } from '@/lib/creatives/revisao/gate'
import { blocoDoGate } from '@/lib/mcp/catalogo/ver-geracao-retorno'
import { resumoDoGateDosPosts } from '@/lib/creatives/revisao/gate-resumo'
import { auditarOperacao } from '@/lib/posts/auditar-operacao'
import { arquivosDaFixture, comArquivos, fixture } from './suporte/fixture'
import { PECA_LIMPA } from './suporte/peca-limpa'
import { CODIGOS } from './suporte/propriedades'

const PROJETO = 8
const LOTE = 'dot-8-2026-S43'
let arquivos: Record<string, string>

/** A assinatura SINTÉTICA limpa: as posições/cores da peça limpa como variante (fontes da marca declaradas presentes). */
function assinaturaLimpa() {
  const layers = structuredClone(PECA_LIMPA.layers).map((l) => ({ ...l, style: { ...l.style, fontFamily: l.id === 'headline' ? 'Branley GC' : l.id === 'apoio' ? 'StageGrotesk Thin' : 'StageGrotesk Regular' } }))
  return { id: 'assinatura-limpa', name: 'Assinatura limpa — story', tags: ['story'], width: 1080, height: 1920, background: '#000000', layers, templateId: 7, isTemplate: true, order: 0, copyAutoral: null, audio: null, thumbnail: null, updatedAt: new Date('2026-10-01T00:00:00Z'), Template: { id: 7, name: 'Assinatura', projectId: PROJETO } }
}
/** A assinatura da FIXTURE (a composição legada 250/350 — E0-legado). */
function assinaturaDaFixture() {
  const assinatura = fixture.assinatura()
  return { ...assinatura.pagina, layers: comArquivos(assinatura.pagina.layers, arquivos), templateId: 7, isTemplate: true, order: 0, copyAutoral: null, audio: null, thumbnail: null, updatedAt: new Date('2026-10-01T00:00:00Z'), Template: { id: 7, name: 'Assinatura', projectId: PROJETO } }
}

function semear(opcoes: { assinatura?: 'limpa' | 'fixture' } = {}) {
  harness.reset()
  espioes.invalidar.mockClear()
  espioes.efeitos.mockClear()
  espioes.renders = []
  espioes.fontesFalham = false
  espioes.decisaoFalha = false
  espioes.medidasDeFora = []
  const numeros = fixture.assinatura().numerosDoProjeto as Record<string, unknown>
  const limpa = opcoes.assinatura !== 'fixture'
  banco.projects.set(String(PROJETO), { id: PROJETO, name: 'Cliente sintético', status: 'ACTIVE', userId: 'dono', instagramAccountId: null, assinatura: limpa ? { ...numeros, fundo: '#000000', mancha: '#000000', logo: { largura: 0 } } : numeros, Logo: [], titleFontFamily: null, bodyFontFamily: null, subtitleFontFamily: null })
  banco.templates.set('7', { id: 7, name: 'Assinatura', projectId: PROJETO })
  banco.templates.set('42', { id: 42, name: 'Pasta da semana', projectId: PROJETO })
  const pagina = limpa ? assinaturaLimpa() : assinaturaDaFixture()
  banco.pages.set(pagina.id, pagina)
}

const SPEC_LIMPA = {
  projectId: PROJETO,
  formato: 'story',
  quando: '2026-10-21 10:00',
  tema: 'Prova ponta a ponta',
  blocos: [
    { papel: 'headline', linhas: ['Texto headline'] },
    { papel: 'apoio', linhas: ['Texto apoio'] },
    { papel: 'servico', linhas: ['Texto servico'] },
  ],
}

/**
 * E0 → o ponto de partida dos casos: a peça COMPOSTA pelo compositor REAL (assinatura sintética limpa) no banco falso, com a
 * Generation do compositor (desta versão) e o item do lote. `editar` simula o editor mexendo na página DEPOIS da composição
 * (a versão muda; a composição deixa de ser reaproveitada, como na produção).
 */
async function pecaComposta(opcoes: { editar?: (layers: Layer[]) => Layer[]; copy?: unknown } = {}) {
  const r = await comporPeca(SPEC_LIMPA)
  const pageId = r.persistido!.pageId
  const generationId = [...banco.generations.values()].find((g) => g.fieldValues?.source === 'compositor' && g.fieldValues?.pageId === pageId)!.id
  if (opcoes.editar || opcoes.copy !== undefined) {
    const p = banco.pages.get(pageId)!
    banco.pages.set(pageId, { ...p, layers: opcoes.editar ? opcoes.editar(p.layers as Layer[]) : p.layers, ...(opcoes.copy !== undefined ? { copyAutoral: opcoes.copy } : {}) })
  }
  const itemId = `item-${pageId}`
  banco.itensDeLote.set(`lote-${pageId}`, { id: `lote-${pageId}`, projectId: PROJETO, loteId: LOTE, itemId, generationId, postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null, payload: null })
  return { pageId, generationId, itemId }
}

/** A peça LIMPA montada à mão (o controle positivo dos pilotos), com a Generation do compositor desta versão e o item do lote. */
function pecaLimpaNoBanco(opcoes: { layers?: Layer[]; id?: string } = {}) {
  const id = opcoes.id ?? 'p-limpa'
  const layers = opcoes.layers ?? structuredClone(PECA_LIMPA.layers)
  const page = { id, templateId: 42, isTemplate: false, name: `Qua 21/10 · 10:00 · story`, tags: ['compositor', 'story'], width: 1080, height: 1920, background: PECA_LIMPA.background, layers, copyAutoral: PECA_LIMPA.copy, audio: null, thumbnail: 'https://blob.test/limpa-v0.png', order: 0, updatedAt: new Date('2026-10-17T00:00:00Z'), Template: { id: 42, name: 'Pasta da semana', projectId: PROJETO } }
  banco.pages.set(id, page)
  const gid = `g-${id}`
  banco.generations.set(gid, { id: gid, projectId: PROJETO, status: 'COMPLETED', resultUrl: 'https://blob.test/limpa-v0.png', slideOrder: null, sourcePageId: null, createdAt: ++banco.seq, fieldValues: { source: 'compositor', pageId: id, versaoRenderizada: versaoDaPagina(page as never), composicao: { assinatura: { pageId: fixture.assinatura().pagina.id } }, spec: { projectId: PROJETO, formato: 'story', quando: '2026-10-21 10:00', tema: 'Prova', blocos: [{ papel: 'headline', linhas: ['Texto headline'] }] } } })
  banco.itensDeLote.set(`lote-${id}`, { id: `lote-${id}`, projectId: PROJETO, loteId: LOTE, itemId: `item-${id}`, generationId: gid, postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null, payload: null })
  return { pageId: id, generationId: gid, itemId: `item-${id}` }
}

const revisar = (pageId: string) => revisarArte({ projectId: PROJETO, pageId, visao: false, previa: false })
const agendar = (itemId: string) => agendarItensDoLote({ projectId: PROJETO, loteId: LOTE, itens: [{ itemId }], apenasRascunho: true, principal: { tipo: 'user', id: 'dot' } })
const ajustar = (pageId: string, ajustes: Ajuste[], versaoEsperada: string) => ajustarArte({ projectId: PROJETO, pageId, versaoEsperada, ajustes, apenasRascunho: true, principal: { tipo: 'user', id: 'dot' } })
const erroDe = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e)
const posts = () => [...banco.posts.values()]
/** I2/I4/I5 em toda revisão medida: motivos nas duas famílias (crítica medida ⇒ há achado dela no relatório), identidade da leitura, APTO só com naoMedidos vazio. */
const gateMedido = (r: Awaited<ReturnType<typeof revisar>>) => {
  expect(r.gate.tipo).toBe('medida')
  const gate = r.gate as Extract<typeof r.gate, { tipo: 'medida' }>
  const criticas = new Set<string>(REGRAS_CRITICAS)
  const conferencias = new Set<string>(CONFERENCIAS_DO_GATE)
  for (const m of gate.motivos) {
    expect(criticas.has(m.regra) || conferencias.has(m.regra), m.regra).toBe(true)
    if (m.codigo === 'ACHADO_CRITICO' && criticas.has(m.regra)) expect(r.relatorio.achados.some((a) => a.regra === m.regra), `${m.regra}: achado no relatório`).toBe(true)
  }
  // I2 — o CÓDIGO de cada motivo é o permitido pela cobertura e pela política efetivas: ACHADO_CRITICO só com achado `problema`
  // medido na regra; NAO_COMPROVADA só em conferência própria do gate, em regra cuja cobertura não é `avaliada`, ou no assunto sob
  // a política (estimado → humano); NAO_MEDIDO só com a regra em `naoMedidos`/cobertura parcial; IDENTIDADE_ILEGIVEL só em identidade.
  // As regras da RÉGUA são as que a medida corrigida do revisor pode deixar limpas enquanto a fiel reprova (é o que E-div prova).
  const daRegua = new Set(['texto-sem-leitura', 'tratamento-piorou-leitura'])
  for (const m of gate.motivos) {
    const cob = (r.relatorio.cobertura as Record<string, { estado?: string } | undefined>)[m.regra]
    if (m.codigo === 'ACHADO_CRITICO') {
      // O gate avalia a medida FIEL: um crítico numa conferência própria (piso) não tem contraparte no relatório; nas regras
      // da régua o relatório (corrigido) pode estar limpo; nas demais o relatório tem ao menos um achado na regra.
      if (!conferencias.has(m.regra) && !daRegua.has(m.regra)) expect(r.relatorio.achados.some((a) => a.regra === m.regra), `${m.regra}: ACHADO_CRITICO com achado no relatório`).toBe(true)
    } else if (m.codigo === 'NAO_COMPROVADA') expect(conferencias.has(m.regra) || !cob || cob.estado !== 'avaliada' || m.regra === 'texto-sobre-assunto', `${m.regra}: NAO_COMPROVADA (cobertura ${cob?.estado})`).toBe(true)
    else if (m.codigo === 'NAO_MEDIDO') expect(gate.naoMedidos.some((n) => n.regra === m.regra) || cob?.estado === 'parcial', `${m.regra}: NAO_MEDIDO`).toBe(true)
    else if (m.codigo === 'IDENTIDADE_ILEGIVEL') expect(m.regra).toBe('identidade')
    else expect.unreachable(`código desconhecido ${String(m.codigo)}`)
  }
  // A direção essencial: todo `problema` do relatório numa regra crítica do gate (o relatório vem da medida CORRIGIDA; o que
  // está mal mesmo com a correção está mal na fiel) ⇒ o gate recusa com um motivo NESSA regra.
  for (const a of r.relatorio.achados) {
    if (a.severidade !== 'problema' || !criticas.has(a.regra)) continue
    expect(gate.resultado, `${a.regra} é problema no relatório`).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(gate.motivos.some((m) => m.regra === a.regra), `${a.regra}: motivo no gate`).toBe(true)
  }
  expect(gate.pageVersion).toBe(r.versao)
  if (gate.resultado === 'APTO') expect(gate.naoMedidos).toEqual([])
  expect(gate.informacao).toMatch(/não autoriza, não grava/)
  return gate
}
const blocoDe = (generationId: string) => {
  const g = banco.generations.get(generationId)!
  const pg = banco.pages.get(g.fieldValues.pageId)!
  return blocoDoGate({ fieldValues: g.fieldValues, generationId, projectId: PROJETO, pagina: { id: pg.id, name: pg.name, templateId: pg.templateId, isTemplate: pg.isTemplate, tags: pg.tags, width: pg.width, height: pg.height, background: pg.background, layers: pg.layers, copyAutoral: pg.copyAutoral } })
}
const resumo = () =>
  resumoDoGateDosPosts({
    posts: posts().map((p) => ({ id: p.id, projectId: p.projectId, pageId: p.pageId ?? null, generationId: p.generationId ?? null })),
    generations: [...banco.generations.values()].map((g) => ({ id: g.id, projectId: g.projectId, fieldValues: g.fieldValues })),
    pages: [...banco.pages.values()].map((pg) => ({ id: pg.id, name: pg.name, tags: pg.tags, width: pg.width, height: pg.height, background: pg.background, layers: pg.layers, copyAutoral: pg.copyAutoral, Template: pg.Template ? { projectId: pg.Template.projectId } : null })),
    permitidos: null,
  })
/** E9: a auditoria REAL da carteira (janela hoje → depois de amanhã a partir de 20/10 09:00 BRT: pega o DRAFT de 21/10 10:00). */
const auditoria = () => auditarOperacao({ permitidos: null, agora: new Date('2026-10-20T12:00:00Z') })
/** E8: em TODO caso draft-only, nenhum efeito pós-commit (lembrete, Zernio, webhook) roda. */
const semEfeitos = () => expect(espioes.efeitos).not.toHaveBeenCalled()

beforeAll(async () => {
  arquivos = await arquivosDaFixture()
}, 60_000)
beforeEach(() => {
  semear()
  espioes.fetchs = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (...a: unknown[]) => {
    espioes.fetchs++
    throw new Error(`fetch para fora em teste hermético: ${String(a[0]).slice(0, 60)}`)
  })
})
afterEach(() => {
  semEfeitos()
  // E8: nenhum `fetch` para fora (Zernio, WhatsApp, webhook, Blob) em caso algum.
  expect(espioes.fetchs).toBe(0)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('E0 — compor de verdade', () => {
  it('o compositor REAL compõe a spec limpa com a assinatura SINTÉTICA limpa no banco falso: Page + Generation do compositor (desta versão) nascem do fluxo real e revisar-arte informa APTO com o vínculo na Generation composta', async () => {
    const { pageId, generationId } = await pecaComposta()
    const pagina = banco.pages.get(pageId)!
    expect(banco.generations.get(generationId)).toMatchObject({ status: 'COMPLETED', fieldValues: { source: 'compositor', pageId, versaoRenderizada: versaoDaPagina(pagina as never) } })
    expect(espioes.renders).toHaveLength(1)
    const rev = await revisar(pageId)
    const gate = gateMedido(rev)
    expect(gate.resultado).toBe('APTO')
    expect(gate.vinculo).toEqual({ generationId, postType: 'STORY' })
    expect(posts()).toEqual([])
  }, 240_000)

  it('E0-legado (medido, limite dito): com a assinatura da FIXTURE a composição legada (geometria 250/350) pousa título/serviço/logo dentro do piso de interface 188/224 e o título escuro sobre o fundo escuro → o gate informa REVISAO_HUMANA_NECESSARIA (P6 da trilha de design, não defeito do gate)', async () => {
    semear({ assinatura: 'fixture' })
    const r = await comporPeca(SPEC_LIMPA)
    const pageId = r.persistido!.pageId
    const rev = await revisar(pageId)
    const gate = gateMedido(rev)
    expect(gate.resultado).toBe(CODIGOS.revisaoHumana)
    expect(gate.motivos.map((m) => m.regra)).toContain('piso-de-interface')
    expect(posts()).toEqual([])
  }, 240_000)
})

describe('E1/E2/E3 — APTO → DRAFT; não APTO → nenhum DRAFT; corrigir e agendar', () => {
  it('E1: a peça limpa é APTA (informação) → agendar-leva draft-only cria o DRAFT, grava o registro APTO; ver-geracao rotula coincidente; auditar-operacao conta 1 em coincidente.APTO', async () => {
    const { pageId, generationId, itemId } = await pecaComposta()
    const escritasAntes = banco.eventos.filter((e) => e.e.startsWith('escrita:')).length
    const rev = await revisar(pageId)
    // I1: revisar-arte não escreve nada (nem a Generation, nem a página).
    expect(banco.eventos.filter((e) => e.e.startsWith('escrita:')).length).toBe(escritasAntes)
    expect(gateMedido(rev).resultado).toBe('APTO')
    const lote = await agendar(itemId)
    expect(lote.itens[0]).toMatchObject({ desfecho: 'criado', revisao: { tipo: 'medida', resultado: 'APTO' } })
    expect(posts()).toHaveLength(1)
    expect(posts()[0]).toMatchObject({ status: 'DRAFT', pageId, generationId })
    const leitura = lerGateDaArte(banco.generations.get(generationId)!.fieldValues)
    expect(leitura.estado).toBe('ok')
    expect(blocoDe(generationId)).toMatchObject({ validade: 'coincidente', resultado: 'APTO', origem: 'agendar-leva' })
    expect(resumo().total).toMatchObject({ posts: 1, coincidente: { APTO: 1 }, historico: 0, semRegistro: 0 })
    // E9 pelo serviço REAL: auditarOperacao sobre o banco deixado pelo caso (nenhuma medição, nenhuma escrita).
    const escritas = banco.eventos.filter((e) => e.e.startsWith('escrita:')).length
    const aud = await auditoria()
    expect(aud.gate).toMatchObject({ posts: 1, coincidente: { APTO: 1 } })
    expect(aud.clientes.find((c) => c.projectId === PROJETO)?.gate).toMatchObject({ posts: 1, coincidente: { APTO: 1 } })
    expect(banco.eventos.filter((e) => e.e.startsWith('escrita:')).length).toBe(escritas)
  }, 240_000)

  const APOIO_NA_MARGEM = (ls: Layer[]) => ls.map((l) => (l.id === 'apoio' ? { ...l, position: { ...l.position, x: 820 }, size: { ...l.size, width: 300 } } : l))

  it('E2: o apoio invadindo a margem de segurança → revisar-arte informa REVISAO_HUMANA_NECESSARIA (fora-da-area-segura) e propõe o mover → agendar-leva não cria post; o veredito reprovado fica registrado; nada para a auditoria contar nesta página', async () => {
    const { pageId, generationId, itemId } = await pecaComposta({ editar: APOIO_NA_MARGEM })
    const rev = await revisar(pageId)
    const gate = gateMedido(rev)
    expect(gate.resultado).toBe(CODIGOS.revisaoHumana)
    expect(gate.motivos.map((m) => m.regra)).toContain('fora-da-area-segura')
    expect(rev.relatorio.ajustes.some((a) => a.tipo === 'mover')).toBe(true)
    const lote = await agendar(itemId)
    expect(lote.itens[0]).toMatchObject({ situacao: 'falhou', codigo: CODIGOS.revisaoHumana })
    expect(posts()).toEqual([])
    // O veredito REPROVADO fica registrado na Generation da peça (CP5c) e ver-geracao o lê como coincidente/REVISAO_HUMANA_NECESSARIA.
    expect(lerGateDaArte(banco.generations.get(generationId)!.fieldValues)).toMatchObject({ estado: 'ok', registro: { gate: { resultado: CODIGOS.revisaoHumana }, origem: 'agendar-leva' } })
    expect(blocoDe(generationId)).toMatchObject({ validade: 'coincidente', resultado: CODIGOS.revisaoHumana })
    expect(resumo().total.posts).toBe(0)
    // E9 pelo serviço REAL: sem post, nada a contar (o registro reprovado está na Generation, não em post algum).
    expect((await auditoria()).gate).toMatchObject({ posts: 0, semRegistro: 0, coincidente: { APTO: 0, REVISAO_HUMANA_NECESSARIA: 0 } })
  }, 240_000)

  it('E2b: o apoio sobre o piso de interface (conferência SÓ do gate: o revisor não tem regra nem ajuste para isso) → gate REVISAO_HUMANA_NECESSARIA (piso-de-interface) sem ajuste a propor → agendar-leva não cria post', async () => {
    const { pageId, itemId } = await pecaComposta({ editar: (ls) => ls.map((l) => (l.id === 'apoio' ? { ...l, position: { ...l.position, y: 1750 } } : l)) })
    const rev = await revisar(pageId)
    const gate = gateMedido(rev)
    expect(gate.resultado).toBe(CODIGOS.revisaoHumana)
    expect(gate.motivos.map((m) => m.regra)).toContain('piso-de-interface')
    // O revisor não vê o piso: nenhum achado, nenhum ajuste — é o caso em que a tool diz "leve à pessoa".
    expect(rev.relatorio.ajustes).toEqual([])
    const lote = await agendar(itemId)
    expect(lote.itens[0]).toMatchObject({ situacao: 'falhou', codigo: CODIGOS.revisaoHumana })
    expect(posts()).toEqual([])
  }, 240_000)

  it('E3: o caso E2 (apoio na margem) corrigido pelo próprio revisor — o `mover` que ele propõe, por ajustar-arte draft-only → APTO → agendar-leva cria o DRAFT; dois registros (ajuste e lote) com a MESMA pageVersion', async () => {
    const { pageId, generationId, itemId } = await pecaComposta({ editar: APOIO_NA_MARGEM })
    const antes = await revisar(pageId)
    const gateAntes = gateMedido(antes)
    expect(gateAntes.resultado).toBe(CODIGOS.revisaoHumana)
    expect(gateAntes.motivos.map((m) => m.regra)).toContain('fora-da-area-segura')
    const mover = antes.relatorio.ajustes.filter((a) => a.tipo === 'mover' && (a as { camadas?: string[] }).camadas?.includes('apoio'))
    expect(mover.length).toBeGreaterThan(0)
    const r = await ajustar(pageId, mover as unknown as Ajuste[], antes.versao!)
    expect(r).toMatchObject({ ajustada: true, revisao: { tipo: 'medida', resultado: 'APTO' } })
    const depois = await revisar(pageId)
    expect(gateMedido(depois).resultado).toBe('APTO')
    const lote = await agendar(itemId)
    expect(lote.itens[0]).toMatchObject({ desfecho: 'criado', revisao: { tipo: 'medida', resultado: 'APTO' } })
    const pageVersion = versaoDaPagina(banco.pages.get(pageId)! as never)
    const doAjuste = lerGateDaArte(banco.generations.get(r.generationId!)!.fieldValues)
    const doLote = lerGateDaArte(banco.generations.get(generationId)!.fieldValues)
    expect(doAjuste).toMatchObject({ estado: 'ok', registro: { origem: 'ajustar-arte', identidade: { pageVersion } } })
    expect(doLote).toMatchObject({ estado: 'ok', registro: { origem: 'agendar-leva', identidade: { pageVersion } } })
    expect(espioes.invalidar).toHaveBeenCalled()
    // E9 pelo serviço REAL: o DRAFT aponta a Generation do compositor, cujo registro (do lote) é desta versão → coincidente APTO.
    expect((await auditoria()).gate).toMatchObject({ posts: 1, coincidente: { APTO: 1 }, historico: 0 })
  }, 240_000)
})

describe('E-div — a medida do gate informativo é a FIEL (corrigir: false), não a corrigida do revisor', () => {
  it('fixture v1 com véu ESCURO com folga e o serviço 130 px acima: a régua corrige em memória (ok hipotético no serviço); o revisor propõe gradiente; o gate informa texto-sem-leitura no serviço — os MESMOS motivos do agendar-leva', async () => {
    const peca = fixture.peca()
    const assinatura = fixture.assinatura()
    banco.projects.set(String(PROJETO), { ...banco.projects.get(String(PROJETO))!, assinatura: { ...(assinatura.numerosDoProjeto as Record<string, unknown>), gradiente: { forcaMinima: 0.45, forcaMaxima: 0.9 } } })
    const layers = comArquivos(peca.v1.layers, arquivos).map((l) =>
      l.id === 'gradiente-leitura-rodape'
        ? ({ ...l, style: { ...(l.style ?? {}), gradientStops: ((l.style as any).gradientStops as Array<Record<string, unknown>>).map((st) => ({ ...st, color: '#283D36' })) } } as Layer)
        : l.id === 'servico'
          ? ({ ...l, position: { ...l.position, y: l.position.y - 130 } } as Layer)
          : l,
    )
    const id = 'p-fixture'
    const page = { id, templateId: 42, isTemplate: false, name: 'Peça piloto (story)', tags: ['compositor', 'story'], width: 1080, height: 1920, background: '#FFFFFF', layers, copyAutoral: null, audio: null, thumbnail: 'https://blob.test/v1.png', order: 0, updatedAt: new Date('2026-10-17T00:00:00Z'), Template: { id: 42, name: 'Pasta da semana', projectId: PROJETO } }
    banco.pages.set(id, page)
    banco.generations.set('g-fixture', { id: 'g-fixture', projectId: PROJETO, status: 'COMPLETED', resultUrl: 'https://blob.test/v1.png', sourcePageId: null, createdAt: ++banco.seq, fieldValues: { source: 'compositor', pageId: id, imageUrl: arquivos['fixture:foto'], versaoRenderizada: versaoDaPagina(page as never), composicao: { ...peca.composicaoRegistrada, formato: 'story', assinatura: { pageId: assinatura.pagina.id } }, spec: { projectId: PROJETO, formato: 'story', quando: '2026-10-21 10:00', blocos: [{ papel: 'headline', linhas: ['x'] }] } } })
    banco.itensDeLote.set('lote-fixture', { id: 'lote-fixture', projectId: PROJETO, loteId: LOTE, itemId: 'item-fixture', generationId: 'g-fixture', postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null, payload: null })
    // Controle: a régua COM correção dá `ok` no serviço (leitura hipotética); SEM correção, não.
    const ctx = await contextoDaMedicao({ projectId: PROJETO, page: { id, name: page.name, width: 1080, height: 1920, tags: page.tags, background: page.background, layers }, camadas: layers, generationDaPeca: banco.generations.get('g-fixture') as never, composicaoReaproveitavel: true })
    const corrigida = await medirCamadasDaPeca(layers, ctx)
    const fiel = await medirCamadasDaPeca(layers, ctx, { corrigir: false })
    const servico = (m: typeof fiel) => m.contraste?.flatMap((c) => c.textos ?? []).find((t) => t.camada === 'servico')
    expect(corrigida.contraste?.some((c) => c.camadas.includes('servico') && c.tintaCorrigida != null)).toBe(true)
    expect(servico(corrigida)?.ok).toBe(true)
    expect(servico(fiel)?.ok).toBe(false)
    // O revisor: relatório da medida corrigida (propõe gradiente); o gate: informação da FIEL.
    const rev = await revisar(id)
    expect(rev.relatorio.ajustes.some((a) => a.tipo === 'gradiente')).toBe(true)
    const gate = gateMedido(rev)
    expect(gate.resultado).toBe(CODIGOS.revisaoHumana)
    expect(gate.motivos.some((m) => m.regra === 'texto-sem-leitura' && m.camadas.includes('servico'))).toBe(true)
    // …e são os mesmos motivos que o agendar-leva (corrigir: false sob trava) devolve para a mesma página.
    const lote = await agendar('item-fixture')
    expect(lote.itens[0]).toMatchObject({ situacao: 'falhou', codigo: CODIGOS.revisaoHumana })
    const motivosDoLote = ((lote.itens[0] as { motivos?: Array<{ regra: string; camadas: string[] }> }).motivos ?? []).map((m) => `${m.regra}:${m.camadas.join(',')}`).sort()
    expect(motivosDoLote).toEqual(gate.motivos.map((m) => `${m.regra}:${m.camadas.join(',')}`).sort())
    // A medida do agendar-leva (sob trava, `corrigir: false`) tem o MESMO `contraste` da medida fiel desta página.
    const doLote = espioes.medidasDeFora.filter((m) => !m.corrigir)
    expect(doLote.length).toBeGreaterThan(0)
    expect(doLote.at(-1)!.contraste).toBe(JSON.stringify(fiel.contraste))
    expect(posts()).toEqual([])
  }, 240_000)
})

describe('E4/E5/E6 — concorrência, versão boa preservada, post aprovado intocável', () => {
  it('E4: o editor grava a página entre o revisar-arte e o ajustar-arte → VERSAO_DIVERGENTE, nada gravado; o revisar-arte seguinte traz o gate da versão nova', async () => {
    const { pageId } = await pecaComposta()
    const rev = await revisar(pageId)
    await harness.escreverFora('pages', pageId, (p) => ({ ...p, layers: (p.layers as Layer[]).map((l) => (l.id === 'apoio' ? { ...l, content: 'Editado no editor' } : l)) }))
    const erro = (await erroDe(ajustar(pageId, [{ tipo: 'mover', camadas: ['apoio'], dy: -20 } as unknown as Ajuste], rev.versao!))) as CreativeError
    expect(erro.code).toBe('VERSAO_DIVERGENTE')
    expect([...banco.generations.values()].filter((g) => g.fieldValues?.source === 'ajuste-arte')).toEqual([])
    const depois = await revisar(pageId)
    expect(depois.versao).not.toBe(rev.versao)
    expect(gateMedido(depois).pageVersion).toBe(depois.versao)
  }, 240_000)

  it('E5: DRAFT anterior bom preservado — um ajuste draft-only que o gate (ou o CP4) recusa deixa página, DRAFT e Generation como estavam; nenhuma Generation nova fica; render não reaberto', async () => {
    const { pageId, generationId, itemId } = await pecaComposta()
    await agendar(itemId)
    const post = posts()[0]
    const antes = JSON.stringify([banco.pages.get(pageId), banco.generations.get(generationId), post])
    const rev = await revisar(pageId)
    // O apoio da peça composta está em y ≈ 400: +1350 o leva para dentro do piso de interface do story (1750).
    const erro = (await erroDe(ajustar(pageId, [{ tipo: 'mover', camadas: ['apoio'], dy: 1350 } as unknown as Ajuste], rev.versao!))) as CreativeError
    expect(erro.code).toBe(CODIGOS.revisaoHumana)
    // QUAL barreira preservou o DRAFT: o CP4 ACEITOU o movimento (`ajustesAplicados` com a comparação sem pioras — a peça
    // composta não tem foto, e o piso de interface não é regra do revisor) e foi o GATE, na transação, que recusou a versão
    // ajustada por `piso-de-interface` (`revisao.tipo = 'medida'`, sem `causa` do CP4).
    expect(erro.details).toMatchObject({ ajusteGravado: false, revisao: { tipo: 'medida', resultado: CODIGOS.revisaoHumana }, ajustesAplicados: [expect.objectContaining({ tipo: 'mover' })], ajustesRecusados: [] })
    expect((erro.details as { causa?: string }).causa).toBeUndefined()
    expect(((erro.details as { motivos: Array<{ regra: string }> }).motivos ?? []).map((m) => m.regra)).toContain('piso-de-interface')
    expect(JSON.stringify([banco.pages.get(pageId), banco.generations.get(generationId), banco.posts.get(post.id)])).toBe(antes)
    expect([...banco.generations.values()].filter((g) => g.fieldValues?.source === 'ajuste-arte' && g.status !== 'FAILED')).toEqual([])
    expect(espioes.invalidar).not.toHaveBeenCalled()
  }, 240_000)

  it('E6: o DRAFT vira SCHEDULED com laterPostId → ajustar-arte draft-only recusa POST_APROVADO_INTOCAVEL sob trava (nada medido/gravado); agendar-leva do mesmo item reaproveita, nunca um segundo post', async () => {
    const { pageId, itemId } = await pecaComposta()
    await agendar(itemId)
    const post = posts()[0]
    banco.posts.set(post.id, { ...post, status: 'SCHEDULED', laterPostId: 'zernio-1' })
    const rev = await revisar(pageId)
    const erro = (await erroDe(ajustar(pageId, [{ tipo: 'mover', camadas: ['apoio'], dy: -20 } as unknown as Ajuste], rev.versao!))) as CreativeError
    expect(erro.code).toBe('POST_APROVADO_INTOCAVEL')
    expect([...banco.generations.values()].filter((g) => g.fieldValues?.source === 'ajuste-arte')).toEqual([])
    const lote = await agendar(itemId)
    expect(lote.itens[0]).toMatchObject({ desfecho: 'reaproveitado' })
    expect(posts()).toHaveLength(1)
    expect(banco.posts.get(post.id)).toMatchObject({ status: 'SCHEDULED', laterPostId: 'zernio-1' })
  }, 240_000)
})

describe('E7/E7b — regra não medida → humano; fonte ausente → humano', () => {
  it('E7: a conferência de fontes FALHA (não é fonte ausente) → o gate informa REVISAO_HUMANA_NECESSARIA com fonte-nao-carregada não comprovada; agendar-leva recusa; nenhum DRAFT', async () => {
    // A conferência de fontes só roda quando há família declarada: o apoio usa uma fonte da marca (presente no ambiente).
    const { pageId, itemId } = await pecaComposta()
    espioes.fontesFalham = true
    const rev = await revisar(pageId)
    const gate = gateMedido(rev)
    expect(gate.resultado).toBe(CODIGOS.revisaoHumana)
    expect(gate.motivos.some((m) => m.regra === 'fonte-nao-carregada' && (m.codigo === 'NAO_COMPROVADA' || m.codigo === 'NAO_MEDIDO'))).toBe(true)
    const lote = await agendar(itemId)
    expect(lote.itens[0]).toMatchObject({ situacao: 'falhou', codigo: CODIGOS.revisaoHumana })
    expect(posts()).toEqual([])
    // E9 pelo serviço REAL ao fim de E7: nenhum post, nada a contar.
    expect((await auditoria()).gate).toMatchObject({ posts: 0 })
  }, 240_000)

  it('E7b: um texto com fonte da marca NÃO cadastrada → achado fonte-nao-carregada crítico → gate recusa (ACHADO_CRITICO); agendar-leva recusa; nenhum DRAFT', async () => {
    const { pageId, itemId } = await pecaComposta({ editar: (ls) => ls.map((l) => (l.id === 'apoio' ? { ...l, style: { ...l.style, fontFamily: 'Fonte Inexistente Da Marca' } } : l)) })
    const rev = await revisar(pageId)
    const gate = gateMedido(rev)
    expect(gate.resultado).toBe(CODIGOS.revisaoHumana)
    expect(gate.motivos.some((m) => m.regra === 'fonte-nao-carregada' && m.codigo === 'ACHADO_CRITICO')).toBe(true)
    const lote = await agendar(itemId)
    expect(lote.itens[0]).toMatchObject({ situacao: 'falhou', codigo: CODIGOS.revisaoHumana })
    expect(posts()).toEqual([])
  }, 240_000)
})

describe('seleção única da Generation', () => {
  it('pageId + generationId de OUTRA página → GERACAO_DE_OUTRA_PAGINA (422), nada medido; generationId sozinho acha a página e é o vínculo do gate', async () => {
    const a = pecaLimpaNoBanco({ id: 'p-a' })
    const b = pecaLimpaNoBanco({ id: 'p-b' })
    // (duas peças montadas à mão: o que se prova aqui é a seleção, não a composição)
    const erro = (await erroDe(revisarArte({ projectId: PROJETO, pageId: a.pageId, generationId: b.generationId, visao: false, previa: false }))) as CreativeError
    expect(erro.code).toBe('GERACAO_DE_OUTRA_PAGINA')
    const r = await revisarArte({ projectId: PROJETO, generationId: a.generationId, visao: false, previa: false })
    expect(r.pageId).toBe(a.pageId)
    expect(gateMedido(r).vinculo.generationId).toBe(a.generationId)
  }, 240_000)
})

describe('I3 — a decisão do gate lança', () => {
  it('a decisão cai → gate.tipo = nao-medida com o motivo e a frase fixa; a revisão (achados, ajustes, cobertura, versao) sai igual à de uma chamada sã; nada escrito', async () => {
    const { pageId } = await pecaComposta()
    const sa = await revisar(pageId)
    espioes.decisaoFalha = true
    const escritas = banco.eventos.filter((e) => e.e.startsWith('escrita:')).length
    const r = await revisar(pageId)
    expect(r.gate).toMatchObject({ tipo: 'nao-medida', motivo: expect.stringMatching(/a decisão caiu/) })
    expect((r.gate as { informacao: string }).informacao).toMatch(/não autoriza, não grava/)
    expect({ achados: r.relatorio.achados, ajustes: r.relatorio.ajustes, cobertura: r.relatorio.cobertura, versao: r.versao }).toEqual({ achados: sa.relatorio.achados, ajustes: sa.relatorio.ajustes, cobertura: sa.relatorio.cobertura, versao: sa.versao })
    expect(banco.eventos.filter((e) => e.e.startsWith('escrita:')).length).toBe(escritas)
  }, 240_000)
})

describe('E9/E10 — os leitores sobre o que o fluxo deixou', () => {
  it('E10: depois de E1 a página é editada (camadas e contrato) → ver-geracao rotula o registro do DRAFT como historico (pageVersion/copyVersion); auditar-operacao conta em historico; nada medido nem escrito pelos leitores; o revisar-arte novo traz o gate da versão nova com o vínculo ainda na Generation do compositor', async () => {
    const { pageId, generationId, itemId } = await pecaComposta()
    await agendar(itemId)
    expect(blocoDe(generationId)).toMatchObject({ validade: 'coincidente' })
    const escritas = banco.eventos.filter((e) => e.e.startsWith('escrita:')).length
    await harness.escreverFora('pages', pageId, (p) => ({ ...p, layers: (p.layers as Layer[]).map((l) => (l.id === 'apoio' ? { ...l, content: 'Apoio editado' } : l)), copyAutoral: { ...(p.copyAutoral as Record<string, unknown>), revisoes: [...(((p.copyAutoral as Record<string, unknown>)?.revisoes as unknown[]) ?? []), { em: '2026-10-17T03:00:00.000Z', autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', blocos: [] }] } }))
    const depoisDaEdicao = banco.eventos.filter((e) => e.e.startsWith('escrita:')).length
    const bloco = blocoDe(generationId)
    expect(bloco).toMatchObject({ validade: 'historico' })
    expect((bloco as { divergencias?: string[] }).divergencias).toEqual(expect.arrayContaining(['pageVersion', 'copyVersion']))
    const r = resumo()
    expect(r.total).toMatchObject({ posts: 1, historico: 1, coincidente: { APTO: 0 } })
    // E9 pelo serviço REAL, sobre o estado deixado: historico 1; nada medido nem escrito.
    const aud = await auditoria()
    expect(aud.gate).toMatchObject({ posts: 1, historico: 1 })
    expect(aud.clientes.find((c) => c.projectId === PROJETO)?.gate).toMatchObject({ posts: 1, historico: 1 })
    // Os leitores não escreveram nada (e a edição de fora foi a única escrita desde o DRAFT).
    expect(banco.eventos.filter((e) => e.e.startsWith('escrita:')).length).toBe(depoisDaEdicao)
    expect(depoisDaEdicao - escritas).toBe(1)
    const rev = await revisar(pageId)
    const gate = gateMedido(rev)
    expect(gate.pageVersion).toBe(rev.versao)
    expect(gate.vinculo.generationId).toBe(generationId)
  }, 240_000)
})
