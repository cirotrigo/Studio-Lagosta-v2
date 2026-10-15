/**
 * CP4 — o comparador PURO de não-piora: duas medidas da mesma peça (antes e depois de um ajuste), propriedade a
 * propriedade. Sem pontuação global; não medido não é "não piorou"; o achado alvo tem de resolver ou melhorar.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import type { ContrasteMedido } from '@/lib/compositor/regua'
import type { AchadoDaRevisao, RelatorioDaRevisao } from '../contrato'
import { AJUSTE_NAO_MEDIDO, AJUSTE_NAO_MELHOROU_O_ACHADO, AJUSTE_PIOROU_ARTE, chaveDoAchado, compararNaoPiora, gravidadeDoAchado, motivoDaComparacao, type MedidaComparavel } from '../nao-piora'

const CANVAS = { width: 1080, height: 1920 }

const achado = (regra: AchadoDaRevisao['regra'], camadas: string[], evidencia: AchadoDaRevisao['evidencia'] = {}, extra: Partial<AchadoDaRevisao> = {}): AchadoDaRevisao => ({
  id: `${regra}:${camadas.join('+')}`,
  regra,
  severidade: 'aviso',
  certeza: 'medida',
  camadas,
  mensagem: `${regra} em ${camadas.join(', ')}`,
  evidencia,
  ajustes: [],
  ...extra,
})

function relatorio(achados: AchadoDaRevisao[], cobertura: Partial<RelatorioDaRevisao['cobertura']> = {}): RelatorioDaRevisao {
  const base: RelatorioDaRevisao['cobertura'] = {
    'fonte-nao-carregada': { estado: 'avaliada' },
    'texto-cortado': { estado: 'avaliada' },
    'tinta-fora-da-caixa': { estado: 'avaliada' },
    colisao: { estado: 'avaliada' },
    'fora-da-area-segura': { estado: 'avaliada' },
    'logo-sobre-texto': { estado: 'avaliada' },
    'logo-sem-leitura': { estado: 'avaliada' },
    'texto-sem-leitura': { estado: 'avaliada' },
    'gradiente-forte-demais': { estado: 'avaliada' },
    'titulo-grande': { estado: 'avaliada' },
    'entrelinha-grande': { estado: 'avaliada' },
    'texto-pequeno': { estado: 'avaliada' },
    'palavra-orfa': { estado: 'avaliada' },
    'texto-sobre-assunto': { estado: 'avaliada' },
    'tratamento-piorou-leitura': { estado: 'avaliada' },
    visao: { estado: 'nao-avaliada', motivo: 'sem visão' },
  }
  return { versaoDasRegras: 'revisao-v1', achados, ajustes: [], cobertura: { ...base, ...cobertura }, resumo: 'sintético' }
}

const texto = (id: string, y = 300): Layer => ({ id, name: id, type: 'text', visible: true, locked: false, order: 1, content: id, position: { x: 92, y }, size: { width: 896, height: 100 }, style: { fontSize: 60 } }) as Layer

const contraste = (textos: Array<{ camada: string; sentido?: 'claro' | 'escuro'; alvo?: number; com: number; ok?: boolean }>): ContrasteMedido[] => [
  {
    grupo: 'g',
    camadas: textos.map((t) => t.camada),
    sentido: 'claro',
    alvo: 139,
    p98SemHalo: 200,
    p98ComHalo: Math.max(...textos.map((t) => t.com)),
    tinta: 0.6,
    tintaCorrigida: null,
    gradiente: null,
    ok: textos.every((t) => t.ok ?? t.com <= (t.alvo ?? 139)),
    textos: textos.map((t) => ({ camada: t.camada, sentido: t.sentido ?? 'claro', alvo: t.alvo ?? 139, p98SemHalo: 200, p98ComHalo: t.com, ok: t.ok ?? (t.sentido === 'escuro' ? t.com >= (t.alvo ?? 139) : t.com <= (t.alvo ?? 139)) })),
  },
]

const medida = (parcial: Partial<MedidaComparavel> = {}): MedidaComparavel => ({ relatorio: relatorio([]), contraste: contraste([{ camada: 'headline', com: 100 }]), camadas: [texto('headline')], canvas: CANVAS, ...parcial })

describe('não piorar — propriedade a propriedade, sem pontuação global', () => {
  it('1. melhora sem regressão → aceito (e as melhoras são listadas)', () => {
    const antes = medida({ relatorio: relatorio([achado('colisao', ['headline', 'apoio'], { px: 20 })]) })
    const depois = medida({ relatorio: relatorio([]) })
    const c = compararNaoPiora(antes, depois)
    expect(c.veredito).toBe('aceito')
    expect(c.pioras).toEqual([])
    expect(c.melhoras).toEqual([expect.objectContaining({ propriedade: 'colisao', antes: 20, depois: null })])
    expect(motivoDaComparacao(c)).toMatch(/aceito/)
  })

  it('2. melhora o alvo e piora OUTRA propriedade → recusado (AJUSTE_PIOROU_ARTE): nenhuma pontuação compensa', () => {
    const antes = medida({ relatorio: relatorio([achado('texto-cortado', ['headline'], { linhas: 3, linhasVisiveis: 2 })]), contraste: contraste([{ camada: 'headline', com: 100 }, { camada: 'servico', com: 120 }]) })
    const depois = medida({ relatorio: relatorio([]), contraste: contraste([{ camada: 'headline', com: 100 }, { camada: 'servico', com: 160 }]) })
    const c = compararNaoPiora(antes, depois, { achadoAlvo: 'texto-cortado:headline' })
    expect(c.achadoAlvo).toMatchObject({ estado: 'resolvido' })
    expect(c.melhoras.length).toBeGreaterThan(0)
    expect(c.veredito).toBe(AJUSTE_PIOROU_ARTE)
    expect(c.pioras).toEqual([expect.objectContaining({ propriedade: 'contraste', camadas: ['servico'], antes: 120, depois: 160 })])
    expect(motivoDaComparacao(c)).toMatch(/piora a peça: contraste em servico/)
  })

  it('3. cria colisão → recusado', () => {
    const c = compararNaoPiora(medida(), medida({ relatorio: relatorio([achado('colisao', ['headline', 'apoio'], { px: 12 })]) }))
    expect(c.veredito).toBe(AJUSTE_PIOROU_ARTE)
    expect(c.pioras[0]).toMatchObject({ propriedade: 'colisao', antes: null, depois: 12 })
  })

  it('a colisão que já existia e cresce é piora; a mesma colisão com a ordem das camadas trocada não é "nova"', () => {
    const antes = medida({ relatorio: relatorio([achado('colisao', ['apoio', 'headline'], { px: 12 })]) })
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([achado('colisao', ['headline', 'apoio'], { px: 12 })]) })).veredito).toBe('aceito')
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([achado('colisao', ['headline', 'apoio'], { px: 30 })]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
    expect(chaveDoAchado(achado('colisao', ['b', 'a']))).toBe('colisao:a+b')
  })

  it('4. sai da área segura → recusado; 1 px de ruído não conta', () => {
    expect(compararNaoPiora(medida(), medida({ relatorio: relatorio([achado('fora-da-area-segura', ['servico'], { px: 8 })]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
    const antes = medida({ relatorio: relatorio([achado('fora-da-area-segura', ['servico'], { px: 8 })]) })
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([achado('fora-da-area-segura', ['servico'], { px: 9 })]) })).veredito).toBe('aceito')
  })

  it('5. piora o contraste → recusado: texto no alvo que sai dele; texto fora do alvo que se afasta além do ruído', () => {
    const noAlvo = medida({ contraste: contraste([{ camada: 'servico', com: 130 }]) })
    expect(compararNaoPiora(noAlvo, medida({ contraste: contraste([{ camada: 'servico', com: 150 }]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
    // No alvo que mexe dentro dele não é piora.
    expect(compararNaoPiora(noAlvo, medida({ contraste: contraste([{ camada: 'servico', com: 138 }]) })).veredito).toBe('aceito')
    const fora = medida({ contraste: contraste([{ camada: 'servico', com: 160 }]) })
    expect(compararNaoPiora(fora, medida({ contraste: contraste([{ camada: 'servico', com: 161 }]) })).veredito).toBe('aceito')
    expect(compararNaoPiora(fora, medida({ contraste: contraste([{ camada: 'servico', com: 170 }]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
    // Texto escuro: o p02 que DESCE é piora.
    const escuro = medida({ contraste: contraste([{ camada: 'servico', sentido: 'escuro', alvo: 150, com: 200 }]) })
    expect(compararNaoPiora(escuro, medida({ contraste: contraste([{ camada: 'servico', sentido: 'escuro', alvo: 150, com: 140 }]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
  })

  it('6. piora a logo → recusado: o p10 que cai sob o limiar aparece como achado novo; já abaixo e cai mais, piora', () => {
    expect(compararNaoPiora(medida(), medida({ relatorio: relatorio([achado('logo-sem-leitura', ['logo'], { p10: 30, limiar: 45 })]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
    const antes = medida({ relatorio: relatorio([achado('logo-sem-leitura', ['logo'], { p10: 30, limiar: 45 })]) })
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([achado('logo-sem-leitura', ['logo'], { p10: 20, limiar: 45 })]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([achado('logo-sem-leitura', ['logo'], { p10: 29, limiar: 45 })]) })).veredito).toBe('aceito')
    expect(compararNaoPiora(medida(), medida({ relatorio: relatorio([achado('logo-sobre-texto', ['logo', 'servico'], { canto: null })]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
  })

  it('7. melhora o contraste → aceito, com a melhora listada', () => {
    const c = compararNaoPiora(medida({ contraste: contraste([{ camada: 'servico', com: 170 }]) }), medida({ contraste: contraste([{ camada: 'servico', com: 120 }]) }))
    expect(c.veredito).toBe('aceito')
    expect(c.melhoras).toEqual([expect.objectContaining({ propriedade: 'contraste', camadas: ['servico'] })])
  })

  it('12. achado mensurável declarado como alvo que não melhora → recusado (AJUSTE_NAO_MELHOROU_O_ACHADO)', () => {
    const antes = medida({ relatorio: relatorio([achado('texto-cortado', ['headline'], { linhas: 3, linhasVisiveis: 2 })]) })
    const igual = compararNaoPiora(antes, medida({ relatorio: relatorio([achado('texto-cortado', ['headline'], { linhas: 3, linhasVisiveis: 2 })]) }), { achadoAlvo: 'texto-cortado:headline' })
    expect(igual.veredito).toBe(AJUSTE_NAO_MELHOROU_O_ACHADO)
    expect(igual.achadoAlvo).toMatchObject({ estado: 'nao-melhorou', antes: 1, depois: 1 })
    expect(motivoDaComparacao(igual)).toMatch(/não o resolveu nem o melhorou/)
    const melhorou = compararNaoPiora(medida({ relatorio: relatorio([achado('texto-cortado', ['headline'], { linhas: 4, linhasVisiveis: 2 })]) }), medida({ relatorio: relatorio([achado('texto-cortado', ['headline'], { linhas: 3, linhasVisiveis: 2 })]) }), { achadoAlvo: 'texto-cortado:headline' })
    expect(melhorou.veredito).toBe('aceito')
    expect(melhorou.achadoAlvo).toMatchObject({ estado: 'melhorou', antes: 2, depois: 1 })
  })

  it('12b. `texto-sem-leitura` como alvo é medido pela RÉGUA (distância ao alvo do texto): resolvido, melhorou, não melhorou; sem régua, não mensurável', () => {
    const semLeitura = achado('texto-sem-leitura', ['servico'], { p98: 194 })
    const antes = medida({ relatorio: relatorio([semLeitura]), contraste: contraste([{ camada: 'servico', com: 194 }]) })
    const alvo = { achadoAlvo: 'texto-sem-leitura:servico' }
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([semLeitura]), contraste: contraste([{ camada: 'servico', com: 194 }]) }), alvo)).toMatchObject({ veredito: AJUSTE_NAO_MELHOROU_O_ACHADO, achadoAlvo: { estado: 'nao-melhorou', antes: 55, depois: 55 } })
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([semLeitura]), contraste: contraste([{ camada: 'servico', com: 170 }]) }), alvo)).toMatchObject({ veredito: 'aceito', achadoAlvo: { estado: 'melhorou', antes: 55, depois: 31 } })
    expect(compararNaoPiora(antes, medida({ contraste: contraste([{ camada: 'servico', com: 120 }]) }), alvo)).toMatchObject({ veredito: 'aceito', achadoAlvo: { estado: 'resolvido', antes: 55, depois: 0 } })
    // Régua que não mediu: o alvo é "não mensurável" E a comparação é AJUSTE_NAO_MEDIDO (fail-closed).
    expect(compararNaoPiora(antes, medida({ relatorio: relatorio([semLeitura]), contraste: null }), alvo)).toMatchObject({ veredito: AJUSTE_NAO_MEDIDO, achadoAlvo: { estado: 'nao-mensuravel' } })
  })

  it('revisores C/D — a CHAVE do achado é o id: `texto-largo` e `texto-cortado` da mesma camada são achados diferentes; a logo sobre texto casa pela logo (os tocados são a gravidade); a fonte pela família', () => {
    const largo = achado('texto-cortado', ['headline'], { larguraDaLinha: 700, larguraUtil: 670 }, { id: 'texto-largo:headline' })
    const cortado = achado('texto-cortado', ['headline'], { linhas: 3, linhasVisiveis: 2 })
    // Antes só largo (30 px); depois só UMA linha cortada: não é "melhora de 30 para 1" — é o largo resolvido E um cortado que apareceu.
    const r = compararNaoPiora(medida({ relatorio: relatorio([largo]) }), medida({ relatorio: relatorio([cortado]) }))
    expect(r.veredito).toBe(AJUSTE_PIOROU_ARTE)
    expect(r.pioras).toEqual([expect.objectContaining({ propriedade: 'texto-cortado', antes: null, depois: 1 })])
    expect(r.melhoras).toEqual([expect.objectContaining({ propriedade: 'texto-cortado', antes: 30, depois: null })])
    // Logo que encostava em 3 textos e passa a encostar em 1: melhora, não "apareceu".
    const tres = achado('logo-sobre-texto', ['logo', 'a', 'b', 'c'])
    const um = achado('logo-sobre-texto', ['logo', 'a'])
    expect(compararNaoPiora(medida({ relatorio: relatorio([tres]) }), medida({ relatorio: relatorio([um]) }))).toMatchObject({ veredito: 'aceito', melhoras: [expect.objectContaining({ propriedade: 'logo-sobre-texto', antes: 3, depois: 1 })] })
    expect(chaveDoAchado(tres)).toBe(chaveDoAchado(um))
    // Fonte ausente em 3 camadas; esconder uma delas não é "apareceu outra fonte".
    const f3 = achado('fonte-nao-carregada', ['x', 'y', 'z'], { familia: 'Branley', peso: 700 })
    const f2 = achado('fonte-nao-carregada', ['x', 'y'], { familia: 'Branley', peso: 700 })
    expect(compararNaoPiora(medida({ relatorio: relatorio([f3]) }), medida({ relatorio: relatorio([f2]) })).pioras).toEqual([])
  })

  it('revisores B/F — texto que APARECE sem leitura é piora; texto VAZIO não entra no contraste', () => {
    const revelado = compararNaoPiora(medida(), medida({ contraste: contraste([{ camada: 'headline', com: 100 }, { camada: 'servico', com: 200 }]) }))
    expect(revelado).toMatchObject({ veredito: AJUSTE_PIOROU_ARTE, pioras: [expect.objectContaining({ propriedade: 'contraste', camadas: ['servico'], antes: null, motivo: expect.stringMatching(/apareceu fora do alvo/) })] })
    const vazio = { ...texto('badge', 1100), content: '' } as Layer
    const r = compararNaoPiora(
      medida({ camadas: [texto('headline'), vazio], contraste: contraste([{ camada: 'headline', com: 100 }, { camada: 'badge', com: 135 }]) }),
      medida({ camadas: [texto('headline'), { ...vazio, position: { x: 92, y: 400 } } as Layer], contraste: contraste([{ camada: 'headline', com: 100 }, { camada: 'badge', com: 213 }]) }),
    )
    expect(r.veredito).toBe('aceito')
  })

  it('revisores A/C/D — DESAPARECER: texto com conteúdo que some é piora de geometria (salvo quando o ajuste é `visibilidade`); logo escondida é piora sempre; o achado da camada escondida nunca fica "resolvido"', () => {
    const logo = { id: 'logo', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: 800, y: 1600 }, size: { width: 160, height: 80 } } as Layer
    const antes = medida({ relatorio: relatorio([achado('texto-sem-leitura', ['servico'], { p98: 194 })]), camadas: [texto('headline'), texto('servico', 1700), logo], contraste: contraste([{ camada: 'headline', com: 100 }, { camada: 'servico', com: 194 }]) })
    const semServico = medida({ camadas: [texto('headline'), { ...texto('servico', 1700), visible: false } as Layer, logo], contraste: contraste([{ camada: 'headline', com: 100 }]) })
    expect(compararNaoPiora(antes, semServico).pioras).toEqual([expect.objectContaining({ propriedade: 'geometria', camadas: ['servico'], depois: 'escondido' })])
    const comPermissao = compararNaoPiora(antes, semServico, { permiteOcultar: true, achadoAlvo: 'texto-sem-leitura:servico' })
    expect(comPermissao.pioras).toEqual([])
    expect(comPermissao).toMatchObject({ veredito: AJUSTE_NAO_MELHOROU_O_ACHADO, achadoAlvo: { estado: 'nao-melhorou', depois: null } })
    expect(motivoDaComparacao(comPermissao)).toMatch(/só escondeu/)
    const semLogo = medida({ camadas: [texto('headline'), texto('servico', 1700)], contraste: antes.contraste })
    expect(compararNaoPiora(antes, semLogo, { permiteOcultar: true }).pioras).toEqual([expect.objectContaining({ propriedade: 'logo-sem-leitura', camadas: ['logo'] })])
    // A logo empurrada para fora do canvas (parcialmente) é piora: a leitura só mede o que sobrou.
    const logoFora = medida({ camadas: [texto('headline'), texto('servico', 1700), { ...logo, position: { x: 1000, y: 1600 } } as Layer], contraste: antes.contraste })
    expect(compararNaoPiora(antes, logoFora).pioras).toEqual([expect.objectContaining({ propriedade: 'geometria', camadas: ['logo'], motivo: expect.stringMatching(/sair do canvas/) })])
    // Já parcialmente fora e empurrada MAIS para fora: piora também (Codex R1); 1 px de ruído não conta.
    const jaFora = medida({ camadas: [texto('headline'), { ...logo, position: { x: 1000, y: 1600 } } as Layer], contraste: contraste([{ camada: 'headline', com: 100 }]) })
    const maisFora = medida({ camadas: [texto('headline'), { ...logo, position: { x: 1040, y: 1600 } } as Layer], contraste: contraste([{ camada: 'headline', com: 100 }]) })
    expect(compararNaoPiora(jaFora, maisFora).pioras).toEqual([expect.objectContaining({ propriedade: 'geometria', camadas: ['logo'], antes: 80, depois: 120 })])
    expect(compararNaoPiora(jaFora, medida({ camadas: [texto('headline'), { ...logo, position: { x: 1001, y: 1600 } } as Layer], contraste: jaFora.contraste })).pioras).toEqual([])
  })

  it('revisores C/D — mexer em camada que a geometria NÃO mediu (fonte ausente, texto sem métrica, rich text) é NÃO MEDIDO; mexer noutra, não', () => {
    const antes = medida({ semMetrica: ['servico'] })
    const depois = medida({ semMetrica: ['servico'] })
    expect(compararNaoPiora(antes, depois, { alteradas: ['servico'] })).toMatchObject({ veredito: AJUSTE_NAO_MEDIDO, naoMedidas: [expect.objectContaining({ propriedade: 'geometria', motivo: expect.stringMatching(/servico/) })] })
    expect(compararNaoPiora(antes, depois, { alteradas: ['headline'] }).veredito).toBe('aceito')
  })

  it('Codex R2 — a conferência das fontes que falhou chega como `fonte-nao-carregada` não avaliada e recusa como NÃO MEDIDO', () => {
    const semFontes = { 'fonte-nao-carregada': { estado: 'nao-avaliada' as const, motivo: 'a conferência das fontes falhou: canvas' } }
    expect(compararNaoPiora(medida(), medida({ relatorio: relatorio([], semFontes) }))).toMatchObject({ veredito: AJUSTE_NAO_MEDIDO, naoMedidas: [expect.objectContaining({ propriedade: 'fonte-nao-carregada', lado: 'depois' })] })
  })

  it('revisores C/E — regra INAPLICÁVEL não bloqueia: `texto-sobre-assunto` não avaliada dos dois lados numa peça SEM foto de fundo é dita em `naoAplicaveis`; com foto que não baixou, segue não medida', () => {
    const semAssunto = { 'texto-sobre-assunto': { estado: 'nao-avaliada' as const, motivo: 'sem foto ou sem assunto localizado' } }
    const r = compararNaoPiora(medida({ relatorio: relatorio([], semAssunto) }), medida({ relatorio: relatorio([], semAssunto) }))
    expect(r).toMatchObject({ veredito: 'aceito', naoMedidas: [], naoAplicaveis: [expect.objectContaining({ propriedade: 'texto-sobre-assunto' })] })
    const foto = { id: 'bg-foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: CANVAS, fileUrl: 'https://x/foto.jpg' } as Layer
    const comFoto = compararNaoPiora(medida({ relatorio: relatorio([], semAssunto), camadas: [foto, texto('headline')] }), medida({ relatorio: relatorio([], semAssunto), camadas: [foto, texto('headline')] }))
    expect(comFoto.veredito).toBe(AJUSTE_NAO_MEDIDO)
  })

  it('revisor B — `tratamento-piorou-leitura` que APARECE com a leitura do texto igual não é piora (quem decide é o contraste); o achado dessa regra só está "resolvido" se a leitura não piorou', () => {
    const trat = achado('tratamento-piorou-leitura', ['servico'], { antes: 165, depois: 180 })
    const leitura = contraste([{ camada: 'servico', com: 194 }])
    expect(compararNaoPiora(medida({ contraste: leitura }), medida({ relatorio: relatorio([trat]), contraste: leitura })).veredito).toBe('aceito')
    // O achado some porque o texto saiu de sob o gradiente — mas a leitura piorou (194 → 233): não está resolvido.
    const sumiuPiorando = compararNaoPiora(medida({ relatorio: relatorio([trat]), contraste: leitura }), medida({ contraste: contraste([{ camada: 'servico', com: 233 }]) }), { achadoAlvo: 'tratamento-piorou-leitura:servico' })
    expect(sumiuPiorando.achadoAlvo).toMatchObject({ estado: 'nao-melhorou' })
    expect(sumiuPiorando.veredito).toBe(AJUSTE_PIOROU_ARTE)
  })

  it('CP4.1 — `texto-pequeno` é propriedade comparada pela gravidade da própria regra (quanto abaixo do piso1080): aparecer, descer mais e subir', () => {
    const pequeno = (corpo1080: number, piso1080 = 26) => achado('texto-pequeno', ['servico'], { corpo1080, piso1080, referencia1080: 32 })
    // Saudável → 8 px: o achado aparece = piora.
    expect(compararNaoPiora(medida(), medida({ relatorio: relatorio([pequeno(8)]) }))).toMatchObject({ veredito: AJUSTE_PIOROU_ARTE, pioras: [expect.objectContaining({ propriedade: 'texto-pequeno', camadas: ['servico'], antes: null, depois: 18 })] })
    // Já pequeno (20, piso 26) → 18: piorou (gravidade 6 → 8).
    expect(compararNaoPiora(medida({ relatorio: relatorio([pequeno(20)]) }), medida({ relatorio: relatorio([pequeno(18)]) }))).toMatchObject({ veredito: AJUSTE_PIOROU_ARTE, pioras: [expect.objectContaining({ propriedade: 'texto-pequeno', antes: 6, depois: 8 })] })
    // Já pequeno (20) → 24: melhorou (6 → 2), ainda abaixo do piso.
    expect(compararNaoPiora(medida({ relatorio: relatorio([pequeno(20)]) }), medida({ relatorio: relatorio([pequeno(24)]) }))).toMatchObject({ veredito: 'aceito', melhoras: [expect.objectContaining({ propriedade: 'texto-pequeno', antes: 6, depois: 2 })] })
    // Resolve a colisão diminuindo a fonte, mas cria texto-pequeno: recusa (sem pontuação global).
    const colisao = achado('colisao', ['headline', 'servico'], { px: 12 })
    expect(compararNaoPiora(medida({ relatorio: relatorio([colisao]) }), medida({ relatorio: relatorio([pequeno(18)]) })).veredito).toBe(AJUSTE_PIOROU_ARTE)
    // Modelo que nasceu miúdo: o piso é o relativo da própria regra (20, não 26); 19 → 17 é piora pela mesma gravidade.
    expect(compararNaoPiora(medida({ relatorio: relatorio([pequeno(19, 20)]) }), medida({ relatorio: relatorio([pequeno(17, 20)]) })).pioras).toEqual([expect.objectContaining({ propriedade: 'texto-pequeno', antes: 1, depois: 3 })])
    // 1 px de ruído não conta.
    expect(compararNaoPiora(medida({ relatorio: relatorio([pequeno(20)]) }), medida({ relatorio: relatorio([pequeno(19)]) })).pioras).toEqual([])
    // Declarado como alvo e não melhorado: recusa.
    expect(compararNaoPiora(medida({ relatorio: relatorio([pequeno(20)]) }), medida({ relatorio: relatorio([pequeno(20)]) }), { achadoAlvo: 'texto-pequeno:servico' }).veredito).toBe(AJUSTE_NAO_MELHOROU_O_ACHADO)
    // Camada não medida (cobertura não avaliada): fail-closed, nunca aprovação.
    expect(compararNaoPiora(medida(), medida({ relatorio: relatorio([], { 'texto-pequeno': { estado: 'nao-avaliada', motivo: 'a medição dos textos falhou' } }) })).veredito).toBe(AJUSTE_NAO_MEDIDO)
  })

  it('13. achado só de VISÃO como alvo não exige prova de melhora, mas a não-piora vale do mesmo jeito', () => {
    const visto = achado('visao', ['headline'], { problema: 'bloco-mal-colocado' }, { certeza: 'visao', id: 'visao-bloco-mal-colocado:T1' })
    const antes = medida({ relatorio: relatorio([visto]) })
    const ok = compararNaoPiora(antes, medida({ relatorio: relatorio([visto]) }), { achadoAlvo: 'visao-bloco-mal-colocado:T1' })
    expect(ok.veredito).toBe('aceito')
    expect(ok.achadoAlvo).toMatchObject({ estado: 'nao-mensuravel' })
    const piorou = compararNaoPiora(antes, medida({ relatorio: relatorio([visto, achado('colisao', ['headline', 'apoio'], { px: 10 })]) }), { achadoAlvo: 'visao-bloco-mal-colocado:T1' })
    expect(piorou.veredito).toBe(AJUSTE_PIOROU_ARTE)
    // Um achado de visão que APARECE depois não é piora medida.
    expect(compararNaoPiora(medida(), medida({ relatorio: relatorio([visto]) })).veredito).toBe('aceito')
  })

  it('14. o retorno traz antes e depois de cada piora, com a propriedade e as camadas', () => {
    const c = compararNaoPiora(medida({ relatorio: relatorio([achado('tinta-fora-da-caixa', ['apoio'], { pxAcima: 0, pxAbaixo: 2 })]) }), medida({ relatorio: relatorio([achado('tinta-fora-da-caixa', ['apoio'], { pxAcima: 0, pxAbaixo: 9 })]) }))
    expect(c.pioras).toEqual([{ propriedade: 'tinta-fora-da-caixa', camadas: ['apoio'], antes: 2, depois: 9, motivo: expect.stringContaining('piorou') }])
  })

  it('não medido NÃO é "não piorou": régua sem medida ou regra não avaliada → AJUSTE_NAO_MEDIDO (fail-closed)', () => {
    const semRegua = compararNaoPiora(medida(), medida({ contraste: null }))
    expect(semRegua.veredito).toBe(AJUSTE_NAO_MEDIDO)
    expect(semRegua.naoMedidas).toEqual([{ propriedade: 'contraste', lado: 'depois', motivo: 'a régua de contraste não mediu' }])
    const semLogo = compararNaoPiora(medida({ relatorio: relatorio([], { 'logo-sem-leitura': { estado: 'nao-avaliada', motivo: 'o arquivo da logo não carregou' } }) }), medida())
    expect(semLogo.veredito).toBe(AJUSTE_NAO_MEDIDO)
    expect(semLogo.naoMedidas[0]).toMatchObject({ propriedade: 'logo-sem-leitura', lado: 'antes' })
    // Parcial (rich text, fonte incerta) conta como medida para o que cobriu.
    expect(compararNaoPiora(medida({ relatorio: relatorio([], { colisao: { estado: 'parcial', motivo: 'rich text' } }) }), medida()).veredito).toBe('aceito')
    // A piora vence o "não medido" na ordem do veredito (as duas são ditas).
    const ambos = compararNaoPiora(medida(), medida({ contraste: null, relatorio: relatorio([achado('colisao', ['a', 'b'], { px: 10 })]) }))
    expect(ambos.veredito).toBe(AJUSTE_PIOROU_ARTE)
    expect(ambos.naoMedidas).toHaveLength(1)
  })

  it('geometria: caixa que fica degenerada ou inteira fora do canvas é piora', () => {
    const fora = texto('headline', 2500)
    expect(compararNaoPiora(medida(), medida({ camadas: [fora] })).pioras).toEqual([expect.objectContaining({ propriedade: 'geometria', camadas: ['headline'] })])
    expect(compararNaoPiora(medida({ camadas: [fora] }), medida({ camadas: [fora] })).veredito).toBe('aceito')
  })

  it('a gravidade por regra: linhas cortadas, px, cobertura, o que falta ao p10', () => {
    expect(gravidadeDoAchado(achado('texto-cortado', ['a'], { linhas: 5, linhasVisiveis: 3 })).valor).toBe(2)
    expect(gravidadeDoAchado(achado('texto-sobre-assunto', ['a'], { cobertura: 0.42 })).valor).toBeCloseTo(0.42)
    expect(gravidadeDoAchado(achado('logo-sem-leitura', ['logo'], { p10: 12, limiar: 45 })).valor).toBe(33)
    expect(gravidadeDoAchado(achado('fonte-nao-carregada', ['a'], { familia: 'X' })).valor).toBe(1)
  })
})
