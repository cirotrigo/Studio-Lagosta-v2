/**
 * PR5-08..10 da revisão FINAL do Codex sobre 81708704 (18/09/2026): o registro
 * da copy autoral na via de IA e na melhoria não pode declarar o que não é.
 */
import { describe, expect, it } from 'vitest'
import type { BrandContext } from '@/lib/brand/brand-context'
import { buildArtePrompt, copyComCaixaDaMarca } from '../image-prompt-builder'
import { semColchetes } from '@/lib/compositor/destaques'
import {
  VERSAO_DO_CONTRATO,
  comEnviada,
  contratoDaOrigemDaMelhoria,
  enviadaNoPrompt,
  LACUNA_PROMPT_AINDA_NAO_MONTADO,
  registroParaIA,
  textoEnviadoDoContrato,
  validarCopyAutoral,
  type CopyAutoral,
} from '@/lib/copy-autoral'
import { copyDaArte } from '@/lib/mcp/catalogo/ver-geracao-retorno'

const marca = (projectId: number, projectName: string) =>
  ({ projectId, projectName, dna: { toneOfVoice: null, contentRules: null, composition: null, visualStyle: null, photoDirection: null }, cuisineType: null, fonts: { title: 'Didot', subtitle: null, body: 'Montserrat' }, colors: [], logoUrl: null }) as unknown as BrandContext
const contrato = (linhas: string[]): CopyAutoral => ({ versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos: [{ id: 'manchete', funcao: 'headline', ordem: 0, linhas }], revisoes: [] })

describe('PR5-09 — a linha vazia interna do autor chega ao planejador', () => {
  it('do contrato ao texto entregue ao diretor: "Almoço\\n\\nem família", com e sem caixa da marca', () => {
    const c = contrato(['Almoço', '', 'em família'])
    expect(validarCopyAutoral(c).problemas).toEqual([])
    // o caminho de `startArtGeneration` (contrato → blocos → sem colchetes, bordas aparadas) → `copyComCaixaDaMarca`
    const copy = textoEnviadoDoContrato(c).map((b) => semColchetes(b).trim())
    expect(copy).toEqual(['Almoço\n\nem família'])
    expect(copyComCaixaDaMarca(copy, null)).toEqual(['Almoço\n\nem família'])
    expect(copyComCaixaDaMarca(copy, marca(3, 'TERO'))).toEqual(['ALMOÇO\n\nEM FAMÍLIA'])
    expect(copyComCaixaDaMarca(['A  \n \nB'], null)).toEqual(['A\n\nB'])
  })
})

describe('PR5-10 — `enviada` é lida do prompt que saiu', () => {
  it('prompt pronto com a frase em caixa natural (TERO): enviada é a da frase, não a caixa alta que o sistema aplicaria', () => {
    const copy = ['Almoço executivo']
    const r = enviadaNoPrompt('Peça do TERO. Manchete: "Almoço executivo", no terço de baixo.', [copyComCaixaDaMarca(copy, marca(3, 'TERO')), copy])
    expect(r).toEqual({ enviada: ['Almoço executivo'], lacuna: null })
  })
  it('o prompt montado por código colapsa a quebra: enviada registra o que ele mandou', () => {
    const copy = ['Almoço\nexecutivo']
    const prompt = buildArtePrompt({ copy, brand: null, refs: [] } as never)
    expect(enviadaNoPrompt(prompt, [copyComCaixaDaMarca(copy, null), copy]).enviada).toEqual(['Almoço executivo'])
  })
  it('bloco que não aparece no prompt: enviada fica ausente e a lacuna diz qual', () => {
    const r = enviadaNoPrompt('um prompt sem a copy', [['Almoço executivo']])
    expect(r.enviada).toBeNull()
    expect(r.lacuna).toMatch(/bloco 1 \("Almoço executivo"\)/)
    expect(enviadaNoPrompt(null, [['x']]).enviada).toBeNull()
  })
  it('o registro nasce SEM enviada (a criação não conhece o prompt) e o runner completa; sem enviada a comparação segue por visão', () => {
    const c = contrato(['Almoço executivo'])
    const criado = registroParaIA(c, null, [LACUNA_PROMPT_AINDA_NAO_MONTADO])
    expect('enviada' in criado).toBe(false)
    const completo = comEnviada(criado, { enviada: ['Almoço executivo'], lacuna: null })
    expect(completo.enviada).toEqual(['Almoço executivo'])
    expect(completo.lacunas).not.toContain(LACUNA_PROMPT_AINDA_NAO_MONTADO)
    const semDizer = comEnviada(criado, { enviada: null, lacuna: 'x' })
    expect('enviada' in semDizer).toBe(false)
    const lido = copyDaArte({ copyAutoral: { ...semDizer, conferencia: { lida: ['ALMOÇO EXECUTIVO'], faltando: [], passou: true, regua: 'copy' } } })
    expect(lido?.comparadoPor).toBe('visao')
    expect(lido?.comparavel).toBe(true)
    expect(lido?.enviada).toBeUndefined()
  })
})

describe('PR5-08 — melhoria de OUTRO slide não herda o contrato da imagem errada', () => {
  const doSlideA = { copyAutoral: registroParaIA(contrato(['Slide A']), ['Slide A']) }
  it('com `skipTextVerification` (a imagem é outro slide) o contrato de A não vem, e a ausência é dita', () => {
    const r = contratoDaOrigemDaMelhoria(doSlideA, { outraImagem: true })
    expect(r.contrato).toBeNull()
    expect(r.aviso).toMatch(/outro slide/)
  })
  it('a própria arte continua herdando o contrato', () => {
    expect(contratoDaOrigemDaMelhoria(doSlideA, { outraImagem: false }).contrato?.blocos[0].linhas).toEqual(['Slide A'])
    expect(contratoDaOrigemDaMelhoria({}, { outraImagem: true })).toEqual({ contrato: null, aviso: null })
  })
})
