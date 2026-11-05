/**
 * CLI de curadoria do importador de SVG (CP-V6). Lê UM arquivo local, chama o importador puro
 * (`src/lib/vetor/importar.ts`) e escreve a PROPOSTA de entrada de catálogo em JSON (stdout ou `--saida`). Nada mais:
 * sem rede, banco, Blob, upload nem ativação no catálogo — quem cura copia a entrada para `shapes-library.ts` em PR.
 *
 *   npx tsx scripts/importar-vetor.ts arte.svg --id onda-tripla --rotulo "Ondas" --categoria organicos \
 *     --slot "#1e3a8a=fundo:escuro:Onda de trás" --slot "#f97316=frente:destaque" [--keywords onda,base] \
 *     [--versao 1] [--ajuste travado|livre] [--saida proposta.json]
 *
 * Saída: 0 proposta completa · 3 proposta com pendências de curadoria (papel de cor, id…) · 2 SVG recusado (código e
 * motivo no stderr, JSON no stdout) · 1 uso inválido. A proposta nunca sai ativada.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { ENTRADA_MAX_BYTES, importarSvg, type Curadoria, type CuradoriaDoSlot } from '../src/lib/vetor/importar'

function uso(msg: string): never {
  process.stderr.write(`importar-vetor: ${msg}\nuso: importar-vetor <arquivo.svg> [--id] [--rotulo] [--categoria] [--slot "#hex=slot:papel[:Rótulo]"]... [--keywords a,b] [--versao n] [--ajuste travado|livre] [--saida arquivo.json]\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
let arquivo: string | undefined
let saida: string | undefined
const curadoria: Curadoria = {}
const slots: Record<string, CuradoriaDoSlot> = {}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (!a.startsWith('--')) {
    if (arquivo) uso(`dois arquivos (${arquivo}, ${a})`)
    arquivo = a
    continue
  }
  const v = args[++i]
  if (v === undefined) uso(`${a} sem valor`)
  if (a === '--id') curadoria.id = v
  else if (a === '--rotulo') curadoria.label = v
  else if (a === '--categoria') curadoria.category = v as Curadoria['category']
  else if (a === '--keywords') curadoria.keywords = v.split(',').map((k) => k.trim()).filter(Boolean)
  else if (a === '--versao') curadoria.versao = Number(v)
  else if (a === '--ajuste') {
    if (v !== 'travado' && v !== 'livre') uso('--ajuste é travado ou livre')
    curadoria.ajuste = v
  } else if (a === '--saida') saida = v
  else if (a === '--slot') {
    const m = /^(#[0-9a-fA-F]{3,6})=([^:]+):([^:]+)(?::(.+))?$/.exec(v)
    if (!m) uso(`--slot "${v}" (formato "#hex=slot:papel[:Rótulo]")`)
    if (Object.hasOwn(slots, m![1])) uso(`--slot repetido para ${m![1]}`)
    slots[m![1]] = { id: m![2], papelPadrao: m![3] as CuradoriaDoSlot['papelPadrao'], ...(m![4] && { rotulo: m![4] }) }
  } else uso(`opção desconhecida ${a}`)
}
if (!arquivo) uso('falta o arquivo SVG')
if (Object.keys(slots).length) curadoria.slots = slots

let bytes: Buffer
try {
  // o teto vem antes da leitura: arquivo enorme nem é carregado
  const tamanho = statSync(arquivo!).size
  if (tamanho > ENTRADA_MAX_BYTES) {
    process.stdout.write(`${JSON.stringify({ ok: false, codigo: 'ENTRADA_GRANDE_DEMAIS', mensagem: `${tamanho} bytes (máximo ${ENTRADA_MAX_BYTES})` }, null, 2)}\n`)
    process.stderr.write(`recusado: ENTRADA_GRANDE_DEMAIS\n`)
    process.exit(2)
  }
  bytes = readFileSync(arquivo!)
} catch (e) {
  uso(`não consegui ler ${arquivo}: ${(e as Error).message}`)
}

const r = importarSvg(bytes!, curadoria)
if (r.ok === false) {
  const recusa = r as Extract<typeof r, { ok: false }>
  process.stdout.write(`${JSON.stringify(recusa, null, 2)}\n`)
  process.stderr.write(`recusado: ${recusa.codigo} — ${recusa.mensagem}\n`)
  process.exit(2)
}
const { proposta } = r as Extract<typeof r, { ok: true }>
const json = `${JSON.stringify({ ...proposta, origem: { arquivo: arquivo!.split('/').pop(), sha256: createHash('sha256').update(bytes!).digest('hex') } }, null, 2)}\n`
if (saida) writeFileSync(saida, json)
else process.stdout.write(json)
if (proposta.pendencias.length) {
  process.stderr.write(`proposta com pendências de curadoria: ${proposta.pendencias.join('; ')}\n`)
  process.exit(3)
}
