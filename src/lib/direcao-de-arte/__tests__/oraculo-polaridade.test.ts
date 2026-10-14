/**
 * Emenda do CP0 (14/10/2026, decisão do owner, depois do CP2A): a polaridade
 * de leitura do ORÁCULO das propriedades é contextual — a do texto sobre o
 * fundo sem tratamento —, e não mais a da cor isolada. Estes controles provam
 * a regra matemática por fora, sem a decisão de produção.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { alvoPorContraste } from '@/lib/creatives/halo/halo'
import { alvoClaroPorContraste, textoEscuro } from '@/lib/compositor/regua'
import { leituraDentroDoAlvo, polaridadeDoOraculo, type LeituraDoTexto } from './suporte/propriedades'

const ESCURO = { p02: 10, p98: 50 }
const CLARO = { p02: 200, p98: 240 }
const ATRAVESSA = { p02: 20, p98: 235 }

/** A leitura de um texto SEM tratamento (sem = com), pela polaridade do oráculo — para a propriedade do alvo. */
function leituraSemTratamento(cor: string, sem: { p02: number; p98: number }): LeituraDoTexto {
  const polaridade = polaridadeDoOraculo(cor, sem)
  const valor = polaridade === 'clara' ? sem.p98 : sem.p02
  return { camada: 't', cor, polaridade, alvo: polaridade === 'clara' ? alvoPorContraste(cor, 3) : alvoClaroPorContraste(cor, 3), sem: valor, com: valor }
}

describe('controles independentes da polaridade do oráculo', () => {
  it('A — branco sobre fundo escuro: clara', () => {
    expect(polaridadeDoOraculo('#FFFFFF', ESCURO)).toBe('clara')
  })

  it('B — preto e verde muito escuro sobre fundo claro: escura', () => {
    expect(polaridadeDoOraculo('#000000', CLARO)).toBe('escura')
    expect(polaridadeDoOraculo('#283D36', CLARO)).toBe('escura')
  })

  it('C — cor intermediária sobre fundo claro: o lado ESCURO (é o contexto que lê)', () => {
    expect(polaridadeDoOraculo('#DC0909', CLARO)).toBe('escura')
  })

  it('D — a MESMA cor intermediária sobre fundo escuro: o lado CLARO', () => {
    expect(polaridadeDoOraculo('#DC0909', ESCURO)).toBe('clara')
  })

  it('E — fundo já dentro do alvo: a propriedade continua dizendo que não precisa de tratamento', () => {
    expect(leituraDentroDoAlvo(leituraSemTratamento('#FFFFFF', ESCURO))).toBe(true)
    expect(leituraDentroDoAlvo(leituraSemTratamento('#000000', CLARO))).toBe(true)
    expect(leituraDentroDoAlvo(leituraSemTratamento('#DC0909', { p02: 210, p98: 240 }))).toBe(true)
    expect(leituraDentroDoAlvo(leituraSemTratamento('#DC0909', { p02: 5, p98: 25 }))).toBe(true)
  })

  it('regressão: a mesma cor (#dc0909) assume lados diferentes conforme o fundo', () => {
    expect([polaridadeDoOraculo('#DC0909', ESCURO), polaridadeDoOraculo('#DC0909', CLARO)]).toEqual(['clara', 'escura'])
  })

  it('fundo que atravessa a luz da cor: o lado de MAIOR contraste disponível (contra o preto ou contra o branco)', () => {
    // #dc0909: 4,1:1 contra o preto, 5,2:1 contra o branco → escura. #f4301a: 5,3:1 contra o preto, 4,0:1 contra o branco → clara.
    expect(polaridadeDoOraculo('#DC0909', ATRAVESSA)).toBe('escura')
    expect(polaridadeDoOraculo('#F4301A', ATRAVESSA)).toBe('clara')
    // O lado do fundo que NÃO lê não vale: escuro demais para ler como claro é escuro mesmo sobre fundo mais escuro.
    expect(polaridadeDoOraculo('#1E1E1E', { p02: 5, p98: 20 })).toBe('escura')
    expect(polaridadeDoOraculo('#F5F5F5', { p02: 248, p98: 252 })).toBe('clara')
  })
})

describe('guardas da emenda', () => {
  it('nos casos de cor claramente clara ou escura, o oráculo emendado dá o MESMO lado do original (a cor isolada)', () => {
    const claras = ['#FFFFFF', '#F5F5F5', '#F6F0E4', '#F2F2F2']
    const escuras = ['#000000', '#1E1E1E', '#222222', '#283D36']
    for (const fundo of [ESCURO, CLARO, ATRAVESSA, { p02: 90, p98: 160 }]) {
      for (const cor of [...claras, ...escuras]) expect({ cor, fundo, lado: polaridadeDoOraculo(cor, fundo) }).toEqual({ cor, fundo, lado: textoEscuro(cor) ? 'escura' : 'clara' })
    }
  })

  it('o oráculo é independente: o suporte das propriedades não usa a decisão de polaridade da produção', () => {
    // Só o CÓDIGO conta (o comentário que explica a independência cita o nome da função de produção).
    const codigo = readFileSync(join(__dirname, 'suporte', 'propriedades.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    for (const nome of ['polaridadeDoTexto', 'ladosDeLeitura', 'luzMedida', 'pioraDaLeitura', 'tratamento-de-leitura']) expect(codigo, nome).not.toContain(nome)
  })
})
