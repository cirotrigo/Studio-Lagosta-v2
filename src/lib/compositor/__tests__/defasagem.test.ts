/**
 * As decisões que decidem se a arte de um slide vai ao ar com o texto velho.
 *
 * Cada bloco aqui pina uma armadilha MEDIDA em 04/09/2026, quando 11 das 65
 * artes agendadas do projeto 8 não batiam com o texto da página.
 */
import { describe, expect, it } from 'vitest'

import {
  alcancadoPelaInvalidacao,
  copyDosPapeis,
  fotoDaPagina,
  medirDefasagem,
  precisaRefazer,
  slidesDaPagina,
  specComACopyDaPagina,
} from '../defasagem'
import type { SpecDePeca } from '../spec'

type Camada = Record<string, unknown>

function texto(papel: string, conteudo: string, extras: Camada = {}): Camada {
  return {
    id: papel,
    name: papel,
    type: 'text',
    visible: true,
    order: 1,
    position: { x: 96, y: 1200 },
    size: { width: 888, height: 120 },
    rotation: 0,
    content: conteudo,
    style: { fontSize: 72, textAlign: 'left', color: '#fff' },
    metadata: { groupId: 'grupo-1', compositor: { papel } },
    ...extras,
  }
}

const foto: Camada = {
  id: 'bg-foto',
  name: 'Foto de fundo',
  type: 'image',
  visible: true,
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: 1080, height: 1920 },
  rotation: 0,
  fileUrl: 'https://x.public.blob.vercel-storage.com/drive-cache/abc-s1920.jpg',
  style: { objectFit: 'cover', cropPosition: 'center-middle' },
}

const spec: SpecDePeca = {
  projectId: 8,
  formato: 'story',
  foto: { url: foto.fileUrl as string, driveFileId: 'abc' },
  blocos: [
    { papel: 'headline', linhas: ['Mão na foto', 'convida'] },
    { papel: 'apoio', linhas: ['A foto precisa mostrar que dá para dividir.'] },
  ],
} as SpecDePeca

describe('medirDefasagem', () => {
  const snapshot = [foto, texto('headline', 'Mão na foto\nconvida'), texto('apoio', 'A foto precisa mostrar que dá para dividir.')]

  it('acusa a copy editada e libera a recomposição', () => {
    const pagina = [foto, texto('headline', 'Mão na foto convida'), texto('apoio', 'A foto precisa mostrar que dá para dividir.')]
    const d = medirDefasagem(pagina, snapshot)
    expect(d.ilegivel).toBe(false)
    expect(d.defasada).toBe(true)
    expect(d.papeis).toEqual(['headline'])
    expect(d.soTexto).toBe(true)
  })

  it('página igual não é defasagem', () => {
    expect(medirDefasagem(snapshot, snapshot).defasada).toBe(false)
  })

  /**
   * A caixa CRESCE sozinha quando o texto muda (`autoExpand`), e até quando só
   * a fonte termina de carregar. Contar isso como "mexeu à mão" faria toda
   * edição cair no caminho conservador e a recomposição nunca aconteceria —
   * que é justamente o defeito, com outra roupa.
   */
  it('altura de texto que cresceu sozinha NÃO conta como ajuste manual', () => {
    const pagina = [
      foto,
      texto('headline', 'Mão na foto convida a dividir a mesa'),
      { ...texto('apoio', 'A foto precisa mostrar que dá para dividir.'), size: { width: 888, height: 240 } },
    ]
    const d = medirDefasagem(pagina, snapshot)
    expect(d.soTexto).toBe(true)
    expect(d.mexidoNaMao).toEqual([])
  })

  it('caixa movida à mão desliga a recomposição e diz por quê', () => {
    const pagina = [
      foto,
      { ...texto('headline', 'Mão na foto convida'), position: { x: 96, y: 400 } },
      texto('apoio', 'A foto precisa mostrar que dá para dividir.'),
    ]
    const d = medirDefasagem(pagina, snapshot)
    expect(d.defasada).toBe(true)
    expect(d.soTexto).toBe(false)
    expect(d.mexidoNaMao.join(' ')).toContain('headline')
  })

  it('camada acrescentada à mão desliga a recomposição', () => {
    const pagina = [...snapshot, { ...texto('extra', 'Selo'), id: 'selo-10-anos', name: 'Selo', metadata: {} }]
    expect(medirDefasagem(pagina, snapshot).soTexto).toBe(false)
  })

  /**
   * Arte sem snapshot (a de `arte-rapida`, e toda anterior ao compositor) não
   * pode ser declarada "em dia": ilegível nunca vira "não mudou nada".
   */
  it('sem snapshot devolve ilegível, nunca "em dia"', () => {
    const d = medirDefasagem(snapshot, undefined)
    expect(d.ilegivel).toBe(true)
    expect(d.defasada).toBe(false)
    expect(d.soTexto).toBe(false)
  })

  it('lê as camadas dupla-codificadas do legado', () => {
    const d = medirDefasagem(JSON.stringify(JSON.stringify(snapshot)), snapshot)
    expect(d.ilegivel).toBe(false)
    expect(d.defasada).toBe(false)
  })
})

describe('copyDosPapeis', () => {
  it('ignora camada escondida e camada que não é papel do compositor', () => {
    const copy = copyDosPapeis([
      texto('headline', 'Sexta é dia'),
      { ...texto('cta', 'Vem pra cá'), visible: false },
      { ...texto('livre', 'anotação'), id: 'livre', name: 'livre', metadata: {} },
    ])
    expect(copy).toEqual({ headline: 'Sexta é dia' })
  })

  it('acha o papel mesmo quando a camada foi renomeada no editor', () => {
    const renomeada = { ...texto('apoio', 'x'), id: 'camada-7', name: 'Texto de apoio' }
    expect(copyDosPapeis([renomeada])).toEqual({ apoio: 'x' })
  })
})

describe('specComACopyDaPagina', () => {
  it('junta headline e headline2 de volta numa manchete só', () => {
    /**
     * `comporPeca` parte a manchete em duas vozes quando a assinatura tem
     * `headline2`. Devolver `headline2` como papel da spec faria `validarSpec`
     * recusar a peça inteira — e o slide continuaria com o texto velho.
     */
    const pagina = [foto, texto('headline', 'Mão na foto'), texto('headline2', 'convida'), texto('apoio', 'A foto precisa mostrar.')]
    const r = specComACopyDaPagina(spec, pagina)
    expect(r.spec.blocos.map((b) => b.papel)).toEqual(['headline', 'apoio'])
    expect(r.spec.blocos[0].linhas).toEqual(['Mão na foto', 'convida'])
  })

  /**
   * 🔴 Nem toda spec tem foto: duas peças de 04/09 tinham a imagem posta à mão
   * no editor depois de compor, e recompor pela spec devolveu a peça com FUNDO
   * PRETO, sem erro nenhum.
   */
  it('a foto da PÁGINA vence a da spec, e a spec sem foto ganha a da página', () => {
    const semFoto = { ...spec, foto: undefined } as SpecDePeca
    const r = specComACopyDaPagina(semFoto, [foto, texto('headline', 'a'), texto('apoio', 'b')])
    expect(r.spec.foto?.url).toBe(foto.fileUrl)
    expect(r.avisos.join(' ')).toContain('não tinha foto')
  })

  it('trocar a foto no editor derruba o driveFileId antigo', () => {
    const outra = { ...foto, fileUrl: 'https://x.public.blob.vercel-storage.com/uploads/outra.jpg' }
    const r = specComACopyDaPagina(spec, [outra, texto('headline', 'a'), texto('apoio', 'b')])
    expect(r.spec.foto).toEqual({ url: outra.fileUrl })
  })

  it('papel apagado da página sai da spec, com aviso', () => {
    const r = specComACopyDaPagina(spec, [foto, texto('headline', 'só a manchete')])
    expect(r.spec.blocos.map((b) => b.papel)).toEqual(['headline'])
    expect(r.avisos.join(' ')).toContain('apoio')
  })

  it('camadas ilegíveis não inventam spec nova', () => {
    const r = specComACopyDaPagina(spec, 'não é json')
    expect(r.spec).toBe(spec)
    expect(r.avisos).toHaveLength(1)
  })
})

describe('fotoDaPagina', () => {
  it('prefere a camada bg-foto do compositor', () => {
    const outra = { ...foto, id: 'imagem-solta', fileUrl: 'https://x/solta.jpg' }
    expect(fotoDaPagina([outra, foto])).toBe(foto.fileUrl)
  })

  it('página sem imagem devolve null', () => {
    expect(fotoDaPagina([texto('headline', 'a')])).toBeNull()
  })
})

describe('slidesDaPagina', () => {
  const url = 'https://x.public.blob.vercel-storage.com/arte-rapida/8/pag123-1757000000000.png'
  const outra = 'https://x.public.blob.vercel-storage.com/arte-rapida/8/pag999-1757000000001.png'

  it('acha a posição exata do slide num carrossel', () => {
    const posts = [{ id: 'post-1', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: [outra, url, outra] }]
    expect(slidesDaPagina(posts, [url], 'pag123')).toEqual([
      { postId: 'post-1', indice: 1, total: 3, urlAntiga: url },
    ])
  })

  /**
   * 🔴 O casamento é por URL EXATA. `renderPostArt` nomeia por POST
   * (`<postId>-<epoch>.png`) e o compositor por PÁGINA (`<pageId>-<epoch>.png`);
   * casar por prefixo do nome do arquivo produziu 9 falsos "página que não
   * existe mais" no diagnóstico de 04/09.
   */
  it('não casa por prefixo do nome do arquivo', () => {
    const parecida = 'https://x.public.blob.vercel-storage.com/arte-rapida/8/pag123-1888000000000.png'
    const posts = [{ id: 'post-1', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: [parecida] }]
    expect(slidesDaPagina(posts, [url], 'pag123')).toEqual([])
  })

  it('pula o post que a invalidação já atende', () => {
    const posts = [{ id: 'post-1', pageId: 'pag123', renderStatus: 'RENDERED', mediaUrls: [url] }]
    expect(slidesDaPagina(posts, [url], 'pag123')).toEqual([])
  })

  it('não pula o post cuja arte veio desta página mas está congelada em NOT_NEEDED', () => {
    const posts = [{ id: 'post-1', pageId: 'pag123', renderStatus: 'NOT_NEEDED', mediaUrls: [url] }]
    expect(slidesDaPagina(posts, [url], 'pag123')).toHaveLength(1)
  })

  it('encontra a arte ANTIGA da página, não só a mais recente', () => {
    const antiga = 'https://x.public.blob.vercel-storage.com/arte-rapida/8/pag123-1750000000000.png'
    const posts = [{ id: 'post-1', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: [antiga] }]
    expect(slidesDaPagina(posts, [url, antiga], 'pag123')).toHaveLength(1)
  })
})

describe('precisaRefazer', () => {
  const url = 'https://x/atual.png'
  const emDia = { ilegivel: false, defasada: false, papeis: [], soTexto: true, mexidoNaMao: [] }
  const slide = { postId: 'p', indice: 0, total: 3, urlAntiga: url }

  it('página sem slide congelado nunca precisa', () => {
    expect(precisaRefazer(emDia, [], url)).toBe(false)
  })

  it('página igual à arte, com o slide já apontando para ela: nada a fazer', () => {
    expect(precisaRefazer(emDia, [slide], url)).toBe(false)
  })

  it('slide preso numa arte ANTIGA precisa, mesmo com a página em dia', () => {
    expect(precisaRefazer(emDia, [{ ...slide, urlAntiga: 'https://x/velha.png' }], url)).toBe(true)
  })

  it('copy editada precisa', () => {
    expect(precisaRefazer({ ...emDia, defasada: true, papeis: ['headline'] }, [slide], url)).toBe(true)
  })

  it('página ajustada à mão precisa (e vai pelo re-render)', () => {
    expect(precisaRefazer({ ...emDia, soTexto: false, mexidoNaMao: ['"cta" foi movida'] }, [slide], url)).toBe(true)
  })

  /** "não consegui conferir" NUNCA é "está em dia". */
  it('ilegível precisa', () => {
    expect(precisaRefazer({ ...emDia, ilegivel: true, soTexto: false }, [slide], url)).toBe(true)
  })
})

describe('alcancadoPelaInvalidacao', () => {
  it('só quando o post renderiza DESTA página', () => {
    expect(alcancadoPelaInvalidacao({ id: 'p', pageId: 'pag123', renderStatus: 'PENDING' }, 'pag123')).toBe(true)
    expect(alcancadoPelaInvalidacao({ id: 'p', pageId: 'outra', renderStatus: 'RENDERED' }, 'pag123')).toBe(false)
    expect(alcancadoPelaInvalidacao({ id: 'p', pageId: null, renderStatus: 'RENDERED' }, 'pag123')).toBe(false)
  })
})
