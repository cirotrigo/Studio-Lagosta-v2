/**
 * A falha de render SEMÂNTICA — B1d, checkpoint d.
 *
 * O contrato novo (`_slots`/`_papeis`) que não casa com a página no momento do render é uma falha
 * DETERMINÍSTICA: repetir o render dá o mesmo resultado. `renderPostArt` a reconhece pelo tipo (nunca pela
 * mensagem) e a torna terminal na primeira tentativa; os erros comuns (fonte, Canvas, Blob) seguem o retry de
 * sempre. Em `renderError` ela vira um envelope JSON com leitor ESTRITO: código, motivo, pageId e os erros
 * estruturados do resolvedor — nunca o texto nem a URL pedidos. Qualquer outro `renderError` é erro comum.
 */
import type { ErroDeValor } from '@/lib/semantica/resolver-valores'

export type MotivoDoRenderSemantico = 'CONTRATO_INVALIDO' | 'PAGINA_DE_CONTEUDO'

const MOTIVOS: readonly MotivoDoRenderSemantico[] = ['CONTRATO_INVALIDO', 'PAGINA_DE_CONTEUDO']

export interface FalhaDeRenderSemantico {
  codigo: 'RENDER_SEMANTICO_INVALIDO'
  motivo: MotivoDoRenderSemantico
  pageId: string
  erros: ErroDeValor[]
}

export class ErroRenderSemantico extends Error {
  readonly codigo = 'RENDER_SEMANTICO_INVALIDO' as const

  constructor(
    readonly motivo: MotivoDoRenderSemantico,
    readonly pageId: string,
    readonly erros: ErroDeValor[] = [],
  ) {
    super(
      motivo === 'PAGINA_DE_CONTEUDO'
        ? `O post usa o contrato semântico (_slots/_papeis), mas a página ${pageId} não é um modelo.`
        : `O contrato semântico do post não casa com a página ${pageId} (${erros.map((e) => e.codigo).join(', ')}).`,
    )
    this.name = 'ErroRenderSemantico'
  }

  /** O envelope gravado em `SocialPost.renderError`. */
  paraRenderError(): string {
    const falha: FalhaDeRenderSemantico = { codigo: this.codigo, motivo: this.motivo, pageId: this.pageId, erros: this.erros }
    return JSON.stringify(falha)
  }
}

/** Lê o envelope de `renderError`; `null` para qualquer outra coisa (inclusive os erros comuns de hoje). */
export function lerErroRenderSemantico(renderError: string | null | undefined): FalhaDeRenderSemantico | null {
  if (!renderError || renderError[0] !== '{') return null
  try {
    const v = JSON.parse(renderError) as Partial<FalhaDeRenderSemantico>
    if (
      v?.codigo !== 'RENDER_SEMANTICO_INVALIDO' ||
      !MOTIVOS.includes(v.motivo as MotivoDoRenderSemantico) ||
      typeof v.pageId !== 'string' ||
      !Array.isArray(v.erros)
    ) {
      return null
    }
    return { codigo: v.codigo, motivo: v.motivo as MotivoDoRenderSemantico, pageId: v.pageId, erros: v.erros }
  } catch {
    return null
  }
}

/** O que o executor grava e avisa quando a arte de um story falhou (render RENDER_FAILED). */
export function mensagensDaFalhaDeArte(renderError: string | null | undefined): { erroDoPost: string; log: string; aviso: string } {
  if (lerErroRenderSemantico(renderError)) {
    return {
      erroDoPost: 'Story image rendering refused: the semantic contract no longer matches the page',
      log: `Story image rendering refused (semantic contract): ${renderError}`,
      aviso: 'A arte do story precisa de correção: o contrato semântico não corresponde mais à página.',
    }
  }
  return {
    erroDoPost: 'Story image rendering failed after 3 attempts',
    log: 'Story image rendering failed after 3 attempts',
    aviso: 'Não foi possível gerar a arte do story depois de 3 tentativas',
  }
}
