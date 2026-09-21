/**
 * A CAMADA COPIADA NO EDITOR — duplicar (`duplicateLayer`) e colar (`pasteLayers`).
 *
 * C9-02 (pré-revisão do HEAD 980eea2a, 12/09/2026): o editor copiava a camada
 * INTEIRA, metadata incluída, e a cópia nascia declarando a mesma identidade
 * autoral da original. Com duas camadas declarando o mesmo bloco, só a ALTURA
 * desempata na leitura da copy: mover a cópia para cima da original trocava os
 * textos entre blocos e o autosave gravava isso como revisão da equipe, sem
 * nenhum texto editado.
 *
 * A cópia é texto NOVO e SEMPRE sai sem as marcas que só a composição e a
 * duplicação de página gravam — `extra` (o id do extra), `bloco` (o vínculo
 * materializado), `parte` e `linhasDoBloco` (as partes de um bloco repartido).
 *
 * C9-11 (pré-revisão do commit 099818b0, 12/09/2026): o `papel` sai SÓ quando a
 * página tem contrato da copy. Numa página com contrato, uma segunda camada do
 * mesmo papel vira um segundo bloco COMUM daquela função, e com dois comuns a
 * leitura volta a ser por posição (e o bloco repartido deixa de reunir as
 * partes); sem papel, a cópia é texto solto, com o próprio bloco inferido. Numa
 * página SEM contrato (a assinatura, a de combinação) não há leitura de
 * autoria a proteger — e o papel é justamente o que o COMPOSITOR lê: tirar o
 * papel da cópia do texto de serviço fazia `arranjoDasCamadas` descartá-la (e o
 * ícone preso a ela), e toda peça seguinte daquela variante punha horário e
 * endereço no mesmo texto, em silêncio.
 *
 * 🔴 A marca do compositor sai INTEIRA — a regra da main (`camadaClonada`,
 * PR3-R14-01), alinhada no rebase de 21/09/2026: "chave nova que o desenho grave
 * amanhã já nasce coberta". Até ali esta função tirava as marcas chave a chave e
 * deixava o `prefixo` e o `encaixe`: a cópia do CTA ("→ Reserve já") levava
 * `prefixo: '→ '`, e `linhasDaCamada` descontava da leitura uma seta que agora é
 * TEXTO DO AUTOR — a transformação fictícia que o PR5-12 fechou. A única exceção
 * é o `papel` na página SEM contrato (C9-11, acima). O resto da metadata (grupo,
 * preset, ícone) fica. Módulo PURO (só tipos), porque o editor é client — e as
 * funções do editor moram aqui para serem testadas: os callbacks só as chamam.
 */

import type { Layer } from '@/types/template'
import { semMarcaDoCompositor } from '@/lib/compositor/marca-do-compositor'

export interface OpcoesDaCopia {
  /** A página em que a cópia nasce tem contrato da copy (`Page.copyAutoral`)? Só então o `papel` sai. */
  paginaTemContrato: boolean
}

/**
 * A página tem contrato da copy? Aceita a resposta crua da rota (`copyAutoral`) e a página do contexto
 * multipágina (`temCopyAutoral`). Tipo aberto de propósito: `Page` não declara nenhum dos dois.
 */
export function paginaTemContrato(pagina: unknown): boolean {
  if (!pagina || typeof pagina !== 'object') return false
  const p = pagina as { temCopyAutoral?: unknown; copyAutoral?: unknown }
  return p.temCopyAutoral === true || (p.copyAutoral !== undefined && p.copyAutoral !== null)
}

export function semIdentidadeAutoral<T extends Pick<Layer, 'metadata'>>(camada: T, opcoes: OpcoesDaCopia): T {
  const papel = (camada.metadata as { compositor?: { papel?: unknown } } | undefined)?.compositor?.papel
  const limpa = semMarcaDoCompositor(camada as T & { metadata?: Record<string, unknown> })
  if (opcoes.paginaTemContrato || typeof papel !== 'string') return limpa
  return { ...limpa, metadata: { ...(limpa.metadata ?? {}), compositor: { papel } } }
}

/** `duplicateLayer`: id novo, nome "Copy", 16px abaixo e à direita, destravada — sem a identidade da original. */
export function camadaDuplicadaNoEditor(origem: Layer, opcoes: OpcoesDaCopia & { novoId: string }): Layer {
  return {
    ...semIdentidadeAutoral(origem, opcoes),
    id: opcoes.novoId,
    name: `${origem.name} Copy`,
    position: {
      x: (origem.position?.x ?? 0) + 16,
      y: (origem.position?.y ?? 0) + 16,
    },
    locked: false,
  }
}

function clonar(layer: Layer): Layer {
  try {
    return structuredClone(layer)
  } catch {
    return JSON.parse(JSON.stringify(layer)) as Layer
  }
}

/** `pasteLayers`: clone profundo de cada camada do clipboard, com id novo, "Copy", em cascata de 24px + 12px por item. */
export function camadasColadasNoEditor(clipboard: Layer[], opcoes: OpcoesDaCopia & { novoId: () => string }): Layer[] {
  return clipboard.map((layer, index) => {
    const cloned = clonar(layer)
    return {
      ...semIdentidadeAutoral(cloned, opcoes),
      id: opcoes.novoId(),
      name: `${cloned.name ?? cloned.type} Copy`,
      locked: false,
      order: 0,
      position: {
        x: Math.round((cloned.position?.x ?? 0) + 24 + index * 12),
        y: Math.round((cloned.position?.y ?? 0) + 24 + index * 12),
      },
    }
  })
}
