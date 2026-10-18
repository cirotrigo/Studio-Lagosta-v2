/**
 * DIAGNÓSTICO v3: o ÚNICO escritor do diário (usado pelo registrador e pelo rastro). Regras (revisões R1/R2 do Codex):
 *  - o arquivo tem de estar DIRETAMENTE em DIAG_DIR (realpath do diretório pai === realpath de DIAG_DIR), terminar em `.jsonl`;
 *  - aberto com O_APPEND | O_CREAT | O_NOFOLLOW e modo 0600: symlink no próprio arquivo é recusado pelo SO; se já existir,
 *    tem de ser arquivo regular do mesmo dono;
 *  - teto de 20 MB POR PROCESSO (não por diário: vários processos somam); passou, para de gravar e avisa no stderr;
 *  - arquivo já existente só é aceito com 1 link (sem hardlink) e sem permissão de grupo/outros (modo & 077 === 0);
 *  - toda falha (recusa, abertura, escrita) é avisada no stderr — canal independente, vai para o .out da execução;
 *  - texto livre (nome de teste) NUNCA é gravado: o rastro usa o `task.id` opaco do Vitest; `caminhoDeTeste` só aceita
 *    caminho de teste do repositório (`src/…` ou `diag-worker/…` terminando em `.test.ts`, validado por segmento), senão
 *    `fora-do-padrao`; avisos no stderr só com motivo fechado + errno, nunca `e.message` (v3.2, revisão R4);
 *    `enumeracao` só aceita valores de uma lista fechada (sinal, estado);
 *    DIAG_EXEC só 1–3 dígitos.
 */
const fs = require('node:fs')
const path = require('node:path')
const TETO = 20 * 1024 * 1024
const avisar = (m) => {
  try {
    process.stderr.write(`[diag] ${m}\n`)
  } catch {}
}
const ENUMERACAO = new Set(['SIGKILL', 'SIGSEGV', 'SIGABRT', 'SIGTERM', 'SIGBUS', 'SIGILL', 'SIGFPE', 'SIGINT', 'SIGHUP', 'SIGPIPE', 'pass', 'fail', 'skip', 'todo', 'run', 'queued'])
const enumeracao = (v) => (ENUMERACAO.has(String(v)) ? String(v) : 'outro')
// R4: valida por SEGMENTO (sem `//`, `.`, `..`); raiz fechada; último segmento termina em `.test.ts`; teto de 200 chars.
const SEGMENTO = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/
const caminhoDeTeste = (v) => {
  const s = typeof v === 'string' ? v : ''
  const seg = s.split('/')
  const ok = s.length <= 200 && seg.length >= 2 && (seg[0] === 'src' || seg[0] === 'diag-worker') && seg.every((x) => SEGMENTO.test(x) && !x.includes('..')) && seg[seg.length - 1].endsWith('.test.ts')
  return ok ? s : 'fora-do-padrao'
}
// R4: o stderr leva só motivo fechado + errno (`E` maiúsculo, sem caminho) — nunca `e.message`, que pode citar DIAG_LOG/DIAG_DIR.
const errno = (e) => (e && typeof e.code === 'string' && /^E[A-Z0-9]{2,15}$/.test(e.code) ? e.code : 'sem-errno')
class Recusa extends Error {
  constructor(motivo) {
    super(motivo)
    this.motivo = motivo
  }
}
const opaco = (v) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(v ?? '')) ? String(v) : 'fora-do-padrao')
const EXEC = /^\d{1,3}$/.test(process.env.DIAG_EXEC || '') ? process.env.DIAG_EXEC : 'invalido'
let fd = null
let bytes = 0
let parado = false
function abrir() {
  const LOG = process.env.DIAG_LOG
  const DIR = process.env.DIAG_DIR
  if (!LOG || !DIR) return null
  try {
    if (!LOG.endsWith('.jsonl')) throw new Recusa('sem-jsonl')
    if (fs.realpathSync(path.dirname(path.resolve(LOG))) !== fs.realpathSync(path.resolve(DIR))) throw new Recusa('fora-do-dir')
    const f = fs.openSync(LOG, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600)
    const st = fs.fstatSync(f)
    if (!st.isFile() || (typeof process.getuid === 'function' && st.uid !== process.getuid()) || st.nlink !== 1 || (st.mode & 0o077) !== 0) {
      fs.closeSync(f)
      throw new Recusa('nao-regular-dono-link-ou-modo')
    }
    return f
  } catch (e) {
    avisar(`diário recusado: ${e instanceof Recusa ? e.motivo : 'erro-de-abertura'} ${errno(e)}`)
    parado = true
    return null
  }
}
function gravar(o) {
  if (parado) return
  if (fd === null) fd = abrir()
  if (fd === null) return
  const linha = JSON.stringify({ t: new Date().toISOString(), exec: EXEC, pid: process.pid, ...o }) + '\n'
  if (bytes + linha.length > TETO) {
    parado = true
    avisar('teto de 20 MB atingido: diário parado')
    return
  }
  try {
    const buf = Buffer.from(linha)
    const n = fs.writeSync(fd, buf)
    bytes += n
    if (n !== buf.length) avisar(`gravação parcial: ${n} de ${buf.length} bytes`)
  } catch (e) {
    avisar(`falha de gravação: ${errno(e)}`)
  }
}
module.exports = { gravar, enumeracao, caminhoDeTeste, opaco }
