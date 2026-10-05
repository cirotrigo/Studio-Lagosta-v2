import { describe, it, expect } from 'vitest'
import {
  fraseDaRecomendacao,
  NOME_DA_FORMA,
  PREFERENCIA_POR_PROJETO,
  recomendarFormaDeArte,
  RENDE_PAGINA_EDITAVEL,
} from '../forma-de-arte'

describe('uma recomendação, nunca um menu', () => {
  it('devolve UMA forma e NO MÁXIMO uma alternativa', () => {
    const r = recomendarFormaDeArte({ projectId: 1 })
    expect(typeof r.forma).toBe('string')
    // `alternativa` é um valor só, nunca uma lista: é o que impede a conversa
    // de virar questionário para quem não é técnica.
    expect(Array.isArray(r.alternativa)).toBe(false)
  })

  it('a frase da conversa não usa nome técnico de motor', () => {
    const frase = fraseDaRecomendacao(recomendarFormaDeArte({ projectId: 2 }))
    for (const tecnico of ['compositor', 'arte-ia', 'arte-rapida', 'pageId', 'DRAFT']) {
      expect(frase).not.toContain(tecnico)
    }
  })
})

describe('a preferência declarada por cliente', () => {
  it('Real Gelateria e By Rock começam pela IA (placar favorável)', () => {
    expect(recomendarFormaDeArte({ projectId: 1 }).forma).toBe('ia')
    expect(recomendarFormaDeArte({ projectId: 7 }).forma).toBe('ia')
  })

  it('Quintal e TERO nunca recebem IA como primeira sugestão nem como alternativa', () => {
    for (const projectId of [2, 3]) {
      const r = recomendarFormaDeArte({ projectId })
      expect(r.forma).not.toBe('ia')
      expect(r.alternativa).not.toBe('ia')
    }
  })

  it('cliente sem linha na lista cai no compositor, não na IA — o padrão não gasta crédito', () => {
    const r = recomendarFormaDeArte({ projectId: 5 })
    expect(r.forma).toBe('compositor')
  })
})

describe('a metade mecânica', () => {
  it('havendo modelo do tema, ele ganha — é o layout que a marca já aprovou', () => {
    expect(recomendarFormaDeArte({ projectId: 5, temModeloDoTema: true }).forma).toBe('modelo')
  })

  /**
   * 🔴 O TERO tem 0/32 em modelo no placar e MESMO ASSIM recebe o modelo
   * quando existe um para o tema. As 32 reprovações são de 17/08/2026, dos
   * templates cujas duas caixas do lockup já nasciam colidindo — defeito do
   * template, consertado depois. Marcá-lo em `evitar` seria exatamente o erro
   * que o módulo declara evitar: placar velho condenando motor que melhorou.
   * O que fica em `evitar` é o que continua ruim, não o que já foi ruim.
   */
  it('placar velho não condena: o TERO recebe o modelo do tema apesar dos 0/32 de agosto', () => {
    const r = recomendarFormaDeArte({ projectId: 3, temModeloDoTema: true })
    expect(r.forma).toBe('modelo')
    expect(r.alternativa).not.toBe('ia')
  })

  it('sem assinatura cadastrada o compositor não é oferecido — ele recusaria', () => {
    const r = recomendarFormaDeArte({ projectId: 5, temAssinatura: false })
    expect(r.forma).not.toBe('compositor')
    expect(r.alternativa).not.toBe('compositor')
  })

  it('pedido explícito vence a recomendação e não abre alternativa', () => {
    const r = recomendarFormaDeArte({ projectId: 2, pedidoExplicito: 'ia' })
    expect(r.forma).toBe('ia')
    expect(r.alternativa).toBeNull()
  })
})

describe('o que a equipe precisa saber sem perguntar', () => {
  it('a IA é a única forma proposta que NÃO rende página editável', () => {
    expect(RENDE_PAGINA_EDITAVEL.ia).toBe(false)
    expect(RENDE_PAGINA_EDITAVEL.compositor).toBe(true)
    expect(RENDE_PAGINA_EDITAVEL.modelo).toBe(true)
  })

  it('todo nome é uma AÇÃO em português, sem nome técnico de motor dentro', () => {
    for (const nome of Object.values(NOME_DA_FORMA)) {
      expect(nome.length).toBeGreaterThan(10)
      for (const tecnico of ['arte-ia', 'arte-rapida', 'compositor', 'generation', 'render']) {
        expect(nome).not.toContain(tecnico)
      }
    }
  })

  it('todo projeto da lista declara um motivo — a recomendação nunca sai muda', () => {
    for (const pref of Object.values(PREFERENCIA_POR_PROJETO)) {
      expect(pref.porque.length).toBeGreaterThan(10)
    }
  })
})
