/**
 * DIAGNÓSTICO v3: o ÚNICO escritor do diário (usado pelo registrador e pelo rastro). Regras (revisões R1/R2 do Codex):
 *  - o arquivo tem de estar DIRETAMENTE em DIAG_DIR (realpath do diretório pai === realpath de DIAG_DIR), terminar em `.jsonl`;
 *  - aberto com O_APPEND | O_CREAT | O_NOFOLLOW e modo 0600: symlink no próprio arquivo é recusado pelo SO; se já existir,
 *    tem de ser arquivo regular do mesmo dono;
 *  - teto de 20 MB por processo; passou, para de gravar e avisa no stderr;
 *  - toda falha (recusa, abertura, escrita) é avisada no stderr — canal independente, vai para o .out da execução;
 *  - campos de texto só entram SANITIZADOS (`texto`): fora de [A-Za-z0-9 ._/:-]{1,120} vira `h:<sha256[0..12]>`;
 *    DIAG_EXEC só 1–3 dígitos.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const TETO = 20 * 1024 * 1024
const avisar = (m) => {
  try {
    process.stderr.write(`[diag] ${m}\n`)
  } catch {}
}
const texto = (v) => {
  const s = String(v ?? '')
  return /^[A-Za-z0-9 ._/:-]{1,120}$/.test(s) ? s : `h:${crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)}`
}
const EXEC = /^\d{1,3}$/.test(process.env.DIAG_EXEC || '') ? process.env.DIAG_EXEC : 'invalido'
let fd = null
let bytes = 0
let parado = false
function abrir() {
  const LOG = process.env.DIAG_LOG
  const DIR = process.env.DIAG_DIR
  if (!LOG || !DIR) return null
  try {
    if (!LOG.endsWith('.jsonl')) throw new Error('DIAG_LOG sem .jsonl')
    if (fs.realpathSync(path.dirname(path.resolve(LOG))) !== fs.realpathSync(path.resolve(DIR))) throw new Error('DIAG_LOG fora de DIAG_DIR')
    const f = fs.openSync(LOG, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600)
    const st = fs.fstatSync(f)
    if (!st.isFile() || (typeof process.getuid === 'function' && st.uid !== process.getuid())) {
      fs.closeSync(f)
      throw new Error('DIAG_LOG não é arquivo regular do usuário')
    }
    return f
  } catch (e) {
    avisar(`diário recusado: ${e.message}`)
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
    fs.writeSync(fd, linha)
    bytes += linha.length
  } catch (e) {
    avisar(`falha de gravação: ${e.message}`)
  }
}
module.exports = { gravar, texto }
