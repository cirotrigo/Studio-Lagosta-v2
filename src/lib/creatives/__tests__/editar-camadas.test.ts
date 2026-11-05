/**
 * O módulo puro de edição de camadas pelo MCP (T1, 05/11/2026): cada operação e cada recusa, sem banco.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import {
  aplicarOperacoesDeCamadas,
  aplicarPagina,
  camadaParaLeitura,
  erroDeCamadas,
  operacaoDeCamadaSchema,
  validarFormatoDasOperacoes,
  type OperacaoDeCamada,
} from '../editar-camadas'

const CANVAS = { width: 1080, height: 1920 }
const ctx = { canvas: CANVAS, apenasRascunho: false, novoId: () => 'nova-1' }

function pagina(): Layer[] {
  return [
    { id: 'bg', type: 'image', name: 'Fundo', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://blob.test/foto.jpg', style: { objectFit: 'cover' } },
    { id: 'grad', type: 'gradient', name: 'Sombreado', visible: true, locked: false, order: 1, position: { x: 0, y: 900 }, size: { width: 1080, height: 1020 }, style: { gradientType: 'linear', gradientAngle: 180, gradientStops: [{ id: '1', color: '#000000', position: 0, opacity: 0 }, { id: '2', color: '#000000', position: 1, opacity: 0.7 }] } },
    { id: 'headline', type: 'text', name: 'Título', visible: true, locked: false, order: 2, position: { x: 100, y: 1200 }, size: { width: 880, height: 160 }, content: 'ALMOÇO EXECUTIVO', style: { fontSize: 72, fontFamily: 'Montserrat', color: '#FFFFFF', textAlign: 'center', lineHeight: 1.1 }, textboxConfig: { autoWrap: { lineHeight: 1.1, breakMode: 'word', autoExpand: false } } },
    { id: 'apoio', type: 'text', name: 'Título', visible: true, locked: false, order: 3, position: { x: 100, y: 1400 }, size: { width: 880, height: 60 }, content: 'Seg a sex, 11h30 às 15h', style: { fontSize: 32 } },
    { id: 'logo', type: 'logo', name: 'Logo', visible: true, locked: false, order: 4, position: { x: 440, y: 1650 }, size: { width: 200, height: 200 }, fileUrl: 'https://blob.test/logo.png', style: { objectFit: 'contain' } },
    { id: 'forma', type: 'shape', name: 'Faixa', visible: true, locked: false, order: 5, position: { x: 0, y: 0 }, size: { width: 300, height: 40 }, style: { shapeType: 'rectangle', fill: '#FF0000' } },
  ]
}

const definir = (camada: string, campos: OperacaoDeCamada['campos']): OperacaoDeCamada => ({ op: 'definir', camada, campos })

describe('definir', () => {
  it('posição absoluta, tamanho, rotação e nome em qualquer camada (a logo inclusive)', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('logo', { position: { x: 60, y: 60 }, size: { width: 160 }, rotation: 15, name: 'Marca' })], ctx)
    expect(r.recusadas).toEqual([])
    const logo = r.camadas.find((l) => l.id === 'logo')!
    expect(logo).toMatchObject({ position: { x: 60, y: 60 }, size: { width: 160, height: 200 }, rotation: 15, name: 'Marca' })
    expect(r.aplicadas[0]).toMatchObject({ indice: 0, op: 'definir', camada: 'logo' })
    expect(r.tocadas).toEqual([])
  })

  it('texto: cor, fonte, alinhamento, entrelinha nos DOIS campos, efeitos e âncora', () => {
    const r = aplicarOperacoesDeCamadas(
      pagina(),
      [definir('headline', { style: { color: '#FFD700', fontFamily: 'Oswald', textAlign: 'left', lineHeight: 1.3 }, effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 8, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.6 } }, textboxConfig: { anchor: 'bottom', autoWrap: { autoExpand: true } } })],
      ctx,
    )
    expect(r.recusadas).toEqual([])
    const h = r.camadas.find((l) => l.id === 'headline')!
    expect(h.style).toMatchObject({ color: '#FFD700', fontFamily: 'Oswald', textAlign: 'left', lineHeight: 1.3, fontSize: 72 })
    expect(h.textboxConfig).toMatchObject({ anchor: 'bottom', autoWrap: { lineHeight: 1.3, breakMode: 'word', autoExpand: true } })
    expect(h.effects?.shadow?.shadowBlur).toBe(8)
    expect(r.tocadas).toEqual(['headline'])
  })

  it('a camada pode ser apontada pelo nome; nome repetido é CAMADA_AMBIGUA; nome inexistente é CAMADA_INEXISTENTE', () => {
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('Faixa', { style: { fill: '#00FF00' } })], ctx).camadas.find((l) => l.id === 'forma')!.style!.fill).toBe('#00FF00')
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('Título', { visible: false })], ctx).recusadas[0]).toMatchObject({ codigo: 'CAMADA_AMBIGUA', campos: ['camada'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('nao-existe', { visible: false })], ctx).recusadas[0]).toMatchObject({ codigo: 'CAMADA_INEXISTENTE', indice: 0 })
  })

  it('CAMPO_NAO_PERMITIDO: campo de texto numa imagem, campo de imagem num texto, e rich-text só geometria', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('bg', { content: 'x', style: { fontSize: 30, crop: { x: 0, y: 0, width: 1, height: 1 } } })], ctx)
    expect(r.recusadas[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['content', 'style.fontSize'] })
    const r2 = aplicarOperacoesDeCamadas(pagina(), [definir('headline', { fileUrl: 'https://x.test/a.png' })], ctx)
    expect(r2.recusadas[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['fileUrl'] })
    const rico = [...pagina(), { id: 'rico', type: 'rich-text', name: 'Rico', visible: true, locked: false, order: 6, position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, content: 'abc' } as Layer]
    expect(aplicarOperacoesDeCamadas(rico, [definir('rico', { content: 'novo' })], ctx).recusadas[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO' })
    expect(aplicarOperacoesDeCamadas(rico, [definir('rico', { position: { x: 10 } })], ctx).recusadas).toEqual([])
  })

  it('VALOR_FORA_DA_FAIXA: corpo, crop, opacidade, cor ilegível e URL que não é http(s) — antes de olhar a página', () => {
    const ops: OperacaoDeCamada[] = [
      definir('headline', { style: { fontSize: 7, color: 'azulzinho', opacity: 2 } }),
      definir('bg', { style: { crop: { x: 0, y: 0, width: 1.5, height: 1 } }, fileUrl: 'ftp://x' }),
    ]
    const formato = validarFormatoDasOperacoes(ops, { apenasRascunho: false })
    expect(formato.map((r) => [r.indice, r.codigo, r.campos?.[0]])).toEqual([
      [0, 'VALOR_FORA_DA_FAIXA', 'style.fontSize'],
      [0, 'VALOR_FORA_DA_FAIXA', 'style.color'],
      [0, 'VALOR_FORA_DA_FAIXA', 'style.opacity'],
      [1, 'VALOR_FORA_DA_FAIXA', 'style.crop.width'],
      [1, 'VALOR_FORA_DA_FAIXA', 'fileUrl'],
    ])
    const r = aplicarOperacoesDeCamadas(pagina(), ops, ctx)
    expect(r.recusadas).toHaveLength(5)
    expect(r.camadas).toEqual(pagina())
  })

  it('cores: rgba(), nome CSS e #RGB passam pelo lerCor; a parada do gradiente também', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('grad', { style: { gradientStops: [{ color: 'rgba(0,0,0,0.5)', position: 0, opacity: 0 }, { color: 'black', position: 1, opacity: 1 }] } }), definir('forma', { style: { fill: '#F00', strokeColor: 'tomato', strokeWidth: 4 } })], ctx)
    expect(r.recusadas).toEqual([])
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('grad', { style: { gradientStops: [{ color: '#GGGGGG', position: 0, opacity: 0 }] } })], ctx).recusadas[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['style.gradientStops[].color'] })
  })

  it('TIPO_NAO_EDITAVEL: vídeo e célula de grade, qualquer operação', () => {
    const extra = [...pagina(), { id: 'v', type: 'video', name: 'Vídeo', visible: true, locked: false, order: 6, position: { x: 0, y: 0 }, size: { width: 10, height: 10 } } as Layer, { id: 'cel', type: 'image', name: 'Célula', visible: true, locked: false, order: 7, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, metadata: { grade: { id: 'g1' } } } as Layer]
    expect(aplicarOperacoesDeCamadas(extra, [definir('v', { visible: false })], ctx).recusadas[0]).toMatchObject({ codigo: 'TIPO_NAO_EDITAVEL' })
    expect(aplicarOperacoesDeCamadas(extra, [definir('cel', { position: { x: 1 } })], ctx).recusadas[0]).toMatchObject({ codigo: 'TIPO_NAO_EDITAVEL' })
  })

  it('pedido misto é recusado INTEIRO: a operação válida não é executada e as camadas voltam intactas', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('logo', { position: { x: 1 } }), definir('nao-existe', { visible: false })], ctx)
    expect(r.recusadas).toHaveLength(1)
    expect(r.aplicadas).toEqual([])
    expect(r.camadas).toEqual(pagina())
    const erro = erroDeCamadas(r.recusadas)
    expect(erro).toMatchObject({ code: 'CAMADA_INEXISTENTE', status: 422, details: { ajusteGravado: false, erros: [expect.objectContaining({ indice: 1 })] } })
  })

  it('campos.order move a camada na pilha e renumera (o mesmo que reordenar)', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('forma', { order: 1 })], ctx)
    expect(r.camadas.map((l) => [l.id, l.order])).toEqual([['bg', 0], ['forma', 1], ['grad', 2], ['headline', 3], ['apoio', 4], ['logo', 5]])
  })
})

describe('adicionar, remover, reordenar', () => {
  it('adicionar texto com os defaults do servidor (fonte da marca, cor branca, centrado) e o que veio por cima', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'texto', campos: { content: 'Reserve já', style: { fontSize: 40, color: '#111111' } } }], { ...ctx, fontes: { corpo: 'Inter' } })
    expect(r.recusadas).toEqual([])
    const nova = r.camadas.find((l) => l.id === 'nova-1')!
    expect(nova).toMatchObject({ type: 'text', content: 'Reserve já', order: 6, size: { width: 864, height: 44 }, style: { fontSize: 40, color: '#111111', fontFamily: 'Inter', textAlign: 'center', lineHeight: 1.1 }, textboxConfig: { autoWrap: { lineHeight: 1.1 } } })
    expect(r.tocadas).toEqual(['nova-1'])
    expect(r.aplicadas[0]).toMatchObject({ op: 'adicionar', camada: 'nova-1' })
  })

  it('adicionar logo usa a logo do cliente e o canto de baixo; sem logo cadastrada é OPERACAO_INCOMPLETA', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'logo', id: 'logo-2' }], { ...ctx, logoUrl: 'https://blob.test/marca.png' })
    expect(r.camadas.find((l) => l.id === 'logo-2')).toMatchObject({ type: 'logo', fileUrl: 'https://blob.test/marca.png', size: { width: 194, height: 194 }, position: { x: 443, y: 1648 } })
    expect(aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'logo' }], ctx).recusadas[0]).toMatchObject({ codigo: 'OPERACAO_INCOMPLETA' })
  })

  it('adicionar imagem precisa de foto; forma e gradiente nascem com defaults; ordem põe no lugar pedido', () => {
    expect(aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'imagem' }], ctx).recusadas[0]).toMatchObject({ codigo: 'OPERACAO_INCOMPLETA', campos: ['campos.driveImageId'] })
    const r = aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'forma', ordem: 1, campos: { style: { shapeType: 'circle', fill: '#00AA00' }, size: { width: 50, height: 50 } } }, { op: 'adicionar', tipo: 'gradiente', id: 'g2', campos: { style: { gradientAngle: 0 } } }], ctx)
    expect(r.recusadas).toEqual([])
    expect(r.camadas.map((l) => l.id)).toEqual(['bg', 'nova-1', 'grad', 'headline', 'apoio', 'logo', 'forma', 'g2'])
    expect(r.camadas[1]).toMatchObject({ type: 'shape', order: 1, style: { shapeType: 'circle', fill: '#00AA00' }, size: { width: 50, height: 50 } })
    expect(r.camadas[7]).toMatchObject({ type: 'gradient', order: 7, position: { x: 0, y: 864 }, style: { gradientAngle: 0, gradientType: 'linear' } })
  })

  it('adicionar: id repetido, texto sem conteúdo, ícone sem iconId e campo fora do tipo', () => {
    expect(aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'forma', id: 'logo' }], ctx).recusadas[0]).toMatchObject({ codigo: 'ID_JA_EXISTE' })
    expect(aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'texto', campos: { content: '...' } }], ctx).recusadas[0]).toMatchObject({ codigo: 'OPERACAO_INCOMPLETA', campos: ['campos.content'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'icone' }], ctx).recusadas[0]).toMatchObject({ codigo: 'OPERACAO_INCOMPLETA' })
    expect(aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'forma', campos: { style: { fontSize: 30 } } }], ctx).recusadas[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['style.fontSize'] })
    // revisão #294 (baixo): campos.order em adicionar e foto em tipo que não é imagem/logo são recusados, nunca ignorados
    expect(validarFormatoDasOperacoes([{ op: 'adicionar', tipo: 'forma', campos: { order: 1 } }], ctx)[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['campos.order'] })
    expect(validarFormatoDasOperacoes([{ op: 'adicionar', tipo: 'texto', campos: { content: 'Oi', driveImageId: 'drive-1' } }], ctx)[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['driveImageId'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { driveImageId: 'drive-1' })], ctx).recusadas[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['driveImageId'] })
  })

  it('remover tira a camada e renumera; reordenar move pela pilha (0 = fundo)', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [{ op: 'remover', camada: 'forma' }, { op: 'reordenar', camada: 'logo', ordem: 0 }], ctx)
    expect(r.recusadas).toEqual([])
    expect(r.camadas.map((l) => [l.id, l.order])).toEqual([['logo', 0], ['bg', 1], ['grad', 2], ['headline', 3], ['apoio', 4]])
    expect(r.aplicadas.map((a) => a.op)).toEqual(['remover', 'reordenar'])
  })

  it('camada de grupo: definir vale, remover, reordenar e definir com order são TIPO_NAO_EDITAVEL', () => {
    const comGrupo = pagina().map((l) => (l.id === 'apoio' ? { ...l, metadata: { groupId: 'combo-1' } } : l))
    expect(aplicarOperacoesDeCamadas(comGrupo, [definir('apoio', { position: { y: 10 } })], ctx).recusadas).toEqual([])
    expect(aplicarOperacoesDeCamadas(comGrupo, [definir('apoio', { order: 0 })], ctx).recusadas[0]).toMatchObject({ codigo: 'TIPO_NAO_EDITAVEL' })
    expect(aplicarOperacoesDeCamadas(comGrupo, [{ op: 'remover', camada: 'apoio' }], ctx).recusadas[0]).toMatchObject({ codigo: 'TIPO_NAO_EDITAVEL' })
    expect(aplicarOperacoesDeCamadas(comGrupo, [{ op: 'reordenar', camada: 'apoio', ordem: 0 }], ctx).recusadas[0]).toMatchObject({ codigo: 'TIPO_NAO_EDITAVEL' })
  })

  it('OPERACAO_INCOMPLETA e CAMPO_NAO_PERMITIDO de forma: sem camada, sem tipo, sem campos, sem ordem, campos em remover', () => {
    const r = validarFormatoDasOperacoes([{ op: 'definir' }, { op: 'adicionar' }, { op: 'reordenar', camada: 'logo' }, { op: 'remover', camada: 'logo', campos: { visible: false } }, { op: 'definir', camada: 'logo', campos: {} }], { apenasRascunho: false })
    expect(r.map((x) => [x.indice, x.codigo])).toEqual([[0, 'OPERACAO_INCOMPLETA'], [0, 'OPERACAO_INCOMPLETA'], [1, 'OPERACAO_INCOMPLETA'], [2, 'OPERACAO_INCOMPLETA'], [3, 'CAMPO_NAO_PERMITIDO'], [4, 'OPERACAO_INCOMPLETA']])
  })
})

describe('perfil draft-only', () => {
  const rascunho = { ...ctx, apenasRascunho: true }
  it('URL_EXTERNA_RECUSADA em qualquer fileUrl; driveImageId segue', () => {
    expect(validarFormatoDasOperacoes([definir('bg', { fileUrl: 'https://x.test/a.jpg' })], rascunho)[0]).toMatchObject({ codigo: 'URL_EXTERNA_RECUSADA', campos: ['fileUrl'] })
    expect(validarFormatoDasOperacoes([definir('bg', { driveImageId: 'drive-1' })], rascunho)).toEqual([])
  })
  it('revisão #294 (grave): driveImageId resolvido pelo serviço (urlsDoAcervo) GRAVA a URL do Blob no draft-only — a guarda de URL vale só para fileUrl enviado', () => {
    const urlsDoAcervo = new Map([['drive-1', 'https://blob.test/acervo/drive-1.jpg']])
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('bg', { driveImageId: 'drive-1' }), { op: 'adicionar', tipo: 'imagem', id: 'foto2', campos: { driveImageId: 'drive-1' } }], { ...rascunho, urlsDoAcervo })
    expect(r.recusadas).toEqual([])
    expect(r.camadas.find((l) => l.id === 'bg')!.fileUrl).toBe('https://blob.test/acervo/drive-1.jpg')
    expect(r.camadas.find((l) => l.id === 'foto2')!.fileUrl).toBe('https://blob.test/acervo/drive-1.jpg')
    expect(r.camadas.find((l) => l.id === 'bg')).not.toHaveProperty('driveImageId')
    // sem entrada no mapa a foto não existe para esta chamada
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('bg', { driveImageId: 'drive-2' })], { ...rascunho, urlsDoAcervo }).recusadas[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['driveImageId'] })
    // e fileUrl enviado continua recusado mesmo com o mapa
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('bg', { fileUrl: 'https://x.test/a.jpg' })], { ...rascunho, urlsDoAcervo }).recusadas[0]).toMatchObject({ codigo: 'URL_EXTERNA_RECUSADA' })
  })
  it('revisão #294 (médio): copy que SOME por opacidade, tamanho ou posição fora da página é CONTEUDO_NAO_PODE_SER_REMOVIDO', () => {
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { style: { opacity: 0 } })], rascunho).recusadas[0]).toMatchObject({ codigo: 'CONTEUDO_NAO_PODE_SER_REMOVIDO', campos: ['style.opacity'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { size: { width: 1, height: 1 } })], rascunho).recusadas[0]).toMatchObject({ codigo: 'CONTEUDO_NAO_PODE_SER_REMOVIDO', campos: ['size'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { position: { x: -9000 } })], rascunho).recusadas[0]).toMatchObject({ codigo: 'CONTEUDO_NAO_PODE_SER_REMOVIDO', campos: ['position'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { position: { y: 1920 } })], rascunho).recusadas[0]).toMatchObject({ codigo: 'CONTEUDO_NAO_PODE_SER_REMOVIDO' })
    // parcialmente dentro, opacidade legível e caixa normal: vale
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { position: { x: -400, y: 1800 }, style: { opacity: 0.5 }, size: { width: 600 } })], rascunho).recusadas).toEqual([])
    // no perfil humano nada disso é recusado
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { style: { opacity: 0 }, position: { x: -9000 } })], ctx).recusadas).toEqual([])
  })
  it('CONTEUDO_NAO_PODE_SER_REMOVIDO: esconder, esvaziar ou remover texto com conteúdo; trocar por outro texto vale', () => {
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { visible: false })], rascunho).recusadas[0]).toMatchObject({ codigo: 'CONTEUDO_NAO_PODE_SER_REMOVIDO', campos: ['visible'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { content: '—' })], rascunho).recusadas[0]).toMatchObject({ codigo: 'CONTEUDO_NAO_PODE_SER_REMOVIDO', campos: ['content'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [{ op: 'remover', camada: 'headline' }], rascunho).recusadas[0]).toMatchObject({ codigo: 'CONTEUDO_NAO_PODE_SER_REMOVIDO' })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { content: 'JANTAR' }), { op: 'remover', camada: 'forma' }], rascunho).recusadas).toEqual([])
  })
  it('no perfil normal a pessoa pode esconder e remover texto', () => {
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { visible: false }), { op: 'remover', camada: 'apoio' }], ctx).recusadas).toEqual([])
  })
})

describe('pagina', () => {
  it('fundo, largura e altura com faixa e cor; sem mudança real diz mudou: false', () => {
    const atual = { width: 1080, height: 1920, background: '#000000' }
    expect(aplicarPagina(atual, { background: '#112233', height: 1350 })).toEqual({ pagina: { width: 1080, height: 1350, background: '#112233' }, mudou: true, recusadas: [] })
    expect(aplicarPagina(atual, { background: '#000000' }).mudou).toBe(false)
    expect(aplicarPagina(atual, { width: 100 }).recusadas[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['pagina.width'] })
    expect(aplicarPagina(atual, { background: 'nada' }).recusadas[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA' })
    expect(aplicarPagina(atual, {}).recusadas[0]).toMatchObject({ codigo: 'OPERACAO_INCOMPLETA' })
    expect(aplicarPagina(atual, undefined)).toMatchObject({ pagina: atual, mudou: false, recusadas: [] })
  })
})

describe('schema e leitura', () => {
  it('o schema é estrito: chave desconhecida em campos e em style é erro de validação', () => {
    expect(operacaoDeCamadaSchema.safeParse({ op: 'definir', camada: 'x', campos: { metadata: {} } }).success).toBe(false)
    expect(operacaoDeCamadaSchema.safeParse({ op: 'definir', camada: 'x', campos: { style: { vetor: {} } } }).success).toBe(false)
    expect(operacaoDeCamadaSchema.safeParse({ op: 'definir', camada: 'x', campos: { style: { fontSize: 40 } } }).success).toBe(true)
  })
  it('camadaParaLeitura: campos conhecidos, sem metadata nem style.vetor; grupo e grade como marcas', () => {
    const l = { ...pagina()[5], metadata: { groupId: 'g', compositor: { papel: 'x' } }, style: { shapeType: 'svg-path', pathData: 'M0 0', vetor: { partes: [] } }, texto: 'lixo' } as unknown as Layer
    const r = camadaParaLeitura(l)
    expect(r).toEqual({ id: 'forma', type: 'shape', name: 'Faixa', visible: true, locked: false, order: 5, position: { x: 0, y: 0 }, size: { width: 300, height: 40 }, style: { shapeType: 'svg-path', pathData: 'M0 0' }, grupo: 'g' })
    expect(camadaParaLeitura({ ...pagina()[0], metadata: { grade: { id: 'g1' } } } as Layer).grade).toBe(true)
  })
})

describe('destaque por marcação (05/11/2026)', () => {
  const marca = () => ({ fill: '#E30613', fontFamily: 'Montserrat Black' })
  const comMarca = { ...ctx, destaqueDaMarca: marca }

  it('definir content com [colchetes]: grava o texto LIMPO, os trechos em destaques e o estilo da marca', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('headline', { content: 'Picanha [na brasa]' })], comMarca)
    expect(r.recusadas).toEqual([])
    const h = r.camadas.find((l) => l.id === 'headline')!
    expect(h).toMatchObject({ type: 'text', content: 'Picanha na brasa', destaques: [{ inicio: 8, fim: 16 }], destaque: marca() })
    expect(h.content!.slice(8, 16)).toBe('na brasa')
    expect(r.tocadas).toEqual(['headline'])
    expect(r.avisos).toEqual([])
  })

  it('o estilo que a camada já tem fica (não volta ao da marca); destaque explícito vence', () => {
    const base = pagina().map((l) => (l.id === 'headline' ? ({ ...l, destaque: { fill: '#00FF00' } } as Layer) : l))
    expect(aplicarOperacoesDeCamadas(base, [definir('headline', { content: '[Picanha] hoje' })], comMarca).camadas.find((l) => l.id === 'headline')!.destaque).toEqual({ fill: '#00FF00' })
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('headline', { content: '[Picanha] hoje', destaque: { fill: '#123456' } })], comMarca)
    expect(r.camadas.find((l) => l.id === 'headline')!.destaque).toEqual({ fill: '#123456' })
  })

  it('texto novo SEM colchetes numa camada que destacava perde os destaques (o texto mudou)', () => {
    const base = pagina().map((l) => (l.id === 'headline' ? ({ ...l, content: 'Picanha na brasa', destaques: [{ inicio: 8, fim: 16 }], destaque: marca() } as Layer) : l))
    const h = aplicarOperacoesDeCamadas(base, [definir('headline', { content: 'Costela no fogo' })], comMarca).camadas.find((l) => l.id === 'headline')!
    expect(h.content).toBe('Costela no fogo')
    expect(h.destaques).toBeUndefined()
    // Mexer só na cor não toca nos trechos.
    expect(aplicarOperacoesDeCamadas(base, [definir('headline', { style: { color: '#000000' } })], comMarca).camadas.find((l) => l.id === 'headline')!.destaques).toEqual([{ inicio: 8, fim: 16 }])
  })

  it('colchete sem par vira AVISO, nunca recusa; sem colchetes nada muda', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('headline', { content: 'Picanha [na brasa' })], comMarca)
    expect(r.recusadas).toEqual([])
    expect(r.camadas.find((l) => l.id === 'headline')).toMatchObject({ content: 'Picanha na brasa' })
    expect(r.camadas.find((l) => l.id === 'headline')!.destaques).toBeUndefined()
    expect(r.avisos[0]).toMatch(/colchete aberto sem fechar/)
    const simples = aplicarOperacoesDeCamadas(pagina(), [definir('headline', { content: 'Picanha na brasa' })], comMarca).camadas.find((l) => l.id === 'headline')!
    expect(simples.destaques).toBeUndefined()
    expect(simples.destaque).toBeUndefined()
  })

  it('adicionar texto com [colchetes] já nasce destacado', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [{ op: 'adicionar', tipo: 'texto', campos: { content: 'Só [hoje]' } }], comMarca)
    expect(r.camadas.find((l) => l.id === 'nova-1')).toMatchObject({ content: 'Só hoje', destaques: [{ inicio: 3, fim: 7 }], destaque: marca() })
  })

  it('destaques explícitos: offsets no content final; [] tira; fora do texto e inicio ≥ fim são recusados', () => {
    const ok = aplicarOperacoesDeCamadas(pagina(), [definir('headline', { destaques: [{ inicio: 0, fim: 6 }] })], comMarca)
    expect(ok.recusadas).toEqual([])
    expect(ok.camadas.find((l) => l.id === 'headline')).toMatchObject({ destaques: [{ inicio: 0, fim: 6 }], destaque: marca() })
    const base = pagina().map((l) => (l.id === 'headline' ? ({ ...l, destaques: [{ inicio: 0, fim: 6 }] } as Layer) : l))
    expect(aplicarOperacoesDeCamadas(base, [definir('headline', { destaques: [] })], comMarca).camadas.find((l) => l.id === 'headline')!.destaques).toBeUndefined()
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('headline', { destaques: [{ inicio: 10, fim: 99 }] })], comMarca).recusadas[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['destaques'] })
    expect(validarFormatoDasOperacoes([definir('headline', { destaques: [{ inicio: 4, fim: 4 }] })], ctx)[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['destaques'] })
    expect(validarFormatoDasOperacoes([definir('headline', { content: '[a] b', destaques: [{ inicio: 0, fim: 1 }] })], ctx)[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['destaques'] })
  })

  it('destaque: cor pelo lerCor; só em camada text (rich-text segue em quarentena; imagem não aceita)', () => {
    expect(validarFormatoDasOperacoes([definir('headline', { destaque: { fill: 'nao-e-cor' } })], ctx)[0]).toMatchObject({ codigo: 'VALOR_FORA_DA_FAIXA', campos: ['destaque.fill'] })
    expect(aplicarOperacoesDeCamadas(pagina(), [definir('logo', { destaque: { fill: '#FF0000' } })], ctx).recusadas[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['destaque'] })
    const rico = [...pagina(), { id: 'rico', type: 'rich-text', name: 'Rico', visible: true, locked: false, order: 6, position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, content: 'abc' } as Layer]
    expect(aplicarOperacoesDeCamadas(rico, [definir('rico', { destaques: [{ inicio: 0, fim: 1 }] })], ctx).recusadas[0]).toMatchObject({ codigo: 'CAMPO_NAO_PERMITIDO', campos: ['destaques'] })
    expect(operacaoDeCamadaSchema.safeParse({ op: 'definir', camada: 'x', campos: { destaque: { shadow: {} } } }).success).toBe(false)
  })

  it('sem estilo da marca, os trechos ficam sem destaque (o render desenha só o peso forte)', () => {
    const r = aplicarOperacoesDeCamadas(pagina(), [definir('headline', { content: '[Picanha] hoje' })], ctx)
    const h = r.camadas.find((l) => l.id === 'headline')!
    expect(h.destaques).toEqual([{ inicio: 0, fim: 7 }])
    expect(h.destaque).toBeUndefined()
  })

  it('camadaParaLeitura: texto com destaques devolve conteudoMarcado ao lado do content limpo', () => {
    const l = { ...pagina()[2], content: 'Picanha na brasa\nsó hoje', destaques: [{ inicio: 8, fim: 16 }], destaque: marca() } as Layer
    const r = camadaParaLeitura(l)
    expect(r).toMatchObject({ content: 'Picanha na brasa\nsó hoje', conteudoMarcado: 'Picanha [na brasa]\nsó hoje', destaques: [{ inicio: 8, fim: 16 }], destaque: marca() })
    expect(camadaParaLeitura(pagina()[2]).conteudoMarcado).toBeUndefined()
    // ida e volta: o conteudoMarcado mandado de volta em definir content grava a mesma camada
    const volta = aplicarOperacoesDeCamadas([l], [definir('headline', { content: r.conteudoMarcado as string })], comMarca).camadas[0]
    expect(volta).toMatchObject({ content: l.content, destaques: l.destaques, destaque: l.destaque })
  })
})
