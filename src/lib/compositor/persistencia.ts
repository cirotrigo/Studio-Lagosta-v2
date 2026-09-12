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
import { copyDaSpecSemContrato, orientacaoDosProblemas, orientacaoEmFrase, tentarCopyEfetivaDasCamadas, validarCopyAutoral, type CopyAutoral, type BlocoLegado } from '@/lib/copy-autoral'

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

export interface CopyAutoralDaSpec {
  /** O contrato; `null` só quando a spec sem contrato não cabe nele. */
  copy: CopyAutoral | null
  /** Por que não há contrato (em português, com o que fazer); `null` quando há. */
  aviso: string | null
}

/**
 * O contrato da copy que a peça grava: o que veio na spec, ou — spec antiga,
 * só com `blocos` — o adaptador do legado, que declara autoria desconhecida
 * e não inventa grupo nem ordem. A fidelidade se mede a partir daqui.
 *
 * 🔴 Desde o PR2-01 (`e3c1f75f`) o adaptador LANÇA quando o legado não cabe no
 * contrato, e a spec sem contrato não limita caracteres: uma linha de 301
 * derrubava a peça já composta. Aqui se usa o `converter*`: sem contrato
 * válido a peça segue SEM contrato, com o aviso — nunca com um contrato que o
 * leitor rejeita, e nada é cortado para caber.
 */
export function copyAutoralDaSpec(spec: SpecDePeca): CopyAutoralDaSpec {
  if (spec.copyAutoral) return { copy: spec.copyAutoral, aviso: null }
  // `z.infer` com strict:false marca `papel` como opcional; `validarSpec` já
  // garantiu o papel em runtime (ver CLAUDE.md, "Com strict: false, z.infer…").
  // R07: sem contrato, a spec INTEIRA vira o original — extras, ids e herança
  // preservados, autoria `desconhecido`. A saída passa pelo leitor: sem contrato
  // válido a peça segue SEM contrato, com o aviso (restack sobre e3c1f75f).
  const conversao = validarCopyAutoral(copyDaSpecSemContrato({ blocos: spec.blocos as BlocoLegado[], camadasExtras: spec.camadasExtras as Parameters<typeof copyDaSpecSemContrato>[0]['camadasExtras'] }, { superficie: 'compositor' }))
  if (conversao.copy) return { copy: conversao.copy, aviso: null }
  return {
    copy: null,
    aviso: `A copy desta peça não cabe no contrato da copy autoral (${conversao.problemas.map((p) => p.mensagem).join('; ')}): a arte foi gravada SEM contrato, sem cortar nem redistribuir o texto, e a fidelidade da copy não é medida nela.${orientacaoEmFrase(orientacaoDosProblemas(conversao.problemas))}`,
  }
}

export function entradaDePersistencia(i: InsumosDaPersistencia): PersistCreativeInput {
  const { spec, opcoes } = i
  // O ORIGINAL é o que o autor escreveu; a EFETIVA é o que as camadas finais
  // (depois do autofix) mostram — lida das camadas, bloco a bloco, com o que
  // o compositor mudou registrado como revisão do SISTEMA. As duas vão para a
  // Generation (o original fica preservado ali, verbatim). A PÁGINA guarda a
  // efetiva: é o contrato do que a página MOSTRA, e é sobre ele que a edição
  // seguinte (editor, ajuste) é diferenciada — se a página guardasse o
  // original, a primeira edição da equipe levaria a culpa pelo que o
  // compositor transformou (medido na prova de dev do PR 3, 12/09/2026: a
  // seta que o compositor põe no CTA e o destaque não desenhado apareciam
  // como revisão da equipe).
  const daSpec = copyAutoralDaSpec(spec)
  const original = daSpec.copy
  const avisosDaCopy: string[] = daSpec.aviso ? [daSpec.aviso] : []
  // Histórico cheio na copy da spec (PR2-02): a efetiva não cabe — a peça segue sem contrato novo, com aviso.
  const lida = original ? tentarCopyEfetivaDasCamadas(original, i.layers, { superficie: 'compositor' }) : null
  if (lida && lida.ok === false) avisosDaCopy.push(`${lida.aviso} A arte foi gravada sem contrato na página.`)
  const leitura = lida && lida.ok ? lida.leitura : null
  return {
    ...(leitura ? { copyAutoral: leitura.efetiva } : {}),
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
      // F1: o contrato da copy — original (do autor) e efetiva (o desenhado).
      // `comparavel` é falso quando a autoria é desconhecida (legado).
      ...(leitura
        ? { copyAutoral: { original, efetiva: leitura.efetiva, comparavel: original.origem.autor !== 'desconhecido', ...(leitura.lacunas.length ? { lacunas: leitura.lacunas } : {}) } }
        : {}),
      // Sem contrato por recusa (legado que não cabe, histórico cheio): o motivo fica na arte.
      ...(avisosDaCopy.length > 0 ? { avisosDaCopyAutoral: avisosDaCopy } : {}),
      ...(spec.foto?.driveFileId ? { driveImageId: spec.foto.driveFileId } : {}),
      imageUrl: i.fotoUrl,
      ...(spec.itemDePlanoId ? { itemDePlanoId: spec.itemDePlanoId } : {}),
      ...(spec.planoId ? { planoId: spec.planoId } : {}),
      ...(opcoes.generationId ? { generationIdDaFila: opcoes.generationId } : {}),
    },
  }
}
