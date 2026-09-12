/**
 * O EXECUTOR dos ajustes do revisor — o que `ajustar-arte` roda quando recebe
 * `ajustes` (11/09/2026).
 *
 * Cada ajuste é aplicado em ordem sobre as camadas da página, e o que não
 * pode ser aplicado é RECUSADO com o motivo (camada inexistente, tipo errado),
 * nunca aplicado pela metade. Os cuidados, quase todos vindos da revisão
 * adversarial do Codex sobre a primeira versão:
 *
 *  - **O delta de altura é medido pelo MESMO medidor dos dois lados** (antes e
 *    depois da mudança). A altura gravada pode ter vindo do editor; comparar a
 *    medida nova com ela deslocaria a pilha pela diferença entre os medidores,
 *    não pela mudança pedida.
 *  - **A pilha acompanha quem está abaixo NA MESMA COLUNA**, inteiramente abaixo
 *    ou encaixado (a voz 2 que entra na linha de cima): colunas lado a lado não
 *    se empurram, e o encaixe de desenho sobrevive ao corpo novo.
 *  - **O elemento acompanha o SEU texto**: pelo vínculo que o compositor grava
 *    (`metadata.compositor.elementoDe`, com `lado` e `eixo`) ou, sem ele, pelo
 *    texto ao lado mais próximo — nunca a soma dos deltas de todos os textos da
 *    faixa. O grupo da metade de baixo mantém a BASE.
 *  - **A entrelinha mora em dois campos** (`style.lineHeight` e
 *    `textboxConfig.autoWrap.lineHeight`, que o render prefere): quando
 *    `autoWrap` existe, os dois são escritos. O encaixe da voz 2
 *    (`metadata.compositor.encaixe`) escala com o corpo.
 *  - **Gradiente se aponta pelo id.** Sem id, só o gradiente de LEITURA da borda
 *    é alterado; um gradiente desenhado à mão só muda quando o ajuste o aponta —
 *    senão uma proposta de criar gradiente enfraquecia o da equipe. A força muda
 *    por `comForca` (paradas + metadados); o gradiente novo entra logo acima da
 *    foto de fundo VISÍVEL.
 *
 * Módulo PURO: o medidor de altura vem de fora (o do servidor em produção, um
 * falso nos testes).
 */

import type { Layer } from '@/types/template'
import { comVisibilidadeDoRevisor } from './oculta-pelo-revisor'
import type { MeasureLayerHeight } from '@/lib/combo-stack-reflow'
import {
  bordaDaCamadaDeGradiente,
  camadaDeGradiente,
  comForca,
  CURVA_DE_LEITURA,
  ehGradienteDeLeitura,
  forcaDaCamada,
  type Borda,
  type CurvaDoGradiente,
} from '@/lib/compositor/gradiente-de-leitura'
import { problemaDoAjuste, type Ajuste } from './contrato'

export interface AjusteAplicado {
  indice: number
  tipo: Ajuste['tipo']
  camadas: string[]
  detalhe: string
}

export interface AjusteRecusado {
  indice: number
  tipo: string
  motivo: string
}

export interface ResultadoDosAjustes {
  camadas: Layer[]
  aplicados: AjusteAplicado[]
  recusados: AjusteRecusado[]
  /** Camadas de texto cujo corpo, caixa ou entrelinha mudou — o autofix confere essas. */
  alteradas: string[]
}

interface Canvas {
  width: number
  height: number
}

const ehTexto = (l: Layer) => l.type === 'text' || l.type === 'rich-text'
const ehGradiente = (l: Layer) => l.type === 'gradient' || l.type === 'gradient2'

function grupoDe(l: Layer | undefined): string | null {
  const g = l?.metadata?.groupId
  return typeof g === 'string' && g ? g : null
}

/** O vínculo que o compositor grava no elemento preso a um texto. */
function vinculoDoElemento(l: Layer): { dono: string; lado: string | null; eixo: string | null } | null {
  const c = (l.metadata as { compositor?: { elementoDe?: unknown; lado?: unknown; eixo?: unknown } } | undefined)?.compositor
  if (!c || typeof c.elementoDe !== 'string' || !c.elementoDe) return null
  return { dono: c.elementoDe, lado: typeof c.lado === 'string' ? c.lado : null, eixo: typeof c.eixo === 'string' ? c.eixo : null }
}

/** A borda de um gradiente: a gravada pelo compositor, a lida pelas paradas, ou a posição. */
export function bordaDaLeitura(l: Layer, H: number): Borda {
  const b = l.metadata?.borda
  if (b === 'topo' || b === 'rodape') return b
  return bordaDaCamadaDeGradiente(l) ?? ((l.position?.y ?? 0) <= 1 && (l.size?.height ?? 0) < H ? 'topo' : 'rodape')
}

function corDoGradiente(l: Layer | undefined): string | null {
  const stops = (l?.style as { gradientStops?: Array<{ color?: string }> } | undefined)?.gradientStops ?? []
  const cor = stops.find((s) => typeof s.color === 'string')?.color
  return typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : null
}

function sobreposicaoHorizontal(l: Layer, x0: number, x1: number): number {
  return Math.min(l.position.x + l.size.width, x1) - Math.max(l.position.x, x0)
}

function distanciaHorizontal(a: Layer, b: Layer): number {
  return Math.max(0, b.position.x - (a.position.x + a.size.width), a.position.x - (b.position.x + b.size.width))
}

function caixaDe(camadas: Layer[]): { topo: number; base: number } {
  let topo = Infinity
  let base = -Infinity
  for (const l of camadas) {
    topo = Math.min(topo, l.position?.y ?? 0)
    base = Math.max(base, (l.position?.y ?? 0) + (l.size?.height ?? 0))
  }
  return { topo, base }
}

/**
 * Troca os textos alterados (com a altura nova) e refaz a pilha dos grupos
 * tocados. Texto solto da metade de baixo mantém a base.
 */
function refluir(camadas: Layer[], novas: Map<string, Layer>, canvas: Canvas): Layer[] {
  const antesPorId = new Map(camadas.map((l) => [l.id, l]))
  let resultado = camadas.map((l) => novas.get(l.id) ?? l)
  const H = canvas.height

  const grupos = new Set(
    [...novas.keys()].map((id) => grupoDe(antesPorId.get(id))).filter((g): g is string => !!g),
  )
  for (const grupo of grupos) {
    const membros = camadas.filter((l) => grupoDe(l) === grupo)
    const textos = membros.filter(ehTexto)
    const deltas = membros
      .filter((l) => novas.has(l.id))
      .map((l) => ({
        id: l.id,
        x0: l.position.x,
        x1: l.position.x + l.size.width,
        topo: l.position.y,
        base: l.position.y + l.size.height,
        diff: novas.get(l.id)!.size.height - l.size.height,
      }))
      .filter((d) => Math.abs(d.diff) >= 0.5)
    const deltaDe = new Map(deltas.map((d) => [d.id, d]))

    /** Quanto um membro desce porque textos ACIMA dele, na mesma coluna, mudaram de altura. */
    const empurrao = (m: Layer): number => {
      let dy = 0
      for (const d of deltas) {
        if (d.id === m.id) continue
        // Só a MESMA COLUNA empurra: um texto abaixo mas noutra coluna (o
        // serviço à direita, a manchete à esquerda) não desce porque a manchete
        // mudou de altura. Achado REV-01 da revisão do Codex (12/09/2026).
        const mesmaColuna = sobreposicaoHorizontal(m, d.x0, d.x1) > 0
        const inteiramenteAbaixo = m.position.y >= d.base - 0.5 && mesmaColuna
        const encaixadoAbaixo = m.position.y > d.topo + 0.5 && mesmaColuna
        if (inteiramenteAbaixo || encaixadoAbaixo) dy += d.diff
      }
      return dy
    }

    const depois = membros.map((m) => {
      const nova = novas.get(m.id) ?? m
      let dy: number
      const vinculo = ehTexto(m) ? null : vinculoDoElemento(m)
      const dono = vinculo ? antesPorId.get(vinculo.dono) : undefined
      if (vinculo && dono && grupoDe(dono) === grupo) {
        const d = deltaDe.get(dono.id)
        const parte = !d
          ? 0
          : vinculo.lado === 'abaixo'
            ? d.diff
            : vinculo.lado === 'acima'
              ? 0
              : vinculo.eixo === 'inicio'
                ? 0
                : vinculo.eixo === 'fim'
                  ? d.diff
                  : d.diff / 2
        dy = empurrao(dono) + parte
      } else if (!ehTexto(m)) {
        const centro = m.position.y + m.size.height / 2
        const aoLado = textos
          .filter(
            (t) =>
              centro > t.position.y &&
              centro < t.position.y + t.size.height &&
              sobreposicaoHorizontal(m, t.position.x, t.position.x + t.size.width) <= 0,
          )
          .sort((a, b) => distanciaHorizontal(m, a) - distanciaHorizontal(m, b))[0]
        if (aoLado) {
          const d = deltaDe.get(aoLado.id)
          dy = empurrao(aoLado) + (d ? d.diff / 2 : 0)
        } else {
          dy = empurrao(m)
        }
      } else {
        dy = empurrao(m)
      }
      return { ...nova, position: { ...nova.position, y: nova.position.y + dy } }
    })

    const antes = caixaDe(membros)
    const agora = caixaDe(depois)
    const naMetadeDeBaixo = (antes.topo + antes.base) / 2 >= H / 2
    const correcao = naMetadeDeBaixo ? antes.base - agora.base : 0
    const finais = new Map(
      depois.map((m) => [m.id, { ...m, position: { x: m.position.x, y: Math.round(m.position.y + correcao) } }]),
    )
    resultado = resultado.map((l) => finais.get(l.id) ?? l)
  }

  for (const [id, nova] of novas) {
    const antes = antesPorId.get(id)!
    if (grupoDe(antes)) continue
    const diff = nova.size.height - antes.size.height
    const naMetadeDeBaixo = antes.position.y + antes.size.height / 2 >= H / 2
    if (naMetadeDeBaixo && Math.abs(diff) >= 0.5) {
      resultado = resultado.map((l) =>
        l.id === id ? { ...l, position: { ...l.position, y: Math.round(antes.position.y - diff) } } : l,
      )
    }
  }
  return resultado
}

/**
 * Põe a camada nova logo acima da foto de fundo VISÍVEL que fica abaixo dos
 * textos (ou no fundo da pilha) e renumera a ordem. `bg-foto` escondido com
 * outra foto por cima deixaria o gradiente coberto.
 */
function inserirAcimaDoFundo(camadas: Layer[], nova: Layer, canvas: Canvas): Layer[] {
  const ordenadas = camadas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.order ?? a.i) - (b.l.order ?? b.i) || a.i - b.i)
    .map(({ l }) => l)
  const primeiroTexto = ordenadas.findIndex(ehTexto)
  let fundo = -1
  ordenadas.forEach((l, i) => {
    if (primeiroTexto >= 0 && i >= primeiroTexto) return
    const cobre =
      l.id === 'bg-foto' ||
      ((l.type === 'image' || l.type === 'video') &&
        (l.size?.width ?? 0) >= canvas.width * 0.9 &&
        (l.size?.height ?? 0) >= canvas.height * 0.9)
    if (cobre && l.visible !== false) fundo = i
  })
  ordenadas.splice(fundo + 1, 0, nova)
  return ordenadas.map((l, order) => ({ ...l, order }))
}

export function aplicarAjustes(
  entrada: Layer[],
  ajustes: Ajuste[],
  ctx: { canvas: Canvas; medir: MeasureLayerHeight },
): ResultadoDosAjustes {
  let camadas = entrada
  const aplicados: AjusteAplicado[] = []
  const recusados: AjusteRecusado[] = []
  const alteradas = new Set<string>()
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  // O medidor do servidor só mede `text`; o rich text é medido como texto
  // simples do mesmo corpo e entrelinha — a mesma aproximação do compositor.
  const medirTexto = (l: Layer) => ctx.medir(l.type === 'rich-text' ? ({ ...l, type: 'text' } as Layer) : l)

  ajustes.forEach((a, indice) => {
    const problema = problemaDoAjuste(a)
    if (problema) {
      recusados.push({ indice, tipo: String(a.tipo), motivo: problema })
      return
    }
    const porId = new Map(camadas.map((l) => [l.id, l]))
    const ids = a.camadas ?? []
    const faltando = ids.filter((id) => !porId.has(id))
    if (faltando.length > 0) {
      recusados.push({ indice, tipo: a.tipo, motivo: `camada inexistente na página: ${faltando.join(', ')}` })
      return
    }

    switch (a.tipo) {
      case 'fonte': {
        const alvos = ids.map((id) => porId.get(id)!)
        const naoTexto = alvos.filter((l) => !ehTexto(l))
        if (naoTexto.length > 0) {
          recusados.push({ indice, tipo: a.tipo, motivo: `fonte só vale para texto: ${naoTexto.map((l) => l.id).join(', ')}` })
          return
        }
        const novas = new Map<string, Layer>()
        const partes: string[] = []
        for (const l of alvos) {
          const corpo = typeof l.style?.fontSize === 'number' ? l.style.fontSize : 16
          const pedido = a.fontSize != null ? a.fontSize : a.escala != null ? corpo * a.escala : corpo
          const final = Math.max(8, Math.min(600, Math.round(pedido)))
          const razao = final / corpo
          const alturaAntes = medirTexto(l)
          let nova: Layer = { ...l, style: { ...(l.style ?? {}), fontSize: final } }
          if (l.type === 'rich-text' && Array.isArray(l.richTextStyles) && razao !== 1) {
            nova.richTextStyles = l.richTextStyles.map((s) =>
              typeof s.fontSize === 'number' ? { ...s, fontSize: Math.round(s.fontSize * razao) } : s,
            )
          }
          if (a.entrelinha != null) {
            nova = { ...nova, style: { ...nova.style, lineHeight: a.entrelinha } }
            if (l.textboxConfig?.autoWrap) {
              nova.textboxConfig = {
                ...l.textboxConfig,
                autoWrap: { ...l.textboxConfig.autoWrap, lineHeight: a.entrelinha },
              }
            }
          }
          const compositor = (l.metadata as { compositor?: { encaixe?: unknown } } | undefined)?.compositor
          if (compositor && typeof compositor.encaixe === 'number' && razao !== 1) {
            nova.metadata = { ...l.metadata, compositor: { ...compositor, encaixe: Math.round(compositor.encaixe * razao) } }
          }
          const alturaDepois = medirTexto(nova)
          if (alturaDepois != null) {
            const altura = alturaAntes != null ? l.size.height + (alturaDepois - alturaAntes) : alturaDepois
            nova = { ...nova, size: { ...nova.size, height: Math.max(1, Math.round(altura)) } }
          }
          novas.set(l.id, nova)
          alteradas.add(l.id)
          partes.push(`${l.name || l.id}: ${corpo}→${final}px${a.entrelinha != null ? `, entrelinha ${a.entrelinha}` : ''}`)
        }
        camadas = refluir(camadas, novas, ctx.canvas)
        aplicados.push({ indice, tipo: a.tipo, camadas: ids, detalhe: partes.join('; ') })
        return
      }

      case 'mover': {
        const dx = Math.round(a.dx ?? 0)
        const dy = Math.round(a.dy ?? 0)
        const mover = new Set(ids)
        camadas = camadas.map((l) =>
          mover.has(l.id) ? { ...l, position: { x: Math.round(l.position.x + dx), y: Math.round(l.position.y + dy) } } : l,
        )
        aplicados.push({ indice, tipo: a.tipo, camadas: ids, detalhe: `deslocadas ${dx}px na horizontal e ${dy}px na vertical` })
        return
      }

      case 'gradiente': {
        const borda = a.borda as Borda
        let alvo: Layer | undefined
        if (ids.length > 0) {
          alvo = porId.get(ids[0])
          if (!alvo || !ehGradiente(alvo)) {
            recusados.push({ indice, tipo: a.tipo, motivo: `a camada indicada não é um gradiente: ${ids[0]}` })
            return
          }
        } else {
          alvo = camadas.find(
            (l) => ehGradiente(l) && l.visible !== false && ehGradienteDeLeitura(l) && bordaDaLeitura(l, H) === borda,
          )
        }
        if (alvo) {
          const antes = forcaDaCamada(alvo)
          let nova = comForca(alvo, a.forca!)
          if (a.altura != null) {
            const altura = Math.round(Math.min(H, a.altura))
            nova = {
              ...nova,
              size: { ...nova.size, height: altura },
              position: { ...nova.position, y: bordaDaLeitura(alvo, H) === 'topo' ? 0 : H - altura },
            }
          }
          const alvoId = alvo.id
          camadas = camadas.map((l) => (l.id === alvoId ? nova : l))
          aplicados.push({
            indice,
            tipo: a.tipo,
            camadas: [alvoId],
            detalhe: `força ${antes}→${a.forca}${a.altura != null ? `, altura ${Math.round(a.altura)}px` : ''}`,
          })
          return
        }
        const outro = camadas.find((l) => ehGradiente(l) && ehGradienteDeLeitura(l))
        const cor = a.cor ?? corDoGradiente(outro) ?? '#000000'
        const curva = Array.isArray(outro?.metadata?.curva)
          ? (outro!.metadata!.curva as CurvaDoGradiente)
          : CURVA_DE_LEITURA
        const altura = Math.round(Math.min(H, a.altura ?? H * 0.45))
        let nova = camadaDeGradiente({ borda, W, H, altura, cor, curva, forca: a.forca! })
        if (camadas.some((l) => l.id === nova.id)) nova = { ...nova, id: `${nova.id}-revisao` }
        camadas = inserirAcimaDoFundo(camadas, nova, ctx.canvas)
        aplicados.push({
          indice,
          tipo: a.tipo,
          camadas: [nova.id],
          detalhe: `gradiente de leitura criado ${borda === 'topo' ? 'no topo' : 'no rodapé'} (força ${a.forca}, altura ${altura}px)`,
        })
        return
      }

      case 'visibilidade': {
        const alvo = new Set(ids)
        // A camada escondida pelo revisor leva a MARCA (metadata.revisao.ocultaPeloRevisor): é o que faz o
        // aprendizado não ler o esconder mecânico como a pessoa apagando o texto ao agendar (REV-9E-01).
        const marca = { em: new Date().toISOString(), ajuste: indice }
        camadas = camadas.map((l) => (alvo.has(l.id) ? comVisibilidadeDoRevisor(l, a.visivel!, marca) : l))
        aplicados.push({ indice, tipo: a.tipo, camadas: ids, detalhe: a.visivel ? 'mostradas' : 'escondidas' })
        return
      }

      case 'caixa': {
        const l = porId.get(ids[0])!
        if (!ehTexto(l)) {
          recusados.push({ indice, tipo: a.tipo, motivo: `caixa só vale para texto: ${l.id}` })
          return
        }
        const alturaAntes = medirTexto(l)
        let nova: Layer = l
        const partes: string[] = []
        if (a.largura != null) {
          const largura = Math.round(a.largura)
          const dw = largura - l.size.width
          const alinhamento = l.style?.textAlign ?? 'left'
          const dx = alinhamento === 'center' ? -dw / 2 : alinhamento === 'right' ? -dw : 0
          nova = {
            ...nova,
            position: { ...nova.position, x: Math.round(nova.position.x + dx) },
            size: { ...nova.size, width: largura },
          }
          partes.push(`largura ${l.size.width}→${largura}px`)
        }
        if (a.alturaAutomatica) {
          const autoWrap = nova.textboxConfig?.autoWrap
          nova = {
            ...nova,
            textboxConfig: {
              ...(nova.textboxConfig ?? {}),
              autoWrap: {
                lineHeight: autoWrap?.lineHeight ?? nova.style?.lineHeight ?? 1.2,
                breakMode: autoWrap?.breakMode ?? 'word',
                autoExpand: true,
              },
            },
          }
          partes.push('altura automática ligada')
        }
        const alturaDepois = medirTexto(nova)
        if (alturaDepois != null) {
          // Ligar a altura automática é justamente trocar a altura gravada pela
          // medida; só alargar a caixa mexe pelo delta do mesmo medidor.
          const altura =
            a.alturaAutomatica || alturaAntes == null ? alturaDepois : l.size.height + (alturaDepois - alturaAntes)
          nova = { ...nova, size: { ...nova.size, height: Math.max(1, Math.round(altura)) } }
        }
        camadas = refluir(camadas, new Map([[l.id, nova]]), ctx.canvas)
        alteradas.add(l.id)
        aplicados.push({ indice, tipo: a.tipo, camadas: ids, detalhe: partes.join('; ') })
        return
      }
    }
  })

  return { camadas, aplicados, recusados, alteradas: [...alteradas] }
}
