/**
 * O "servidor" do harness do CP-V2d, no Node: atende TUDO da origem falsa `http://v2d.harness.test` por
 * `page.route`, guarda o estado fora do navegador (sobrevive ao `page.reload()`) e aborta qualquer outra URL,
 * registrando-a. O PATCH da página roda a mesma guarda e a mesma canonização da rota real e classifica cada escrita
 * pelo corpo: `camadas` (tem `layers`), `miniatura` (só `thumbnail`) ou `outra`.
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
    if ((m = url.pathname.match(/^\/api\/projects\/(\d+)\/(colors|elements|fonts)$/)) && metodo === 'GET') {
      const id = Number(m[1])
      if (m[2] === 'fonts') return json(route, [])
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

  servirArquivo(caminho: string, tipo: string, origem: string | Buffer) {
    this.arquivos.set(caminho, { tipo, corpo: typeof origem === 'string' ? readFileSync(origem) : origem })
  }
}
