/**
 * A SPEC de uma peça composta — o que o chat, a bancada ou um script dizem ao
 * compositor. Módulo PURO (zod + tipos): a bancada importa sem env.
 *
 * A copy chega JÁ dividida por PAPEL e por LINHA. Quebrar linha é decisão de
 * quem escreve (é o que a leva de setembro da Lagosta fez no `dados.py`), e o
 * compositor a respeita — ele mede se cabe, e recusa com orçamento quando não
 * cabe, em vez de quebrar por conta própria e mudar o ritmo da frase.
 */

import { z } from 'zod'
import { copyAutoralSchema } from '@/lib/copy-autoral/contrato'
import { blocosParaOCompositor } from '@/lib/copy-autoral/legado'
import { canonico } from '@/lib/copy-autoral/revisao'
import { problemasDeCoerencia } from '@/lib/copy-autoral/validar'

export const PAPEIS = ['pre', 'headline', 'apoio', 'cta', 'servico'] as const
/**
 * Os papéis da SPEC mais o interno `headline2`: a SEGUNDA VOZ da manchete
 * (Quintal DomaniCP→Amithen, TERO âmbar→creme, By Rock 2ª linha vermelha).
 * Ninguém pede `headline2` na spec — quando a assinatura o tem e a manchete
 * vem com 2+ linhas, a ÚLTIMA linha sai nessa voz.
 */
export type Papel = (typeof PAPEIS)[number] | 'headline2'

export const FORMATOS = ['story', 'feed', 'quadrado'] as const
export type Formato = (typeof FORMATOS)[number]

export const ANCORAS = ['topo', 'meio', 'rodape'] as const
export type Ancora = (typeof ANCORAS)[number]

export const ALINHAMENTOS = ['esquerda', 'centro', 'direita'] as const
export type Alinhamento = (typeof ALINHAMENTOS)[number]

export const CANTOS = ['inferior-esquerdo', 'inferior-direito', 'superior-esquerdo', 'superior-direito'] as const
export type Canto = (typeof CANTOS)[number]

/**
 * Onde uma camada EXTRA pousa (F3): `principal` junta-se ao bloco da manchete;
 * `topo` e `rodape` formam grupo próprio naquela borda. Nunca o grupo do papel
 * de que ela herda o estilo — ver `camadas-extras.ts`.
 */
export const GRUPOS_VISUAIS = ['principal', 'topo', 'rodape'] as const
export type GrupoVisual = (typeof GRUPOS_VISUAIS)[number]

const idDeCamadaSchema = z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9._-]*$/i)

export const blocoSchema = z.object({
  papel: z.enum(PAPEIS),
  linhas: z.array(z.string().min(1)).min(1).max(6),
  /** Id próprio da camada — obrigatório quando o papel se repete (função ≠ estilo, F3). */
  id: idDeCamadaSchema.optional(),
  /** O papel da assinatura de que este texto HERDA o estilo, sem virar esse papel (F3): a linha de horário em variante sem `servico`. */
  herdaDe: z.enum(PAPEIS).optional(),
  grupoVisual: z.enum(GRUPOS_VISUAIS).optional(),
})

/** Texto sem função do compositor (`livre` no contrato) que veste o estilo de um papel — a camada extra da F3. */
export const camadaExtraSchema = z.object({
  id: idDeCamadaSchema,
  linhas: z.array(z.string().min(1)).min(1).max(6),
  herdaDe: z.enum(PAPEIS),
  grupoVisual: z.enum(GRUPOS_VISUAIS).optional(),
  grupoDeLeitura: z.string().min(1).max(60).optional(),
  ordem: z.number().int().min(0).max(99).optional(),
})
export type CamadaExtra = z.infer<typeof camadaExtraSchema>
export type Bloco = z.infer<typeof blocoSchema>

/**
 * O lugar da peça num CARROSSEL — 1 é a capa, como o Instagram numera.
 *
 * Existe porque a posição do slide só era recuperável DEPOIS, lendo o
 * `SocialPost.mediaUrls` e casando pelo nome do arquivo do render
 * (`<pageId>-<epoch>.png`). Quem compõe sabe disso na hora; deduzir depois é
 * o que deixava os quatro slides do mesmo carrossel com nomes idênticos na
 * pasta. Vira `Generation.slideOrder` (a coluna que o carrossel de IA já usa)
 * e desempata a ordem das páginas dentro do mesmo minuto.
 */
export const carrosselSchema = z.object({
  slide: z.number().int().min(1).max(20),
  de: z.number().int().min(2).max(20).optional(),
})
export type CarrosselDaPeca = z.infer<typeof carrosselSchema>

/**
 * Um arranjo fixado. A forma nova guarda o GRUPO: duas combinações salvas
 * elegíveis para o mesmo papel em grupos diferentes não podem colapsar na
 * primeira da lista (R15 da revisão de 4413e0a1). A string nua é o legado
 * (ids sem grupo), aceita para qualquer grupo.
 */
export const arranjoFixadoSchema = z.union([z.string().max(160), z.object({ grupo: z.string().max(80), arranjo: z.string().max(160) })])

export const preferenciasSchema = z.object({
  /**
   * LEGADO desde 11/09/2026: todo texto ganha o gradiente de leitura na borda
   * onde pousa. Os valores antigos seguem aceitos (specs gravadas na fila e em
   * `Generation.fieldValues.spec` são revalidadas na recomposição) e dão o
   * mesmo resultado — nenhum deles devolve o halo.
   */
  tratamentoDeTexto: z.enum(['gradiente', 'assinatura', 'gradiente-suave-topo']).optional(),
  ancora: z.enum([...ANCORAS, 'auto']).optional(),
  alinha: z.enum([...ALINHAMENTOS, 'auto']).optional(),
  cantoDaMarca: z.enum([...CANTOS, 'auto', 'nenhum']).optional(),
  /** `fixo` mantém o enquadramento central; `auto` deixa o compositor escolher o corte que abre área livre. */
  enquadramento: z.enum(['auto', 'fixo']).optional(),
  /** Nome (ou tag) da página de assinatura a usar, quando o cliente tem mais de uma no formato. */
  variante: z.string().max(80).optional(),
  /**
   * O id da página de assinatura com que a peça NASCEU — gravado pela
   * recomposição (`specComAPosicaoOriginal`), nunca pedido por ninguém. Vence
   * enquanto a página existir; se ela sumiu (arquivada), a escolha automática
   * segue em vez de recusar a peça, como `arranjos`.
   */
  varianteOriginal: z.string().max(80).optional(),
  /**
   * Os arranjos de texto que esta peça já usou (grupo da página ou combinação
   * salva, ver `combinacoes.ts`). O compositor grava ao persistir, e a
   * recomposição os mantém — refazer a peça não pode sortear outra combinação.
   */
  arranjos: z.array(arranjoFixadoSchema).max(8).optional(),
})
export type Preferencias = z.infer<typeof preferenciasSchema>
/** Um arranjo fixado: `{ grupo, arranjo }` (o id do arranjo DAQUELE grupo — R15) ou, no legado, só o id, para qualquer grupo. */
export type ArranjoFixado = z.infer<typeof arranjoFixadoSchema>

export const specSchema = z.object({
  projectId: z.number().int().positive(),
  formato: z.enum(FORMATOS),
  foto: z
    .object({
      url: z.string().url().optional(),
      driveFileId: z.string().min(1).optional(),
    })
    .optional(),
  selecaoExperimental: z.boolean().optional(),
  fotosCandidatas: z.array(z.string().min(1)).min(1).max(3).optional(),
  /**
   * A copy por papel. Dispensável quando `copyAutoral` vem: `validarSpec`
   * deriva os blocos do contrato (F1) — e recusa quando os dois vêm e não batem.
   */
  blocos: z.array(blocoSchema).max(10).optional(),
  /** As camadas extras (F3) — os blocos `livre` do contrato com `estilo.herdaDe`; até 5. */
  camadasExtras: z.array(camadaExtraSchema).max(5).optional(),
  preferencias: preferenciasSchema.optional(),
  nome: z.string().max(120).optional(),
  /** Vínculos frouxos com o plano — sem FK, como todo vínculo da casa. */
  itemDePlanoId: z.string().optional(),
  planoId: z.string().optional(),
  quando: z.string().optional(),
  tema: z.string().optional(),
  carrossel: carrosselSchema.optional(),
  /**
   * O contrato da copy autoral (F1, 12/09/2026) — o que o autor escreveu,
   * gravado ANTES de qualquer adaptação. `blocos` continua sendo o que o
   * compositor consome; quem monta a spec a partir do contrato deriva os
   * blocos por `blocosParaOCompositor` na porta (nunca aqui, em silêncio).
   */
  copyAutoral: copyAutoralSchema.optional(),
})
export type SpecDePeca = z.infer<typeof specSchema>

/** Uma spec válida ou a lista de problemas, sem lançar. */
export function validarSpec(entrada: unknown): { spec: SpecDePeca; problemas: [] } | { spec: null; problemas: string[] } {
  const r = specSchema.safeParse(entrada)
  if (r.success) {
    if (!r.data.selecaoExperimental) delete r.data.selecaoExperimental
    if (r.data.copyAutoral) {
      const problemas = problemasDeCoerencia(r.data.copyAutoral)
      if (problemas.length > 0) return { spec: null, problemas: problemas.map((p) => `copyAutoral: ${p.mensagem}`) }
      // F1: os blocos do compositor saem do contrato pela ÚNICA conversão
      // sancionada. Bloco `livre` COM texto não tem para onde ir até a camada
      // extra da F3 — recusar é o oposto de sumir em silêncio.
      const { blocos: derivados, semPapel } = blocosParaOCompositor(r.data.copyAutoral)
      // F3: bloco `livre` COM texto entra como camada EXTRA, vestindo o estilo do
      // papel que o autor declarou em `estilo.herdaDe`. Sem herança declarada não
      // há de onde tirar fonte, corpo e cor — recusar continua sendo o oposto de
      // sumir em silêncio.
      const livresComTexto = semPapel.filter((b) => b.linhas.length > 0)
      const semHeranca = livresComTexto.filter((b) => !b.estilo?.herdaDe)
      if (semHeranca.length > 0) {
        return { spec: null, problemas: [`copyAutoral: bloco(s) livre(s) com texto sem \`estilo.herdaDe\` (${semHeranca.map((b) => `"${b.id}"`).join(', ')}) — diga de que papel da assinatura a camada extra herda o estilo (pre, headline, apoio, cta, servico)`] }
      }
      const extrasDoContrato = livresComTexto.map((b) => ({
        id: b.id,
        linhas: [...b.linhas],
        herdaDe: b.estilo!.herdaDe as (typeof PAPEIS)[number],
        ...(b.estilo?.grupoVisual ? { grupoVisual: b.estilo.grupoVisual } : {}),
        ...(b.grupoDeLeitura ? { grupoDeLeitura: b.grupoDeLeitura } : {}),
        ordem: b.ordem,
      }))
      if (extrasDoContrato.length > 0) {
        const declaradas = r.data.camadasExtras ?? []
        if (declaradas.length === 0) r.data.camadasExtras = extrasDoContrato
        else if (canonico(declaradas.map((c) => ({ id: c.id, linhas: c.linhas }))) !== canonico(extrasDoContrato.map((c) => ({ id: c.id, linhas: c.linhas })))) {
          return { spec: null, problemas: ['copyAutoral: `camadasExtras` não bate com os blocos livres do contrato — mande só o contrato (as camadas extras saem dele)'] }
        }
      }
      // Os blocos DERIVADOS passam pelo mesmo schema dos explícitos (PR3-R8-03, 18/09/2026): o contrato aceita linha
      // vazia e até 12 linhas, o compositor não — e sem isto a porta gravava o job que o worker recusava ao revalidar
      // a spec expandida. Recusa aqui, sem cortar texto.
      const derivadosOk = z.array(blocoSchema).max(5).safeParse(derivados)
      if (!derivadosOk.success) {
        return {
          spec: null,
          problemas: derivadosOk.error.issues.map((p) => {
            const papel = typeof p.path[0] === 'number' ? derivados[p.path[0]]?.papel : undefined
            return `copyAutoral: o bloco ${papel ? `"${papel}" ` : ''}não cabe no compositor (${p.path.slice(1).join('.') || 'blocos'}: ${p.message}) — o compositor não desenha linha vazia nem mais de 6 linhas por bloco; ajuste o contrato (nada foi cortado)`
          }),
        }
      }
      const soPapelELinhas = (lista: Array<{ papel: string; linhas: string[] }>) => lista.map((b) => ({ papel: b.papel, linhas: b.linhas }))
      if (!r.data.blocos || r.data.blocos.length === 0) {
        r.data.blocos = derivados as unknown as NonNullable<typeof r.data.blocos>
      } else if (canonico(soPapelELinhas(r.data.blocos as Array<{ papel: string; linhas: string[] }>)) !== canonico(soPapelELinhas(derivados))) {
        return { spec: null, problemas: ['copyAutoral: `blocos` não bate com o contrato — mande só o contrato (os blocos saem dele) ou faça os dois dizerem o mesmo'] }
      }
    }
    if (!r.data.blocos || r.data.blocos.length === 0) return { spec: null, problemas: ['blocos: pelo menos um bloco (ou copyAutoral)'] }
    // A manchete é a peça: ela não herda de ninguém e não se repete.
    const mancheteHerda = r.data.blocos.find((b) => b.papel === 'headline' && b.herdaDe)
    if (mancheteHerda) return { spec: null, problemas: ['headline: a manchete não herda estilo de outro papel — ela é o papel'] }
    // Papel repetido só quando cada ocorrência além da primeira é uma camada
    // EXTRA com id próprio (função ≠ estilo, F3): sem id, duas camadas
    // disputariam o mesmo nome na página.
    const papeis = r.data.blocos.map((b) => b.papel)
    const repetidosSemId = r.data.blocos.filter((b, i) => papeis.indexOf(b.papel) !== i && !(b.herdaDe && b.id)).map((b) => b.papel)
    if (repetidosSemId.length > 0) return { spec: null, problemas: [`papel repetido: ${[...new Set(repetidosSemId)].join(', ')} — a segunda ocorrência precisa de \`id\` próprio e \`herdaDe\``] }
    const ids = [...r.data.blocos.map((b) => b.id ?? b.papel), ...(r.data.camadasExtras ?? []).map((c) => c.id)]
    const idsRepetidos = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (idsRepetidos.length > 0) return { spec: null, problemas: [`id de camada repetido: ${[...new Set(idsRepetidos)].join(', ')}`] }
    const c = r.data.carrossel
    if (c?.de && c.slide > c.de) return { spec: null, problemas: [`carrossel: o slide ${c.slide} não cabe num carrossel de ${c.de}`] }
    return { spec: r.data, problemas: [] }
  }
  return {
    spec: null,
    problemas: r.error.issues.map((p) => `${p.path.join('.') || '(raiz)'}: ${p.message}`),
  }
}

export const DIMENSOES: Record<Formato, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  quadrado: { width: 1080, height: 1080 },
}
