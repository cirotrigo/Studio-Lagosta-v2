/**
 * O "servidor" do harness do CP-V2d, no Node: atende TUDO da origem falsa `http://v2d.harness.test` por
 * `page.route`, guarda o estado fora do navegador (sobrevive ao `page.reload()`) e aborta qualquer outra URL,
 * registrando-a. O PATCH da página roda a mesma guarda e a mesma canonização da rota real e classifica cada escrita
 * pelo corpo: `camadas` (tem `layers`), `miniatura` (só `thumbnail`) ou `outra`.
 *
 * CP-V2e: atende também o `POST` multipart e o `DELETE` de elementos, com a resposta escolhida por controle
 * (`envio`, `exclusao`), e registra cada escrita (método, caminho, `content-type` e campos do multipart). O estado da
 * lista é a verdade: `criar` acrescenta o item, `ok` remove; as respostas de erro não mexem nela.
 */
import type { Page as Aba, Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { VetorInvalido } from '@/lib/vetor/validar-camada'
import { corpoDoVetorInvalido, exigirVetoresValidos } from '@/lib/vetor/guarda-de-porta'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'

export const ORIGEM = 'http://v2d.harness.test'

export type Resposta = { tipo: 'json'; corpo: unknown } | { tipo: 'html' } | { tipo: '500' }
export interface Projeto {
  cores: Resposta
  projeto: Resposta
  elementos: Resposta
}
/** Resposta do `POST /elements`: `criar` (201 com o item novo, servido em `/imagens/novo-{id}.png`) ou um controle. */
export type RespostaDoEnvio = 'criar' | 'html' | 'incompleto' | 'outro-projeto' | { status: number; corpo: string; tipo: 'json' | 'texto' }
/** Resposta do `DELETE /elements/{id}`: `ok` (200 `{success:true}` e remove) ou um controle (não remove). */
export type RespostaDaExclusao = 'ok' | 'html' | 'texto' | 'success-false' | '403' | '500'
export interface Escrita {
  metodo: string
  caminho: string
  contentType: string
  /** nomes dos campos do multipart, na ordem */
  campos: string[]
  /** valor do campo `name` do multipart */
  nome: string | null
}
export type ClasseDoPatch = 'camadas' | 'miniatura' | 'outra'
export interface Patch {
  pageId: string
  classe: ClasseDoPatch
  status: number
  layers?: unknown[]
}
export interface PaginaGravada {
  id: string
  name: string
  width: number
  height: number
  layers: unknown[]
  background: string | null
  order: number
  thumbnail: string | null
  templateId: number
  isTemplate: boolean
  templateName: string | null
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const json = (route: Route, corpo: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) })

export class ServidorFalso {
  projetos = new Map<number, Projeto>()
  /** templateId → páginas */
  paginas = new Map<number, PaginaGravada[]>()
  patches: Patch[] = []
  /** contagem de leituras por chave (`cores:8`, `projeto:8`, `elementos:8`, `paginas:101`) */
  leituras = new Map<string, number>()
  externas: string[] = []
  desconhecidas: string[] = []
  arquivos = new Map<string, { tipo: string; corpo: Buffer | string }>()
  escritas: Escrita[] = []
  /** projeto → fila de respostas do POST (a última se repete) */
  envio = new Map<number, RespostaDoEnvio[]>()
  /** projeto → fila de respostas do DELETE (a última se repete) */
  exclusao = new Map<number, RespostaDaExclusao[]>()
  /** bytes servidos para cada item criado pelo POST */
  imagemDoEnvio: Buffer = Buffer.alloc(0)
  private proximoId = 500
  private presas = new Map<string, { promessa: Promise<void>; soltar: () => void }>()

  /** A próxima leitura de `chave` (e as seguintes) espera até `soltar`. */
  segurar(chave: string) {
    let soltar = () => {}
    const promessa = new Promise<void>((r) => (soltar = r))
    this.presas.set(chave, { promessa, soltar })
  }
  soltar(chave: string) {
    this.presas.get(chave)?.soltar()
    this.presas.delete(chave)
  }

  escritasDe(metodo: 'POST' | 'DELETE') {
    return this.escritas.filter((e) => e.metodo === metodo)
  }

  patchesDesde(indice: number, classe?: ClasseDoPatch) {
    return this.patches.slice(indice).filter((p) => !classe || p.classe === classe)
  }

  async ligar(aba: Aba) {
    await aba.route('**/*', (route) => this.atender(route))
  }

  private contar(chave: string) {
    this.leituras.set(chave, (this.leituras.get(chave) ?? 0) + 1)
  }

  private async responder(route: Route, chave: string, r: Resposta) {
    this.contar(chave)
    await this.presas.get(chave)?.promessa
    if (r.tipo === '500') return json(route, { error: 'falha simulada' }, 500)
    if (r.tipo === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html><body>sign-in</body></html>' })
    return json(route, r.corpo)
  }

  private async atender(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    if (url.origin !== ORIGEM) {
      if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      this.externas.push(req.url())
      return route.abort()
    }
    const arquivo = this.arquivos.get(url.pathname)
    if (arquivo) return route.fulfill({ status: 200, contentType: arquivo.tipo, body: arquivo.corpo })

    const metodo = req.method()
    let m: RegExpMatchArray | null
    if ((m = url.pathname.match(/^\/api\/projects\/(\d+)\/elements$/)) && metodo === 'POST') return this.criarElemento(route, Number(m[1]))
    if ((m = url.pathname.match(/^\/api\/projects\/(\d+)\/elements\/(\d+)$/)) && metodo === 'DELETE') return this.apagarElemento(route, Number(m[1]), Number(m[2]))
    if ((m = url.pathname.match(/^\/api\/projects\/(\d+)\/(colors|elements|fonts|logos)$/)) && metodo === 'GET') {
      const id = Number(m[1])
      if (m[2] === 'fonts' || m[2] === 'logos') return json(route, [])
      const p = this.projetos.get(id)
      if (!p) return json(route, { error: 'projeto inexistente' }, 404)
      return this.responder(route, `${m[2] === 'colors' ? 'cores' : 'elementos'}:${id}`, m[2] === 'colors' ? p.cores : p.elementos)
    }
    if ((m = url.pathname.match(/^\/api\/projects\/(\d+)$/)) && metodo === 'GET') {
      const p = this.projetos.get(Number(m[1]))
      if (!p) return json(route, { error: 'projeto inexistente' }, 404)
      return this.responder(route, `projeto:${m[1]}`, p.projeto)
    }
    if ((m = url.pathname.match(/^\/api\/templates\/(\d+)\/pages$/)) && metodo === 'GET') {
      this.contar(`paginas:${m[1]}`)
      return json(route, clone(this.paginas.get(Number(m[1])) ?? []))
    }
    if ((m = url.pathname.match(/^\/api\/templates\/(\d+)\/pages\/([\w-]+)$/))) {
      const lista = this.paginas.get(Number(m[1])) ?? []
      const pagina = lista.find((p) => p.id === m![2])
      if (!pagina) return json(route, { error: 'página inexistente' }, 404)
      if (metodo === 'GET') return json(route, clone(pagina))
      if (metodo === 'PATCH') return this.gravar(route, pagina, JSON.parse(req.postData() ?? '{}'))
    }
    this.desconhecidas.push(`${metodo} ${url.pathname}`)
    return json(route, { error: 'rota fora do harness' }, 404)
  }

  private gravar(route: Route, pagina: PaginaGravada, corpo: Record<string, unknown>) {
    const chaves = Object.keys(corpo)
    const classe: ClasseDoPatch = 'layers' in corpo ? 'camadas' : chaves.length === 1 && chaves[0] === 'thumbnail' ? 'miniatura' : 'outra'
    if (corpo.layers !== undefined) {
      try {
        exigirVetoresValidos(corpo.layers)
      } catch (erro) {
        if (!(erro instanceof VetorInvalido)) throw erro
        this.patches.push({ pageId: pagina.id, classe, status: 422 })
        return json(route, corpoDoVetorInvalido(erro), 422)
      }
      pagina.layers = clone(canonicalizeLayersForPersistence(corpo.layers as never) as unknown[])
    }
    if (typeof corpo.thumbnail === 'string' || corpo.thumbnail === null) pagina.thumbnail = corpo.thumbnail as string | null
    for (const k of ['width', 'height', 'background'] as const) if (corpo[k] !== undefined) (pagina as unknown as Record<string, unknown>)[k] = corpo[k]
    this.patches.push({ pageId: pagina.id, classe, status: 200, ...(classe === 'camadas' ? { layers: clone(pagina.layers) } : {}) })
    return json(route, clone(pagina))
  }

  private proxima<T>(filas: Map<number, T[]>, projectId: number, padrao: T): T {
    const fila = filas.get(projectId)
    if (!fila || fila.length === 0) return padrao
    return fila.length > 1 ? fila.shift()! : fila[0]
  }

  private listaDe(projectId: number): Array<Record<string, unknown>> | null {
    const r = this.projetos.get(projectId)?.elementos
    return r?.tipo === 'json' && Array.isArray(r.corpo) ? (r.corpo as Array<Record<string, unknown>>) : null
  }

  private async criarElemento(route: Route, projectId: number) {
    const req = route.request()
    const contentType = req.headers()['content-type'] ?? ''
    const corpo = (req.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1')
    const campos = [...corpo.matchAll(/Content-Disposition: form-data; name="([^"]+)"/g)].map((x) => x[1])
    const nome = corpo.match(/name="name"\r\n\r\n([^\r]*)\r\n/)?.[1] ?? null
    this.escritas.push({ metodo: 'POST', caminho: new URL(req.url()).pathname, contentType, campos, nome })
    await this.presas.get(`post:${projectId}`)?.promessa
    const r = this.proxima(this.envio, projectId, 'criar' as RespostaDoEnvio)
    if (typeof r === 'object') return route.fulfill({ status: r.status, contentType: r.tipo === 'json' ? 'application/json' : 'text/plain', body: r.corpo })
    if (r === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html><body>sign-in</body></html>' })
    // POST JSON com `url` (a trilha da Identidade visual, depois do upload ao Blob): a rota real cria a linha com a URL
    if (contentType.startsWith('application/json')) {
      const pedido = JSON.parse(req.postData() ?? '{}') as { url?: unknown; name?: unknown }
      if (typeof pedido.url === 'string' && pedido.url) {
        this.escritas[this.escritas.length - 1].nome = typeof pedido.name === 'string' ? pedido.name : null
        const id = this.proximoId++
        const item = { id, name: typeof pedido.name === 'string' ? pedido.name : 'sem-nome', fileUrl: pedido.url, category: null, projectId, uploadedBy: 'harness', createdAt: '2026-10-23T00:00:00Z' }
        this.listaDe(projectId)?.unshift(item)
        return json(route, item, 201)
      }
    }
    // o servidor real só cria com multipart e com o arquivo; um corpo JSON sem `url` é recusado como lá
    if (!contentType.startsWith('multipart/form-data') || !campos.includes('file')) return json(route, { error: 'Nenhum arquivo enviado' }, 400)
    const id = this.proximoId++
    const item = { id, name: nome ?? 'sem-nome', fileUrl: `${ORIGEM}/imagens/novo-${id}.png`, category: null, projectId, uploadedBy: 'harness', createdAt: '2026-10-23T00:00:00Z' }
    if (r === 'incompleto') return json(route, { id }, 201)
    if (r === 'outro-projeto') return json(route, { ...item, projectId: projectId + 1000 }, 201)
    this.servirArquivo(`/imagens/novo-${id}.png`, 'image/png', this.imagemDoEnvio)
    this.listaDe(projectId)?.unshift(item)
    return json(route, item, 201)
  }

  private async apagarElemento(route: Route, projectId: number, elementId: number) {
    const req = route.request()
    this.escritas.push({ metodo: 'DELETE', caminho: new URL(req.url()).pathname, contentType: req.headers()['content-type'] ?? '', campos: [], nome: null })
    await this.presas.get(`delete:${projectId}`)?.promessa
    const r = this.proxima(this.exclusao, projectId, 'ok' as RespostaDaExclusao)
    if (r === '403') return json(route, { error: 'Não autorizado' }, 403)
    if (r === '500') return json(route, { error: 'falha simulada' }, 500)
    if (r === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html><body>sign-in</body></html>' })
    if (r === 'texto') return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' })
    if (r === 'success-false') return json(route, { success: false })
    const lista = this.listaDe(projectId)
    const i = lista?.findIndex((e) => e.id === elementId) ?? -1
    if (!lista || i < 0) return json(route, { error: 'Elemento não encontrado' }, 404)
    lista.splice(i, 1)
    return json(route, { success: true })
  }

  servirArquivo(caminho: string, tipo: string, origem: string | Buffer) {
    this.arquivos.set(caminho, { tipo, corpo: typeof origem === 'string' ? readFileSync(origem) : origem })
  }
}
