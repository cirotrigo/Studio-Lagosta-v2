/**
 * ADMISSÃO do contrato semântico novo (`_slots`/`_papeis`) num SocialPost — B1d, checkpoint c.
 *
 * Um pedido semântico só entra quando o render do SERVIDOR vai poder desenhá-lo: STORY (o único post que o
 * cron renderiza a partir da página), sem mídia pronta (uma imagem enviada não prova que o contrato foi
 * aplicado), sobre uma página MODELO do mesmo projeto, e com o contrato válido contra as camadas dela — pelo
 * mesmo helper do render (`aplicarValoresDoPost`), sem outro resolvedor. Fluxo: pedido → página modelo →
 * PENDING → render do servidor → prova → envio.
 *
 * Sem as chaves do contrato novo, retorna sem ler nada: a admissão legada não muda. A chave presente com
 * `null` é contrato INVÁLIDO (fronteira do post); a criação do B1c trata `null` como ausente, e unificar a API
 * de entrada, se for preciso, é trabalho separado.
 *
 * Recebe o cliente (o `db` ou a transação de quem chama) — é a mesma função para o `createPost` e para os
 * escritores crus do MCP local.
 */
import { temContratoSemantico } from './copy-segue-a-pagina'
import { aplicarValoresDoPost } from './aplicar-valores-do-post'
import { lerCamadas } from './page-layers'
import type { ErroDeValor } from '@/lib/semantica/resolver-valores'

export type CodigoDaAdmissao =
  | 'CONTRATO_SEM_PAGINA'
  | 'CONTRATO_COM_MIDIA_PRONTA'
  | 'CONTRATO_SEM_RENDER_DO_SERVIDOR'
  | 'PAGINA_NAO_ENCONTRADA'
  | 'CONTRATO_EM_PAGINA_DE_CONTEUDO'
  | 'PAGINA_ILEGIVEL'
  | 'CONTRATO_INVALIDO'

const MENSAGENS: Record<CodigoDaAdmissao, string> = {
  CONTRATO_SEM_PAGINA: 'O contrato semântico (_slots/_papeis) exige a página que o render vai usar (pageId).',
  CONTRATO_COM_MIDIA_PRONTA: 'O contrato semântico (_slots/_papeis) não aceita mídia pronta: a arte sai do render do servidor sobre a página.',
  CONTRATO_SEM_RENDER_DO_SERVIDOR: 'O contrato semântico (_slots/_papeis) só vale para STORY: é o único post que o servidor renderiza a partir da página.',
  PAGINA_NAO_ENCONTRADA: 'A página do contrato semântico não existe neste projeto.',
  CONTRATO_EM_PAGINA_DE_CONTEUDO: 'O contrato semântico (_slots/_papeis) só vale em página MODELO; numa página de conteúdo a página é a peça e ele seria ignorado.',
  PAGINA_ILEGIVEL: 'As camadas da página não puderam ser lidas; o contrato semântico não pode ser conferido.',
  CONTRATO_INVALIDO: 'O contrato semântico (_slots/_papeis) não casa com as camadas da página.',
}

/** Recusa estruturada: códigos e endereços, nunca o texto ou a URL pedidos. */
export class ErroAdmissaoSemantica extends Error {
  constructor(
    readonly codigo: CodigoDaAdmissao,
    readonly erros: ErroDeValor[] = [],
  ) {
    super(`${MENSAGENS[codigo]}${erros.length > 0 ? ` (${erros.map((e) => e.codigo).join(', ')})` : ''}`)
    this.name = 'ErroAdmissaoSemantica'
  }
}

export interface ClienteDeAdmissao {
  page: {
    findUnique(args: {
      where: { id: string }
      select: { isTemplate: true; layers: true; Template: { select: { projectId: true } } }
    }): Promise<{ isTemplate: boolean; layers: unknown; Template: { projectId: number } | null } | null>
  }
}

export interface PedidoDoPost {
  projectId: number
  postType: string
  pageId?: string | null
  /** As mídias que o post vai levar (as finais, inclusive as vindas de Generation). */
  mediaUrls?: readonly string[] | null
  slotValues: unknown
}

export async function admitirPedidoSemantico(client: ClienteDeAdmissao, pedido: PedidoDoPost): Promise<void> {
  if (!temContratoSemantico(pedido.slotValues)) return

  if (pedido.postType !== 'STORY') throw new ErroAdmissaoSemantica('CONTRATO_SEM_RENDER_DO_SERVIDOR')
  if (!pedido.pageId) throw new ErroAdmissaoSemantica('CONTRATO_SEM_PAGINA')
  if ((pedido.mediaUrls?.length ?? 0) > 0) throw new ErroAdmissaoSemantica('CONTRATO_COM_MIDIA_PRONTA')

  const pagina = await client.page.findUnique({
    where: { id: pedido.pageId },
    select: { isTemplate: true, layers: true, Template: { select: { projectId: true } } },
  })
  if (!pagina || pagina.Template?.projectId !== pedido.projectId) throw new ErroAdmissaoSemantica('PAGINA_NAO_ENCONTRADA')
  if (!pagina.isTemplate) throw new ErroAdmissaoSemantica('CONTRATO_EM_PAGINA_DE_CONTEUDO')

  const { camadas, legivel } = lerCamadas(pagina.layers)
  if (!legivel) throw new ErroAdmissaoSemantica('PAGINA_ILEGIVEL')

  const r = aplicarValoresDoPost(camadas as Array<{ id?: string; name?: string }>, pedido.slotValues as Record<string, unknown>)
  if (r.erros.length > 0) throw new ErroAdmissaoSemantica('CONTRATO_INVALIDO', r.erros)
}
