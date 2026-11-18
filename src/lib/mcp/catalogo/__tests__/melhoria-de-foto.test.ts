/**
 * O contrato do MCP para a melhoria de foto (17/11/2026): os campos novos de
 * `melhorar-arte`, a tool de aplicar e quem NÃO as enxerga. Sem banco: só o
 * catálogo, a allowlist do perfil só-rascunho e as instruções.
 */
import { describe, expect, it } from 'vitest'
import { IDS_DAS_RECEITAS } from '../../../ai/receitas-de-foto'
import { INSTRUCOES } from '../../instrucoes'
import { TOOLS_DRAFT_ONLY } from '../../registro/perfil'
import { INDICE_DO_CATALOGO } from '../index'

const propriedades = (nome: string) => (INDICE_DO_CATALOGO.get(nome)!.schemaJson as { properties: Record<string, any>; required?: string[] })

describe('melhorar-arte com alvo foto', () => {
  it('ganhou alvo, receitas, promptPronto, opcoes e instrucaoImagem, todos opcionais', () => {
    const { properties, required } = propriedades('melhorar-arte')
    expect(properties.alvo.enum).toEqual(['arte', 'foto'])
    expect(properties.receitas.items.properties.id.enum).toEqual([...IDS_DAS_RECEITAS])
    expect(properties.promptPronto.type).toBe('string')
    expect(properties.opcoes.type).toBe('number')
    expect(properties.instrucaoImagem.type).toBe('string')
    expect(required).toEqual(['projectId'])
  })

  it('o padrão continua sendo a melhoria da arte: quem não manda alvo passa no schema como antes', () => {
    const tool = INDICE_DO_CATALOGO.get('melhorar-arte')!
    expect(tool.schema.safeParse({ projectId: 7, generationId: 'g', pedido: 'respiro', modo: 'rediagramar' }).success).toBe(true)
    expect(tool.schema.safeParse({ projectId: 7, generationId: 'g', alvo: 'video' }).success).toBe(false)
  })
})

describe('aplicar-opcao-de-foto', () => {
  it('existe nas duas superfícies e pede a melhoria e a opção', () => {
    const tool = INDICE_DO_CATALOGO.get('aplicar-opcao-de-foto')!
    expect(tool.superficies).toEqual(['remoto', 'local'])
    expect(propriedades('aplicar-opcao-de-foto').required).toEqual(['projectId', 'melhoriaId', 'opcao'])
    expect(tool.descricao).toMatch(/Nunca aplique por conta própria/)
  })

  it('o perfil só-rascunho continua sem melhorar-arte e sem a tool de aplicar', () => {
    expect(TOOLS_DRAFT_ONLY.has('melhorar-arte')).toBe(false)
    expect(TOOLS_DRAFT_ONLY.has('aplicar-opcao-de-foto')).toBe(false)
  })
})

describe('instruções', () => {
  it('o pedido da melhoria não promete mais mexer na foto', () => {
    expect(INSTRUCOES).not.toMatch(/contraste, luz e tratamento da foto/)
    expect(INSTRUCOES).toMatch(/O "pedido" não mexe na fotografia/)
  })

  it('ensinam o caminho da foto: alvo, proposta e aplicar só depois do OK', () => {
    expect(INSTRUCOES).toMatch(/alvo "foto"/)
    expect(INSTRUCOES).toMatch(/aplicar-opcao-de-foto depois do OK/)
  })
})
