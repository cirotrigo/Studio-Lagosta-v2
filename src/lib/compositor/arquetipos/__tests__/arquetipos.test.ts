/**
 * T0 — o catálogo imutável de arquétipos minimalistas (14/10/2026). Contrato,
 * catálogo e validador; nada aqui toca o compositor, a Page ou o banco.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { DIMENSOES } from '../../spec'
import { listarArquetipos, resolverArquetipo, verArquetipo } from '../catalogo'
import { impressaoDoArquetipo, jsonCanonico } from '../impressao'
import { chaveDoArquetipo, FORMATOS_DO_ARQUETIPO, type ArquetipoDeLayout, type Caixa, type PosicaoDoPapel, type Zona } from '../tipos'
import { areaSeguraPadrao, validarArquetipo, validarCatalogo } from '../validar'

const TOPO = 'minimal-fb-topo-esquerda'
const BASE = 'minimal-fb-base-esquerda'
const CENTRO = 'minimal-fb-centro-optico'

/** A impressão de cada versão publicada. Mudou? Publique `id@versao+1`, não edite a antiga. */
const IMPRESSOES_PUBLICADAS: Record<string, string> = {
  'minimal-fb-base-esquerda@1': 'arq1-129c5462055140',
  'minimal-fb-centro-optico@1': 'arq1-199f18e363fe7a',
  'minimal-fb-topo-esquerda@1': 'arq1-0fae76f0968633',
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
  it('1. o catálogo tem exatamente os 3 modelos', () => {
    // Conta MODELOS (ids), não versões: publicar uma v2 ao lado não muda isto.
    expect([...new Set(listarArquetipos().map((a) => a.id))].sort()).toEqual([BASE, CENTRO, TOPO])
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
    estranho.papeis.push({ papel: 'cta', obrigatorio: false, ordemDeLeitura: 9 })
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
        expect(Object.keys(e).every((k) => ['id', 'tipo', 'opcional', 'corPorPapel', 'presoA', 'canto'].includes(k))).toBe(true)
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
        for (const [id, c] of Object.entries(a.formatos[f].elementos ?? {})) for (const [papel, t] of caixas) expect(sobrepoe(c, t), `${a.id} ${f} ${id}×${papel}`).toBe(false)
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
      const faixas = listarArquetipos()
        .map((a) => (a.formatos[f].papeis.headline as { zona: Zona }).zona)
        .sort((x, y) => x.yMin - y.yMin)
      for (let i = 1; i < faixas.length; i++) expect(faixas[i].yMin, f).toBeGreaterThan(faixas[i - 1].yMax)
    }
  })
})

describe('T0 · os três modelos', () => {
  it('topo-esquerda (MIN-01): headline no terço superior, à esquerda; serviço e logo na faixa de baixo', () => {
    const a = ver(TOPO)
    expect(a.familia).toBe('MIN-01')
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
    expect(a.familia).toBe('MIN-02')
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
