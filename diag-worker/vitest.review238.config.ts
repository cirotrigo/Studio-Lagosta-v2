import { defineConfig } from 'vitest/config'
import oficial from '../vitest.config'
export default defineConfig({ ...oficial, test: { ...oficial.test, include: [
 'src/lib/__tests__/canvas-encode-sobrevive-ao-gc.test.ts',
 'src/lib/__tests__/canvas-fonte-generica-tem-acento.test.ts',
 'src/lib/__tests__/texto-altura-automatica.test.ts',
 'src/lib/posts/__tests__/fetch-buffer-sinal.test.ts',
 'src/lib/compositor/__tests__/legibilidade-da-logo.test.ts',
 'src/lib/creatives/__tests__/text-geometry-encaixe.test.ts',
 'src/lib/creatives/revisao/__tests__/regras.test.ts',
 'src/lib/creatives/revisao/__tests__/nao-piora.test.ts',
 'src/lib/creatives/revisao/__tests__/ajustar-sem-piorar.test.ts',
 'src/lib/creatives/revisao/__tests__/cp3-logo-sem-leitura.test.ts',
 'src/lib/creatives/halo/__tests__/fundo-de-texto.test.ts',
], } })
