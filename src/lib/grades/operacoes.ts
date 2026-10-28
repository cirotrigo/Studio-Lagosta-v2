/**
 * Operações puras da grade (§3.3–§4 do plano). Cada uma devolve o resultado INTEIRO (já conferido por
 * `conferirGrade`) ou só diagnóstico — nada pela metade. Entradas nunca são mutadas: as saídas são cópias.
 * Ids novos são sempre recebidos do chamador; este módulo não gera id, não lê env, não toca rede.
 */
import type { BorderStyle, Layer, LayerStyle } from '@/types/template'
import { cropForResizedBox, currentSourceRect, resolveImageSourceRect } from '@/lib/image-fit'
import { CATALOGO_DE_GRADES, VERSAO_DO_CATALOGO, layoutDoCatalogo, type LayoutDeGrade } from './catalogo'
import { IDS_RESERVADOS, conferirCelulaIsolada, conferirGrade, celulaVazia, metadadoDeGrade, urlAceita } from './conferir'
import { TOLERANCIA_PX, caixaValida, celulasDaGrade, espacamentoInicial, ordemDeLeitura, raioDaCelula } from './geometria'
import { deu, falhou, type OpcoesDeUrl, type Diagnostico, type MetadadoDeGrade, type Resultado, type Retangulo } from './tipos'

export { HOSTS_DO_BLOB_PROPRIO, urlDeBlobProprio } from './conferir'

const invalida = (mensagem: string) => falhou([{ codigo: 'ENTRADA_INVALIDA', mensagem }])
const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const nomeDaCelula = (i: number) => `Grade · foto ${i + 1}`
const copiaDaCaixa = (c: Retangulo): Retangulo => ({ x: c.x, y: c.y, w: c.w, h: c.h })
/** Sem `width` de propósito: raio + borda não têm paridade editor × servidor */
const bordaSoDeRaio = (base: unknown, radius: number) => ({ ...(base as object), radius }) as BorderStyle

/**
 * O recorte que editor e servidor DESENHAM (`resolveImageSourceRect`, com o piso de 0,01 do recorte manual) tem a
 * proporção da caixa, ± 0,5 px na largura. As frações cruas não bastam: abaixo do piso o desenho estica.
 */
function recorteEfetivoCabe(nat: { width: number; height: number }, caixa: { width: number; height: number }, style: LayerStyle | undefined) {
  const f = currentSourceRect(nat, caixa, style)
  if (![f.cropX, f.cropY, f.cropWidth, f.cropHeight].every(finito) || f.cropWidth <= 0 || f.cropHeight <= 0) return false
  return Math.abs((f.cropWidth / f.cropHeight) * caixa.height - caixa.width) <= 0.5
}

/**
 * O resolver desenha EXATAMENTE o retângulo-fonte que o recorte pede (x, y, largura e altura, ± TOLERANCIA_PX em px da
 * foto)? O piso de 0,01 do recorte manual muda escala e centro sem mudar a proporção (fonte de 4,17 px vira 10 px), e
 * o limite `1 − x` faz o contrário na borda direita/inferior (lá a fonte abaixo de 1% é desenhada fiel). Por isso a
 * conferência é do retângulo inteiro, nunca uma regra de largura mínima.
 */
function recorteDesenhadoComoPedido(nat: { width: number; height: number }, caixa: { width: number; height: number }, style: LayerStyle) {
  const crop = style.crop
  const f = resolveImageSourceRect(nat, caixa, style)
  if (!crop || !f) return false
  const pedido = [crop.x * nat.width, crop.y * nat.height, crop.width * nat.width, crop.height * nat.height]
  return [f.cropX, f.cropY, f.cropWidth, f.cropHeight].every((v, i) => Math.abs(v - pedido[i]) <= TOLERANCIA_PX)
}

function idsInvalidos(ids: unknown, quantos: number, ocupados: ReadonlySet<string>): string | undefined {
  if (!Array.isArray(ids) || ids.length < quantos) return `São necessários ${quantos} ids novos.`
  const usados = ids.slice(0, quantos)
  if (usados.some((id) => typeof id !== 'string' || !id)) return 'Id vazio.'
  if (usados.some((id) => IDS_RESERVADOS.has(id))) return 'Ids bg-foto/bg-img são reservados.'
  if (new Set(usados).size !== usados.length || usados.some((id) => ocupados.has(id))) return 'Ids repetidos.'
  return undefined
}

/**
 * Fábrica: N células vazias ocupando `caixa`, com ids injetados. `order` sai 0..N−1; a posição na pilha da
 * página (abaixo de textos, logo e elementos) é decisão de quem insere (G1).
 */
export function criarGrade(p: {
  layout: string
  caixa: Retangulo
  espacamento?: number
  raio?: number
  idDaGrade: string
  idsDasCelulas: string[]
}): Resultado<Layer[]> {
  const layout = layoutDoCatalogo(p.layout, VERSAO_DO_CATALOGO)
  if (!layout) return falhou([{ codigo: 'GRADE_DESCONHECIDA', mensagem: `Layout "${String(p.layout)}" fora do catálogo.` }])
  if (typeof p.idDaGrade !== 'string' || !p.idDaGrade) return invalida('Id da grade vazio.')
  const n = layout.celulas.length
  if (!Array.isArray(p.idsDasCelulas) || p.idsDasCelulas.length !== n) return invalida(`O layout tem ${n} células.`)
  const erroDeId = idsInvalidos(p.idsDasCelulas, n, new Set())
  if (erroDeId) return invalida(erroDeId)
  const raio = p.raio ?? 0
  if (!finito(raio)) return invalida('Raio não finito.')
  const geo = celulasDaGrade(layout, p.caixa, p.espacamento ?? espacamentoInicial(layout))
  if (!geo.ok) return falhou(geo.diagnosticos)

  const camadas = geo.valor.celulas.map(
    (c, i): Layer => ({
      id: p.idsDasCelulas[i],
      type: 'image',
      name: nomeDaCelula(i),
      visible: true,
      locked: false,
      order: i,
      position: { x: c.x, y: c.y },
      size: { width: c.w, height: c.h },
      rotation: 0,
      fileUrl: '',
      style: { objectFit: 'cover', border: bordaSoDeRaio(undefined, raioDaCelula(raio, c)) },
      metadata: {
        grade: {
          id: p.idDaGrade,
          layout: layout.id,
          versao: layout.versao,
          celula: i,
          espacamento: geo.valor.espacamento,
          raio: Math.max(0, raio),
          caixa: copiaDaCaixa(p.caixa),
        } satisfies MetadadoDeGrade,
        groupId: p.idDaGrade,
      },
    }),
  )
  const d = conferirGrade(camadas)
  return d.length ? falhou(d) : deu(camadas)
}

/**
 * ÚNICO caminho de foto para célula: grava `fileUrl`, escreve `objectFit: 'cover'` e LIMPA `crop` (o recorte da
 * foto anterior deformaria uma foto de outra proporção). URL só de host próprio exato
 * (`HOSTS_DO_BLOB_PROPRIO` ou a lista explícita `opcoes.hostsProprios`).
 */
export function preencherCelula(camada: Layer, url: string, opcoes: OpcoesDeUrl = {}): Resultado<Layer> {
  if (!metadadoDeGrade(camada)) {
    return falhou([{ codigo: 'CELULA_FORA_DE_GRADE', mensagem: 'A camada não é célula de grade.', camadaId: camada.id }])
  }
  if (camada.rotation !== undefined && camada.rotation !== 0) {
    return falhou([{ codigo: 'GRADE_GIRADA', mensagem: 'Célula girada: desvincule da grade antes.', camadaId: camada.id }])
  }
  if (!urlAceita(url, opcoes)) {
    return falhou([{ codigo: 'URL_INVALIDA', mensagem: 'Foto de célula só de host próprio (nunca data:, blob: ou lh3).', camadaId: camada.id }])
  }
  const saida = structuredClone(camada)
  saida.fileUrl = url
  const style: LayerStyle = { ...saida.style, objectFit: 'cover' }
  delete style.crop
  saida.style = style
  const d = conferirCelulaIsolada(saida, opcoes)
  return d.length ? falhou(d) : deu(saida)
}

export interface MudancaDeGrade {
  espacamento?: number
  raio?: number
  caixa?: Retangulo
  layout?: string
}

const CHAVES_DA_MUDANCA = new Set(['espacamento', 'raio', 'caixa', 'layout'])

/**
 * Recalcula a grade inteira quando muda espaçamento, raio, caixa ou layout.
 *
 * `dimensoes`: dimensões naturais por URL EXATA de cada foto da grade. Contrato: o chamador as confere com
 * `dimensoesDaFotoCarregada` (image-fit) — a corrida do `use-image` entrega a imagem de outra URL. Foto sem medida
 * válida ⇒ FOTO_SEM_MEDIDA e nada é aplicado. Célula vazia (`''` ou ausente) não precisa de medida.
 *
 * Enquadramento: caixa de tamanho igual mantém o `crop` como está; tamanho novo passa por `cropForResizedBox`
 * (mesma escala, mesmo centro). Recorte que já não mostra área nenhuma (ex.: `x = 1`) ⇒ RECORTE_DEGENERADO, nunca
 * apagado nem esticado. O recorte EFETIVO (o desenhado, com o piso de 0,01 do `image-fit`) precisa ter a proporção da
 * caixa, antes e depois; e o recorte RECALCULADO precisa ser desenhado exatamente como o `cropForResizedBox` o pediu
 * (posição e tamanho da fonte). Se não for ⇒ RECORTE_NAO_REPRESENTAVEL e nada é aplicado. Caixa de mesmo tamanho
 * (só mover ou raio) mantém o recorte e, com ele, o desenho idêntico.
 *
 * Mesmo layout: cada célula fica no seu índice. Layout novo: as FOTOS entram compactadas em ordem de leitura; as
 * que sobram saem em `avulsas` (sem `grade` e sem `groupId`, posição e recorte intactos), nunca apagadas; células
 * vazias que sobram somem (não há foto nelas). Faltando célula, os ids vêm de `opcoes.idsNovos`.
 */
export function refazerGrade(
  camadas: ReadonlyArray<Layer>,
  mudanca: MudancaDeGrade,
  dimensoes: ReadonlyMap<string, { width: number; height: number }>,
  opcoes: OpcoesDeUrl & { idsNovos?: string[] } = {},
): Resultado<{ celulas: Layer[]; avulsas: Layer[]; espacamento: number }> {
  if (!Array.isArray(camadas) || camadas.length === 0) return invalida('Nenhuma célula.')
  const metas = camadas.map(metadadoDeGrade)
  const gradeId = metas[0]?.id
  if (!gradeId || metas.some((m) => !m || m.id !== gradeId)) return invalida('A entrada precisa ser exatamente as células de UMA grade.')
  const diagEntrada = conferirGrade(camadas, opcoes)
  if (diagEntrada.length) return falhou(diagEntrada)

  if (!mudanca || typeof mudanca !== 'object' || Object.keys(mudanca).some((k) => !CHAVES_DA_MUDANCA.has(k))) {
    return invalida(`Mudança aceita só ${[...CHAVES_DA_MUDANCA].join(', ')}.`)
  }
  if (mudanca.espacamento !== undefined && !finito(mudanca.espacamento)) return invalida('Espaçamento não finito.')
  if (mudanca.raio !== undefined && !finito(mudanca.raio)) return invalida('Raio não finito.')
  if (mudanca.caixa !== undefined && !caixaValida(mudanca.caixa)) return invalida('Caixa com valor não finito ou lado ≤ 0.')

  const atual = metas[0]!
  const layoutAtual = layoutDoCatalogo(atual.layout, atual.versao) as LayoutDeGrade
  let layout = layoutAtual
  if (mudanca.layout !== undefined && mudanca.layout !== atual.layout) {
    const novo = CATALOGO_DE_GRADES.find((l) => l.id === mudanca.layout && l.versao === VERSAO_DO_CATALOGO)
    if (!novo) return falhou([{ codigo: 'GRADE_DESCONHECIDA', mensagem: `Layout "${String(mudanca.layout)}" fora do catálogo.`, gradeId }])
    layout = novo
  }
  const caixa = copiaDaCaixa(mudanca.caixa ?? atual.caixa)
  const raio = Math.max(0, mudanca.raio ?? atual.raio)
  const geo = celulasDaGrade(layout, caixa, mudanca.espacamento ?? atual.espacamento)
  if (!geo.ok) return falhou(geo.diagnosticos.map((d) => ({ ...d, gradeId })))

  // Medidas e recortes: confere tudo antes de montar qualquer célula
  const naturais = new Map<string, { width: number; height: number }>()
  const diag: Diagnostico[] = []
  for (const c of camadas) {
    if (celulaVazia(c.fileUrl)) continue
    const url = c.fileUrl as string
    const nat = dimensoes.get(url)
    if (!nat || !finito(nat.width) || !finito(nat.height) || nat.width <= 0 || nat.height <= 0) {
      diag.push({ codigo: 'FOTO_SEM_MEDIDA', mensagem: 'Foto sem dimensão natural conferida para a URL exata.', gradeId, camadaId: c.id })
      continue
    }
    naturais.set(c.id, { width: nat.width, height: nat.height })
    const crop = c.style?.crop
    const cropRuim =
      crop !== undefined &&
      (!crop || ![crop.x, crop.y, crop.width, crop.height].every(finito) || crop.width <= 0 || crop.height <= 0)
    const fonte = cropRuim ? undefined : currentSourceRect(nat, { width: c.size.width, height: c.size.height }, c.style)
    if (!fonte || !(fonte.cropWidth > 0) || !(fonte.cropHeight > 0) || ![fonte.cropX, fonte.cropY].every(finito)) {
      diag.push({ codigo: 'RECORTE_DEGENERADO', mensagem: 'O recorte atual não mostra área da foto.', gradeId, camadaId: c.id })
    } else if (!recorteEfetivoCabe(nat, { width: c.size.width, height: c.size.height }, c.style)) {
      diag.push({ codigo: 'RECORTE_NAO_REPRESENTAVEL', mensagem: 'O recorte atual já não tem a proporção da célula (a foto aparece esticada).', gradeId, camadaId: c.id })
    }
  }
  if (diag.length) return falhou(diag)

  // Quem vai para qual célula
  const emLeitura = ordemDeLeitura(camadas.map((c) => c.position)).map((i) => camadas[i])
  const n = geo.valor.celulas.length
  let destino: Array<Layer | undefined>
  let avulsasDeOrigem: Layer[] = []
  if (layout === layoutAtual) {
    destino = Array.from({ length: n }, (_, i) => camadas.find((c, j) => metas[j]!.celula === i))
  } else {
    const fotos = emLeitura.filter((c) => !celulaVazia(c.fileUrl))
    const vazias = emLeitura.filter((c) => celulaVazia(c.fileUrl))
    destino = [...fotos.slice(0, n), ...vazias].slice(0, n)
    avulsasDeOrigem = fotos.slice(n)
  }
  const faltam = n - destino.length
  if (faltam > 0) {
    const erro = idsInvalidos(opcoes.idsNovos, faltam, new Set(camadas.map((c) => c.id)))
    if (erro) return invalida(erro)
  }
  const proximaOrdem = Math.max(...camadas.map((c) => (finito(c.order) ? c.order : 0))) + 1

  const celulas: Layer[] = []
  for (let k = 0; k < n; k++) {
    const caixaK = geo.valor.celulas[k]
    const origem = destino[k]
    const nova: Layer = origem
      ? structuredClone(origem)
      : { id: opcoes.idsNovos![k - destino.length], type: 'image', name: '', visible: true, locked: false, order: proximaOrdem + k - destino.length, position: { x: 0, y: 0 }, size: { width: 0, height: 0 }, fileUrl: '' }
    const style: LayerStyle = { ...nova.style, objectFit: 'cover', border: bordaSoDeRaio(nova.style?.border, raioDaCelula(raio, caixaK)) }
    const nat = origem && naturais.get(origem.id)
    if (!nat) {
      delete style.crop
    } else {
      const antes = { width: origem.size.width, height: origem.size.height }
      const depois = { width: caixaK.w, height: caixaK.h }
      const mesmoTamanho = Math.abs(antes.width - depois.width) <= TOLERANCIA_PX && Math.abs(antes.height - depois.height) <= TOLERANCIA_PX
      if (!mesmoTamanho) {
        const crop = cropForResizedBox(nat, antes, depois, origem.style)
        if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(finito) || crop.width <= 0 || crop.height <= 0) {
          return falhou([{ codigo: 'RECORTE_DEGENERADO', mensagem: 'Não foi possível recalcular o recorte.', gradeId, camadaId: origem.id }])
        }
        style.crop = crop
        if (!recorteDesenhadoComoPedido(nat, depois, style)) {
          return falhou([
            { codigo: 'RECORTE_NAO_REPRESENTAVEL', mensagem: 'O enquadramento recalculado não seria desenhado como pedido (limite de 1% do recorte manual): escala e centro mudariam.', gradeId, camadaId: origem.id },
          ])
        }
      }
      if (!recorteEfetivoCabe(nat, { width: caixaK.w, height: caixaK.h }, style)) {
        return falhou([
          { codigo: 'RECORTE_NAO_REPRESENTAVEL', mensagem: 'O enquadramento não cabe na célula nova sem esticar a foto (recorte abaixo do mínimo de 1%).', gradeId, camadaId: origem.id },
        ])
      }
    }
    nova.style = style
    nova.name = nomeDaCelula(k)
    nova.rotation = 0
    nova.position = { x: caixaK.x, y: caixaK.y }
    nova.size = { width: caixaK.w, height: caixaK.h }
    nova.metadata = {
      ...nova.metadata,
      grade: { id: gradeId, layout: layout.id, versao: layout.versao, celula: k, espacamento: geo.valor.espacamento, raio, caixa: copiaDaCaixa(caixa) } satisfies MetadadoDeGrade,
      groupId: gradeId,
    }
    celulas.push(nova)
  }

  const avulsas = avulsasDeOrigem.map((c) => {
    const solta = structuredClone(c)
    const metadata = { ...solta.metadata }
    delete metadata.grade
    delete metadata.groupId
    solta.metadata = metadata
    return solta
  })

  const d = conferirGrade([...celulas, ...avulsas], opcoes)
  return d.length ? falhou(d) : deu({ celulas, avulsas, espacamento: geo.valor.espacamento })
}
