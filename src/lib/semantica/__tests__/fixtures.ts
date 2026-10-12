/**
 * Fixtures SINTÉTICAS da fundação semântica. Nenhum dado de cliente — nem
 * anonimizado: as estruturas reproduzem o que o compositor e o editor gravam
 * (`metadata.compositor.papel`, ids reservados `bg-foto`/`logo`, o par
 * `servico`/`servico-2` de `camadas-extras.ts`), com conteúdo inventado.
 */
import type { Layer } from '@/types/template'

export function camada(parcial: Partial<Layer> & Pick<Layer, 'id'>): Layer {
  return {
    type: 'text',
    name: parcial.id,
    visible: true,
    locked: false,
    order: 0,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    ...parcial,
  }
}

const papel = (p: string) => ({ compositor: { papel: p } })
const slot = (id: unknown) => ({ slot: { id } })

/** a. headline único, declarado. */
export const headlineUnico = [camada({ id: 'headline', metadata: papel('headline'), content: 'Título' })]

/** b. servico único, declarado. */
export const servicoUnico = [camada({ id: 'servico', metadata: papel('servico'), content: 'Info' })]

/** c. dois `servico` — o par que o compositor gera (`servico` e `servico-2`). */
export const doisServicos = [
  camada({ id: 'servico', metadata: papel('servico'), content: 'Rua A, 1', position: { x: 0, y: 900 } }),
  camada({ id: 'servico-2', metadata: papel('servico'), content: 'Ter a dom', position: { x: 0, y: 960 } }),
]

/** d. foto de fundo pelo id reservado; e. logo pelo tipo. */
export const fotoELogo = [
  camada({ id: 'bg-foto', type: 'image', fileUrl: 'https://exemplo.test/a.jpg' }),
  camada({ id: 'logo', type: 'logo', logoId: 1 }),
]

/** f. página legada: papel só no `name`, sem metadata nem id de papel. */
export const legadoPorNome = [
  camada({ id: 'text-aa11', name: 'headline', content: 'Antigo' }),
  camada({ id: 'text-bb22', name: 'Fundo', type: 'image' }),
]

/** g. mesmo papel, ids físicos aleatórios. */
export const mesmoPapelIdsAleatorios = [
  camada({ id: 'text-8f931', metadata: papel('servico') }),
  camada({ id: 'text-17ca2', metadata: papel('servico') }),
]

/** h. dois `servico` com slot declarado — o caso endereçável. */
export const servicosComSlot = [
  camada({ id: 'text-8f931', name: 'Endereço', metadata: { ...papel('servico'), ...slot('servico-endereco') } }),
  camada({ id: 'text-17ca2', name: 'Horário', metadata: { ...papel('servico'), ...slot('servico-horario') } }),
]

/** j. slot duplicado na mesma página (erro de integridade). */
export const slotDuplicado = [
  camada({ id: 'text-1', metadata: { ...papel('cta'), ...slot('cta-principal') } }),
  camada({ id: 'text-2', metadata: { ...papel('apoio'), ...slot('cta-principal') } }),
]

/** Declaração explícita corrompida com id que "parece" papel. */
export const papelInvalidoComIdDePapel = [camada({ id: 'servico', metadata: papel('servicoo') })]

/** Um `servico` válido ao lado de um corrompido — o caso que escolheria a camada errada. */
export const servicoValidoEUmCorrompido = [
  camada({ id: 'text-ok', metadata: papel('servico') }),
  camada({ id: 'text-ruim', metadata: papel('servicoo') }),
]

/** Slot malformado (espaço e acento fora do formato de id). */
export const slotMalformado = [camada({ id: 'text-x', metadata: { ...papel('cta'), ...slot('cta principal é') } })]

/** Dois logos — legítimo num modelo; a expectativa (ONE) não o invalida. */
export const doisLogos = [
  camada({ id: 'logo-a', type: 'logo' }),
  camada({ id: 'logo-b', type: 'logo' }),
]
