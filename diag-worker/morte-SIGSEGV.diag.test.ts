/** PROVA da instrumentação: o worker morre de forma controlada (SIGSEGV); a captura tem de registrar exatamente isso. */
import { it } from 'vitest'
it('morte controlada SIGSEGV', () => {
  const modo = 'SIGSEGV'
  if (modo === 'exit7') (process as unknown as { reallyExit: (c: number) => void }).reallyExit(7)
  else if (modo === 'abort') process.abort()
  else process.kill(process.pid, modo as NodeJS.Signals)
})
