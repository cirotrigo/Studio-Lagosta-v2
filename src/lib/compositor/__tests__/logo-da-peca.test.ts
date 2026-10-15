/**
 * CP3 — `conferirLogoDaPeca` em peças sintéticas, com o renderer REAL (fotos e logos em data URL; sem banco, sem
 * rede): a logo desenhada é medida na caixa EXATA em que o render a desenha; outra variante no canto atual ocupa a
 * caixa que a regra do canto lhe dá; colisão elimina mesmo quando lê; o véu automático da logo que não a salvou sai;
 * a gravada não autorizada é dita — também na recusa.
 */
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'
import type { Rect } from '@/lib/creatives/halo/halo'
import { CreativeError } from '@/lib/creatives/errors'
import { LOGO_SEM_VARIANTE_LEGIVEL, type VarianteDaLogo } from '../legibilidade-da-logo'
import { caixaDaVariante, conferirLogoDaPeca, type ArgsDaConferencia } from '../logo-da-peca'

const CANVAS = { width: 1080, height: 1920 }
const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`

/** Foto em cinza: `luz(x, y)` por pixel. */
async function foto(luz: (x: number, y: number) => number): Promise<string> {
  const px = Buffer.alloc(CANVAS.width * CANVAS.height)
  for (let y = 0; y < CANVAS.height; y++) for (let x = 0; x < CANVAS.width; x++) px[y * CANVAS.width + x] = Math.max(0, Math.min(255, Math.round(luz(x, y))))
  return dataUrl(await sharp(px, { raw: { width: CANVAS.width, height: CANVAS.height, channels: 1 } }).png().toBuffer())
}

/** Logo W×H toda opaca numa tinta (um retângulo cheio: a caixa esticada é toda tinta). */
async function logoCheia(tinta: number, W = 160, H = 80): Promise<string> {
  const px = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = tinta
    px[i * 4 + 1] = tinta
    px[i * 4 + 2] = tinta
    px[i * 4 + 3] = 255
  }
  return dataUrl(await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer())
}

const fundo = (url: string): Layer => ({ id: 'bg-foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: CANVAS, fileUrl: url, style: { objectFit: 'cover' } }) as Layer
const camadaDaLogo = (url: string, rect: Rect): Layer => ({ id: 'logo', name: 'Logo', type: 'logo', visible: true, locked: false, order: 9, position: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height }, fileUrl: url, style: { objectFit: 'contain' }, metadata: { compositor: { canto: 'inferior-direito' } } }) as Layer
const texto = (id: string, rect: Rect): Layer => ({ id, name: id, type: 'text', visible: true, locked: false, order: 1, content: id, position: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height }, style: { fontSize: 40, color: '#FFFFFF' } }) as Layer

const CANTO: Rect = { x: 800, y: 1600, width: 160, height: 80 }
const pagina = (url: string): VarianteDaLogo => ({ origem: 'pagina', url, camada: 'logo-pagina' })
const projeto = (url: string, id: number): VarianteDaLogo => ({ origem: 'projeto', url, logoId: id })

function args(parcial: Partial<ArgsDaConferencia> & Pick<ArgsDaConferencia, 'layers' | 'logo' | 'desenhada' | 'variantes'>): ArgsDaConferencia {
  return {
    canvas: CANVAS,
    background: '#0B0B0B',
    cantoAtual: 'inferior-direito',
    posicoesAlternativas: (t) => [{ canto: 'superior-esquerdo', rect: { x: 92, y: 200, width: t.width, height: t.height } }],
    caixaNoCantoAtual: (t) => ({ x: CANTO.x + CANTO.width - t.width, y: CANTO.y + CANTO.height - t.height, width: t.width, height: t.height }),
    livre: () => true,
    veusDaLogo: new Set(),
    modo: 'arquetipo',
    ...parcial,
  }
}

describe('a caixa medida é a caixa desenhada', () => {
  it('a logo desenhada ESTICADA (caixa 2,5:1 com arquivo 2:1) é medida na caixa inteira: a faixa clara sob o pedaço esticado reprova', async () => {
    // Fundo escuro até x = 900 e claro depois: a caixa {800..1000} tem 100 px sobre o claro; o contain (160×80 → 160 px
    // rente à direita, {840..1000}) teria 60 px sobre o claro. Logo clara: só a caixa inteira mostra que 50% não lê.
    const url = await logoCheia(240)
    const caixa: Rect = { x: 800, y: 1600, width: 200, height: 80 }
    const layers = [fundo(await foto((x) => (x < 900 ? 20 : 230))), camadaDaLogo(url, caixa)]
    const r = await conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(url), variantes: [pagina(url)], modo: 'legado' }))
    expect(r.legibilidade.posicao).toEqual(caixa)
    expect(r.legibilidade.medida!.pixelsAvaliados).toBe(200 * 80)
    expect(r.legibilidade.medida!.proporcaoAcima45).toBeCloseTo(0.5, 1)
    expect(r.legibilidade.legivel).toBe(false)
  })

  it('outra variante no canto atual ocupa a caixa pela largura (a da regra do canto), não um contain da caixa desenhada', async () => {
    const clara = await logoCheia(240) // 160×80
    const quadrada = await logoCheia(20, 100, 100) // razão 1
    const layers = [fundo(await foto(() => 200)), camadaDaLogo(clara, CANTO)]
    const r = await conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(clara), variantes: [pagina(clara), projeto(quadrada, 7)] }))
    expect(r.legibilidade.escolha).toBe('variante-trocada')
    // Largura mantida (160) e altura pela razão do arquivo (160), ancorada no canto: nunca 80×80.
    expect(r.legibilidade.posicao).toEqual({ x: 800, y: 1680 - 160, width: 160, height: 160 })
    const logo = r.layers.find((l) => l.id === 'logo')!
    expect(logo.size).toEqual({ width: 160, height: 160 })
    expect(logo.fileUrl).toBe(quadrada)
  })

  it('caixaDaVariante (a logo fixa): contain na caixa, rente ao lado do canto, centrada na altura', () => {
    expect(caixaDaVariante({ x: 100, y: 100, width: 200, height: 100 }, 1, 'inferior-direito')).toEqual({ x: 200, y: 100, width: 100, height: 100 })
    expect(caixaDaVariante({ x: 100, y: 100, width: 200, height: 100 }, 0.25, 'inferior-esquerdo')).toEqual({ x: 100, y: 125, width: 200, height: 50 })
  })
})

describe('eliminar antes de preferir', () => {
  it('a posição atual que COLIDE com texto é eliminada mesmo legível: a logo vai ao canto livre', async () => {
    const url = await logoCheia(240)
    const layers = [fundo(await foto(() => 20)), texto('servico', { x: 700, y: 1590, width: 300, height: 60 }), camadaDaLogo(url, CANTO)]
    const r = await conferirLogoDaPeca(args({ layers, logo: layers[2], desenhada: pagina(url), variantes: [pagina(url)], livre: (caixa) => caixa.y < 1500 }))
    expect(r.legibilidade.avaliacoes[0]).toMatchObject({ canto: 'inferior-direito', estado: 'fora-da-area' })
    expect(r.legibilidade.escolha).toBe('canto-trocado')
    expect(r.canto).toBe('superior-esquerdo')
    expect(r.layers.find((l) => l.id === 'logo')!.position).toEqual({ x: 92, y: 200 })
  })

  it('outra variante MAIS ALTA no canto atual que passa a encostar no texto é eliminada ali (a conferência é por caixa), e vai ao canto livre', async () => {
    // A desenhada (cinza-escura, 160×80 em y 1600..1680) não lê sobre o fundo escuro; a variante clara é QUADRADA e no
    // canto ocuparia 160×160 (y 1520..1680), encostando no serviço que termina em y 1560 — a caixa desenhada está livre,
    // a da variante não.
    const cinza = await logoCheia(20)
    const quadrada = await logoCheia(240, 100, 100)
    const servico = { x: 700, y: 1500, width: 300, height: 60 }
    const camadas = [fundo(await foto(() => 20)), texto('servico', servico), camadaDaLogo(cinza, CANTO)]
    const livre = (caixa: Rect) => !(caixa.x < servico.x + servico.width && caixa.x + caixa.width > servico.x && caixa.y < servico.y + servico.height && caixa.y + caixa.height > servico.y)
    expect(livre(CANTO)).toBe(true)
    const r = await conferirLogoDaPeca(args({ layers: camadas, logo: camadas[2], desenhada: pagina(cinza), variantes: [pagina(cinza), projeto(quadrada, 3)], livre }))
    const noCantoAtual = r.legibilidade.avaliacoes.find((a) => a.variante.logoId === 3 && a.canto === 'inferior-direito')!
    expect(noCantoAtual.estado).toBe('fora-da-area')
    expect(r.canto).toBe('superior-esquerdo')
  })

  it('o véu automático da logo que não a salvou SAI, e a mesma logo no mesmo canto passa a ler: escolha "veu-removido", régua avisa', async () => {
    const escura = await logoCheia(30)
    // Foto clara (logo escura lê nua); um "véu" escuro opaco sobre o canto (camada de imagem) a esconde.
    const veu: Layer = { id: 'gradiente-leitura-rodape', name: 'véu', type: 'image', visible: true, locked: false, order: 5, position: { x: 0, y: 1500 }, size: { width: 1080, height: 420 }, fileUrl: await foto(() => 35), style: { objectFit: 'cover' } } as Layer
    const layers = [fundo(await foto(() => 215)), veu, camadaDaLogo(escura, CANTO)]
    const r = await conferirLogoDaPeca(args({ layers, logo: layers[2], desenhada: pagina(escura), variantes: [pagina(escura)], veusDaLogo: new Set(['gradiente-leitura-rodape']) }))
    expect(r.legibilidade.escolha).toBe('veu-removido')
    expect(r.veusRemovidos).toEqual(['gradiente-leitura-rodape'])
    expect(r.layers.some((l) => l.id === 'gradiente-leitura-rodape')).toBe(false)
    expect(r.avisos.join(' ')).toMatch(/sob o véu automático dela/)
  })
})

describe('a gravada e a recusa', () => {
  it('a gravada autorizada vai primeiro e é casada pelo identificador (logoId), mesmo com a URL trocada', async () => {
    const clara = await logoCheia(240)
    const escura = await logoCheia(30)
    const layers = [fundo(await foto(() => 128)), camadaDaLogo(clara, CANTO)]
    // A gravada diz `logoId: 7` com uma URL antiga (o Blob mudou): casa com a variante do projeto de id 7.
    const r = await conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(clara), variantes: [pagina(clara), projeto(escura, 7)], gravada: { origem: 'projeto', url: 'https://blob-antigo/x.png', logoId: 7 } }))
    expect(r.legibilidade.variante).toEqual(projeto(escura, 7))
    expect(r.legibilidade.escolha).toBe('reproduzida')
  })

  it('a gravada não autorizada é dita no aviso — e, quando a peça recusa, no erro e nos details', async () => {
    const cinza = await logoCheia(128)
    const layers = [fundo(await foto(() => 128)), camadaDaLogo(cinza, CANTO)]
    const gravada = { origem: 'projeto' as const, url: 'https://blob/sumiu.png', logoId: 99 }
    const erro = await conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(cinza), variantes: [pagina(cinza)], gravada })).catch((e) => e)
    expect(erro).toBeInstanceOf(CreativeError)
    expect(erro.code).toBe(LOGO_SEM_VARIANTE_LEGIVEL)
    expect(erro.message).toMatch(/já não é autorizada/)
    expect(erro.details).toMatchObject({ gravada, gravadaAutorizada: false, avisos: [expect.stringContaining('já não é autorizada')] })
  })

  it('sem nenhuma variante autorizada: recusa própria com arquétipo; "não medida" no legado', async () => {
    const url = await logoCheia(240)
    const layers = [fundo(await foto(() => 20)), camadaDaLogo(url, CANTO)]
    await expect(conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(url), variantes: [] }))).rejects.toMatchObject({ code: LOGO_SEM_VARIANTE_LEGIVEL })
    const legado = await conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(url), variantes: [], modo: 'legado' }))
    expect(legado.legibilidade).toMatchObject({ estado: 'nao-medida', motivo: 'nenhuma variante autorizada cadastrada' })
  })

  it('URL com escape inválido (`logo%.png`) não derruba a peça: o rótulo cai para o nome bruto, no legado e na recusa com arquétipo (Codex final)', async () => {
    const escura = await logoCheia(20)
    const layers = [fundo(await foto(() => 20)), camadaDaLogo(escura, CANTO)]
    const quebrada: VarianteDaLogo = { origem: 'projeto', url: 'https://blob.test/logos/logo%.png', logoId: 7 }
    const legado = await conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(escura), variantes: [pagina(escura), quebrada], modo: 'legado' }))
    const celula = legado.legibilidade.avaliacoes.find((a) => a.variante.url === quebrada.url)!
    expect(celula.estado).toBe('indisponivel')
    expect(legado.legibilidade.mensagem).toMatch(/1 não carregou/)
    // O rótulo com o nome bruto não lança (é ele que montaria o aviso/erro com `nomeDoArquivo`).
    expect(legado.layers).toBe(layers)
    await expect(conferirLogoDaPeca(args({ layers, logo: layers[1], desenhada: pagina(escura), variantes: [pagina(escura), quebrada] }))).rejects.toMatchObject({ code: 'LOGO_INDISPONIVEL' })
  })

  it('variante do projeto TRUNCADA (a cabeça decodifica, o corpo não): "indisponivel" na grade — o legado sai, o arquétipo recusa como transitório, nunca uma exceção solta (revisor F)', async () => {
    const legivel = await logoCheia(240)
    const inteira = Buffer.from((await logoCheia(20)).slice('data:image/png;base64,'.length), 'base64')
    const truncada = dataUrl(inteira.subarray(0, Math.floor(inteira.length * 0.4)))
    const layers = [fundo(await foto(() => 20)), camadaDaLogo(legivel, CANTO)]
    const comum = { layers, logo: layers[1], desenhada: pagina(legivel), variantes: [pagina(legivel), projeto(truncada, 9)] }
    const legado = await conferirLogoDaPeca(args({ ...comum, modo: 'legado' }))
    // A desenhada lê: a truncada só aparece na grade como "não decodificou", sem derrubar a peça.
    expect(legado.legibilidade.legivel).toBe(true)
    // A desenhada que não lê e a única alternativa truncada: a grade diz "não decodificou" e o legado SAI (sem conclusão);
    // o arquétipo recusa como INDISPONÍVEL (transitório), não como "sem variante".
    const escura = await logoCheia(20)
    const layersEscura = [fundo(await foto(() => 20)), camadaDaLogo(escura, CANTO)]
    const semConclusao = await conferirLogoDaPeca(args({ layers: layersEscura, logo: layersEscura[1], desenhada: pagina(escura), variantes: [pagina(escura), projeto(truncada, 9)], modo: 'legado' }))
    expect(semConclusao.legibilidade.avaliacoes.filter((a) => a.variante.url === truncada).map((a) => [a.estado, a.motivo?.startsWith('não decodificou')])).toContainEqual(['indisponivel', true])
    expect(semConclusao.legibilidade.codigo).toBeUndefined()
    await expect(conferirLogoDaPeca(args({ layers: layersEscura, logo: layersEscura[1], desenhada: pagina(escura), variantes: [pagina(escura), projeto(truncada, 9)] }))).rejects.toMatchObject({ code: 'LOGO_INDISPONIVEL' })
  })
})
