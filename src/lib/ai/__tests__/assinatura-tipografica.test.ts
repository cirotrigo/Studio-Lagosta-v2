/**
 * A assinatura tipográfica do TERO (17/08/2026) — destilada das 24 artes
 * publicadas na galeria do Claudinho, a pedido do Ciro e da Roberta: mais
 * semelhança ao padrão da marca SEM voltar ao layout travado.
 */
import { describe, expect, it } from 'vitest'

import { assinaturaTipografica } from '../assinatura-tipografica'
import { buildArtePrompt, type BuildArtePromptArgs } from '../image-prompt-builder'

function argsPara(projectId: number): BuildArtePromptArgs {
  return {
    copy: ['Terça no TERO', 'Aberto das 11h30 às 23h30'],
    brand: {
      projectId,
      projectName: 'TERO',
      colors: [{ name: 'cobre', hexCode: '#C88E5A' }],
      fonts: { title: 'Playfair Display', body: 'Montserrat' },
      dna: {},
      logoUrl: null,
    } as unknown as BuildArtePromptArgs['brand'],
    refs: [{ role: 'subject' }],
    formato: 'story',
    alturaPx: 1936,
  }
}

describe('assinaturaTipografica', () => {
  it('o TERO tem; os demais (ainda) não', () => {
    expect(assinaturaTipografica(3)).toContain('ASSINATURA TIPOGRÁFICA')
    expect(assinaturaTipografica(2)).toBeNull()
    expect(assinaturaTipografica(undefined)).toBeNull()
  })

  it('fala do TEXTO (tamanho, tracking, cores), nunca de POSIÇÃO', () => {
    const a = assinaturaTipografica(3)!
    expect(a).toContain('~4 a 6% da altura')
    expect(a).toContain('DUAS VOZES')
    expect(a).toContain('losango')
    // Posição é do modo livre — a assinatura não pode competir com ele.
    expect(a).not.toMatch(/rodapé da peça|canto|topo do quadro|terço inferior/)
    // Nenhuma palavra de exemplo entre aspas — viraria texto desenhado.
    expect(a).not.toMatch(/"[^"]+"/)
  })

  it('entra no prompt do TERO, junto do lock de tipografia', () => {
    const prompt = buildArtePrompt(argsPara(3))
    expect(prompt).toContain('TIPOGRAFIA TRAVADA')
    expect(prompt).toContain('ASSINATURA TIPOGRÁFICA DA MARCA')
  })

  it('não muda nada nos projetos sem assinatura', () => {
    expect(buildArtePrompt(argsPara(2))).not.toContain('ASSINATURA TIPOGRÁFICA')
  })
})
