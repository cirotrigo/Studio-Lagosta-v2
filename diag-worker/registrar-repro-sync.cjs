/** Diagnostic only: observe the EXACT unchanged PR238 child, without replacing results. */
const cp = require('node:child_process')
const crypto = require('node:crypto')
const { syncBuiltinESMExports } = require('node:module')
const { gravar, enumeracao } = require('./diario-seguro.cjs')
const CHILD_SHA256 = '064c9ed101a3b30243910b5ca321289d30371a5f167e4193ac6fd2e1d5190708'
const original = cp.spawnSync
cp.spawnSync = function (file, args, options) {
  const isProbe = file === process.execPath && Array.isArray(args) && args.length === 4 &&
    args[0] === '--expose-gc' && args[1] === '-e' && typeof args[2] === 'string' &&
    crypto.createHash('sha256').update(args[2]).digest('hex') === CHILD_SHA256
  const start = Date.now()
  const result = original.apply(this, arguments)
  if (isProbe) {
    gravar({ ev: 'exit', filho: result.pid, papel: 'encode-gc-probe', code: result.status,
      signal: result.signal ? enumeracao(result.signal) : null, vidaMs: Date.now() - start,
      probeSha256: CHILD_SHA256, temErro: Boolean(result.error) })
  }
  return result // no catch, no retry, no changed return values/assertions
}
syncBuiltinESMExports()
