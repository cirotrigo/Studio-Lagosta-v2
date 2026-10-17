/** DIAGNÓSTICO v3: início e fim de cada `it` pelo diário seguro; nome e arquivo SANITIZADOS. `it-inicio` sem `it-fim` = inconclusivo (morte, timeout). */
import { createRequire } from 'node:module'
import { afterEach, beforeEach } from 'vitest'
const { gravar, texto } = createRequire(import.meta.url)('./diario-seguro.cjs') as { gravar: (o: object) => void; texto: (v: unknown) => string }
type Ctx = { task: { name: string; file?: { name: string }; result?: { state?: string } } }
const registrar = (ev: string, ctx: Ctx) =>
  gravar({ ev, arquivo: texto(ctx.task.file?.name), nome: texto(ctx.task.name), ...(ev === 'it-fim' ? { estado: texto(ctx.task.result?.state) } : {}) })
beforeEach((ctx) => registrar('it-inicio', ctx as unknown as Ctx))
afterEach((ctx) => registrar('it-fim', ctx as unknown as Ctx))
