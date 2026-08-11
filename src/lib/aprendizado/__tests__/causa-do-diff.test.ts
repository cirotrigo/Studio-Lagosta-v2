import { describe, it, expect } from 'vitest'
import {
  alertaDeBaseDesatualizada,
  classificarAlteracao,
  classificarDiff,
  contemDadoProibido,
  dadosProibidos,
  sanitizarParaPerfil,
} from '@/lib/aprendizado/causa-do-diff'
import { diffDeCopy, semelhanca } from '@/lib/aprendizado/diff-copy'

function alteracao(antes: string, depois: string) {
  return classificarAlteracao({
    campo: 'titulo',
    antes,
    depois,
    apenasFormatacao: false,
    semelhanca: semelhanca(antes, depois),
  })
}

describe('detecção de dado protegido', () => {
  it('acha preço, horário, data e promoção', () => {
    expect(dadosProibidos('Taça a R$ 25').tipos).toContain('preco')
    expect(dadosProibidos('das 16h às 19h').tipos).toContain('horario')
    expect(dadosProibidos('até 31/08').tipos).toContain('data')
    expect(dadosProibidos('30% de desconto').tipos).toContain('promocao')
    expect(dadosProibidos('19:30').tipos).toContain('horario')
    expect(dadosProibidos('25 reais').tipos).toContain('preco')
    expect(dadosProibidos('31 de agosto').tipos).toContain('data')
  })

  it('não vê dado protegido onde não há', () => {
    expect(contemDadoProibido('Uma noite de vinhos e conversa boa')).toBe(false)
  })
})

describe('causa da edição', () => {
  it('correção de HORÁRIO é fato — vira alerta, nunca perfil', () => {
    const a = alteracao('Happy hour das 17h às 20h', 'Happy hour das 16h às 19h')
    expect(a.causa).toBe('fato')
    expect(a.tiposDeFato).toContain('horario')
  })

  it('correção de PREÇO é fato', () => {
    expect(alteracao('Taça por R$ 29', 'Taça por R$ 25').causa).toBe('fato')
  })

  it('reescrita mantendo o assunto é estilo', () => {
    const a = alteracao(
      'Venha aproveitar o nosso happy hour com os amigos',
      'Venha curtir o nosso happy hour com os amigos',
    )
    expect(a.causa).toBe('estilo')
  })

  it('só diagramação também é estilo', () => {
    const a = classificarAlteracao({
      campo: 'titulo',
      antes: 'HAPPY HOUR · TODO DIA',
      depois: 'Happy Hour | Todo dia',
      apenasFormatacao: true,
      semelhanca: 1,
    })
    expect(a.causa).toBe('estilo')
  })

  it('troca de assunto é pontual — ensina sobre a peça, não sobre a marca', () => {
    const a = alteracao('Nosso risoto de funghi está imperdível', 'A picanha na brasa é a estrela do dia')
    expect(a.causa).toBe('pontual')
  })
})

describe('blindagem do perfil', () => {
  it('recusa guardar texto com dado protegido, sem tentar mascarar', () => {
    expect(sanitizarParaPerfil('Taça de vinho a partir de R$ 25')).toBeNull()
    expect(sanitizarParaPerfil('Seg a sáb, das 16h às 19h')).toBeNull()
    expect(sanitizarParaPerfil('Um brinde à sexta-feira')).toBe('Um brinde à sexta-feira')
  })

  it('edição de ESTILO cujo texto carrega preço fica fora do perfil', () => {
    // O preço não MUDOU (não é "fato"), mas a frase o carrega — e o perfil não
    // pode guardar preço em hipótese nenhuma.
    const diff = diffDeCopy(
      { titulo: 'Venha tomar uma taça por R$ 25' },
      { titulo: 'Venha curtir uma taça por R$ 25' },
    )
    const r = classificarDiff(diff)
    expect(r.alteracoes[0].causa).toBe('estilo')
    expect(r.paraOPerfil).toEqual([])
    expect(r.descartadas.length).toBe(1)
  })

  it('separa alerta de base, perfil e descarte no mesmo diff', () => {
    const diff = diffDeCopy(
      {
        titulo: 'Venha aproveitar o nosso happy hour com os amigos',
        subtitulo: 'Das 17h às 20h',
        rodape: 'Nosso risoto de funghi está imperdível',
      },
      {
        titulo: 'Venha curtir o nosso happy hour com os amigos',
        subtitulo: 'Das 16h às 19h',
        rodape: 'A picanha na brasa é a estrela do dia',
      },
    )
    const r = classificarDiff(diff)
    expect(r.paraOPerfil.map((a) => a.campo)).toEqual(['titulo'])
    expect(r.alertasDeBase.map((a) => a.campo)).toEqual(['subtitulo'])
    expect(r.descartadas.map((a) => a.campo)).toEqual(['rodape'])
  })

  it('diff ILEGÍVEL não produz nada — "não sei" nunca vira "nada mudou"', () => {
    const r = classificarDiff(diffDeCopy(null, { titulo: 'x' }))
    expect(r.alteracoes).toEqual([])
    expect(r.paraOPerfil).toEqual([])
  })
})

describe('alerta de base desatualizada', () => {
  it('nomeia os tipos corrigidos em português', () => {
    const diff = diffDeCopy({ a: 'das 17h às 20h' }, { a: 'das 16h às 19h' })
    const mensagem = alertaDeBaseDesatualizada(classificarDiff(diff).alertasDeBase)
    expect(mensagem).toContain('horário')
    expect(mensagem).toContain('base de conhecimento')
  })

  it('sem alerta, não inventa mensagem', () => {
    expect(alertaDeBaseDesatualizada([])).toBeNull()
  })
})
