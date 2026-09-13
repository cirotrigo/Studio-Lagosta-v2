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
 * A cópia é texto NOVO: sai sem as marcas de identidade que a leitura da copy
 * usa — `extra` (o id do extra), `bloco` (o vínculo materializado pela
 * duplicação de página), `parte` e `linhasDoBloco` (as partes de um bloco
 * repartido) — e sem o `papel`. O papel sai também porque uma segunda camada do
 * mesmo papel vira um segundo bloco COMUM daquela função, e com dois comuns a
 * leitura volta a ser por posição (e o bloco repartido deixa de reunir as
 * partes). Sem papel, a cópia é texto solto: ganha o próprio bloco inferido
 * (`extra-<id da cópia>`), ligado a ela pelo id, e não disputa camada com
 * ninguém. O resto da metadata (grupo, prefixo, encaixe…) fica.
 *
 * Módulo PURO (só tipos), porque o editor é client.
 */

import type { Layer } from '@/types/template'

/** As marcas da metadata do compositor que dão identidade autoral a uma camada. */
export const MARCAS_DE_IDENTIDADE_AUTORAL = ['extra', 'bloco', 'parte', 'linhasDoBloco', 'papel'] as const

export function semIdentidadeAutoral<T extends Pick<Layer, 'metadata'>>(camada: T): T {
  const metadata = camada.metadata as Record<string, unknown> | undefined
  const compositor = metadata?.compositor
  if (!compositor || typeof compositor !== 'object') return camada
  const marcas = MARCAS_DE_IDENTIDADE_AUTORAL as readonly string[]
  if (!Object.keys(compositor).some((chave) => marcas.includes(chave))) return camada
  const limpo = Object.fromEntries(Object.entries(compositor as Record<string, unknown>).filter(([chave]) => !marcas.includes(chave)))
  return { ...camada, metadata: { ...metadata, compositor: limpo } }
}
