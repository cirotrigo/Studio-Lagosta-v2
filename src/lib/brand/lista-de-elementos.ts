/**
 * Leitores ESTRITOS das respostas de `/api/projects/{id}/elements` (CP-V2e). Puro: sem React e sem `@/lib/db`.
 *
 * Nenhuma resposta estranha vira "vazia" ou "sucesso": HTML 200 do login, texto, JSON que não é do formato, lista de
 * outro projeto e item incompleto LANÇAM. Um item malformado recusa a lista inteira (fail-closed, como a paleta
 * estrita do V2c): a Marca mostra erro com "Tentar de novo", nunca uma lista parcial que quebra ao inserir.
 */

export interface ProjectElement {
  id: number
  name: string
  fileUrl: string
  category: string | null
  projectId: number
}

export class ListaDeElementosInvalida extends Error {
  name = 'ListaDeElementosInvalida'
}

export class RespostaDeElementoInvalida extends Error {
  name = 'RespostaDeElementoInvalida'
}

const idSeguro = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0

/** O item como o endpoint grava, do projeto pedido; `null` quando qualquer campo falta ou é de outro tipo. */
function lerItem(v: unknown, projectId: number): ProjectElement | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (!idSeguro(o.id) || typeof o.name !== 'string') return null
  if (typeof o.fileUrl !== 'string' || !/^https?:\/\/\S+$/.test(o.fileUrl)) return null
  if (o.category !== null && typeof o.category !== 'string') return null
  if (!idSeguro(o.projectId) || o.projectId !== projectId) return null
  return { id: o.id, name: o.name, fileUrl: o.fileUrl, category: o.category as string | null, projectId: o.projectId }
}

/** Resposta do `GET`. */
export function lerListaDeElementos(dado: unknown, projectId: number): ProjectElement[] {
  if (!Array.isArray(dado)) throw new ListaDeElementosInvalida('A lista de elementos não veio como lista.')
  return dado.map((item, i) => {
    const lido = lerItem(item, projectId)
    if (!lido) throw new ListaDeElementosInvalida(`Elemento ${i} da lista é inválido ou de outro projeto.`)
    return lido
  })
}

/** Resposta do `POST` (201 com o elemento criado). */
export function lerElementoCriado(dado: unknown, projectId: number): ProjectElement {
  const lido = lerItem(dado, projectId)
  if (!lido) throw new RespostaDeElementoInvalida('O servidor não confirmou o elemento enviado.')
  return lido
}

/** Resposta do `DELETE`: só `{ success: true }` é sucesso. */
export function lerExclusaoConfirmada(dado: unknown): void {
  const ok = typeof dado === 'object' && dado !== null && !Array.isArray(dado) && (dado as { success?: unknown }).success === true
  if (!ok) throw new RespostaDeElementoInvalida('O servidor não confirmou a exclusão.')
}

/** As 3 query keys vivas que leem o endpoint (Marca/combinações, Identidade visual, modal de melhoria). */
export function chavesDosElementos(projectId: number) {
  return [
    ['project-elements', projectId],
    ['project-assets', projectId, 'elements'],
    ['project', projectId, 'elements'],
  ] as const
}

/**
 * Teto do arquivo no envio pelo editor (multipart pela função): 4 MiB, abaixo dos 4.5 MB de corpo da Vercel com
 * margem para o envelope multipart. Arquivo maior vai pela Identidade visual (upload direto ao Blob).
 */
export const TETO_DO_ENVIO = 4_194_304

const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const EXTENSOES_ACEITAS = /\.(png|jpe?g|webp|svg)$/i
export const ACCEPT_DO_ENVIO = [...TIPOS_ACEITOS, '.png', '.jpg', '.jpeg', '.webp', '.svg'].join(',')

/** Por que o arquivo não sai do navegador; `null` quando pode ir. Sem tipo do sistema (SVG em alguns SOs), vale a extensão. */
export function recusaDoArquivoNoEditor(file: { name: string; type: string; size: number }): string | null {
  const tipoOk = file.type ? TIPOS_ACEITOS.includes(file.type) : EXTENSOES_ACEITAS.test(file.name)
  if (!tipoOk) return 'formato não aceito (use PNG, JPEG, WebP ou SVG)'
  if (file.size > TETO_DO_ENVIO) return 'arquivo acima de 4 MB: envie pela Identidade visual'
  return null
}

/** Mensagem de um envio recusado pelo servidor. O 413 da plataforma pode não ser JSON. */
export function mensagemDoErroDeEnvio(status: number, texto: string): string {
  try {
    const erro = (JSON.parse(texto) as { error?: unknown }).error
    if (typeof erro === 'string' && erro) return erro
  } catch {
    // não é JSON: cai nas mensagens por status
  }
  if (status === 413) return 'Arquivo grande demais para enviar pelo editor: envie pela Identidade visual'
  return `Falha ao enviar (HTTP ${status})`
}
