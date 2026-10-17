/** PROVA da instrumentação: o worker morre de forma controlada (exit7); a captura tem de registrar exatamente isso. */
import { it } from 'vitest'
it('morte controlada exit7', () => {
  const modo = 'exit7'
  if (modo === 'exit7') (process as unknown as { reallyExit: (c: number) => void }).reallyExit(7)
  else if (modo === 'abort') process.abort()
  else process.kill(process.pid, modo as NodeJS.Signals)
})
