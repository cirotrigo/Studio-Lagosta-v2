import { describe, expect, it } from 'vitest'
import { aplicarRegraNaVoz, conflitosNoTextoLegado, lerVoz, precedenciaDaVoz, semelhancaDeRegras, TETO_DO_PROMPT_DA_VOZ, vozParaPrompt, vozVazia, type VozCompacta } from '../voz'

const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Fala de dono de churrascaria: direto, caloroso, sem gíria de agência.',
  tratamento: 'você',
  exemplos: ['Costela no bafo, doze horas de fogo baixo.', 'Sábado é dia de rodízio em família.'],
  antesDepois: [{ antes: 'Venha degustar nossa experiência gastronômica', depois: 'Vem almoçar com a gente', motivo: 'linguagem de agência' }],
  termos: ['Costela no Bafo', 'Espeto Gaúcho'],
  proibicoes: ['emoji na arte', 'promessa sem base'],
  regras: [
    { id: 'regra-2026-09-06-1', texto: 'Nunca usar "Vem pro fogo" como CTA', motivo: 'o Ciro reprovou em 06/09', em: '2026-09-06', escopo: 'copy', ativa: true },
    { id: 'regra-2026-09-01-1', texto: 'Horário e CTA vão para o rodapé', motivo: 'peça de happy hour empilhada', em: '2026-09-01', escopo: 'arte', ativa: true },
  ],
}

describe('a voz compacta (contrato puro)', () => {
  it('lê e devolve a voz; problemas saem TODOS de uma vez', () => {
    expect(lerVoz(voz).voz).not.toBeNull()
    const ruim = { ...voz, regras: [...voz.regras, { id: 'regra-2026-09-06-1', texto: 'x', motivo: 'y', em: '2026-09-07', escopo: 'copy', ativa: true, substitui: 'nao-existe' }] }
    const r = lerVoz(ruim)
    expect(r.voz).toBeNull()
    expect(r.problemas.map((p) => p.mensagem).join(' | ')).toMatch(/repetido/)
    expect(r.problemas.map((p) => p.mensagem).join(' | ')).toMatch(/não existe/)
  })

  it('o prompt é compacto e só leva regra ATIVA do escopo pedido', () => {
    const copy = vozParaPrompt(voz, { escopo: 'copy' })
    expect(copy).toContain('COMO A MARCA FALA')
    expect(copy).toContain('Vem pro fogo')
    expect(copy).not.toContain('rodapé')
    expect(copy.length).toBeLessThan(TETO_DO_PROMPT_DA_VOZ)
    const arte = vozParaPrompt(voz, { escopo: 'arte' })
    expect(arte).toContain('rodapé')
    expect(arte).not.toContain('Vem pro fogo')
  })

  it('a voz que passa do teto no prompt é recusada como síntese, não arquivo', () => {
    const grande = { ...voz, exemplos: Array.from({ length: 12 }, (_, i) => `${'exemplo comprido '.repeat(11)}${i}`), antesDepois: Array.from({ length: 12 }, (_, i) => ({ antes: 'a'.repeat(190), depois: 'b'.repeat(190), motivo: `m${i}` })) }
    const r = lerVoz(grande)
    expect(r.voz).toBeNull()
    expect(r.problemas[0].mensagem).toMatch(/passa de 4000/)
  })

  it('semelhança: mesma frase com "nunca" na frente conta como o MESMO assunto', () => {
    expect(semelhancaDeRegras('Nunca usar "Vem pro fogo" como CTA', 'CTA aprovado: Vem pro fogo!')).toBeGreaterThanOrEqual(0.4)
    expect(semelhancaDeRegras('Horário e CTA vão para o rodapé', 'Emoji nunca')).toBeLessThan(0.4)
  })

  it('virar regra: conflito APONTADO sem substituição; substituindo, a antiga fica inativa no histórico', () => {
    const conflito = aplicarRegraNaVoz(voz, { texto: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: 'o Ciro liberou para o evento', em: '2026-09-12', escopo: 'copy' })
    expect(conflito.ok).toBe(false)
    if (conflito.ok !== false) return
    expect(conflito.erro).toBe('CONFLITO_DE_REGRA')
    expect(conflito.conflitos.map((c) => c.id)).toEqual(['regra-2026-09-06-1'])
    const sub = aplicarRegraNaVoz(voz, { texto: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: 'o Ciro liberou para o evento', em: '2026-09-12', escopo: 'copy', substitui: 'regra-2026-09-06-1' })
    expect(sub.ok).toBe(true)
    if (sub.ok !== true) return
    expect(sub.substituida?.id).toBe('regra-2026-09-06-1')
    expect(sub.voz.regras.find((r) => r.id === 'regra-2026-09-06-1')?.ativa).toBe(false)
    expect(sub.regra.id).toBe('regra-2026-09-12-1')
    expect(sub.regra.substitui).toBe('regra-2026-09-06-1')
    expect(vozParaPrompt(sub.voz, { escopo: 'copy' })).not.toContain('Nunca usar "Vem pro fogo"')
    expect(lerVoz(sub.voz).voz).not.toBeNull()
    // conviver: as duas ficam, declarado
    const juntas = aplicarRegraNaVoz(voz, { texto: 'Pode usar "Vem pro fogo" só em post de churrasco ao vivo', motivo: 'm', em: '2026-09-12', escopo: 'copy', conviver: true })
    expect(juntas.ok && juntas.voz.regras.filter((r) => r.ativa).length).toBe(3)
  })

  it('regra de ARTE não conflita com regra de COPY; "ambas" cruza com tudo', () => {
    const r = aplicarRegraNaVoz(voz, { texto: 'Nunca usar "Vem pro fogo" no rodapé da arte', motivo: 'm', em: '2026-09-12', escopo: 'arte' })
    expect(r.ok).toBe(true)
    const r2 = aplicarRegraNaVoz(voz, { texto: 'Nunca usar "Vem pro fogo" em lugar nenhum', motivo: 'm', em: '2026-09-12', escopo: 'ambas' })
    expect(r2.ok).toBe(false)
  })

  it('precedência: legado até migrar; voz gravada sem migrar é PENDENTE; migrada vence; migrada inválida cai no legado', () => {
    const dna = { toneOfVoice: 'tom legado', contentRules: 'regras legadas' }
    expect(precedenciaDaVoz({ registro: null, dna })).toMatchObject({ fonte: 'legado', texto: 'tom legado', regrasDaMarca: 'regras legadas', vozPendente: false })
    expect(precedenciaDaVoz({ registro: { voz, versao: 2, migradaEm: null }, dna })).toMatchObject({ fonte: 'legado', vozPendente: true })
    const migrada = precedenciaDaVoz({ registro: { voz, versao: 3, migradaEm: new Date('2026-09-12T10:00:00Z') }, dna })
    expect(migrada.fonte).toBe('voz')
    expect(migrada.versao).toBe(3)
    expect(migrada.regrasDaMarca).toBeNull()
    expect(migrada.texto).toContain('COMO A MARCA FALA')
    expect(precedenciaDaVoz({ registro: { voz: { versao: 'errada' }, versao: 1, migradaEm: new Date() }, dna })).toMatchObject({ fonte: 'legado', vozPendente: true })
    expect(precedenciaDaVoz({ registro: null, dna: { toneOfVoice: null, contentRules: null } }).fonte).toBe('nenhuma')
  })

  it('no texto legado o conflito é só AVISO: as linhas do mesmo assunto', () => {
    const secao = 'Tom direto.\n\nRegras aprendidas na prática:\n- Nunca usar "Vem pro fogo" (2026-09-06 — reprovado)\n- Horário no rodapé (2026-09-01 — peça empilhada)'
    expect(conflitosNoTextoLegado(secao, 'Liberar "Vem pro fogo" no evento')).toEqual(['Nunca usar "Vem pro fogo" (2026-09-06 — reprovado)'])
    expect(conflitosNoTextoLegado(null, 'x')).toEqual([])
  })

  it('vozVazia é válida', () => {
    expect(lerVoz(vozVazia('Fala simples.')).voz).not.toBeNull()
  })
})
