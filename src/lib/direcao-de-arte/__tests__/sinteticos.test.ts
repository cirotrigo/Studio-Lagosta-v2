/**
 * CP0 — casos SINTÉTICOS, para as propriedades não ficarem presas à peça da
 * Real: o mesmo compositor real, com foto, assinatura e logo geradas.
 *
 *   A  headline escura + serviço claro na MESMA borda por PREFERÊNCIA (âncora pedida) — há solução fora dela
 *   A' headline escura + apoio claro na MESMA borda por ESTRUTURA (mesmo grupo da assinatura) — sem solução aprovada
 *   B  todos os textos claros
 *   C  todos os textos escuros
 *   D  logo clara sobre fundo claro
 *   E  logo escura sobre fundo escuro
 *   F  preferência de canto da logo inviável (havendo canto legível)
 *   G  preferência de alinhamento inviável (havendo alinhamento livre)
 *   H  duas bordas com polaridades diferentes (headline escura no topo, serviço claro no rodapé)
 *
 * As cores são fixture, nunca regra de produção.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => (await import('./suporte/compositor')).mockDaPersistencia())
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { CreativeError } from '@/lib/creatives/errors'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { exigir, hojeViola } from './suporte/hoje-viola'
import { CODIGOS, leituraDaLogo, leituraDentroDoAlvo, leiturasDosTextos, MOTIVOS, resumoDaLogo, textosQueInvadem, tratamentosQuePioram } from './suporte/propriedades'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const CANVAS = { width: 1080, height: 1920 }
const ESCURO = '#1E1E1E'
const CLARO = '#F5F5F5'
const HEADLINE = { papel: 'headline', linhas: ['Sintético'] }
const SERVICO = { papel: 'servico', linhas: ['Seg a sex · 12h às 22h'] }
const APOIO = { papel: 'apoio', linhas: ['Apoio claro'] }

interface Caso {
  pagina: Parameters<typeof paginaSintetica>[0] extends infer P ? Omit<P & object, 'id' | 'logoUrl' | 'fundoUrl'> : never
  luz: (x: number, y: number) => number
  logo: string
  blocos: Array<{ papel: string; linhas: string[] }>
  preferencias?: Record<string, unknown>
  candidatasDoVeu?: string[]
  assunto?: { x0: number; y0: number; x1: number; y1: number }
}

/** Compõe o caso; uma recusa ESTRUTURADA (CreativeError com código) é devolvida, não lançada. */
async function compor(id: string, c: Caso): Promise<{ r: ResultadoDaComposicao | null; recusa: CreativeError | null }> {
  const foto = await fotoSintetica(c.luz)
  const pagina = paginaSintetica({ id, ...c.pagina, logoUrl: dataUrl(await logoSintetica(c.logo)), fundoUrl: dataUrl(foto) })
  cenario.atual = await cenarioSintetico({ pagina, foto, candidatasDoVeu: c.candidatasDoVeu ?? [VEU_ESCURO, VEU_CLARO], assunto: c.assunto })
  try {
    return { r: await comporPeca(specSintetica({ pagina: id, blocos: c.blocos, preferencias: c.preferencias }), { somenteAvaliar: true }), recusa: null }
  } catch (e) {
    if (e instanceof CreativeError) return { r: null, recusa: e }
    throw e
  }
}

const sinalizou = (r: ResultadoDaComposicao | null, codigos: string[]) => !!r && codigos.some((c) => JSON.stringify(r.diagnostico).includes(c))

/** Uma peça que TEM de sair montada (controle): sem recusa e sem código de inviabilidade. */
async function montada(id: string, c: Caso): Promise<ResultadoDaComposicao> {
  const { r, recusa } = await compor(id, c)
  exigir(!recusa && r, `o controle ${id} compõe (recusa: ${recusa?.code ?? 'nenhuma'})`)
  exigir(!sinalizou(r, Object.values(CODIGOS)), `o controle ${id} sai sem código de inviabilidade`)
  return r
}

/** Uma recusa aceita: o código e, quando dado, o `motivo` do detalhe estruturado. */
interface RecusaAceita {
  codigo: string
  motivo?: string
}
const recusaCasa = (recusa: CreativeError, aceitas: RecusaAceita[]) => aceitas.some((a) => a.codigo === recusa.code && (a.motivo === undefined || recusa.details?.motivo === a.motivo))

/**
 * Polaridade numa peça composta: nenhum tratamento piora a leitura e, com
 * `noAlvo`, todo texto fica no alvo de 3:1 — ou a composição é recusada com
 * uma das recusas aceitas (código e motivo), nunca qualquer erro.
 */
async function polaridade(id: string, c: Caso, opcoes: { noAlvo: boolean; recusasAceitas: RecusaAceita[] }) {
  const { r, recusa } = await compor(id, c)
  if (recusa) return expect(recusaCasa(recusa, opcoes.recusasAceitas), `recusa ${recusa.code} ${JSON.stringify(recusa.details ?? {})}`).toBe(true)
  const leituras = await leiturasDosTextos(r!.layers, CANVAS)
  const piores = tratamentosQuePioram(leituras)
  const foraDoAlvo = opcoes.noAlvo ? leituras.filter((l) => !leituraDentroDoAlvo(l)) : []
  expect({ piores, foraDoAlvo }, JSON.stringify({ piores, foraDoAlvo })).toEqual({ piores: [], foraDoAlvo: [] })
}

/** P4 numa peça composta: logo legível pelo critério regional (p10 ≥ 45), ou um dos códigos aceitos para o caso. */
async function p4(id: string, c: Caso, codigosAceitos: string[]) {
  const { r, recusa } = await compor(id, c)
  if (recusa) return expect(codigosAceitos, `recusa ${recusa.code}`).toContain(recusa.code)
  const logo = await leituraDaLogo(r!.layers, CANVAS)
  exigir(logo, 'a peça tem logo medível')
  expect(sinalizou(r, codigosAceitos) || logo.legivel, resumoDaLogo(logo)).toBe(true)
}

/** Há solução fora da preferência pedida: só PREFERENCIA_INVIAVEL. */
const PREFERENCIA_INVIAVEL: RecusaAceita[] = [{ codigo: CODIGOS.preferenciaInviavel }]
/** Nenhuma combinação permitida resolve a polaridade da borda: SEM_COMBINACAO com o motivo estruturado. */
const POLARIDADE_SEM_SOLUCAO: RecusaAceita[] = [{ codigo: CODIGOS.semCombinacao, motivo: MOTIVOS.polaridadeIncompativel }]

const uniforme = (v: number) => () => v

describe('polaridade (P1, e o alvo onde há solução)', () => {
  // Foto a 175: o texto escuro lê sem ajuda, o claro NÃO (p98 > 142+12) — tirar o véu não resolve.
  const casoA: Caso = { pagina: { headline: { cor: ESCURO }, servico: { cor: CLARO } }, luz: uniforme(175), logo: ESCURO, blocos: [HEADLINE, SERVICO], preferencias: { ancora: 'rodape' } }
  const casoAEstrutural: Caso = { pagina: { headline: { cor: ESCURO }, apoio: { cor: CLARO } }, luz: uniforme(175), logo: ESCURO, blocos: [HEADLINE, APOIO] }
  const casoH: Caso = { pagina: { headline: { cor: ESCURO }, servico: { cor: CLARO } }, luz: uniforme(175), logo: ESCURO, blocos: [HEADLINE, SERVICO] }
  const metade = (r: ResultadoDaComposicao, id: string) => (r.layers.find((l) => l.id === id)!.position.y > CANVAS.height / 2 ? 'baixo' : 'cima')

  /**
   * Guarda de ESTRUTURA do caso: se a peça sai montada, os textos estão onde o caso diz; se sai recusada,
   * só vale a recusa prevista para o caso (a correção esperada não pode quebrar a guarda).
   */
  async function estrutura(id: string, c: Caso, esperado: Record<string, 'cima' | 'baixo'>, recusasAceitas: RecusaAceita[]) {
    const { r, recusa } = await compor(id, c)
    if (recusa) return expect(recusaCasa(recusa, recusasAceitas), `recusa ${recusa.code}`).toBe(true)
    exigir(r, `o caso ${id} compõe ou recusa`)
    expect(Object.fromEntries(Object.keys(esperado).map((k) => [k, metade(r, k)]))).toEqual(esperado)
  }

  it('A (guarda) — a headline e o serviço caem na MESMA borda (rodapé): é isso que distingue A de H', () =>
    estrutura('a-guarda', casoA, { headline: 'baixo', servico: 'baixo' }, PREFERENCIA_INVIAVEL),
  60_000)

  it('H (guarda) — headline no topo e serviço no rodapé', async () => {
    const r = await montada('h-guarda', casoH)
    expect({ headline: metade(r, 'headline'), servico: metade(r, 'servico') }).toEqual({ headline: 'cima', servico: 'baixo' })
  }, 60_000)

  it("A' (guarda) — headline e apoio no MESMO grupo da assinatura, no topo, sem preferência", () =>
    estrutura('a-estrutural-guarda', casoAEstrutural, { headline: 'cima', apoio: 'cima' }, POLARIDADE_SEM_SOLUCAO),
  60_000)

  // CP2A (14/10/2026): a metade "nenhum texto piora" de A e A' passou — a borda de polaridades
  // incompatíveis fica SEM véu (a estratégia de tratamento é inviável). O que segue violado é "todos no
  // alvo, ou a recusa estruturada": o texto claro fica sem leitura, e só a POSIÇÃO resolve (CP2B).
  it('A — mesma borda por PREFERÊNCIA: nenhum texto piora (CP2A)', () => polaridade('a-sem-piora', casoA, { noAlvo: false, recusasAceitas: PREFERENCIA_INVIAVEL }), 60_000)

  it("A' — mesma borda por ESTRUTURA: nenhum texto piora (CP2A)", () => polaridade('a-estrutural-sem-piora', casoAEstrutural, { noAlvo: false, recusasAceitas: POLARIDADE_SEM_SOLUCAO }), 60_000)

  // A âncora pedida junta as polaridades; sem ela a página separa (H): há solução fora da preferência.
  hojeViola('A — mesma borda por PREFERÊNCIA: nenhum texto piora e todos no alvo, ou PREFERENCIA_INVIAVEL (falta a posição: CP2B)', () =>
    polaridade('a', casoA, { noAlvo: true, recusasAceitas: PREFERENCIA_INVIAVEL }),
  60_000)

  hojeViola("A' — mesma borda por ESTRUTURA: nenhum texto piora e todos no alvo, ou SEM_COMBINACAO com POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA (falta a posição: CP2B)", () =>
    polaridade('a-estrutural', casoAEstrutural, { noAlvo: true, recusasAceitas: POLARIDADE_SEM_SOLUCAO }),
  60_000)

  it('B — todos os textos claros: o véu não piora nenhum (passa hoje)', async () => {
    await montada('b-montada', { pagina: { headline: { cor: '#FFFFFF' }, servico: { cor: CLARO } }, luz: uniforme(205), logo: ESCURO, blocos: [HEADLINE, SERVICO] })
    await polaridade('b', { pagina: { headline: { cor: '#FFFFFF' }, servico: { cor: CLARO } }, luz: uniforme(205), logo: ESCURO, blocos: [HEADLINE, SERVICO] }, { noAlvo: false, recusasAceitas: [] })
  }, 60_000)

  it('C — todos os textos escuros: o véu não piora nenhum (passa hoje)', async () => {
    await montada('c-montada', { pagina: { headline: { cor: ESCURO }, servico: { cor: '#222222' } }, luz: uniforme(55), logo: CLARO, blocos: [HEADLINE, SERVICO] })
    await polaridade('c', { pagina: { headline: { cor: ESCURO }, servico: { cor: '#222222' } }, luz: uniforme(55), logo: CLARO, blocos: [HEADLINE, SERVICO] }, { noAlvo: false, recusasAceitas: [] })
  }, 60_000)

  it('H — headline escura no topo + serviço claro no rodapé: cada borda com o tratamento da sua polaridade (ou nenhum), todos no alvo (CP2A)', () =>
    polaridade('h', casoH, { noAlvo: true, recusasAceitas: [] }),
  60_000)
})

describe('logo (P4)', () => {
  // Uma variante só cadastrada e a foto inteira do mesmo tom: não há canto que salve — LOGO_SEM_VARIANTE_LEGIVEL é o desfecho certo.
  // CP3 (15/10/2026): sem arquétipo a peça sai como está e o código vai ao DIAGNÓSTICO (a recusa é só com arquétipo).
  it('D — logo clara sobre fundo claro: legível, ou LOGO_SEM_VARIANTE_LEGIVEL', () =>
    p4('d', { pagina: { headline: { cor: ESCURO } }, luz: uniforme(215), logo: '#F0F0F0', blocos: [HEADLINE] }, [CODIGOS.logoSemVariante]),
  60_000)

  it('E — logo escura sobre fundo escuro: legível, ou LOGO_SEM_VARIANTE_LEGIVEL', () =>
    p4('e', { pagina: { headline: { cor: '#FFFFFF' } }, luz: uniforme(45), logo: ESCURO, blocos: [HEADLINE] }, [CODIGOS.logoSemVariante]),
  60_000)

  // O canto superior direito é escuro; o resto da foto é claro. A logo é escura.
  const cantoEscuro = (x: number, y: number) => (x > 760 && y < 420 ? 30 : 210)

  it('F (controle) — no canto claro, a mesma logo escura lê: a peça sai montada, sem código, legível pelo critério regional (há alternativa)', async () => {
    const r = await montada('f-controle', { pagina: { headline: { cor: ESCURO } }, luz: cantoEscuro, logo: ESCURO, blocos: [HEADLINE], preferencias: { cantoDaMarca: 'superior-esquerdo', ancora: 'rodape' } })
    const logo = await leituraDaLogo(r.layers, CANVAS)
    exigir(logo, 'a peça tem logo medível')
    expect(logo.legivel, resumoDaLogo(logo)).toBe(true)
  }, 60_000)

  // Há canto legível para a MESMA logo (o controle prova): LOGO_SEM_VARIANTE_LEGIVEL não vale aqui.
  it('F — canto pedido inviável (logo escura no canto escuro): legível, ou PREFERENCIA_INVIAVEL', () =>
    p4('f', { pagina: { headline: { cor: ESCURO } }, luz: cantoEscuro, logo: ESCURO, blocos: [HEADLINE], preferencias: { cantoDaMarca: 'superior-direito', ancora: 'rodape' } }, [CODIGOS.preferenciaInviavel]),
  60_000)
})

describe('preferência de alinhamento (P5)', () => {
  // A região protegida (pelo campo `assunto` do catálogo) ocupa a metade ESQUERDA do topo.
  const assunto = { x0: 0, y0: 0.05, x1: 0.5, y1: 0.45 }
  const naPeca = { x: 0, y: 0.05 * 1920, width: 540, height: 0.4 * 1920 }
  const caso = (alinha: string): Caso => ({ pagina: { headline: { cor: '#FFFFFF' } }, luz: uniforme(60), logo: CLARO, blocos: [HEADLINE], preferencias: { alinha, ancora: 'topo' }, assunto })

  it('G (controle) — alinhado à direita, a peça sai montada, sem código, e o texto não toca a região protegida (há alternativa)', async () => {
    const r = await montada('g-controle', caso('direita'))
    expect(textosQueInvadem(r.layers, naPeca)).toEqual([])
  }, 60_000)

  hojeViola('G — alinhamento pedido inviável (esquerda, sobre a região protegida): sem invasão, ou PREFERENCIA_INVIAVEL', async () => {
    const { r, recusa } = await compor('g', caso('esquerda'))
    if (recusa) return expect(recusa.code).toBe(CODIGOS.preferenciaInviavel)
    const invasoes = textosQueInvadem(r!.layers, naPeca)
    expect(sinalizou(r, [CODIGOS.preferenciaInviavel]) || invasoes.length === 0, JSON.stringify(invasoes)).toBe(true)
  }, 60_000)
})
