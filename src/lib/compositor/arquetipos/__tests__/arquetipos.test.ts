/**
 * T0 — o catálogo imutável de arquétipos minimalistas (14/10/2026). Contrato,
 * catálogo e validador; nada aqui toca o compositor, a Page ou o banco.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { DIMENSOES } from '../../spec'
import { listarArquetipos, resolverArquetipo, verArquetipo } from '../catalogo'
import { impressaoDoArquetipo, jsonCanonico } from '../impressao'
import { chaveDoArquetipo, ELEMENTOS_QUE_ENVOLVEM, FORMATOS_DO_ARQUETIPO, type ArquetipoDeLayout, type Caixa, type PosicaoDoPapel, type Zona } from '../tipos'
import { areaSeguraPadrao, validarArquetipo, validarCatalogo } from '../validar'
import { ocupacaoDoAcento, receitasDoArquetipo } from '../acentos'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'

const TOPO = 'minimal-fb-topo-esquerda'
const BASE = 'minimal-fb-base-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const GIGANTE = 'minimal-titulo-gigante'
const LISTA = 'minimal-tipografico-lista'
const CONVITE = 'minimal-tipografico-convite'
const DIVISAO = 'minimal-divisao-foto-topo'
const BASE_CENTRO = 'minimal-fb-base-centro'
const TOPO_CENTRO = 'minimal-fb-topo-centro'
const ARCO = 'minimal-divisao-cor-topo-arco'
const COLUNA = 'minimal-coluna-foto'
const COLUNA_E = 'minimal-coluna-foto-esquerda'

/** A impressão de cada versão publicada. Mudou? Publique `id@versao+1`, não edite a antiga. */
const IMPRESSOES_PUBLICADAS: Record<string, string> = {
  'minimal-fb-base-esquerda@1': 'arq1-0c6796f14d6787',
  'minimal-fb-centro-optico@1': 'arq1-05eebd2c041304',
  'minimal-fb-topo-esquerda@1': 'arq1-1f4ab8c4a215f2',
  'minimal-titulo-gigante@1': 'arq1-1025df9d49631a',
  'minimal-tipografico-lista@1': 'arq1-023b3e4602f2d9',
  'minimal-tipografico-convite@1': 'arq1-1cdd408f7eeb8d',
  'minimal-tipografico-convite@2': 'arq1-01570f16b5b8cb',
  'minimal-divisao-foto-topo@1': 'arq1-03ccaf6af70501',
  'minimal-fb-base-centro@1': 'arq1-15c914b2112ca8',
  'minimal-fb-topo-centro@1': 'arq1-023d4c649e2482',
  'minimal-divisao-cor-topo-arco@1': 'arq1-04603bcf9d7623',
  // IH #10 (25/10/2026): os 2 ids da coluna de foto, calculados e travados; as 11 de cima byte a byte.
  'minimal-coluna-foto@1': 'arq1-17a4b00f7ab1d1',
  'minimal-coluna-foto-esquerda@1': 'arq1-15df4b7aedca7d',
}

const ver = (id: string) => verArquetipo(id) as ArquetipoDeLayout
/** Uma cópia mutável para montar definições quebradas. */
const rascunho = (id = TOPO): any => ver(id)
const codigos = (a: unknown) => validarArquetipo(a as ArquetipoDeLayout).map((p) => p.codigo)

const comPosicao = (p: PosicaoDoPapel): p is { referencia: Caixa; zona: Zona } => 'referencia' in p
const posicoes = (a: ArquetipoDeLayout, f: 'story' | 'feed') =>
  Object.entries(a.formatos[f].papeis).filter((e): e is [string, { referencia: Caixa; zona: Zona }] => comPosicao(e[1] as PosicaoDoPapel))
const fundo = (c: Caixa) => c.y + c.h
const sobrepoe = (a: Caixa, b: Caixa) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('T0 · contrato e catálogo', () => {
  it('1. o catálogo tem exatamente os 12 modelos (os 3 do T0 + o título gigante do T4-A + a lista do #15 + o convite do #16 + a divisão do #8 + a base centrada do #4 + o topo centrado do #5 + o arco do #9 + os 2 lados da coluna do #10)', () => {
    // Conta MODELOS (ids), não versões: publicar uma v2 ao lado não muda isto. H9: o #9@1 publicado. IH #10: os 2 ids da coluna.
    expect([...new Set(listarArquetipos().map((a) => a.id))].sort()).toEqual([COLUNA, COLUNA_E, ARCO, DIVISAO, BASE_CENTRO, BASE, CENTRO, TOPO_CENTRO, TOPO, CONVITE, LISTA, GIGANTE])
  })

  it('A-1/A-2 (#16@2): 13 versões e 12 ids (com o #8@1, o #4@1, o #5@1, o #9@1 da H9 e os 2 do #10 da IH); sem versão → @2, versão 1 → @1; o asset cantoneiras@1 é o literal de hoje', () => {
    expect(listarArquetipos().map(chaveDoArquetipo)).toHaveLength(13)
    expect(new Set(listarArquetipos().map((a) => a.id)).size).toBe(12)
    expect(listarArquetipos().filter((a) => a.id === CONVITE).map((a) => a.versao)).toEqual([1, 2])
    expect(ver(CONVITE).versao).toBe(2)
    expect(impressaoDoArquetipo(ver(CONVITE))).toBe(IMPRESSOES_PUBLICADAS[`${CONVITE}@2`])
    expect(impressaoDoArquetipo(verArquetipo(CONVITE, 1)!)).toBe('arq1-1cdd408f7eeb8d')
    expect(ver(CONVITE).elementos!.find((e) => e.id === 'cantoneiras')!.braco).toBe(0.12)
    expect(verArquetipo(CONVITE, 1)!.elementos!.find((e) => e.id === 'cantoneiras')!.braco).toBeUndefined()
    expect(SHAPES_LIBRARY.find((x) => x.id === 'cantoneiras')).toMatchObject({ versao: 1, pathData: 'M0 25 L0 0 L25 0 M75 0 L100 0 L100 25 M100 75 L100 100 L75 100 M25 100 L0 100 L0 75' })
  })

  it('2. ids únicos — e o validador recusa id@versao repetido e id fora do formato', () => {
    const lista = listarArquetipos()
    expect(new Set(lista.map(chaveDoArquetipo)).size).toBe(lista.length)
    expect(validarCatalogo([...lista, ver(TOPO)]).map((p) => p.codigo)).toEqual(['ID_DUPLICADO'])
    expect(codigos({ ...rascunho(), id: 'Minimal Topo' })).toContain('ID_INVALIDO')
  })

  it('3. versões válidas — inteiro ≥ 1', () => {
    for (const a of listarArquetipos()) expect(Number.isInteger(a.versao) && a.versao >= 1).toBe(true)
    for (const versao of [0, 1.5, '1', -1]) expect(codigos({ ...rascunho(), versao })).toContain('VERSAO_INVALIDA')
  })

  it('4. story e feed presentes — e o validador recusa formato ausente ou estranho', () => {
    for (const a of listarArquetipos()) expect(Object.keys(a.formatos).sort()).toEqual(['feed', 'story'])
    const semFeed = rascunho()
    delete semFeed.formatos.feed
    expect(codigos(semFeed)).toContain('FORMATO_AUSENTE')
    const comQuadrado = rascunho()
    comQuadrado.formatos.quadrado = comQuadrado.formatos.feed
    expect(codigos(comQuadrado)).toContain('FORMATO_DESCONHECIDO')
  })

  it('5. coordenadas normalizadas (0..1), tamanhos > 0, zonas não invertidas', () => {
    for (const a of listarArquetipos()) {
      for (const f of FORMATOS_DO_ARQUETIPO) {
        for (const [, { referencia: c, zona: z }] of posicoes(a, f)) {
          expect(c.w > 0 && c.h > 0 && c.x >= 0 && c.y >= 0 && c.x + c.w <= 1 && fundo(c) <= 1).toBe(true)
          expect(z.xMin >= 0 && z.xMin < z.xMax && z.xMax <= 1 && z.yMin >= 0 && z.yMin < z.yMax && z.yMax <= 1).toBe(true)
        }
      }
    }
    const fora = rascunho()
    fora.formatos.story.papeis.headline.referencia.x = 1.2
    expect(codigos(fora)).toContain('COORDENADA_FORA')
    const emPixel = rascunho()
    emPixel.formatos.feed.papeis.headline.zona.yMax = 513
    expect(codigos(emPixel)).toContain('COORDENADA_FORA')
    const semAltura = rascunho()
    semAltura.formatos.story.papeis.apoio.referencia.h = 0
    expect(codigos(semAltura)).toContain('TAMANHO_INVALIDO')
    const invertida = rascunho()
    Object.assign(invertida.formatos.story.papeis.servico.zona, { yMin: 0.883, yMax: 0.72 })
    expect(codigos(invertida)).toContain('ZONA_INVERTIDA')
  })

  it('6. toda referência cabe na zona — e o validador recusa a que sai', () => {
    for (const a of listarArquetipos()) {
      for (const f of FORMATOS_DO_ARQUETIPO) {
        for (const [, { referencia: c, zona: z }] of posicoes(a, f)) {
          expect(c.x >= z.xMin && c.x + c.w <= z.xMax + 1e-9 && c.y >= z.yMin && fundo(c) <= z.yMax + 1e-9).toBe(true)
        }
      }
    }
    const fora = rascunho()
    fora.formatos.story.papeis.headline.referencia.y = 0.5
    expect(codigos(fora)).toEqual(['REFERENCIA_FORA_DA_ZONA'])
  })

  it('7. área segura respeitada — lida do contrato global (NUMEROS_PADRAO), não copiada', () => {
    expect(validarCatalogo(listarArquetipos())).toEqual([])
    for (const f of FORMATOS_DO_ARQUETIPO) {
      const g = NUMEROS_PADRAO.geometria[f]
      expect(areaSeguraPadrao(f)).toEqual({ largura: DIMENSOES[f].width, altura: DIMENSOES[f].height, margemH: g.margemH, safeTopo: g.safeTopo, safeRodape: g.safeRodape })
    }
    // Conferência independente, em pixels, com meio pixel de arredondamento.
    for (const a of listarArquetipos()) {
      for (const f of FORMATOS_DO_ARQUETIPO) {
        const s = areaSeguraPadrao(f)
        const dentro = (c: Caixa) => {
          expect(c.x * s.largura).toBeGreaterThanOrEqual(s.margemH - 0.5)
          expect((c.x + c.w) * s.largura).toBeLessThanOrEqual(s.largura - s.margemH + 0.5)
          expect(c.y * s.altura).toBeGreaterThanOrEqual(s.safeTopo - 0.5)
          expect(fundo(c) * s.altura).toBeLessThanOrEqual(s.altura - s.safeRodape + 0.5)
        }
        // Hoje toda referência e todo elemento já pousam dentro do piso...
        posicoes(a, f).forEach(([, p]) => dentro(p.referencia))
        Object.values(a.formatos[f].elementos ?? {}).forEach(dentro)
        // ...e a zona, recortada pelo piso, sempre comporta a caixa: é o que a materialização vai usar.
        for (const [, { referencia: c, zona: z }] of posicoes(a, f)) {
          const largura = Math.min(z.xMax * s.largura, s.largura - s.margemH) - Math.max(z.xMin * s.largura, s.margemH)
          const altura = Math.min(z.yMax * s.altura, s.altura - s.safeRodape) - Math.max(z.yMin * s.altura, s.safeTopo)
          expect(largura).toBeGreaterThanOrEqual(c.w * s.largura - 0.5)
          expect(altura).toBeGreaterThanOrEqual(c.h * s.altura - 0.5)
        }
      }
    }
    // Uma zona que só existe acima do piso do topo é estruturalmente impossível.
    const invade = rascunho()
    Object.assign(invade.formatos.story.papeis.pre, { zona: { xMin: 0.085, xMax: 0.65, yMin: 0, yMax: 0.09 }, referencia: { x: 0.085, y: 0.03, w: 0.5, h: 0.03 } })
    expect(codigos(invade)).toEqual(['FORA_DA_AREA_SEGURA'])
    const elementoFora = rascunho()
    elementoFora.formatos.feed.elementos.fio.y = 0.95
    expect(codigos(elementoFora)).toEqual(['FORA_DA_AREA_SEGURA'])
    // O piso é global: estreitá-lo não invalida a v1 enquanto o recorte couber.
    const story = areaSeguraPadrao('story')
    expect(validarArquetipo(ver(TOPO), { areaSegura: { story: { ...story, safeTopo: story.safeTopo + 20 } } })).toEqual([])
    const impossivel = validarArquetipo(ver(TOPO), { areaSegura: { story: { largura: 1080, altura: 1920, margemH: 92, safeTopo: 1000, safeRodape: 1000 } } })
    expect(impossivel.map((p) => p.codigo)).toEqual(['AREA_SEGURA_IMPOSSIVEL'])
  })

  it('8. headline obrigatória em todo modelo', () => {
    for (const a of listarArquetipos()) expect(a.papeis.find((p) => p.papel === 'headline')?.obrigatorio).toBe(true)
    const sem = rascunho()
    sem.papeis = sem.papeis.filter((p: { papel: string }) => p.papel !== 'headline')
    expect(codigos(sem)).toContain('SEM_HEADLINE')
    const opcional = rascunho()
    opcional.papeis.find((p: { papel: string }) => p.papel === 'headline').obrigatorio = false
    expect(codigos(opcional)).toContain('SEM_HEADLINE')
  })

  it('papéis: duplicado, fora do contrato e sem posição são recusados', () => {
    const duplicado = rascunho()
    duplicado.papeis.push({ papel: 'servico', obrigatorio: true, ordemDeLeitura: 9 })
    expect(codigos(duplicado)).toContain('PAPEL_DUPLICADO')
    const estranho = rascunho()
    // O cta entrou no contrato no #15 (coluna do rodapé); a segunda voz continua fora (ela é a manchete).
    estranho.papeis.push({ papel: 'headline2', obrigatorio: false, ordemDeLeitura: 9 })
    expect(codigos(estranho)).toContain('PAPEL_FORA_DO_CONTRATO')
    const posicaoSobrando = rascunho(BASE)
    posicaoSobrando.formatos.story.papeis.pre = { referencia: { x: 0.085, y: 0.6, w: 0.3, h: 0.03 }, zona: { xMin: 0.085, xMax: 0.5, yMin: 0.55, yMax: 0.65 } }
    expect(codigos(posicaoSobrando)).toContain('PAPEL_FORA_DO_CONTRATO')
    const semPosicao = rascunho()
    delete semPosicao.formatos.feed.papeis.servico
    expect(codigos(semPosicao)).toContain('POSICAO_AUSENTE')
    const textoAutomatico = rascunho()
    textoAutomatico.formatos.story.papeis.headline = { automatica: 'canto-mais-calmo' }
    expect(codigos(textoAutomatico)).toContain('CAMPO_INVALIDO')
    // Entrada malformada vira problema, nunca exceção.
    const posicaoTexto = rascunho()
    posicaoTexto.formatos.story.papeis.headline = 'topo'
    expect(codigos(posicaoTexto)).toContain('COORDENADA_FORA')
    const papeisObjeto = rascunho()
    papeisObjeto.papeis = { headline: true }
    expect(codigos(papeisObjeto)).toContain('SEM_HEADLINE')
    expect(codigos(null).length).toBeGreaterThan(0)
    // Contêiner de outro tipo é recusado, nunca lido como vazio.
    const elementosObjeto = rascunho(TOPO)
    elementosObjeto.elementos = { svgData: '<svg/>' }
    delete elementosObjeto.formatos.story.elementos
    delete elementosObjeto.formatos.feed.elementos
    expect(codigos(elementosObjeto)).toEqual(['CAMPO_INVALIDO'])
    const elementosDoFormatoTexto = rascunho(TOPO)
    elementosDoFormatoTexto.elementos = []
    elementosDoFormatoTexto.formatos.story.elementos = '<svg/>'
    delete elementosDoFormatoTexto.formatos.feed.elementos
    expect(codigos(elementosDoFormatoTexto)).toEqual(['CAMPO_INVALIDO'])
    const papeisDoFormatoLista = rascunho(TOPO)
    papeisDoFormatoLista.formatos.feed.papeis = []
    expect(codigos(papeisDoFormatoLista)).toContain('CAMPO_INVALIDO')
    const limitesTexto = rascunho(TOPO)
    limitesTexto.formatos.story.limitesDeTexto = 'duas linhas'
    expect(codigos(limitesTexto)).toContain('CAMPO_INVALIDO')
    const preferenciasLista = rascunho(TOPO)
    preferenciasLista.preferencias = ['topo']
    expect(codigos(preferenciasLista)).toContain('CAMPO_INVALIDO')
  })

  it('as preferências não são uma segunda fonte de posição: têm de concordar com a geometria', () => {
    const logoAutomaticaComCanto = rascunho(TOPO)
    logoAutomaticaComCanto.formatos.feed.papeis.logo = { automatica: 'canto-mais-calmo' }
    expect(codigos(logoAutomaticaComCanto)).toEqual(['PREFERENCIA_INCOERENTE'])
    const cantoFixoComLogoAutomatica = rascunho(CENTRO)
    cantoFixoComLogoAutomatica.preferencias.cantoDaMarca = 'inferior-direito'
    expect(codigos(cantoFixoComLogoAutomatica)).toEqual(['PREFERENCIA_INCOERENTE', 'PREFERENCIA_INCOERENTE'])
    const cantoErrado = rascunho(TOPO)
    cantoErrado.preferencias.cantoDaMarca = 'superior-esquerdo'
    expect(codigos(cantoErrado)).toEqual(['PREFERENCIA_INCOERENTE', 'PREFERENCIA_INCOERENTE'])
    const ancoraErrada = rascunho(TOPO)
    ancoraErrada.preferencias.ancora = 'rodape'
    expect(codigos(ancoraErrada)).toEqual(['PREFERENCIA_INCOERENTE', 'PREFERENCIA_INCOERENTE'])
    const alinhamentoErrado = rascunho(CENTRO)
    alinhamentoErrado.preferencias.alinha = 'esquerda'
    expect(codigos(alinhamentoErrado)).toEqual(['PREFERENCIA_INCOERENTE', 'PREFERENCIA_INCOERENTE'])
  })

  it('9. elementos: só tipos conhecidos, declarados e com posição — referência semântica, sem desenho', () => {
    for (const a of listarArquetipos()) {
      for (const e of a.elementos ?? []) {
        expect(Object.keys(e).every((k) => ['id', 'tipo', 'opcional', 'corPorPapel', 'presoA', 'canto', 'porItem', 'braco'].includes(k))).toBe(true)
        for (const f of FORMATOS_DO_ARQUETIPO) expect(Object.keys(a.formatos[f].elementos?.[e.id] ?? {}).sort()).toEqual(['h', 'w', 'x', 'y'])
      }
    }
    const desconhecido = rascunho()
    desconhecido.elementos[0].tipo = 'estrela-8'
    expect(codigos(desconhecido)).toContain('ELEMENTO_DESCONHECIDO')
    const naoDeclarado = rascunho()
    naoDeclarado.formatos.story.elementos.spark = { x: 0.5, y: 0.5, w: 0.04, h: 0.02 }
    expect(codigos(naoDeclarado)).toContain('ELEMENTO_DESCONHECIDO')
    const semPosicao = rascunho()
    delete semPosicao.formatos.feed.elementos.fio
    expect(codigos(semPosicao)).toContain('POSICAO_AUSENTE')
    const comCor = rascunho()
    comCor.elementos[0].corPorPapel = 'dourado'
    expect(codigos(comCor)).toContain('CAMPO_INVALIDO')
    const lSemCanto = rascunho(BASE)
    delete lSemCanto.elementos[0].canto
    expect(codigos(lSemCanto)).toEqual(['CAMPO_INVALIDO'])
    const fioComCanto = rascunho(TOPO)
    fioComCanto.elementos[0].canto = 'superior-esquerdo'
    expect(codigos(fioComCanto)).toEqual(['CAMPO_INVALIDO'])
  })

  it('10. nada de fonte, cor literal ou cliente no catálogo — e o validador recusa', () => {
    const texto = JSON.stringify(listarArquetipos())
    expect(texto).not.toMatch(/font|fontFamily|fontWeight|projectId|projetoId|clienteId|userId|"fill"|"color"/i)
    expect(texto).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
    const comFonte = rascunho()
    comFonte.formatos.story.papeis.headline.fontFamily = 'Didot'
    expect(codigos(comFonte)).toContain('CAMPO_PROIBIDO')
    const comHex = rascunho()
    comHex.fotoIdeal.descricao = 'fundo #0B0B0B'
    expect(codigos(comHex)).toContain('CAMPO_PROIBIDO')
    const comCliente = rascunho()
    comCliente.projectId = 42
    expect(codigos(comCliente)).toEqual(['CAMPO_PROIBIDO'])
    // O contrato é fechado: o mesmo desvio com outro nome é recusado, não ignorado.
    const comPeso = rascunho()
    comPeso.formatos.story.papeis.headline.peso = 700
    expect(codigos(comPeso)).toEqual(['CAMPO_DESCONHECIDO'])
    const comDesenho = rascunho()
    comDesenho.elementos[0].svgData = '<svg></svg>'
    expect(codigos(comDesenho)).toEqual(['CAMPO_DESCONHECIDO'])
    const comTema = rascunho()
    comTema.tema = 'escuro'
    expect(codigos(comTema)).toEqual(['CAMPO_DESCONHECIDO'])
    const caixaComExtra = rascunho()
    caixaComExtra.formatos.feed.papeis.apoio.zona.margem = 12
    expect(codigos(caixaComExtra)).toEqual(['CAMPO_DESCONHECIDO'])
  })

  it('código taxonômico: MIN-XX é o agrupamento conceitual, não a família macro (que o T0 não modela)', () => {
    const codigos_ = Object.fromEntries(listarArquetipos().map((a) => [a.id, a.codigoTaxonomico]))
    expect(codigos_).toEqual({ [TOPO]: 'MIN-01', [BASE]: 'MIN-01', [CENTRO]: 'MIN-02', [GIGANTE]: 'MIN-10', [LISTA]: 'MIN-09', [CONVITE]: 'MIN-09', [DIVISAO]: 'MIN-04', [BASE_CENTRO]: 'MIN-01', [TOPO_CENTRO]: 'MIN-01', [ARCO]: 'MIN-04', [COLUNA]: 'MIN-05', [COLUNA_E]: 'MIN-05' })
    // Enquanto a família macro A–E não fizer parte do contrato, nenhuma definição publicada tem a chave `familia`.
    const temChave = (valor: unknown, chave: string): boolean =>
      !!valor && typeof valor === 'object' && Object.entries(valor).some(([k, v]) => k === chave || temChave(v, chave))
    for (const a of listarArquetipos()) expect(temChave(a, 'familia'), chaveDoArquetipo(a)).toBe(false)
    // E o validador recusa: a chave antiga é desconhecida, e o código fora da taxonomia é inválido.
    const comFamilia = rascunho()
    comFamilia.familia = 'A'
    expect(codigos(comFamilia)).toEqual(['CAMPO_DESCONHECIDO'])
    const familiaNoLugar = rascunho()
    familiaNoLugar.familia = familiaNoLugar.codigoTaxonomico
    delete familiaNoLugar.codigoTaxonomico
    expect(codigos(familiaNoLugar).sort()).toEqual(['CAMPO_DESCONHECIDO', 'CAMPO_INVALIDO'])
    const foraDaTaxonomia = rascunho()
    foraDaTaxonomia.codigoTaxonomico = 'A'
    expect(codigos(foraDaTaxonomia)).toEqual(['CAMPO_INVALIDO'])
  })

  it('limites de texto: linhas máximas (HARD) em todo papel de texto; caracteres só como estimativa', () => {
    for (const a of listarArquetipos()) {
      for (const f of FORMATOS_DO_ARQUETIPO) {
        for (const p of a.papeis.filter((x) => x.papel !== 'logo')) {
          const limite = a.formatos[f].limitesDeTexto?.[p.papel as 'headline']
          expect(Number.isInteger(limite?.linhasMax) && limite.linhasMax >= 1).toBe(true)
          expect(Object.keys(limite).every((k) => k === 'linhasMax' || k === 'caracteresPorLinha')).toBe(true)
        }
      }
    }
    const zeroLinhas = rascunho()
    zeroLinhas.formatos.story.limitesDeTexto.headline.linhasMax = 0
    expect(codigos(zeroLinhas)).toContain('CAMPO_INVALIDO')
    // O limite estrutural é obrigatório para todo papel de texto, em cada formato.
    const semLimite = rascunho()
    delete semLimite.formatos.feed.limitesDeTexto.headline
    expect(codigos(semLimite)).toEqual(['CAMPO_INVALIDO'])
    const semLimites = rascunho(CENTRO)
    delete semLimites.formatos.story.limitesDeTexto
    expect(codigos(semLimites)).toEqual(['CAMPO_INVALIDO', 'CAMPO_INVALIDO', 'CAMPO_INVALIDO', 'CAMPO_INVALIDO'])
    const daLogo = rascunho()
    daLogo.formatos.story.limitesDeTexto.logo = { linhasMax: 1 }
    expect(codigos(daLogo)).toContain('PAPEL_FORA_DO_CONTRATO')
  })

  it('11. id+versão reproduz a mesma definição; versão omitida = a mais recente, explícita na cópia', () => {
    for (const a of listarArquetipos()) {
      const chave = chaveDoArquetipo(a)
      const exata = verArquetipo(a.id, a.versao)
      expect(exata).toEqual(verArquetipo(a.id, a.versao))
      expect(exata).toEqual(a)
      expect(impressaoDoArquetipo(exata), `${chave} mudou: versão publicada é imutável — publique ${a.id}@${a.versao + 1} ao lado, não edite a ${a.versao}`).toBe(IMPRESSOES_PUBLICADAS[chave])
      const ultima = verArquetipo(a.id)
      expect(ultima).toEqual(verArquetipo(a.id, ultima.versao))
    }
    // Toda versão publicada continua no catálogo (nunca remova uma linha de IMPRESSOES_PUBLICADAS)...
    for (const chave of Object.keys(IMPRESSOES_PUBLICADAS)) {
      const [id, versao] = chave.split('@')
      expect(verArquetipo(id, Number(versao)), `${chave} sumiu do catálogo: uma peça gravada com ela não reproduz`).not.toBeNull()
    }
    // ...e toda versão do catálogo tem a impressão cadastrada.
    expect(Object.keys(IMPRESSOES_PUBLICADAS).sort()).toEqual(listarArquetipos().map(chaveDoArquetipo).sort())
    expect(verArquetipo(TOPO, 999)).toBeNull()
    expect(verArquetipo(TOPO, 0)).toBeNull()
    expect(verArquetipo('minimal-inexistente')).toBeNull()
  })

  it('resolução de versão: exata com versão, a maior sem — com várias versões fora de ordem', () => {
    const lista = [
      { id: 'x', versao: 1 },
      { id: 'x', versao: 3 },
      { id: 'y', versao: 7 },
      { id: 'x', versao: 2 },
    ]
    expect(resolverArquetipo(lista, 'x')).toBe(lista[1])
    expect(resolverArquetipo(lista, 'x', 2)).toBe(lista[3])
    expect(resolverArquetipo(lista, 'x', 1)).toBe(lista[0])
    expect(resolverArquetipo(lista, 'x', 4)).toBeNull()
    expect(resolverArquetipo(lista, 'z')).toBeNull()
  })

  it('impressão: determinística, independe da ordem das chaves, muda com a estrutura', () => {
    const a = ver(CENTRO)
    const reordenado = JSON.parse(jsonCanonico(a)) as ArquetipoDeLayout
    const invertido = Object.fromEntries(Object.entries(a).reverse()) as unknown as ArquetipoDeLayout
    expect(impressaoDoArquetipo(reordenado)).toBe(impressaoDoArquetipo(a))
    expect(impressaoDoArquetipo(invertido)).toBe(impressaoDoArquetipo(a))
    const movido = rascunho(CENTRO)
    movido.formatos.feed.papeis.headline.referencia.y = 0.43
    expect(impressaoDoArquetipo(movido)).not.toBe(impressaoDoArquetipo(a))
    const outraZona = rascunho(CENTRO)
    outraZona.formatos.story.papeis.apoio.zona.yMax = 0.69
    expect(impressaoDoArquetipo(outraZona)).not.toBe(impressaoDoArquetipo(a))
    // undefined segue o JSON: some do objeto, vira null no array — a fonte e a cópia têm a mesma impressão.
    expect(jsonCanonico([undefined])).toBe('[null]')
    expect(jsonCanonico({ a: 1, b: undefined })).toBe('{"a":1}')
    const comBuraco = { ...a, fotoIdeal: { ...a.fotoIdeal, referencias: ['S1', undefined] } } as unknown as ArquetipoDeLayout
    expect(impressaoDoArquetipo(comBuraco)).toBe(impressaoDoArquetipo(JSON.parse(JSON.stringify(comBuraco))))
  })

  it('12. a definição não se muda por acidente: readonly no tipo, cópia em tempo de execução', () => {
    const a = ver(TOPO)
    // @ts-expect-error: o contrato é readonly — atribuir é erro de compilação
    a.versao = 99
    expect(impressaoDoArquetipo(verArquetipo(TOPO, 1))).toBe(IMPRESSOES_PUBLICADAS[`${TOPO}@1`])
  })

  it('13. alterar a cópia devolvida não altera a fonte', () => {
    const antes = impressaoDoArquetipo(ver(BASE))
    const copia = rascunho(BASE)
    copia.formatos.story.papeis.headline.referencia.y = 0.1
    copia.formatos.feed.elementos.moldura.h = 0.9
    copia.papeis.length = 0
    const lista = listarArquetipos() as any[]
    const totalAntes = lista.length
    lista[0].formatos.story.papeis.headline.referencia.y = 0.9
    lista.length = 0
    expect(impressaoDoArquetipo(ver(BASE))).toBe(antes)
    expect(listarArquetipos()).toHaveLength(totalAntes)
    expect(listarArquetipos().map(impressaoDoArquetipo).sort()).toEqual(Object.values(IMPRESSOES_PUBLICADAS).sort())
    expect(ver(BASE)).not.toBe(ver(BASE))
    expect(listarArquetipos()[0]).not.toBe(listarArquetipos()[0])
  })

  it('14. story e feed: mesma identidade, sem ser escala um do outro', () => {
    for (const a of listarArquetipos()) {
      const story = new Map(posicoes(a, 'story'))
      const feed = new Map(posicoes(a, 'feed'))
      // Mesma identidade: os mesmos papéis, na mesma ordem vertical, com o mesmo alinhamento.
      expect([...feed.keys()].sort()).toEqual([...story.keys()].sort())
      expect(Object.keys(a.formatos.feed.papeis).sort()).toEqual(Object.keys(a.formatos.story.papeis).sort())
      const ordem = (m: Map<string, { referencia: Caixa }>) => [...m.entries()].sort((x, y) => x[1].referencia.y - y[1].referencia.y).map(([p]) => p)
      expect(ordem(feed)).toEqual(ordem(story))
      for (const [papel, s] of story) {
        const f = feed.get(papel)
        if (a.preferencias.alinha === 'centro') expect(f.referencia.x + f.referencia.w / 2).toBeCloseTo(s.referencia.x + s.referencia.w / 2, 6)
        else expect(f.referencia.x).toBe(s.referencia.x)
      }
      // Não é escala: em frações, uma escala automática daria as mesmas caixas.
      const iguais = [...story].every(([papel, s]) => JSON.stringify(s) === JSON.stringify(feed.get(papel)))
      expect(iguais).toBe(false)
    }
  })

  it('caixas de texto não se atropelam, e os elementos não invadem o texto', () => {
    for (const a of listarArquetipos()) {
      for (const f of FORMATOS_DO_ARQUETIPO) {
        const caixas = posicoes(a, f).map(([papel, p]) => [papel, p.referencia] as const)
        for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) expect(sobrepoe(caixas[i][1], caixas[j][1]), `${a.id} ${f} ${caixas[i][0]}×${caixas[j][0]}`).toBe(false)
        // O elemento preso à PEÇA (as cantoneiras, #16) conta pelo que OCUPA — os braços —, a mesma função do compor.
        for (const [id, c] of Object.entries(a.formatos[f].elementos ?? {})) {
          const e = a.elementos!.find((x) => x.id === id)!
          // O desenho que a peça desenharia (#16@2: o path derivado do formato; os demais, o do asset).
          const receita = receitasDoArquetipo(a, { formato: f, canvas: DIMENSOES[f] }).receitas.find((r) => r.elemento === id)!
          const ocupa = ocupacaoDoAcento(receita, { x: c.x, y: c.y, width: c.w, height: c.h }, 0).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }))
          if (!e.presoA) expect(ocupa, `${a.id} ${f} ${id}: os quatro braços`).toHaveLength(4)
          for (const [papel, t] of caixas) {
            // #5: o ENVOLVENTE abraça o papel dele (a caixa contém a referência); os outros textos ele não toca.
            if (ELEMENTOS_QUE_ENVOLVEM.includes(e.tipo) && e.presoA === papel) {
              expect(c.x < t.x && c.y < t.y && c.x + c.w > t.x + t.w && c.y + c.h > t.y + t.h, `${a.id} ${f} ${id} envolve ${papel}`).toBe(true)
              continue
            }
            expect(ocupa.some((o) => sobrepoe(o, t)), `${a.id} ${f} ${id}×${papel}`).toBe(false)
          }
        }
      }
    }
  })

  it('a zona preserva a identidade: a headline fica na faixa da âncora e nenhuma zona de texto passa de 30% da altura', () => {
    for (const a of listarArquetipos()) {
      for (const f of FORMATOS_DO_ARQUETIPO) {
        const { zona } = a.formatos[f].papeis.headline as { zona: Zona }
        if (a.preferencias.ancora === 'topo') expect(zona.yMax).toBeLessThanOrEqual(0.4)
        if (a.preferencias.ancora === 'rodape') expect(zona.yMin).toBeGreaterThanOrEqual(0.5)
        if (a.preferencias.ancora === 'meio') expect(zona.yMin >= 1 / 3 && zona.yMax <= 2 / 3).toBe(true)
        for (const [, p] of posicoes(a, f)) expect(p.zona.yMax - p.zona.yMin).toBeLessThanOrEqual(0.3)
      }
    }
  })

  it('as faixas da headline dos três modelos não se sobrepõem: a zona sozinha já distingue o modelo', () => {
    for (const f of FORMATOS_DO_ARQUETIPO) {
      // Só os três que o teste nomeia: o título gigante (T4-A) divide a faixa do topo-esquerda e se distingue pela
      // escala dominante (ver 'T4-A · título gigante').
      const faixas = listarArquetipos()
        .filter((a) => [TOPO, BASE, CENTRO].includes(a.id))
        .map((a) => (a.formatos[f].papeis.headline as { zona: Zona }).zona)
        .sort((x, y) => x.yMin - y.yMin)
      for (let i = 1; i < faixas.length; i++) expect(faixas[i].yMin, f).toBeGreaterThan(faixas[i - 1].yMax)
    }
  })
})

describe('T0 · os três modelos', () => {
  it('topo-esquerda (MIN-01): headline no terço superior, à esquerda; serviço e logo na faixa de baixo', () => {
    const a = ver(TOPO)
    expect(a.codigoTaxonomico).toBe('MIN-01')
    expect(a.preferencias).toEqual({ ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'inferior-direito' })
    expect(a.papeis.filter((p) => !p.obrigatorio).map((p) => p.papel).sort()).toEqual(['apoio', 'pre'])
    expect(a.elementos).toEqual([{ id: 'fio', tipo: 'fio-fino', opcional: true, corPorPapel: 'texto', presoA: 'headline' }])
    for (const f of FORMATOS_DO_ARQUETIPO) {
      const p = a.formatos[f].papeis as Record<string, { referencia: Caixa; zona: Zona }>
      expect(fundo(p.headline.referencia)).toBeLessThanOrEqual(1 / 3)
      expect(p.headline.zona.yMax).toBeLessThanOrEqual(1 / 3)
      expect(p.headline.referencia.x).toBe(0.085)
      expect(p.headline.zona.xMin).toBe(0.085)
      expect(p.headline.zona.xMax).toBeLessThan(0.9)
      for (const papel of ['servico', 'logo']) {
        expect(p[papel].referencia.y).toBeGreaterThanOrEqual(2 / 3)
        expect(p[papel].zona.yMin).toBeGreaterThanOrEqual(0.7)
      }
      // O fio fica no respiro entre headline e apoio.
      const fio = a.formatos[f].elementos.fio
      expect(fio.y).toBeGreaterThanOrEqual(fundo(p.headline.referencia))
      expect(fundo(fio)).toBeLessThanOrEqual(p.apoio.referencia.y)
    }
  })

  it('base-esquerda (MIN-01 + L): headline na base, logo no topo, L só declarado e 3–4 unidades acima da headline', () => {
    const a = ver(BASE)
    expect(a.preferencias).toEqual({ ancora: 'rodape', alinha: 'esquerda', cantoDaMarca: 'superior-direito' })
    expect(a.elementos).toEqual([{ id: 'moldura', tipo: 'moldura-aberta', opcional: false, corPorPapel: 'texto', presoA: 'headline', canto: 'superior-esquerdo' }])
    for (const f of FORMATOS_DO_ARQUETIPO) {
      const p = a.formatos[f].papeis as Record<string, { referencia: Caixa; zona: Zona }>
      expect(p.headline.referencia.y).toBeGreaterThanOrEqual(0.6)
      expect(p.headline.zona.yMin).toBeGreaterThanOrEqual(0.5)
      expect(fundo(p.logo.referencia)).toBeLessThanOrEqual(0.2)
      expect(p.logo.zona.yMax).toBeLessThanOrEqual(0.2)
      const l = a.formatos[f].elementos.moldura
      expect(l.x).toBe(p.headline.referencia.x)
      const folga = p.headline.referencia.y - fundo(l)
      expect(folga).toBeGreaterThanOrEqual(0.03 - 1e-9)
      expect(folga).toBeLessThanOrEqual(0.04 + 1e-9)
      // A headline nunca sobe para dentro do L: a zona começa 3 unidades abaixo do fim dele.
      expect(p.headline.zona.yMin).toBeGreaterThanOrEqual(fundo(l) + 0.03 - 1e-9)
      // A logo não pousa no braço de cima: a zona dela começa mais de 24 px depois do fim do braço.
      expect((p.logo.zona.xMin - (l.x + l.w)) * 1080).toBeGreaterThan(24)
    }
  })

  it('centro-óptico (MIN-02): zona central, serviço embaixo, logo automática, spark só declarado', () => {
    const a = ver(CENTRO)
    expect(a.codigoTaxonomico).toBe('MIN-02')
    expect(a.preferencias).toEqual({ ancora: 'meio', alinha: 'centro', cantoDaMarca: 'auto' })
    expect(a.elementos).toEqual([{ id: 'spark', tipo: 'spark-4', opcional: true, corPorPapel: 'destaque', presoA: 'headline' }])
    for (const f of FORMATOS_DO_ARQUETIPO) {
      const p = a.formatos[f].papeis as Record<string, { referencia: Caixa; zona: Zona } & { automatica?: string }>
      expect(p.logo).toEqual({ automatica: 'canto-mais-calmo' })
      for (const papel of ['headline', 'apoio', 'servico']) {
        expect(p[papel].zona.xMin + p[papel].zona.xMax).toBeCloseTo(1, 9)
        expect(p[papel].referencia.x * 2 + p[papel].referencia.w).toBeCloseTo(1, 9)
      }
      expect(p.headline.zona.yMin).toBeGreaterThanOrEqual(1 / 3)
      expect(p.headline.zona.yMax).toBeLessThanOrEqual(2 / 3)
      expect(p.servico.referencia.y).toBeGreaterThanOrEqual(0.8)
      const spark = a.formatos[f].elementos.spark
      expect(spark.x * 2 + spark.w).toBeCloseTo(1, 9)
      expect(fundo(spark)).toBeLessThanOrEqual(p.headline.referencia.y)
    }
  })
})

describe('T4-A · título gigante (MIN-10)', () => {
  it('a escala dominante é a identidade: só a headline do título gigante a tem; os três do T0 continuam sem a chave', () => {
    const a = ver(GIGANTE)
    expect(a.codigoTaxonomico).toBe('MIN-10')
    expect(a.papeis).toEqual([
      { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0, escala: 'dominante' },
      { papel: 'apoio', obrigatorio: false, ordemDeLeitura: 1, alinha: 'direita' },
      { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
      { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
    ])
    expect(a.elementos).toBeUndefined()
    expect(a.preferencias).toEqual({ ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'inferior-direito' })
    expect(a.fotoIdeal?.referencias).toEqual(['S025', 'F014', 'F018'])
    for (const id of [TOPO, BASE, CENTRO]) for (const p of ver(id).papeis) expect(['escala' in p, 'alinha' in p], `${id} ${p.papel}`).toEqual([false, false])
    expect(validarArquetipo(a)).toEqual([])
  })

  it('a headline ocupa largura 80–100 e altura 22–38 da peça, sem sangrar a margem; apoio na coluna da direita; serviço 84–88', () => {
    const a = ver(GIGANTE)
    for (const f of FORMATOS_DO_ARQUETIPO) {
      const p = a.formatos[f].papeis as Record<string, { referencia: Caixa; zona: Zona }>
      const area = areaSeguraPadrao(f)
      expect(p.headline.referencia.w).toBeGreaterThanOrEqual(0.8)
      expect(p.headline.referencia.x * area.largura).toBeGreaterThanOrEqual(area.margemH - 0.5)
      expect((p.headline.referencia.x + p.headline.referencia.w) * area.largura).toBeLessThanOrEqual(area.largura - area.margemH + 0.5)
      expect(p.headline.referencia.h).toBeGreaterThanOrEqual(0.22)
      expect(p.headline.referencia.h).toBeLessThanOrEqual(0.38)
      expect(p.apoio.referencia.x).toBeGreaterThanOrEqual(0.5)
      expect(p.apoio.referencia.y).toBeGreaterThanOrEqual(0.66)
      expect(fundo(p.apoio.referencia)).toBeLessThanOrEqual(0.8)
      expect(p.servico.referencia.y).toBeGreaterThanOrEqual(0.84)
    }
    // Story e feed são definições próprias (o teste genérico confere que diferem).
    expect(JSON.stringify(a.formatos.story)).not.toBe(JSON.stringify(a.formatos.feed))
  })

  it('sem a escala, o título gigante seria o topo-esquerda com outra caixa: a escala é o que o distingue, não a faixa', () => {
    const g = ver(GIGANTE).formatos.story.papeis.headline as { zona: Zona }
    const t = ver(TOPO).formatos.story.papeis.headline as { zona: Zona }
    expect(g.zona.yMin < t.zona.yMax && t.zona.yMin < g.zona.yMax).toBe(true)
    expect(ver(GIGANTE).preferencias).toEqual(ver(TOPO).preferencias)
  })

  it('o validador recusa a escala fora da headline e valor fora do vocabulário (CAMPO_INVALIDO), e a chave a mais segue fechada', () => {
    const noApoio = rascunho(GIGANTE)
    noApoio.papeis[1].escala = 'dominante'
    expect(codigos(noApoio)).toEqual(['CAMPO_INVALIDO'])
    const valor = rascunho(GIGANTE)
    valor.papeis[0].escala = 'enorme'
    expect(codigos(valor)).toEqual(['CAMPO_INVALIDO'])
    const corpo = rascunho(GIGANTE)
    corpo.papeis[0].fontSize = 400
    expect(codigos(corpo)).toEqual(['CAMPO_PROIBIDO'])
    const outra = rascunho(GIGANTE)
    outra.papeis[0].tamanho = 'gigante'
    expect(codigos(outra)).toEqual(['CAMPO_DESCONHECIDO'])
  })

  it('alinhamento próprio (rodada 1): só em papel de texto que não é a headline; a referência tem de encostar na borda da zona', () => {
    const naHeadline = rascunho(GIGANTE)
    naHeadline.papeis[0].alinha = 'direita'
    expect(codigos(naHeadline)).toEqual(['CAMPO_INVALIDO'])
    const naLogo = rascunho(GIGANTE)
    naLogo.papeis[3].alinha = 'direita'
    expect(codigos(naLogo)).toEqual(['CAMPO_INVALIDO'])
    const valor = rascunho(GIGANTE)
    valor.papeis[1].alinha = 'justificado'
    expect(codigos(valor)).toEqual(['CAMPO_INVALIDO'])
    // À direita com a referência longe da borda direita da zona: duas fontes de posição, recusado nos dois formatos.
    const solto = rascunho(GIGANTE)
    for (const f of FORMATOS_DO_ARQUETIPO) solto.formatos[f].papeis.apoio.referencia.x = 0.5
    expect(codigos(solto)).toEqual(['PREFERENCIA_INCOERENTE', 'PREFERENCIA_INCOERENTE'])
    // À esquerda exigiria a referência na borda esquerda da zona (.50): o .55 de hoje é incoerente com ela.
    const esquerda = rascunho(GIGANTE)
    esquerda.papeis[1].alinha = 'esquerda'
    expect(codigos(esquerda)).toEqual(['PREFERENCIA_INCOERENTE', 'PREFERENCIA_INCOERENTE'])
  })
})
