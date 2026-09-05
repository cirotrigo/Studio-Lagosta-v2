/**
 * O que o compositor manda gravar — a entrada de `persistAndRenderCreative`.
 *
 * Módulo PURO (sem `@/lib/db`) para que a regra que mais custou em produção
 * fique testável sem banco: **a peça da FILA fecha a Generation que a fila
 * criou, nunca abre outra.** Em 04/09/2026 (Espeto Gaúcho, 20 peças por
 * `compor-leva`) o `comporPeca` só anotava o id da fila em `fieldValues` e
 * não o entregava ao persist — nasciam 20 Generations COMPLETED duplicadas,
 * as 20 da fila ficavam PROCESSING para sempre, `fecharJob` lia PROCESSING e
 * marcava o job FAILED sem motivo, e os itens do plano não eram reapontados.
 */

import type { Layer } from '@/types/template'
import type { CanalDaArte } from '@/lib/creatives/canal'
import type { PersistCreativeInput } from '@/lib/creatives/persist'

import type { SpecDePeca } from './spec'

/** Tag que marca a página nascida do compositor (é o que liga o sinal `geometria`). */
export const TAG_DA_PECA_COMPOSTA = 'compositor'

export interface InsumosDaPersistencia {
  spec: SpecDePeca
  opcoes: {
    autor?: string | null
    canal?: CanalDaArte | null
    /** A Generation PROCESSING que a fila criou. Quando vem, é ELA que fecha. */
    generationId?: string | null
  }
  projeto: { id: number; name: string; userId: string }
  pasta: { id: number; name: string }
  nome: string
  /** `Page.order` — a ordem de POSTAGEM na pasta (`ordemNaPasta`). */
  ordem: number
  canvas: { width: number; height: number }
  layers: Layer[]
  /** Fundo liso da marca (`assinatura.numeros.fundo`). */
  fundo: string
  /** O diagnóstico da composição, gravado em `fieldValues.composicao`. */
  diagnostico: unknown
  fotoUrl: string | null
}

export function entradaDePersistencia(i: InsumosDaPersistencia): PersistCreativeInput {
  const { spec, opcoes } = i
  return {
    project: i.projeto,
    templateId: i.pasta.id,
    templateName: i.pasta.name,
    pageName: i.nome,
    width: i.canvas.width,
    height: i.canvas.height,
    layers: i.layers,
    background: i.fundo,
    authorName: 'compositor',
    createdBy: opcoes.autor ?? null,
    canal: opcoes.canal ?? null,
    pageTags: [TAG_DA_PECA_COMPOSTA, spec.formato],
    pageOrder: i.ordem,
    // O slide vira `Generation.slideOrder`: registrado por quem COMPÕE, não
    // deduzido depois do `SocialPost.mediaUrls`. `carouselGroupId` fica nulo
    // de propósito — cada slide é composto sozinho, e um grupo de um só seria
    // pior que nenhum.
    slideOrder: spec.carrossel?.slide ?? null,
    // A Generation da fila é fechada em vez de nascer outra — ver o cabeçalho.
    generationId: opcoes.generationId ?? null,
    fieldValues: {
      source: 'compositor',
      spec,
      composicao: i.diagnostico,
      // F4: o snapshot das camadas como nasceram — é o "git" de uma peça.
      layersSnapshot: i.layers,
      ...(spec.foto?.driveFileId ? { driveImageId: spec.foto.driveFileId } : {}),
      imageUrl: i.fotoUrl,
      ...(spec.itemDePlanoId ? { itemDePlanoId: spec.itemDePlanoId } : {}),
      ...(spec.planoId ? { planoId: spec.planoId } : {}),
      ...(opcoes.generationId ? { generationIdDaFila: opcoes.generationId } : {}),
    },
  }
}
