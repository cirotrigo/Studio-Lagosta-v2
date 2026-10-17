/** DIAGNÓSTICO v3: início e fim de cada `it` pelo diário seguro; sem nome de teste (só o `task.id` opaco); arquivo só se for caminho de teste do repositório. `it-inicio` sem `it-fim` = inconclusivo (morte, timeout). */
import { createRequire } from 'node:module'
import { afterEach, beforeEach } from 'vitest'
const { gravar, enumeracao, caminhoDeTeste, opaco } = createRequire(import.meta.url)('./diario-seguro.cjs') as {
  gravar: (o: object) => void
  enumeracao: (v: unknown) => string
  caminhoDeTeste: (v: unknown) => string
  opaco: (v: unknown) => string
}
type Ctx = { task: { id: string; file?: { name: string }; result?: { state?: string } } }
const registrar = (ev: string, ctx: Ctx) =>
  gravar({ ev, arquivo: caminhoDeTeste(ctx.task.file?.name), teste: opaco(ctx.task.id), ...(ev === 'it-fim' ? { estado: enumeracao(ctx.task.result?.state) } : {}) })
beforeEach((ctx) => registrar('it-inicio', ctx as unknown as Ctx))
afterEach((ctx) => registrar('it-fim', ctx as unknown as Ctx))
