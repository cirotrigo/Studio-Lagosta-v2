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
 * O resto da metadata (grupo, prefixo, encaixe…) fica. Módulo PURO (só tipos),
 * porque o editor é client — e as funções do editor moram aqui para serem
 * testadas: os callbacks só as chamam.
 */

import type { Layer } from '@/types/template'

/** As marcas que só a composição e a duplicação de página gravam: a cópia nunca as leva. */
export const MARCAS_DA_COMPOSICAO = ['extra', 'bloco', 'parte', 'linhasDoBloco'] as const

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
  const metadata = camada.metadata as Record<string, unknown> | undefined
  const compositor = metadata?.compositor
  if (!compositor || typeof compositor !== 'object') return camada
  const marcas: readonly string[] = opcoes.paginaTemContrato ? [...MARCAS_DA_COMPOSICAO, 'papel'] : MARCAS_DA_COMPOSICAO
  if (!Object.keys(compositor).some((chave) => marcas.includes(chave))) return camada
  const limpo = Object.fromEntries(Object.entries(compositor as Record<string, unknown>).filter(([chave]) => !marcas.includes(chave)))
  return { ...camada, metadata: { ...metadata, compositor: limpo } }
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
