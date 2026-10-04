/** Verificador local genérico, sem endpoint, DB ou política embutida.
 * Os pins e critérios vêm da execução autorizada, após revisão independente
 * da origem. Não os aceitar de HTTP, manifesto ou do autor do documento.
 * Um recibo JSON não restaura a capacidade opaca; não há atalho de CLI.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { atestarFonteDeTexto, hashDoTextoAprovado } from '../../src/lib/brand/texto-aprovado'

const politicaSchema = z.object({
  origemSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fonteSha256: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: z.number().int().positive(),
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  userMessageId: z.string().min(1),
  pergunta: z.string().min(1),
  resposta: z.string().min(1),
  trecho: z.string().min(1),
  referencia: z.string().min(1),
  aprovadoPor: z.string().min(1),
  aprovadoEm: z.string().min(1),
}).strict()
export type PoliticaDeAtestacaoLocal = Readonly<z.infer<typeof politicaSchema>>
const origemSchema = z.object({
  thread: z.object({ id: z.string(), kind: z.string() }).passthrough(),
  turn: z.object({
    id: z.string(), startedAt: z.number().finite(),
    items: z.array(z.object({
      id: z.string(), type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).optional(),
    }).passthrough()),
  }).passthrough(),
}).passthrough()

export async function atestarFonteLocal(args: {
  fontePath: string
  origemPath: string
  reciboPath: string
  /** Apenas configuração da execução autorizada, independente dos arquivos. */
  politica: PoliticaDeAtestacaoLocal
}) {
  const politica = politicaSchema.parse(args.politica)
  const origem: unknown = JSON.parse(readFileSync(args.origemPath, 'utf8'))
  const documento: unknown = JSON.parse(readFileSync(args.fontePath, 'utf8'))
  const fonte = await atestarFonteDeTexto({
    documento,
    sha256Esperado: politica.fonteSha256,
    conferirOrigem: async (d) => {
      if (hashDoTextoAprovado(origem) !== politica.origemSha256) return false
      const parsed = origemSchema.safeParse(origem)
      if (!parsed.success) return false
      const o = parsed.data
      const itens = o.turn.items.filter((i) => i.id === politica.userMessageId && i.type === 'userMessage')
      if (itens.length !== 1) return false
      const texto = itens[0].content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? ''
      const data = new Date(o.turn.startedAt * 1000)
      if (!Number.isFinite(data.getTime())) return false
      // Pergunta + resposta adjacentes: um "sim" de outra decisão não basta.
      return o.thread.id === politica.threadId && o.thread.kind === 'codex' &&
        o.turn.id === politica.turnId &&
        texto.includes(`<input>${politica.resposta}</input>`) &&
        texto.includes(`${politica.pergunta}\nuser:  ${politica.resposta}</transcript_delta>`) &&
        data.toISOString().slice(0, 10) === d.fonte.aprovadoEm.slice(0, 10) &&
        d.projectId === politica.projectId &&
        d.fonte.aprovadoPor === politica.aprovadoPor &&
        d.fonte.aprovadoEm === politica.aprovadoEm &&
        d.fonte.trecho === politica.trecho &&
        d.fonte.referencia === politica.referencia
    },
  })
  const recibo = {
    projectId: politica.projectId,
    fonteSha256: politica.fonteSha256,
    origemSha256: politica.origemSha256,
    metodo: 'transcricao_autorizada_com_politica_revisada',
    threadId: politica.threadId, turnId: politica.turnId,
    userMessageId: politica.userMessageId,
    aprovadoPor: politica.aprovadoPor, aprovadoEm: politica.aprovadoEm,
    limitacao: 'Atribuição textual da origem revisada; sem autenticação biométrica.',
    ativado: false, escritaServidor: false,
  }
  writeFileSync(args.reciboPath, JSON.stringify(recibo, null, 2) + '\n', { flag: 'wx' })
  return { fonte, recibo }
}
