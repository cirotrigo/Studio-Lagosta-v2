/**
 * CP-T2, rodada 1 (P2-1) — a cadeia INTEIRA: rota real → `comporPeca` REAL (validação da spec, preparação dos blocos,
 * divisão da manchete, arquétipo, assinatura) → contrato de camadas → página gravada. Dublados só o banco (em memória,
 * com a página de assinatura sintética e o template do editor), a foto, as fontes, o medidor e o autofix — o suporte
 * de `direcao-de-arte/__tests__/suporte/compositor.ts`, o mesmo das provas T1a/T1b.
 *
 * Prova que a origem COM contrato compõe pelo contrato: a segunda voz é a que o autor declarou (nenhuma, ou as duas
 * últimas linhas), não a regra legada; a autoria e o histórico seguem; o recorte do arquétipo é uma revisão do sistema.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Pagina = Record<string, any>
const loja = vi.hoisted(() => ({ paginas: [] as Pagina[], seq: 0 }))
const espias = vi.hoisted(() => ({ invalidar: vi.fn(), recompor: vi.fn() }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_dono', orgId: null }) }))
vi.mock('@/lib/compositor/recompor', () => ({ pedirRecomposicaoDaArteCongelada: espias.recompor }))
vi.mock('@/lib/posts/invalidate-renders', () => ({
  invalidateScheduledRenders: async (...args: unknown[]) => {
    espias.invalidar(...args)
    return { invalidados: 0, congelados: [], reabertos: 0 }
  },
}))
vi.mock('@/lib/db', async () => {
  const base = (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoBanco().db as Record<
    string,
    any
  >
  const projeto = { id: 9002, userId: 'u-dono', organizationProjects: [] }
  const doEditor = (where: Record<string, any>) =>
    loja.paginas.filter((p) =>
      Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'gte' in v ? p[k] >= v.gte : p[k] === v)),
    )
  const db: Record<string, any> = {
    ...base,
    user: { findUnique: async ({ where }: any) => (where.id === 'u-dono' ? { clerkId: 'user_dono' } : null) },
    // O template do editor (77) para a rota; o resto é o "Assinatura" do suporte.
    template: {
      findFirst: async (args: any) =>
        args?.where?.id === 77 ? { id: 77, projectId: 9002, Project: projeto } : base.template.findFirst(args),
    },
    page: {
      ...base.page,
      findFirst: async ({ where }: any) => structuredClone(doEditor(where)[0] ?? null),
      findMany: async (args: any) =>
        args?.where?.templateId === 77 ? structuredClone(doEditor(args.where)) : base.page.findMany(args),
      updateMany: async ({ where, data }: any) => ({
        count: doEditor(where).map((p) => (p.order += data.order.increment)).length,
      }),
      create: async ({ data }: any) => {
        const nova = { id: `nova-${++loja.seq}`, ...data }
        loja.paginas.push(nova)
        return { id: nova.id }
      },
    },
    $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join('?')
      if (sql.includes('pg_advisory_xact_lock')) return [{ ok: 1 }]
      if (sql.includes('FOR UPDATE'))
        return doEditor({ id: valores[0], templateId: valores[1] }).map((p) => ({ order: p.order }))
      throw new Error(`SQL inesperado: ${sql}`)
    },
  }
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db)
  return { db }
})
vi.mock('@/lib/creatives/persist', async () =>
  (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDaPersistencia(),
)
vi.mock('@/lib/compositor/pastas', () => ({
  garantirPasta: async () => ({ id: 1, name: 'x' }),
  ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }),
}))
vi.mock('@/lib/brand/voz-service', () => ({ carimboDaVozAgora: async () => null }))
vi.mock('@/lib/posts/register-project-fonts', async () =>
  (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDasFontes(),
)
vi.mock('@/lib/creatives/server-text-measurer', async () =>
  (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoMedidor(),
)
vi.mock('@/lib/creatives/text-autofix', async () =>
  (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoAutofix(),
)
vi.mock('@/lib/creatives/uso-de-foto', async () =>
  (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoUsoDeFoto(),
)
vi.mock('@/lib/creatives/acervo', async () =>
  (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoAcervo(),
)
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).gradientesDoCenario,
}))

import type { Layer } from '@/types/template'
import { autorDoBloco, copyAutoralDaPagina, revisaoDaPaginaComCamadas, type CopyAutoral } from '@/lib/copy-autoral'
import { cenario } from '@/lib/direcao-de-arte/__tests__/suporte/compositor'
import { dataUrl } from '@/lib/direcao-de-arte/__tests__/suporte/fixture'
import {
  cenarioSintetico,
  fotoSintetica,
  logoSintetica,
  paginaSintetica,
  variantesClaraEEscura,
} from '@/lib/direcao-de-arte/__tests__/suporte/sinteticos'
import { POST } from '../route'

const ARQ = 'minimal-fb-topo-esquerda'
const CLARO = '#F5F5F5'
const VOZ2 = '#E4572E'

/** Assinatura sintética COM segunda voz (`headline2`): é ela que deixa a regra legada mover a última linha. */
async function montarAssinatura() {
  const foto = await fotoSintetica(() => 60)
  const pagina = paginaSintetica({
    id: 'assin-voz2',
    headline: { cor: CLARO },
    apoio: { cor: CLARO },
    servico: { cor: CLARO },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const h1 = pagina.layers.find((l) => l.name === 'headline')!
  pagina.layers.push({
    ...h1,
    id: 'headline2-pagina',
    name: 'headline2',
    position: { x: h1.position.x, y: h1.position.y + 110 },
    style: { ...h1.style, color: VOZ2 },
  } as Layer)
  cenario.atual = await cenarioSintetico({
    pagina,
    foto,
    candidatasDoVeu: [],
    logosDoProjeto: await variantesClaraEEscura(),
  })
}

const texto = (id: string, name: string, content: string, y: number): Layer =>
  ({
    id,
    name,
    type: 'text',
    visible: true,
    locked: false,
    order: 1,
    content,
    position: { x: 80, y },
    size: { width: 900, height: 160 },
    rotation: 0,
    style: { fontFamily: 'Sintetica Display', fontSize: 80, fill: '#ffffff' },
  }) as Layer
const FOTO = {
  id: 'bg-foto',
  name: 'Foto',
  type: 'image',
  visible: true,
  locked: false,
  order: 0,
  fileUrl: 'https://blob.test/origem.jpg',
  position: { x: 0, y: 0 },
  size: { width: 1080, height: 1920 },
  rotation: 0,
  style: { objectFit: 'cover' },
} as Layer

function contrato(blocos: CopyAutoral['blocos'], revisoes: CopyAutoral['revisoes'] = []): CopyAutoral {
  return {
    versao: 'copy-autoral-v1',
    origem: { autor: 'equipe', em: '2026-10-20T12:00:00.000Z', superficie: 'editor' },
    blocos,
    revisoes,
  }
}

function origem(camadas: Layer[], copyAutoral: CopyAutoral | null) {
  loja.paginas = [
    {
      id: 'origem',
      name: 'Story',
      templateId: 77,
      width: 1080,
      height: 1920,
      order: 1,
      isTemplate: false,
      tags: [],
      background: '#101010',
      layers: JSON.stringify(camadas),
      copyAutoral,
    },
    {
      id: 'p2',
      name: 'p2',
      templateId: 77,
      width: 1080,
      height: 1920,
      order: 2,
      isTemplate: false,
      tags: [],
      background: '#101010',
      layers: '[]',
      copyAutoral: null,
    },
  ]
  return structuredClone(loja.paginas[0])
}

async function usarLayout() {
  const r = (await POST(
    new Request('http://studio.test/api/templates/77/pages/from-layout', {
      method: 'POST',
      body: JSON.stringify({ arquetipo: { id: ARQ, versao: 1 }, aPartirDaPagina: 'origem' }),
    }),
    { params: Promise.resolve({ id: '77' }) },
  )) as any
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const nova = loja.paginas.find((p) => p.id === r.body.pageId)!
  const camadas = JSON.parse(nova.layers) as Layer[]
  const conteudo = (id: string) => camadas.find((l) => l.id === id && l.type === 'text')?.content ?? null
  return { r, nova, camadas, conteudo, copy: copyAutoralDaPagina(nova.copyAutoral) }
}

beforeEach(async () => {
  vi.clearAllMocks()
  loja.seq = 0
  await montarAssinatura()
})

describe('rodada 1 · P2-1: a origem com contrato compõe pelo contrato (compositor real)', () => {
  it('manchete de duas linhas SEM voz 2 declarada: as duas na voz 1 (o legado mandaria a última para a voz 2)', async () => {
    const copy = contrato([
      { id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Costela', 'na brasa'] },
      { id: 'horario', funcao: 'servico', ordem: 1, linhas: ['Sáb 12h às 16h'] },
    ])
    const camadas = [
      FOTO,
      texto('t1', 'headline', 'Costela\nna brasa', 300),
      texto('t2', 'servico', 'Sáb 12h às 16h', 1500),
    ]
    const antes = origem(camadas, copy)
    // Pré-condição: o contrato descreve as camadas de hoje (sem reconciliação).
    expect(
      revisaoDaPaginaComCamadas(copy, camadas, { autor: 'sistema', motivo: 'x', superficie: 'teste' }).estado,
    ).toBe('sem-mudanca')

    const { conteudo, copy: gravada } = await usarLayout()
    expect(conteudo('headline')).toBe('Costela\nna brasa')
    expect(conteudo('headline2')).toBeNull()
    // Autoria e histórico seguem: nada a recortar, nenhuma revisão nova sobre o texto do autor.
    expect(gravada!.origem).toEqual(copy.origem)
    expect(gravada!.blocos.find((b) => b.id === 'manchete')!.linhas).toEqual(['Costela', 'na brasa'])
    expect(autorDoBloco(gravada!, 'manchete').autor).toBe('equipe')
    expect(loja.paginas[0]).toEqual(antes)
  }, 60_000)

  it('as duas linhas DECLARADAS na voz 2: saem as duas na voz 2 (o legado mandaria só a última)', async () => {
    const copy = contrato([
      {
        id: 'manchete',
        funcao: 'headline',
        ordem: 0,
        linhas: ['Costela', 'na brasa'],
        estilo: { linhasNaVoz2: [0, 1] },
      },
      { id: 'horario', funcao: 'servico', ordem: 1, linhas: ['Sáb 12h às 16h'] },
    ])
    const camadas = [
      FOTO,
      texto('t1b', 'headline2', 'Costela\nna brasa', 420),
      texto('t2', 'servico', 'Sáb 12h às 16h', 1500),
    ]
    const antes = origem(camadas, copy)
    expect(
      revisaoDaPaginaComCamadas(copy, camadas, { autor: 'sistema', motivo: 'x', superficie: 'teste' }).estado,
    ).toBe('sem-mudanca')

    const { conteudo, copy: gravada } = await usarLayout()
    expect(conteudo('headline2')).toBe('Costela\nna brasa')
    expect(conteudo('headline') ?? '').not.toContain('Costela')
    expect(gravada!.blocos.find((b) => b.id === 'manchete')!.estilo).toEqual({ linhasNaVoz2: [0, 1] })
    expect(autorDoBloco(gravada!, 'manchete').autor).toBe('equipe')
    expect(loja.paginas[0]).toEqual(antes)
  }, 60_000)

  it('três linhas: o arquétipo (máx. 2) recusa pelo compositor real — 422 com o código dele, nada gravado', async () => {
    const copy = contrato([
      {
        id: 'manchete',
        funcao: 'headline',
        ordem: 0,
        linhas: ['Costela', 'na brasa', 'do sul'],
        estilo: { linhasNaVoz2: [1, 2] },
      },
      { id: 'horario', funcao: 'servico', ordem: 1, linhas: ['Sáb 12h às 16h'] },
    ])
    const antes = origem(
      [
        FOTO,
        texto('t1', 'headline', 'Costela', 300),
        texto('t1b', 'headline2', 'na brasa\ndo sul', 420),
        texto('t2', 'servico', 'Sáb 12h às 16h', 1500),
      ],
      copy,
    )
    const r = (await POST(
      new Request('http://studio.test/api/templates/77/pages/from-layout', {
        method: 'POST',
        body: JSON.stringify({ arquetipo: { id: ARQ, versao: 1 }, aPartirDaPagina: 'origem' }),
      }),
      { params: Promise.resolve({ id: '77' }) },
    )) as any
    expect([r.status, r.body.error]).toEqual([422, 'ARQUETIPO_LINHAS_EXCEDIDAS'])
    expect(loja.paginas).toHaveLength(2)
    expect(loja.paginas[0]).toEqual(antes)
    expect(espias.invalidar).not.toHaveBeenCalled()
  }, 60_000)

  it('o cta sem lugar sai como revisão do SISTEMA (com o que dizia); a autoria anterior fica', async () => {
    const copy = contrato(
      [
        { id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Costela', 'na brasa'] },
        { id: 'horario', funcao: 'servico', ordem: 1, linhas: ['Sáb 12h às 16h'] },
        { id: 'chamada', funcao: 'cta', ordem: 2, linhas: ['Reserve'] },
      ],
      [
        {
          em: '2026-10-21T10:00:00.000Z',
          autor: 'claude',
          motivo: 'ajuste do horário',
          blocos: ['horario'],
          superficie: 'chat',
        },
      ],
    )
    const camadas = [
      FOTO,
      texto('t1', 'headline', 'Costela\nna brasa', 300),
      texto('t2', 'servico', 'Sáb 12h às 16h', 1500),
      texto('t3', 'cta', 'Reserve', 1700),
    ]
    origem(camadas, copy)
    expect(
      revisaoDaPaginaComCamadas(copy, camadas, { autor: 'sistema', motivo: 'x', superficie: 'teste' }).estado,
    ).toBe('sem-mudanca')

    const { r, copy: gravada, conteudo } = await usarLayout()
    expect(conteudo('cta')).toBeNull()
    expect(r.body.foraDoLayout).toEqual([{ camada: 't3', nome: 'cta', motivo: 'papel-fora-do-layout', papel: 'cta' }])
    expect(gravada!.origem).toEqual(copy.origem)
    expect(gravada!.revisoes[0]).toEqual(copy.revisoes[0])
    const recorte = gravada!.revisoes.find((v) => v.superficie === 'layout' && v.removidos)!
    expect(recorte).toMatchObject({
      autor: 'sistema',
      blocos: ['chamada'],
      removidos: [{ id: 'chamada', funcao: 'cta', linhas: ['Reserve'] }],
    })
    expect(autorDoBloco(gravada!, 'horario').autor).toBe('claude')
    expect(gravada!.blocos.map((b) => b.id)).toEqual(['manchete', 'horario'])
  }, 60_000)

  it('contrato sem manchete: placeholder escrito pelo SISTEMA, dito no motivo; a página nasce rascunho e a origem do contrato fica', async () => {
    const copy = contrato([{ id: 'horario', funcao: 'servico', ordem: 0, linhas: ['Sáb 12h às 16h'] }])
    const camadas = [FOTO, texto('t2', 'servico', 'Sáb 12h às 16h', 1500)]
    origem(camadas, copy)
    const { r, nova, conteudo, copy: gravada } = await usarLayout()
    expect(r.body.placeholders).toEqual(['headline'])
    expect(nova.name).toMatch(/\(rascunho\)$/)
    expect(conteudo('headline')).toBe('Título')
    expect(gravada!.origem).toEqual(copy.origem)
    expect(autorDoBloco(gravada!, 'headline')).toMatchObject({
      autor: 'sistema',
      motivo: expect.stringContaining('placeholder do sistema'),
    })
    expect(autorDoBloco(gravada!, 'horario').autor).toBe('equipe')
  }, 60_000)

  it('sem contrato na origem (legado): a regra legada continua valendo e a copy nasce de autoria desconhecida', async () => {
    const antes = origem(
      [FOTO, texto('t1', 'headline', 'Costela\nna brasa', 300), texto('t2', 'servico', 'Sáb 12h às 16h', 1500)],
      null,
    )
    const { conteudo, copy: gravada } = await usarLayout()
    expect(conteudo('headline')).toBe('Costela')
    expect(conteudo('headline2')).toBe('na brasa')
    expect(gravada!.origem.autor).toBe('desconhecido')
    expect(loja.paginas[0]).toEqual(antes)
  }, 60_000)
})
