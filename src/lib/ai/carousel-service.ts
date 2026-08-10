/**
 * Carrossel pelo CHAT — as duas etapas que a bancada faz na tela.
 *
 * Na UI quem guarda a série entre as etapas é o navegador (localStorage). No
 * chat não há onde guardar: o assistente teria que repetir a lista inteira de
 * slides na confirmação, e um erro de digitação dele viraria slide errado. Por
 * isso a especificação da série fica gravada na Generation da CAPA
 * (`fieldValues.carrosselSpec`) e a confirmação só precisa do id do carrossel.
 *
 * A etapa de confirmação existe de propósito: capa e guia primeiro, a pessoa
 * OLHA, e só então os demais são gerados. É o que evita produzir seis slides
 * no estilo errado — e o motivo de isto não ser uma tool só.
 */

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { startArtGeneration } from '@/lib/ai/creative-generation-service'
import type { ArtGenerationJobArgs } from '@/lib/ai/creative-generation-runner'

export interface SlideSpec {
  ordem: number
  /** Vazio só na capa (slide 1), que é foto pura. */
  copy: string[]
  driveFileId?: string
  url?: string
  label?: string
}

export interface CarouselStartResult {
  carrosselId: string
  capaGenerationId: string
  guiaGenerationId: string
  totalSlides: number
  /** Os dois jobs a rodar em background (capa e guia). */
  runnerArgs: ArtGenerationJobArgs[]
}

const MIN_SLIDES = 3
const MAX_SLIDES = 8

function validarSlides(slides: SlideSpec[]): SlideSpec[] {
  const ordenados = slides.slice().sort((a, b) => a.ordem - b.ordem)
  if (ordenados.length < MIN_SLIDES) {
    throw new CreativeError(
      'POUCOS_SLIDES',
      `Carrossel precisa de ao menos ${MIN_SLIDES} slides (capa + guia + 1).`,
      400,
    )
  }
  if (ordenados.length > MAX_SLIDES) {
    throw new CreativeError('MUITOS_SLIDES', `Máximo de ${MAX_SLIDES} slides.`, 400)
  }
  ordenados.forEach((s, i) => {
    if (s.ordem !== i + 1) {
      throw new CreativeError('ORDEM_INVALIDA', 'Os slides precisam ser numerados de 1 a N, sem buracos.', 400)
    }
    if (!s.driveFileId && !s.url) {
      throw new CreativeError('SLIDE_SEM_FOTO', `Slide ${s.ordem} está sem foto.`, 400)
    }
    if (s.ordem === 1 && s.copy.length > 0) {
      throw new CreativeError(
        'CAPA_SEM_TEXTO',
        'A capa é foto pura, sem texto — mova essa copy para o slide 2.',
        400,
      )
    }
    if (s.ordem > 1 && s.copy.length === 0) {
      throw new CreativeError('SLIDE_SEM_COPY', `Slide ${s.ordem} está sem copy.`, 400)
    }
  })
  return ordenados
}

/** Etapa 1: capa (foto pura) + guia (slide 2), que define o look da série. */
export async function iniciarCarrossel(input: {
  projectId: number
  slides: SlideSpec[]
  legenda?: string
  pedido?: string
  actorClerkId: string
  orgId?: string
}): Promise<CarouselStartResult> {
  const slides = validarSlides(input.slides)
  const carrosselId = randomUUID()

  const gerar = (slide: SlideSpec) =>
    startArtGeneration({
      projectId: input.projectId,
      track: 'arte',
      copy: slide.copy,
      pedido: input.pedido,
      formato: 'feed',
      referencias: [
        {
          role: 'subject',
          driveFileId: slide.driveFileId,
          url: slide.url,
          label: slide.label ?? `slide ${slide.ordem}`,
        },
      ],
      carrossel: {
        groupId: carrosselId,
        slideOrder: slide.ordem,
        totalSlides: slides.length,
      },
      actorClerkId: input.actorClerkId,
      orgId: input.orgId,
    })

  const [capa, guia] = await Promise.all([gerar(slides[0]), gerar(slides[1])])

  // A especificação da série mora na capa: é o que permite confirmar o estilo
  // depois passando só o id do carrossel.
  await db.generation.update({
    where: { id: capa.jobGenerationId },
    data: {
      fieldValues: {
        ...((await db.generation.findUnique({
          where: { id: capa.jobGenerationId },
          select: { fieldValues: true },
        }))?.fieldValues as Record<string, unknown>),
        carrosselSpec: { slides, legenda: input.legenda ?? null, pedido: input.pedido ?? null },
      } as never,
    },
  })

  return {
    carrosselId,
    capaGenerationId: capa.jobGenerationId,
    guiaGenerationId: guia.jobGenerationId,
    totalSlides: slides.length,
    runnerArgs: [capa.runnerArgs, guia.runnerArgs].filter(
      (a): a is ArtGenerationJobArgs => a !== null,
    ),
  }
}

export interface CarouselConfirmResult {
  gerados: Array<{ ordem: number; generationId: string }>
  runnerArgs: ArtGenerationJobArgs[]
}

/** Etapa 2: com o look aprovado, gera os slides 3..N em paralelo. */
export async function confirmarEstiloCarrossel(input: {
  projectId: number
  carrosselId: string
  actorClerkId: string
  orgId?: string
}): Promise<CarouselConfirmResult> {
  const doGrupo = await db.generation.findMany({
    where: { carouselGroupId: input.carrosselId, projectId: input.projectId },
    orderBy: { slideOrder: 'asc' },
    select: { id: true, slideOrder: true, status: true, fieldValues: true },
  })
  if (doGrupo.length === 0) {
    throw new CreativeError('CARROSSEL_NAO_ENCONTRADO', 'Carrossel não encontrado neste cliente.', 404)
  }

  const capa = doGrupo.find((g) => g.slideOrder === 1)
  const guia = doGrupo.find((g) => g.slideOrder === 2)
  if (!guia || guia.status !== 'COMPLETED') {
    throw new CreativeError(
      'GUIA_NAO_PRONTO',
      'O slide-guia ainda não ficou pronto — espere e confirme depois (é ele que define o look).',
      409,
    )
  }

  const spec = (capa?.fieldValues as Record<string, unknown> | null)?.carrosselSpec as
    | { slides: SlideSpec[] }
    | undefined
  if (!spec?.slides?.length) {
    throw new CreativeError(
      'SPEC_PERDIDA',
      'Não achei a lista de slides deste carrossel. Crie de novo com criar-carrossel.',
      409,
    )
  }

  const jaGerados = new Set(doGrupo.map((g) => g.slideOrder))
  const faltando = spec.slides.filter((s) => s.ordem > 2 && !jaGerados.has(s.ordem))
  if (faltando.length === 0) {
    throw new CreativeError('NADA_A_GERAR', 'Todos os slides deste carrossel já foram gerados.', 409)
  }

  const resultados = await Promise.all(
    faltando.map((slide) =>
      startArtGeneration({
        projectId: input.projectId,
        track: 'arte',
        copy: slide.copy,
        formato: 'feed',
        referencias: [
          {
            role: 'subject',
            driveFileId: slide.driveFileId,
            url: slide.url,
            label: slide.label ?? `slide ${slide.ordem}`,
          },
        ],
        carrossel: {
          groupId: input.carrosselId,
          slideOrder: slide.ordem,
          totalSlides: spec.slides.length,
          guideGenerationId: guia.id,
        },
        actorClerkId: input.actorClerkId,
        orgId: input.orgId,
      }).then((r) => ({ ordem: slide.ordem, ...r })),
    ),
  )

  return {
    gerados: resultados.map((r) => ({ ordem: r.ordem, generationId: r.jobGenerationId })),
    runnerArgs: resultados
      .map((r) => r.runnerArgs)
      .filter((a): a is ArtGenerationJobArgs => a !== null),
  }
}

/** Situação da série, para o assistente contar à pessoa. */
export async function verCarrossel(projectId: number, carrosselId: string) {
  const slides = await db.generation.findMany({
    where: { carouselGroupId: carrosselId, projectId },
    orderBy: { slideOrder: 'asc' },
    select: { id: true, slideOrder: true, status: true, resultUrl: true, fieldValues: true },
  })
  if (slides.length === 0) {
    throw new CreativeError('CARROSSEL_NAO_ENCONTRADO', 'Carrossel não encontrado neste cliente.', 404)
  }
  const capa = slides.find((s) => s.slideOrder === 1)
  const spec = (capa?.fieldValues as Record<string, unknown> | null)?.carrosselSpec as
    | { slides: SlideSpec[]; legenda?: string | null }
    | undefined
  const total = spec?.slides.length ?? slides.length
  const prontos = slides.filter((s) => s.status === 'COMPLETED')
  const guia = slides.find((s) => s.slideOrder === 2)

  return {
    carrosselId,
    totalSlides: total,
    legenda: spec?.legenda ?? null,
    slides: slides.map((s) => ({
      ordem: s.slideOrder,
      situacao:
        s.status === 'COMPLETED' ? 'pronto' : s.status === 'FAILED' ? 'falhou' : 'gerando',
      url: s.resultUrl,
      generationId: s.id,
    })),
    faltamGerar: Math.max(0, total - slides.length),
    esperandoConfirmacao:
      guia?.status === 'COMPLETED' && slides.length < total && prontos.length === slides.length,
    /** Mídias na ordem, quando a série está completa — pronto para agendar. */
    midiasEmOrdem:
      prontos.length === total
        ? slides
            .filter((s) => s.resultUrl)
            .sort((a, b) => (a.slideOrder ?? 0) - (b.slideOrder ?? 0))
            .map((s) => s.resultUrl!)
        : null,
  }
}
