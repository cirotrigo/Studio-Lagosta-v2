/**
 * H9 (25/10/2026) — o #9 `minimal-divisao-cor-topo-arco@1` PUBLICADO, contra o catálogo REAL (nenhum `vi.mock` do
 * catálogo: o `divisao-arco-9.test.ts` dubla o catálogo no arquivo inteiro). A definição publicada é a FINAL da I9
 * (A-I1/A-I2 adotados: texto w .602, logo do Feed h .0348, raio 0,62), com a impressão travada; a literal histórica da
 * fixture não é a publicada. A vitrine leva a máscara pela MESMA conta do compor; candidatos compatíveis não são APTOS.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIMENSOES } from '../../spec'
import { candidatosDeArquetipo } from '../candidatos'
import { listarArquetipos, verArquetipo } from '../catalogo'
import { caixaDaFoto } from '../fundo'
import { impressaoDoArquetipo, jsonCanonico } from '../impressao'
import { receitaDoArcoJanela } from '../mascara'
import { prepararArquetipo, vitrineDeArquetipos } from '../na-spec'
import { validarArquetipo, validarCatalogo } from '../validar'
import { ARQUETIPO_ARCO_9, ID_ARCO, RAIO_DO_ARCO, arcoComOAjusteDeDiagnostico } from './suporte/arquetipo-arco-9'

/** Os paths das peças Bv3 aceitas (o mesmo GOLDEN de `mascara-9.test.ts`). */
const GOLDEN = {
  story: 'M0 100 L0 24.566 C 5.7585 16.952 13.286 10.7601 21.9728 6.4921 C 30.6597 2.2241 40.2613 0 50 0 C 59.7387 0 69.3403 2.2241 78.0272 6.4921 C 86.714 10.7601 94.2415 16.952 100 24.566 L100 100 Z',
  feed: 'M0 100 L0 36.1991 C 5.7585 24.9795 13.286 15.8555 21.9728 9.5664 C 30.6597 3.2773 40.2613 0 50 0 C 59.7387 0 69.3403 3.2773 78.0272 9.5664 C 86.714 15.8555 94.2415 24.9795 100 36.1991 L100 100 Z',
}
const IMPRESSAO_9 = 'arq1-04603bcf9d7623'
const IMPRESSAO_DA_LITERAL = 'arq1-139cae795189c3'
const SO_A_MANCHETE = { blocos: [{ papel: 'headline' as const, linhas: ['Bastidores da', 'nova sessão'] }] }

describe('H9 · o #9 publicado no catálogo real', () => {
  it('H-01: a versão publicada É a definição final da I9 (JSON canônico), com a impressão travada; sem versão → @1; a literal histórica não é a publicada', () => {
    const publicada = verArquetipo(ID_ARCO, 1)
    expect(publicada).not.toBeNull()
    expect(jsonCanonico(publicada!)).toBe(jsonCanonico(arcoComOAjusteDeDiagnostico()))
    expect(impressaoDoArquetipo(publicada!)).toBe(IMPRESSAO_9)
    expect(verArquetipo(ID_ARCO)!.versao).toBe(1)
    expect(impressaoDoArquetipo(ARQUETIPO_ARCO_9)).toBe(IMPRESSAO_DA_LITERAL)
    expect(IMPRESSAO_DA_LITERAL).not.toBe(IMPRESSAO_9)
    expect(validarArquetipo(publicada!)).toEqual([])
    expect(validarCatalogo(listarArquetipos())).toEqual([])
    for (const f of ['story', 'feed'] as const) expect(publicada!.formatos[f].mascaraDaFoto).toEqual({ tipo: 'arco-janela', raio: RAIO_DO_ARCO })
  })

  it('H-01: o produto não importa a fixture de teste nem a pasta de relatórios (o literal mora no catálogo)', () => {
    const fonte = readFileSync(join(__dirname, '..', 'catalogo.ts'), 'utf8')
    expect(fonte).not.toMatch(/from '[^']*(__tests__|human-output)/)
  })

  it('H-03: a vitrine leva caixaDaFoto e mascaraDaFoto { tipo, raio, path } por formato — o path pela conta do compor, = GOLDEN; só o #9 declara a máscara', () => {
    const vitrine = vitrineDeArquetipos()
    const nove = vitrine.find((a) => a.id === ID_ARCO)!
    expect(nove).toMatchObject({ versao: 1, codigoTaxonomico: 'MIN-04', fundo: 'foto-em-caixa', disponibilidade: 'disponivel', caixaDaFoto: { story: { x: 0, y: 0.42, w: 1, h: 0.58 }, feed: { x: 0, y: 0.44, w: 1, h: 0.56 } } })
    expect(nove.mascaraDaFoto).toEqual({ story: { tipo: 'arco-janela', raio: 0.62, path: GOLDEN.story }, feed: { tipo: 'arco-janela', raio: 0.62, path: GOLDEN.feed } })
    for (const f of ['story', 'feed'] as const) {
      const caixa = caixaDaFoto(verArquetipo(ID_ARCO, 1), f, DIMENSOES[f])!
      expect(nove.mascaraDaFoto![f]!.path).toBe(receitaDoArcoJanela({ w: caixa.width, h: caixa.height }, RAIO_DO_ARCO).path)
    }
    expect(vitrine.filter((a) => 'mascaraDaFoto' in a).map((a) => a.id)).toEqual([ID_ARCO])
    expect('mascaraDaFoto' in vitrine.find((a) => a.id === 'minimal-divisao-foto-topo')!).toBe(false)
  })

  it('H-06: candidatos do catálogo listam o #9 em 3º desde a IH #10 (ordem por id, não ranking); manchete + logo é compatível; serviço e sem logo recusam', () => {
    const r = candidatosDeArquetipo({ formato: 'story', ...SO_A_MANCHETE }, { temLogo: true })
    expect(r.origem).toBe('catalogo')
    // IH #10: os 2 ids da coluna (`minimal-coluna-foto*`) ordenam antes → o #9 passa de 1º a 3º.
    expect(r.candidatos[2]).toEqual({ id: ID_ARCO, versao: 1, compativel: true })
    expect(listarArquetipos()[2].id).toBe(ID_ARCO)
    const comServico = { blocos: [...SO_A_MANCHETE.blocos, { papel: 'servico' as const, linhas: ['Sexta, 20h'] }] }
    expect(candidatosDeArquetipo({ formato: 'feed', ...comServico }, { temLogo: true }).candidatos.find((c) => c.id === ID_ARCO)?.recusa?.codigo).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    expect(candidatosDeArquetipo({ formato: 'story', ...SO_A_MANCHETE }, { temLogo: false }).candidatos.find((c) => c.id === ID_ARCO)).toMatchObject({ compativel: false, recusa: { codigo: 'ARQUETIPO_PAPEIS_INCOMPATIVEIS' } })
  })

  it('H-06/H-04: compatível NÃO é APTO — a mesma spec no compor sem foto recusa (mensagem sem "no alto"); pedido explícito com impressão errada não cai noutro', () => {
    const spec = { formato: 'story' as const, arquetipo: { id: ID_ARCO }, ...SO_A_MANCHETE }
    let erro: { code?: string; message: string } | null = null
    try {
      prepararArquetipo(spec, { exigirFoto: true })
    } catch (e) {
      erro = e as { code?: string; message: string }
    }
    expect(erro?.code).toBe('ARQUETIPO_FOTO_AUSENTE')
    expect(erro?.message).toContain('tem a foto numa caixa:')
    expect(erro?.message).not.toContain('no alto')
    const divergente = candidatosDeArquetipo({ ...spec, arquetipo: { id: ID_ARCO, versao: 1, impressao: IMPRESSAO_DA_LITERAL } }, { temLogo: true })
    expect(divergente.candidatos).toHaveLength(1)
    expect(divergente.candidatos[0]).toMatchObject({ id: ID_ARCO, versao: 1, compativel: false, recusa: { codigo: 'ARQUETIPO_IMPRESSAO_DIVERGENTE' } })
  })
})
