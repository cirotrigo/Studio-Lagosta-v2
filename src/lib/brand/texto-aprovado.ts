import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { VozCompacta } from './voz'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const dataCalendario = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const [ano, mes, dia] = d.split('-').map(Number)
    const t = new Date(0)
    t.setUTCFullYear(ano, mes - 1, dia)
    t.setUTCHours(0, 0, 0, 0)
    return (
      ano >= 1 &&
      t.getUTCFullYear() === ano &&
      t.getUTCMonth() === mes - 1 &&
      t.getUTCDate() === dia
    )
  }, 'Data de calendário inválida')
const schema = z
  .object({
    projectId: z.number().int().positive(),
    vozSha256: sha256,
    dnaSha256: sha256,
    fonte: z
      .object({
        referencia: z.string().min(1),
        trecho: z.string().min(1),
        aprovadoPor: z.string().min(1),
        aprovadoEm: z.union([
          dataCalendario,
          z
            .string()
            .datetime()
            .refine(
              (d) => dataCalendario.safeParse(d.slice(0, 10)).success,
              'Data de calendário inválida'
            ),
        ]),
      })
      .strict(),
    ctas: z
      .array(
        z
          .object({
            literal: z.string().trim().min(1).max(160),
            condicao: z
              .object({ regraId: z.string().min(1), texto: z.string().min(1) })
              .strict()
              .nullable(),
          })
          .strict()
      )
      .min(1)
      .max(40),
  })
  .strict()
export type DocumentoDeTextoAprovado = z.infer<typeof schema>
type Dna = { toneOfVoice?: string | null; contentRules?: string | null }
const canonico = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(canonico)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonico((x as Record<string, unknown>)[k])])
        )
      : x
export const hashDoTextoAprovado = (x: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonico(x)))
    .digest('hex')
export const hashDoDnaDeTexto = (dna: Dna): string =>
  hashDoTextoAprovado({
    toneOfVoice: dna.toneOfVoice ?? null,
    contentRules: dna.contentRules ?? null,
  })

declare const atestada: unique symbol
/** Capacidade intransferível por JSON: só existe depois da conferência de origem. */
export type FonteDeTextoAtestada = { readonly [atestada]: true }
const fontes = new WeakMap<
  FonteDeTextoAtestada,
  { documento: DocumentoDeTextoAprovado; hash: string }
>()

/** Uso interno pela execução autorizada. Hash esperado deve ser o pacote revisado,
 * não um hash declarado pelo request. Zod/hash NÃO atestam autorização humana:
 * conferirOrigem deve verificar a referência na fonte autorizada independente. */
export async function atestarFonteDeTexto(args: {
  documento: unknown
  sha256Esperado: string
  conferirOrigem: (
    documento: Readonly<DocumentoDeTextoAprovado>,
    hash: string
  ) => Promise<boolean>
}): Promise<FonteDeTextoAtestada> {
  const documento = schema.parse(args.documento)
  const hash = hashDoTextoAprovado(documento)
  if (hash !== args.sha256Esperado)
    throw new Error('Fonte de texto difere do pacote revisado')
  if (
    new Set(documento.ctas.map((c) => c.literal)).size !== documento.ctas.length
  )
    throw new Error('Fonte repete CTA')
  if (documento.ctas.some((c) => !documento.fonte.trecho.includes(c.literal)))
    throw new Error('Fonte não cita o literal aprovado')
  // A cópia impede callback ou chamador de alterar o que foi conferido.
  const copia = JSON.parse(
    JSON.stringify(documento)
  ) as DocumentoDeTextoAprovado
  if (!(await args.conferirOrigem(JSON.parse(JSON.stringify(documento)), hash)))
    throw new Error('Origem da aprovação não atestada')
  const capacidade = Object.freeze({}) as FonteDeTextoAtestada
  fontes.set(capacidade, { documento: copia, hash })
  return capacidade
}

export type ContextoDeTextoAprovado = {
  projectId: number
  fonte: FonteDeTextoAtestada
}
export function hashDaFonteAtestada(fonte: FonteDeTextoAtestada): string {
  const lida = fontes.get(fonte)
  if (!lida)
    throw new Error(
      'Fonte não atestada; JSON/autodeclaração não concede aprovação'
    )
  return lida.hash
}
export function ctasAtestados(
  contexto: ContextoDeTextoAprovado,
  voz: VozCompacta,
  dna: Dna
): string[] {
  const lida = fontes.get(contexto.fonte)
  if (!lida)
    throw new Error(
      'Fonte não atestada; JSON/autodeclaração não concede aprovação'
    )
  const d = lida.documento
  if (
    d.projectId !== contexto.projectId ||
    d.vozSha256 !== hashDoTextoAprovado(voz) ||
    d.dnaSha256 !== hashDoDnaDeTexto(dna)
  )
    throw new Error('Fonte pertence a outro projeto/voz/DNA; refaça a prévia')
  for (const c of d.ctas) {
    if (
      c.condicao &&
      !voz.regras.some(
        (r) =>
          r.id === c.condicao?.regraId &&
          r.texto === c.condicao.texto &&
          r.ativa &&
          (r.escopo === 'copy' || r.escopo === 'ambas')
      )
    )
      throw new Error(`Condição do CTA não preservada: ${c.literal}`)
    // A fonte adicional não desfaz veto presente na voz.
    if (
      voz.proibicoes.some((p) => p.includes(c.literal)) ||
      [
        ...voz.regras
          .filter(
            (r) =>
              r.ativa &&
              (r.escopo === 'copy' || r.escopo === 'ambas') &&
              !(
                c.condicao &&
                r.id === c.condicao.regraId &&
                r.texto === c.condicao.texto
              )
          )
          .map((r) => r.texto),
      ].some((p) => /não|nunca|vetad|proibid/i.test(p) && p.includes(c.literal))
    )
      throw new Error(`CTA aprovado conflita com veto: ${c.literal}`)
  }
  return d.ctas.map((c) => c.literal)
}
