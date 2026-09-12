import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { AMOSTRA_DO_ORCAMENTO, areaUtilDe, familiasUsadasNaVariante, medirCopy, orcamentoDaVariante } from '../medir-copy'

/** Régua falsa: cada letra mede 0,55 × corpo; uma linha por \n; altura = linhas × corpo × entrelinha. */
const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  const largura = Math.max(...linhas.map((l) => l.length * fontSize * 0.55))
  return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: largura, lineCount: linhas.length }
}

const texto = (id: string, style: Record<string, unknown>, content = 'x'): Layer => ({
  id,
  name: id,
  type: 'text',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: 400, height: 80 },
  content,
  style,
})

const assinatura = montarAssinatura({
  pagina: {
    id: 'p-story',
    name: 'Story base',
    width: 1080,
    height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#FFFFFF', lineHeight: 1 }),
      texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#FFFFFF', lineHeight: 1.2 }),
    ],
  },
  formatoDaPagina: 'story',
  // destaque por COR (sem depender de família pesada cadastrada): é o que faz [colchetes] virar rich text
  numerosDoProjeto: { destaque: { fill: '#FF0000', pesado: false } },
})
const geo = assinatura.numeros.geometria.story
const COLUNA = 1080 - 2 * geo.margemH
const carregadaExceto = (...ausentes: string[]) => (f: string) => !ausentes.includes(f)
const base = { assinatura, medir: medirFalso, familias: ['Bevan', 'Barlow'], fonteCarregada: carregadaExceto() }

describe('medirCopy — a mesma régua da composição, dita pelo que é', () => {
  it('a área útil sai dos números da assinatura: coluna = largura − 2 margens; escala 1 quando a página é do formato, a do formato quando não é', () => {
    const story = areaUtilDe(assinatura, 'story')
    expect(story.colunaUtil).toBe(COLUNA)
    expect(story.escalaDoFormato).toBe(1)
    expect(story.alturaUtil).toBe(1920 - geo.safeTopo - geo.safeRodape)
    const feed = areaUtilDe(assinatura, 'feed')
    expect(feed.escalaDoFormato).toBe(0.875)
    expect(feed.alturaDoCanvas).toBe(1350)
  })

  it('copy curta cabe em escala 1, com a caixa medida; linha comprida cabe só reduzida; linha que não cabe nem a 80% volta com o orçamento', () => {
    // 100px × 0,55 = 55px por letra na régua falsa: 16 letras = 880px cabem; 21 letras (1155px) só com a fonte reduzida; 29 letras (1595px) não cabem nem a 80%
    expect(COLUNA).toBe(1000)
    const r = medirCopy({ ...base, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela no bafo!'] }, { papel: 'apoio', linhas: ['Sexta é dia'] }] } })
    expect(r.cabeTudo).toBe(true)
    expect(r.blocos.map((b) => [b.papel, b.situacao, b.escala])).toEqual([['headline', 'cabe', 1], ['apoio', 'cabe', 1]])
    expect(r.blocos[0].linhasMedidas[0]).toEqual({ linha: 'Costela no bafo!', largura: 880, coluna: COLUNA, cabe: true, caracteresQueCabem: 18 })
    expect(r.blocos[0].height).toBeGreaterThan(0)
    expect(r.naoMedido).toBe(false)
    expect(r.aproximado).toBe(false)

    const reduzida = medirCopy({ ...base, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela no bafo hoje!'] }] } })
    expect(reduzida.blocos[0].situacao).toBe('cabe-reduzido')
    expect(reduzida.blocos[0].escala).toBeLessThan(1)
    expect(reduzida.blocos[0].escala).toBeGreaterThanOrEqual(0.8)
    expect(reduzida.blocos[0].linhasMedidas[0].cabe).toBe(false)
    expect(reduzida.cabeTudo).toBe(true)

    const naoCabe = medirCopy({ ...base, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela no bafo da casa hoje!'] }] } })
    expect(naoCabe.cabeTudo).toBe(false)
    expect(naoCabe.blocos[0].situacao).toBe('nao-cabe')
    expect(naoCabe.blocos[0].orcamento?.[0].caracteresQueCabem).toBe(18)
    expect(naoCabe.blocos[0].avisos.some((a) => /reescreva com o orçamento/.test(a))).toBe(true)
  })

  it('papel que a variante não tem é declarado, não some; a manchete com segunda voz é dividida como na composição', () => {
    const r = medirCopy({ ...base, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela', 'no bafo'] }, { papel: 'servico', linhas: ['Sexta, 19h'] }] } })
    expect(r.papeisAusentes).toEqual(['servico'])
    expect(r.cabeTudo).toBe(false)
    expect(r.blocos.find((b) => b.papel === 'servico')?.situacao).toBe('papel-ausente')
    expect(r.segundaVoz).toBe('nenhuma')

    const comVoz2 = montarAssinatura({
      pagina: { id: 'p2', width: 1080, height: 1920, layers: [texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 }), texto('headline2', { fontFamily: 'Caveat', fontSize: 90, color: '#f00', lineHeight: 1 })] },
      formatoDaPagina: 'story',
      numerosDoProjeto: null,
    })
    const r2 = medirCopy({ ...base, assinatura: comVoz2, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela', 'no bafo'] }] } })
    expect(r2.segundaVoz).toBe('legado')
    expect(r2.blocos.map((b) => [b.papel, b.fonte])).toEqual([['headline', 'Bevan'], ['headline2', 'Caveat']])
  })

  it('fonte que não carregou no servidor = NÃO MEDIDO (os números saem, mas não valem); destaque entre [colchetes] = APROXIMADO', () => {
    const semBevan = medirCopy({ ...base, fonteCarregada: carregadaExceto('Bevan'), formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'apoio', linhas: ['Sexta é dia'] }] } })
    expect(semBevan.naoMedido).toBe(true)
    expect(semBevan.blocos[0].naoMedido).toBe(true)
    expect(semBevan.blocos[0].linhasMedidas[0].largura).toBeNull()
    expect(semBevan.blocos[1].naoMedido).toBe(false)
    expect(semBevan.fontesNaoCarregadas).toEqual(['Bevan'])

    const destacado = medirCopy({ ...base, formato: 'story', spec: { blocos: [{ papel: 'apoio', linhas: ['Sexta é [dia]'] }] } })
    expect(destacado.aproximado).toBe(true)
    // marca SEM estilo de destaque: [colchetes] saem sem destaque e o BLOCO avisa (não só a lista geral)
    const semEstilo = montarAssinatura({ pagina: { id: 'p5', width: 1080, height: 1920, layers: [texto('apoio', { fontFamily: 'Barlow', fontSize: 40, color: '#fff', lineHeight: 1.2 })] }, formatoDaPagina: 'story', numerosDoProjeto: { destaque: { pesado: false } } })
    const semDestaque = medirCopy({ ...base, assinatura: semEstilo, familias: [], formato: 'story', spec: { blocos: [{ papel: 'apoio', linhas: ['Sexta é [dia]'] }] } })
    expect(semDestaque.aproximado).toBe(false)
    expect(semDestaque.blocos[0].avisos.some((a) => /não tem estilo de destaque/.test(a))).toBe(true)
    expect(destacado.blocos[0].aproximado).toBe(true)
    expect(destacado.blocos[0].linhasMedidas[0].linha).toBe('Sexta é [dia]')
  })

  it('a medição é a MESMA preparação da composição (R01): dois textos de serviço no grupo da página, com estilos próprios, viram dois blocos com ids próprios — horário num, endereço no outro', () => {
    const camadas: Layer[] = [
      { ...texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 }, 'Título'), metadata: { groupId: 'g-topo' } },
      { ...texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#fff', lineHeight: 1.2 }, 'Seg a sex, das 11h às 15h'), position: { x: 92, y: 1600 }, metadata: { groupId: 'g-rodape' } },
      // o segundo texto de serviço da página chama-se pelo apelido que a equipe usa ("info"); a composição dá a ele o id `servico-2`
      { ...texto('info', { fontFamily: 'Barlow', fontSize: 24, color: '#ddd', lineHeight: 1.2 }, 'Rua das Flores, 12 — Centro'), id: 'servico-endereco', position: { x: 92, y: 1650 }, metadata: { groupId: 'g-rodape' } },
    ]
    const comArranjo = montarAssinatura({ pagina: { id: 'p3', width: 1080, height: 1920, layers: camadas }, formatoDaPagina: 'story', numerosDoProjeto: null })
    comArranjo.camadasDaPagina = camadas
    const r = medirCopy({ ...base, assinatura: comArranjo, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['Ter a dom, das 18h às 23h', 'Av. Beira Mar, 100'] }] } })
    expect(r.blocos.map((b) => [b.id, b.papel, b.fontSize, b.linhas])).toEqual([
      ['headline', 'headline', 100, 1],
      ['servico', 'servico', 30, 1],
      ['servico-2', 'servico', 24, 1],
    ])
    expect(r.blocos.find((b) => b.id === 'servico')?.linhasMedidas[0].linha).toBe('Ter a dom, das 18h às 23h')
    expect(r.blocos.find((b) => b.id === 'servico-2')?.linhasMedidas[0].linha).toBe('Av. Beira Mar, 100')
    expect(r.arranjos.map((a) => a.origem)).toEqual(['pagina', 'pagina'])
    expect(r.cabeTudo).toBe(true)
  })

  it('bloco RECUSADO com a fonte do destaque ausente é NÃO MEDIDO: a recusa foi medida no fallback, a família ausente é declarada e as medidas por linha invalidadas (R03)', () => {
    const comDestaque = montarAssinatura({
      pagina: { id: 'p4', width: 1080, height: 1920, layers: [texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 })] },
      formatoDaPagina: 'story',
      numerosDoProjeto: { destaque: { fontFamily: 'Bevan Bold', pesado: false } },
    })
    const r = medirCopy({ ...base, assinatura: comDestaque, fonteCarregada: carregadaExceto('Bevan Bold'), formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['[Costela] no bafo da casa hoje!'] }] } })
    expect(r.blocos[0].situacao).toBe('nao-cabe')
    expect(r.blocos[0].naoMedido).toBe(true)
    expect(r.naoMedido).toBe(true)
    expect(r.fontesNaoCarregadas).toEqual(['Bevan Bold'])
    expect(r.blocos[0].linhasMedidas[0].largura).toBeNull()
    expect(r.blocos[0].avisos.some((a) => /Bevan Bold/.test(a) && /NÃO vale/.test(a))).toBe(true)
    // a mesma linha SEM colchetes não pede a família do destaque: medida vale, mesmo com "Bevan Bold" ausente
    const semDestaque = medirCopy({ ...base, assinatura: comDestaque, fonteCarregada: carregadaExceto('Bevan Bold'), formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela no bafo da casa hoje!'] }] } })
    expect(semDestaque.blocos[0].naoMedido).toBe(false)
  })

  it('a fonte é conferida por bloco, sobre as famílias PEDIDAS (R04): o segundo serviço com família própria ausente sai NÃO MEDIDO, o primeiro não', () => {
    const camadas: Layer[] = [
      { ...texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 }, 'Título'), metadata: { groupId: 'g-topo' } },
      { ...texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#fff', lineHeight: 1.2 }, 'Seg a sex, das 11h às 15h'), position: { x: 92, y: 1600 }, metadata: { groupId: 'g-rodape' } },
      { ...texto('info', { fontFamily: 'Fonte Rara', fontSize: 24, color: '#ddd', lineHeight: 1.2 }, 'Rua das Flores, 12 — Centro'), id: 'servico-endereco', position: { x: 92, y: 1650 }, metadata: { groupId: 'g-rodape' } },
    ]
    const a = montarAssinatura({ pagina: { id: 'p6', width: 1080, height: 1920, layers: camadas }, formatoDaPagina: 'story', numerosDoProjeto: null })
    a.camadasDaPagina = camadas
    const r = medirCopy({ ...base, assinatura: a, fonteCarregada: carregadaExceto('Fonte Rara'), formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['Ter a dom, das 18h às 23h', 'Av. Beira Mar, 100'] }] } })
    expect(r.blocos.map((b) => [b.id, b.naoMedido])).toEqual([['headline', false], ['servico', false], ['servico-2', true]])
    expect(r.blocos.find((b) => b.id === 'servico-2')?.linhasMedidas[0].largura).toBeNull()
    expect(r.fontesNaoCarregadas).toEqual(['Fonte Rara'])
    expect(r.naoMedido).toBe(true)
  })

  it('papel que a ASSINATURA não tem é ausente mesmo quando uma combinação salva o oferece (R05): a composição recusa antes dos arranjos, e a medição diz o mesmo', () => {
    const semServico = montarAssinatura({ pagina: { id: 'p7', width: 1080, height: 1920, layers: [texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 })] }, formatoDaPagina: 'story', numerosDoProjeto: null })
    const combinacaoComServico = {
      id: 'combinacao:x',
      nome: 'Rodapé salvo',
      origem: 'combinacao' as const,
      papeis: ['servico' as const],
      alinhamento: null,
      temLogo: false,
      textos: [{ papel: 'servico' as const, estilo: { fontFamily: 'Barlow', fontSize: 30, lineHeight: 1.2, letterSpacing: 0, color: '#fff' }, vaoAntes: null, elementos: [], tipo: null }],
    }
    const r = medirCopy({ ...base, assinatura: semServico, formato: 'story', combinacoesSalvas: [combinacaoComServico], spec: { blocos: [{ papel: 'headline', linhas: ['Costela'] }, { papel: 'servico', linhas: ['Sexta, 19h'] }] } })
    expect(r.papeisAusentes).toEqual(['servico'])
    expect(r.cabeTudo).toBe(false)
    expect(r.blocos.map((b) => [b.id, b.situacao])).toEqual([['servico', 'papel-ausente'], ['headline', 'cabe']])
  })

  it('a medida por linha leva o PREFIXO da assinatura como a montagem (R06): o "→ " do CTA conta na largura; a linha volta como o autor escreveu; prefixo já escrito não dobra', () => {
    const comCta = montarAssinatura({ pagina: { id: 'p8', width: 1080, height: 1920, layers: [texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 }), texto('cta', { fontFamily: 'Barlow', fontSize: 50, color: '#fff', lineHeight: 1.2 }, '→ Reserve')] }, formatoDaPagina: 'story', numerosDoProjeto: null })
    expect(comCta.papeis.cta?.prefixo).toBe('→ ')
    // 50px × 0,55 = 27,5px por letra; coluna 1000: 36 letras cabem (990), 37 não (1017,5). 36 letras SÓ cabem sem o prefixo (com "→ " são 38 = 1045)
    const linha = 'Peça agora e garanta a sua mesa hoje'
    expect(linha.length).toBe(36)
    const r = medirCopy({ ...base, assinatura: comCta, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Oi'] }, { papel: 'cta', linhas: [linha] }] } })
    const cta = r.blocos.find((b) => b.papel === 'cta')!
    expect(cta.linhasMedidas[0].linha).toBe(linha)
    expect(cta.linhasMedidas[0].largura).toBe(Math.round(38 * 27.5))
    expect(cta.linhasMedidas[0].cabe).toBe(false)
    expect(cta.situacao).toBe('cabe-reduzido')
    // caracteres que cabem descontam o prefixo: o autor tem 36 − 2 = 34 letras
    expect(cta.linhasMedidas[0].caracteresQueCabem).toBe(34)
    // prefixo já escrito pelo autor não dobra
    const jaComSeta = medirCopy({ ...base, assinatura: comCta, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: ['Oi'] }, { papel: 'cta', linhas: ['→ Reserve já'] }] } })
    expect(jaComSeta.blocos.find((b) => b.papel === 'cta')!.linhasMedidas[0].largura).toBe(Math.round('→ Reserve já'.length * 27.5))
  })

  it('colchete sem par: a linha é medida com o texto EFETIVO que a montagem desenha (R07) — "[" + 18 letras cabe em escala 1, a linha diz cabe, a string do autor volta inteira e o aviso fica', () => {
    const abertoSemPar = '[' + 'a'.repeat(18)
    const r = medirCopy({ ...base, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: [abertoSemPar] }] } })
    expect(r.blocos[0].situacao).toBe('cabe')
    expect(r.blocos[0].escala).toBe(1)
    expect(r.blocos[0].linhasMedidas[0]).toMatchObject({ linha: abertoSemPar, largura: 18 * 55, cabe: true })
    expect(r.blocos[0].aproximado).toBe(false)
    expect([...r.blocos[0].avisos, ...r.avisos].some((a) => /colchete/i.test(a))).toBe(true)
    const fechadoSemPar = 'a'.repeat(18) + ']'
    const r2 = medirCopy({ ...base, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: [fechadoSemPar] }] } })
    expect(r2.blocos[0].linhasMedidas[0]).toMatchObject({ linha: fechadoSemPar, largura: 18 * 55, cabe: true })
  })

  it('a medida por linha e o orçamento da recusa somam a largura do DESTAQUE como a montagem (R08): família pesada mais larga, fontes disponíveis — bloco, linha e orçamento dizem o mesmo', () => {
    // Régua sensível à FAMÍLIA: 0,55 × corpo na base, 1,10 × corpo na família pesada do destaque.
    const medirPorFamilia = (layer: Layer) => {
      const fontSize = Number(layer.style?.fontSize ?? 16)
      const fator = layer.style?.fontFamily === 'Bevan Bold' ? 1.1 : 0.55
      const linhas = (layer.content ?? '').split('\n')
      const largura = Math.max(...linhas.map((l) => l.length * fontSize * fator))
      return { width: layer.size.width, height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1), maxLineWidth: largura, lineCount: linhas.length }
    }
    const comDestaque = montarAssinatura({
      pagina: { id: 'p9', width: 1080, height: 1920, layers: [texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 })] },
      formatoDaPagina: 'story',
      numerosDoProjeto: { destaque: { fontFamily: 'Bevan Bold', pesado: false } },
    })
    const linha = 'Costela no bafo!'
    expect(linha.length).toBe(16)
    // A coluna desta assinatura sai das margens da página (896 px): 16 × 55 = 880 px cabe SEM destaque;
    // a linha inteira destacada mede 16 × 110 = 1.760 px (extra de 880), e a 80% ainda 1.408 px — não cabe.
    const coluna = areaUtilDe(comDestaque, 'story').colunaUtil
    expect(16 * 55).toBeLessThanOrEqual(coluna)
    expect(16 * 110 * 0.8).toBeGreaterThan(coluna)
    const r = medirCopy({ ...base, assinatura: comDestaque, medir: medirPorFamilia, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: [`[${linha}]`] }] } })
    const bloco = r.blocos[0]
    expect(bloco.situacao).toBe('nao-cabe')
    expect(bloco.naoMedido).toBe(false)
    expect(bloco.aproximado).toBe(true)
    expect(bloco.linhasMedidas[0].coluna).toBe(coluna)
    expect(bloco.linhasMedidas[0].largura).toBe(1760)
    expect(bloco.linhasMedidas[0].cabe).toBe(false)
    const cabem = Math.floor((16 * coluna) / 1760)
    expect(bloco.linhasMedidas[0].caracteresQueCabem).toBe(cabem)
    // o orçamento da recusa NÃO vem vazio: a mesma linha, a mesma largura, o mesmo orçamento
    expect(bloco.orcamento).toHaveLength(1)
    expect(bloco.orcamento![0]).toMatchObject({ linha, largura: 1760, coluna, caracteresQueCabem: cabem })
    // a MESMA linha sem colchetes cabe em escala 1: o extra é só do destaque
    const semColchetes = medirCopy({ ...base, assinatura: comDestaque, medir: medirPorFamilia, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: [linha] }] } })
    expect(semColchetes.blocos[0].situacao).toBe('cabe')
    expect(semColchetes.blocos[0].linhasMedidas[0].largura).toBe(880)
    expect(semColchetes.blocos[0].linhasMedidas[0].cabe).toBe(true)
    // destaque só na COR (a assinatura base, coluna 1.000): mesma família, nenhum extra — cabe, e é aproximado
    const soCor = medirCopy({ ...base, medir: medirPorFamilia, formato: 'story', spec: { blocos: [{ papel: 'headline', linhas: [`[${linha}]`] }] } })
    expect(soCor.blocos[0].situacao).toBe('cabe')
    expect(soCor.blocos[0].linhasMedidas[0].largura).toBe(880)
    expect(soCor.blocos[0].aproximado).toBe(true)
  })

  it('as famílias da variante são as de TODOS os textos reconhecidos (R09): o segundo serviço com fonte própria entra, camada oculta e camada sem papel não', () => {
    const camadas: Layer[] = [
      { ...texto('headline', { fontFamily: 'Bevan', fontSize: 100, color: '#fff', lineHeight: 1 }, 'Título'), metadata: { groupId: 'g-topo' } },
      { ...texto('servico', { fontFamily: 'Barlow', fontSize: 30, color: '#fff', lineHeight: 1.2 }, 'Seg a sex, das 11h às 15h'), position: { x: 92, y: 1600 }, metadata: { groupId: 'g-rodape' } },
      { ...texto('info', { fontFamily: 'Fonte Rara', fontSize: 24, color: '#ddd', lineHeight: 1.2 }, 'Rua das Flores, 12 — Centro'), id: 'servico-endereco', position: { x: 92, y: 1650 }, metadata: { groupId: 'g-rodape' } },
      { ...texto('apoio', { fontFamily: 'Fonte Oculta', fontSize: 40, color: '#fff', lineHeight: 1.2 }), visible: false },
      texto('decoracao', { fontFamily: 'Fonte Sem Papel', fontSize: 40, color: '#fff', lineHeight: 1.2 }),
    ]
    const a = montarAssinatura({ pagina: { id: 'p10', width: 1080, height: 1920, layers: camadas }, formatoDaPagina: 'story', numerosDoProjeto: { destaque: { fontFamily: 'Bevan Bold', pesado: false } } })
    // `papeis` guarda só o PRIMEIRO estilo de cada papel: a "Fonte Rara" do segundo serviço não está lá
    expect(Object.values(a.papeis).map((e) => e.fontFamily)).not.toContain('Fonte Rara')
    const familias = familiasUsadasNaVariante(a, camadas)
    expect(familias).toEqual(expect.arrayContaining(['Bevan', 'Barlow', 'Fonte Rara', 'Bevan Bold']))
    expect(familias).not.toContain('Fonte Oculta')
    expect(familias).not.toContain('Fonte Sem Papel')
    // sem a lista explícita, lê `camadasDaPagina` da própria assinatura (como o serviço a carrega)
    a.camadasDaPagina = camadas
    expect(familiasUsadasNaVariante(a)).toContain('Fonte Rara')
  })

  it('o orçamento antes do texto: caracteres por linha pela amostra em português e linhas na altura útil, por papel; sem fonte, nulo', () => {
    const o = orcamentoDaVariante({ assinatura, formato: 'story', medir: medirFalso, fontesNaoCarregadas: new Set() })
    // 1000 / (100 × 0,55) = 18,18 → 18 caracteres na headline; 1000 / 22 = 45,45 → 45 no apoio
    expect(o.map((p) => [p.papel, p.caracteresPorLinha])).toEqual([['headline', 18], ['apoio', 45]])
    expect(o[0].linhasNaAlturaUtil).toBe(Math.floor((1920 - geo.safeTopo - geo.safeRodape) / 100))
    expect(AMOSTRA_DO_ORCAMENTO.length).toBeGreaterThan(30)
    const semFonte = orcamentoDaVariante({ assinatura, formato: 'feed', medir: medirFalso, fontesNaoCarregadas: new Set(['Barlow']) })
    expect(semFonte.find((p) => p.papel === 'apoio')).toMatchObject({ naoMedido: true, caracteresPorLinha: null, fontSize: 35 })
  })
})
