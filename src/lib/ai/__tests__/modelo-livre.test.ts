/**
 * O modo modelo-livre (17/08/2026): "o modelo já manda bem e é bem criativo —
 * agora está engessando muito. A referência é para passar as FONTES e a
 * organização de texto, deixando ele livre para identificar o melhor lugar de
 * acordo com a imagem."
 *
 * Nasceu como experimento no O Quintal Parrilla, foi aprovado no mesmo dia
 * ("funcionou melhor") e virou o PADRÃO de todos os clientes. O teste mais
 * importante daqui é o do opt-out: um cliente que regredir tem de poder voltar
 * ao spine estrito, intocado, só entrando no Set.
 */
import { describe, expect, it } from 'vitest'

import { PROJETOS_COM_MODELO_LIVRE, modeloLivre } from '../modelo-livre'
import {
  buildArtePrompt,
  buildModeloSpineLivre,
  buildReferencePreamble,
  type BuildArtePromptArgs,
} from '../image-prompt-builder'
import { descricaoDoGuia } from '../carousel-guide-decoder'

/** BrandContext mínimo — o builder só lê estes campos. */
function marca(projectId: number) {
  return {
    projectId,
    projectName: 'O Quintal Parrilla',
    colors: [{ name: 'verde', hexCode: '#547737' }],
    fonts: { title: 'Amithen', subtitle: 'DomaniCP', body: 'Acumin Pro Thin' },
    dna: { contentRules: 'Nunca incluir preço nas peças.' },
    logoUrl: null,
  } as unknown as BuildArtePromptArgs['brand']
}

function argsPara(projectId: number): BuildArtePromptArgs {
  return {
    copy: ['Domingou no quintal', 'Chega mais'],
    brand: marca(projectId),
    refs: [
      { role: 'subject' },
      { role: 'style-guide', label: 'arte de referência' },
      { role: 'brand-card' },
    ],
    formato: 'story',
    alturaPx: 1936,
    modelo: {
      descricao: '- Bloco de texto.\n  níveis de texto, do maior para o menor:\n    1. título · cor branco · caixa Title Case · o maior',
      elementos: ['filete abaixo da manchete'],
    },
  }
}

describe('modeloLivre', () => {
  it('🔴 o ESTRITO é o padrão de toda a carteira desde 07/09/2026', () => {
    // A inversão: 5 dos 7 clientes com feedback reclamaram de a peça não
    // seguir a referência (18 queixas), e nenhuma delas é anterior a 17/08,
    // quando o modo livre virou padrão. Ver o cabeçalho do módulo.
    expect(modeloLivre(1)).toBe(false)
    expect(modeloLivre(2)).toBe(false)
    expect(modeloLivre(11)).toBe(false)
    expect(modeloLivre(undefined)).toBe(false)
    expect(modeloLivre(null)).toBe(false)
  })

  it('nenhum cliente está no opt-in hoje', () => {
    expect([...PROJETOS_COM_MODELO_LIVRE]).toEqual([])
  })

  it('o opt-in devolve o cliente ao spine livre', () => {
    PROJETOS_COM_MODELO_LIVRE.add(99)
    try {
      expect(modeloLivre(99)).toBe(true)
    } finally {
      PROJETOS_COM_MODELO_LIVRE.delete(99)
    }
  })
})

describe('buildModeloSpineLivre', () => {
  const spine = buildModeloSpineLivre(
    '  níveis de texto, do maior para o menor:\n    1. título · cor branco · caixa Title Case',
    ['filete abaixo da manchete'],
    ['Domingou no quintal', 'Chega mais'],
  )

  it('copia o ESTILO: fontes, caixa, cor, proporção', () => {
    expect(spine).toContain('REFERÊNCIA DE ESTILO, NÃO DE LAYOUT')
    expect(spine).toContain('TIPOGRAFIA em uso')
    expect(spine).toContain('CAIXA de cada nível')
    expect(spine).toContain('COR de cada nível')
    expect(spine).toContain('PROPORÇÃO de tamanhos')
  })

  it('devolve a POSIÇÃO ao gerador, com a foto como protagonista', () => {
    expect(spine).toContain('NÃO COPIE do modelo')
    expect(spine).toContain('A POSIÇÃO dos blocos')
    expect(spine).toContain('onde ela é calma')
    expect(spine).toContain('NUNCA fica coberto por texto')
    // O vocabulário do spine estrito não pode sobrar aqui.
    expect(spine).not.toContain('REPLIQUE, item a item')
    expect(spine).not.toContain('mesma faixa')
    expect(spine).not.toContain('variação é DEFEITO')
  })

  it('mantém as redes de segurança: palavras, marca e ícone órfão', () => {
    expect(spine).toContain('AS PALAVRAS')
    expect(spine).toContain('UMA única vez')

    // Ícone de serviço numa copy sem serviço continua proibido.
    const semServico = buildModeloSpineLivre(
      null,
      ['ícone de relógio antes da linha de serviço'],
      ['Brownie com sorvete'],
    )
    expect(semServico).toContain('não desenhe esses ícones')
  })
})

describe('o gate por projeto', () => {
  it('projeto 2 (opt-out de 24/08) recebe o spine ESTRITO', () => {
    const prompt = buildArtePrompt(argsPara(2))
    expect(prompt).toContain('A DIAGRAMAÇÃO JÁ ESTÁ DECIDIDA')
    expect(prompt).not.toContain('REFERÊNCIA DE ESTILO, NÃO DE LAYOUT')
  })

  it('🔴 outro projeto também recebe o spine ESTRITO — é o padrão', () => {
    const prompt = buildArtePrompt(argsPara(3))
    expect(prompt).toContain('A DIAGRAMAÇÃO JÁ ESTÁ DECIDIDA')
    expect(prompt).toContain('REPLIQUE, item a item')
    expect(prompt).not.toContain('REFERÊNCIA DE ESTILO, NÃO DE LAYOUT')
  })

  it('o cliente em opt-in volta ao spine LIVRE, intocado', () => {
    PROJETOS_COM_MODELO_LIVRE.add(3)
    try {
      const prompt = buildArtePrompt(argsPara(3))
      expect(prompt).toContain('REFERÊNCIA DE ESTILO, NÃO DE LAYOUT')
      expect(prompt).not.toContain('A DIAGRAMAÇÃO JÁ ESTÁ DECIDIDA')
    } finally {
      PROJETOS_COM_MODELO_LIVRE.delete(3)
    }
  })

  it('o preâmbulo do papel muda junto, pela flag da referência', () => {
    const livre = buildReferencePreamble([{ role: 'style-guide', estiloLivre: true }])
    const estrito = buildReferencePreamble([{ role: 'style-guide' }])

    expect(livre).toContain('STYLE MODEL')
    expect(livre).toContain('Do NOT copy its layout')
    expect(livre).toContain('never covered by text')
    expect(estrito).toContain('same placement of the text block')
    // Os dois limites duros valem nos dois modos.
    for (const p of [livre, estrito]) {
      expect(p).toContain('Its TEXT is not content')
      expect(p).toContain('not content: nothing from this image appears')
    }
  })
})

describe('a leitura sem posições', () => {
  const GUIA = {
    zonas: [
      {
        papel: 'manchete',
        banda: 2,
        lado: 'esquerda' as const,
        alinhamento: 'esquerda' as const,
        niveis: [{ texto: 'Sabadouuu', papel: 'título', cor: 'branco', tamanhoRelativo: 'o maior' }],
      },
      {
        papel: 'serviço',
        banda: 8,
        lado: 'esquerda' as const,
        niveis: [{ texto: 'Funcionamento - 11h às 00h', papel: 'serviço', cor: 'verde' }],
      },
    ],
  }

  it('sem posições: o estilo fica, banda/faixa/lado somem', () => {
    const texto = descricaoDoGuia(GUIA, { semPosicoes: true })

    expect(texto).toContain('cor branco')
    expect(texto).toContain('caixa Title Case')
    expect(texto).not.toContain('faixa')
    expect(texto).not.toContain('% da altura')
    expect(texto).not.toContain('lado esquerda')
    expect(texto).not.toContain('Mantenha cada uma na sua faixa')
  })

  it('com posições (default), nada muda para os outros clientes', () => {
    const texto = descricaoDoGuia(GUIA)
    expect(texto).toContain('faixa terço superior (começa a ~19% da altura)')
    expect(texto).toContain('lado esquerda')
  })
})
