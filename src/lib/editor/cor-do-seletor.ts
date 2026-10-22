/**
 * A cor que o seletor nativo (`<input type="color">`) e a paleta da marca MOSTRAM para o preenchimento e a borda de
 * uma forma. Só apresentação: não valida, não grava e não normaliza o `style` (ver docs/regras/editor-e-galeria.md,
 * "Campo de texto da cor grava só ao confirmar").
 *
 * O painel grava a cor de várias formas não-hex (`rgba(…)`, `hsla(…)`, `rgb(… / a)`, nome CSS), e o conversor antigo
 * só entendia hex: tudo o mais caía no fallback (o azul da borda), e a paleta acendia o swatch do fallback.
 *
 * - Lê pelo `lerCor` (o leitor canônico): o seletor mostra os CANAIS (`#rrggbb`); o alfa fica no `style` e no slider
 *   de transparência. `rgba(…, 0)` também mostra os canais.
 * - O literal `transparent` (sem canais), o ausente, o ilegível e o contextual (`currentcolor`, CSS-wide) mostram o
 *   `fallback`, como antes.
 * - Pré-condição: `fallback` é um hex de 6 dígitos literal e válido (hoje `#2563eb` e `#1e3a8a`); não é validado aqui.
 *   Com ela, a saída é sempre `#rrggbb`.
 */
import { lerCor } from '@/lib/vetor/cor'

export function corParaSeletor(valor: string | undefined, fallback: string): string {
  const lida = lerCor(valor)
  return lida && lida !== 'transparente' ? lida.hex : fallback
}
