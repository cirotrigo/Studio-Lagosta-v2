/**
 * Como um TEMA pedido ("happy hour", "almoço executivo") casa com as TAGS de
 * um modelo — e como um DIA casa com o nome de página/template.
 *
 * Módulo PURO (sem Prisma) porque `arte-rapida.ts` puxa `@/lib/db`, que
 * lança no import sem `DATABASE_URL`, e esta decisão precisa de teste
 * unitário: foi um casamento frouxo que fez `escolher-modelo("funcionamento")`
 * devolver "Celebrações Especiais" no O Quintal Parrilla (01/09/2026).
 *
 * O que estava frouxo, medido no caso real:
 *  - o tema casava por substring NOS DOIS SENTIDOS (`tag.includes(v) ||
 *    v.includes(t)`), com palavras de 3 letras — "hh" ou "pra" acertariam
 *    qualquer tag que os contivesse;
 *  - o DIA casava por `nome.includes(dia)`: "quinta" está dentro de
 *    "O QUINTAl Parrilla — Celebrações Especiais", então TODO template do
 *    cliente era "de quinta". Era por esse buraco que o fallback só-dia
 *    entregava qualquer página quando o tema não achava nada.
 *
 * Regras que ficam:
 *  - o tema inteiro normalizado ("happy-hour") casa com a tag IGUAL;
 *  - uma PALAVRA do tema só casa se tiver ≥ 4 letras e a tag (ou um token
 *    dela) for igual a ela ou COMEÇAR por ela. Nunca `tag.includes(palavra)`
 *    e nunca `palavra.includes(tag)`;
 *  - o dia casa por TOKEN do nome (separado por espaço, hífen, pontuação):
 *    "quinta-feira" e "By Rock — Quinta" casam; "Quintal" não.
 */

/** Minúsculas, sem acento, espaços → hífen. Mesma forma das tags gravadas. */
export function normalizarTema(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** Tamanho mínimo de uma palavra do tema para valer sozinha. */
const MIN_LETRAS = 4

function tokens(s: string): string[] {
  return normalizarTema(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * O tema casa com ALGUMA das tags?
 *
 * Nenhum dos dois lados é examinado por substring solta: a palavra precisa
 * ser prefixo (ou igual) da tag ou de um token dela.
 */
export function casaTemaComTags(tema: string, tags: ReadonlyArray<string>): boolean {
  const temaNorm = normalizarTema(tema)
  if (!temaNorm) return false
  const tagsNorm = tags.map(normalizarTema).filter(Boolean)
  if (tagsNorm.length === 0) return false

  if (tagsNorm.some((t) => t === temaNorm)) return true

  const palavras = tokens(temaNorm).filter((w) => w.length >= MIN_LETRAS)
  return palavras.some((w) =>
    tagsNorm.some((t) => t === w || t.startsWith(w) || tokens(t).some((tok) => tok === w || tok.startsWith(w))),
  )
}

/**
 * O nome (de página ou de template) declara o dia `dia`?
 *
 * `dia` chega como o chamador escreveu ("sexta", "sexta-feira", "Sábado");
 * o sufixo "-feira" é descartado dos dois lados e o casamento é por TOKEN.
 */
export function casaDiaComNome(nome: string | null | undefined, dia: string): boolean {
  if (!nome) return false
  const alvo = normalizarTema(dia).replace(/-feira$/, '')
  if (!alvo) return false
  return tokens(nome).some((tok) => tok === alvo)
}
