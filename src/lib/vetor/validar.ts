/**
 * Validador de `pathData` de camada `svg-path` (CP-V0). Puro, sem banco: as portas
 * de escrita passam a usá-lo no CP-X2. Aceita a gramática de path do SVG RESTRITA ao
 * que o parser do Konva (o único, ver `tracar.ts`) lê igual à especificação:
 * - o path tem de começar com `M` e desenhar algo (não só `M`);
 * - depois de `Z`, o próximo comando tem de ser `M`/`m`;
 * - flags de arco separadas (`0 1 1`, nunca `011`) e raios > 0;
 * - números finitos, sem a forma `10.e5`; vírgula só entre dois números.
 */

export const PATH_DATA_MAX_BYTES = 16 * 1024

export type FalhaDoPath =
  | 'NAO_E_TEXTO'
  | 'VAZIO'
  | 'GRANDE_DEMAIS'
  | 'CARACTERE_INVALIDO'
  | 'NAO_COMECA_COM_M'
  | 'ARGUMENTOS'
  | 'ARCO_FLAG'
  | 'ARCO_RAIO'
  | 'APOS_Z_SEM_M'
  | 'SEM_DESENHO'

export type ResultadoDoPath = { ok: true } | { ok: false; codigo: FalhaDoPath; mensagem: string }

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }
const NUMERO = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/
const ESPACO = /^\s+/
const SEPARADOR = /^(?:\s*,\s*|\s+)/ // no máximo uma vírgula

const falha = (codigo: FalhaDoPath, mensagem: string): ResultadoDoPath => ({ ok: false, codigo, mensagem })

export function validarPathData(d: unknown): ResultadoDoPath {
  if (typeof d !== 'string') return falha('NAO_E_TEXTO', 'pathData tem de ser texto')
  if (!d.trim()) return falha('VAZIO', 'pathData vazio')
  const bytes = new TextEncoder().encode(d).length
  if (bytes > PATH_DATA_MAX_BYTES) {
    return falha('GRANDE_DEMAIS', `pathData com ${bytes} bytes (máximo ${PATH_DATA_MAX_BYTES})`)
  }

  let resto = d.replace(ESPACO, '')
  let anterior = ''
  let desenha = false
  let primeiro = true
  while (resto) {
    const letra = resto[0]
    const cmd = letra.toLowerCase()
    if (!(cmd in ARGS)) return falha('CARACTERE_INVALIDO', `caractere inválido "${letra}"`)
    if (primeiro && cmd !== 'm') return falha('NAO_COMECA_COM_M', 'o path tem de começar com M')
    if (anterior === 'z' && cmd !== 'm') return falha('APOS_Z_SEM_M', `"${letra}" depois de Z sem M`)
    primeiro = false
    resto = resto.slice(1).replace(ESPACO, '')

    const n = ARGS[cmd]
    let lidos = 0
    // lê grupos de n números até o próximo comando
    while (n > 0 && resto && !/^[A-Za-z]/.test(resto)) {
      const posicao = lidos % n
      if (cmd === 'a' && (posicao === 3 || posicao === 4)) {
        // flag do arco: 0 ou 1, SEPARADA do que vem depois (o Konva lê `1010` como um número só)
        if (!/^[01](?=[\s,]|$)/.test(resto)) return falha('ARCO_FLAG', 'flag de arco tem de ser 0 ou 1, separada')
        resto = resto.slice(1)
      } else {
        const m = NUMERO.exec(resto)
        if (!m) return falha('CARACTERE_INVALIDO', `número inválido perto de "${resto.slice(0, 12)}"`)
        if (/\d\.[eE]/.test(m[0])) return falha('CARACTERE_INVALIDO', `número "${m[0]}" (o Konva lê como dois)`)
        const valor = Number(m[0])
        if (!Number.isFinite(valor)) return falha('CARACTERE_INVALIDO', `número não finito "${m[0]}"`)
        if (cmd === 'a' && posicao < 2 && valor <= 0) return falha('ARCO_RAIO', 'raio de arco tem de ser > 0')
        resto = resto.slice(m[0].length)
      }
      const sep = SEPARADOR.exec(resto)
      resto = sep ? resto.slice(sep[0].length) : resto
      if (sep?.[0].includes(',') && (!resto || /^[A-Za-z]/.test(resto))) {
        return falha('CARACTERE_INVALIDO', 'vírgula sem número depois')
      }
      lidos++
    }
    if (n === 0 ? lidos !== 0 : lidos === 0 || lidos % n !== 0) {
      return falha('ARGUMENTOS', `"${letra}" com ${lidos} número(s); espera múltiplo de ${n}`)
    }
    // M com pares extras = L implícitos
    if (cmd !== 'm' || lidos > 2) desenha ||= cmd !== 'z'
    anterior = cmd
  }
  if (!desenha) return falha('SEM_DESENHO', 'o path não desenha nada (só M)')
  return { ok: true }
}
