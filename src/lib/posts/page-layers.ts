/**
 * Leitura de `Page.layers` — a única forma correta na base.
 *
 * ⚠️ A CODIFICAÇÃO É INCONSISTENTE NO BANCO. O mesmo campo aparece como:
 *   - array nativo (o caminho normal do Prisma com coluna Json);
 *   - string JSON (o PageSync grava assim em alguns caminhos);
 *   - string DUPLA-CODIFICADA (`"\"[{...}]\""`), o legado registrado no
 *     CLAUDE.md (§ Editor PageSync autosave).
 *
 * O `parseLayers` de `src/lib/creatives/arte-rapida.ts` decodifica UM nível e
 * devolve `[]` **em silêncio** na dupla. Para escolher slots isso só degrada;
 * para o diff de copy do aprendizado é o pior defeito possível: as camadas
 * ilegíveis viram "nenhum texto", o diff sai vazio e o corpus registra "o
 * usuário não editou nada" — exatamente o contrário do que aconteceu.
 *
 * Por isso a decodificação profunda vive aqui, num módulo SEM Prisma e sem
 * nenhuma dependência: `diff-copy.ts` precisa ser testável sem banco, e
 * `@/lib/db` **lança no import** quando `DATABASE_URL` não está no ambiente
 * (ver `src/lib/db.ts`).
 */

/** O que este módulo precisa saber de uma camada. O resto passa direto. */
export interface PageLayer {
  id?: string
  name?: string
  type?: string
  content?: unknown
  [k: string]: unknown
}

/** Quantos níveis de string aninhada aceitamos antes de desistir. */
const MAX_PROFUNDIDADE = 3

/**
 * `Page.layers` → array de camadas, aceitando as três codificações.
 * Devolve `[]` quando é ilegível — quem precisa distinguir "vazio" de
 * "ilegível" usa `lerCamadas`, abaixo.
 */
export function parsePageLayers(raw: unknown): PageLayer[] {
  return lerCamadas(raw).camadas
}

/**
 * Igual ao acima, mas dizendo se a leitura FUNCIONOU.
 *
 * "Página sem camada de texto" e "não consegui ler a página" são fatos
 * diferentes, e confundi-los é o que produz o diff falsamente vazio. Quem
 * agrega aprendizado tem de poder recusar o segundo.
 */
export function lerCamadas(raw: unknown): { camadas: PageLayer[]; legivel: boolean } {
  let valor = raw
  let profundidade = 0
  while (typeof valor === 'string' && profundidade < MAX_PROFUNDIDADE) {
    try {
      valor = JSON.parse(valor)
      profundidade++
    } catch {
      return { camadas: [], legivel: false }
    }
  }
  if (!Array.isArray(valor)) return { camadas: [], legivel: false }
  return { camadas: valor as PageLayer[], legivel: true }
}

/**
 * Normaliza `Page.layers` para uma string canônica de comparação.
 * `null` quando ilegível.
 *
 * Serve para detectar mudança real antes de invalidar o render: o PATCH da
 * página também recebe autosave e thumbnails do PageSync a cada troca de
 * página — invalidar sem comparar re-renderizaria os agendados toda vez que
 * alguém abre o editor.
 *
 * (Vivia em `invalidate-renders.ts`, que importa Prisma; mudou de casa para
 * poder ser usada por módulos puros. Continua re-exportada de lá.)
 */
export function normalizeLayersString(raw: unknown): string | null {
  const { camadas, legivel } = lerCamadas(raw)
  if (!legivel) return null
  return JSON.stringify(camadas)
}

/**
 * Textos da página, no formato que `extractExpectedTexts` lê (`slotValues`):
 * chave = nome da camada (o mesmo que o editor mostra), valor = conteúdo.
 *
 * É o que dá à melhoria com IA a verificação de texto — sem textos esperados
 * ela roda com `textCheck: 'skipped'` e ninguém confere se o modelo reescreveu
 * a headline — e é o lado FINAL do diff de copy do aprendizado.
 *
 * Nome repetido entre camadas: o sufixo `#2`, `#3`… mantém as duas no mapa.
 * Antes, a segunda camada de mesmo nome apagava a primeira, e o diff acusava
 * um texto "removido" que estava lá.
 */
export function textosDaPagina(layers: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const layer of parsePageLayers(layers)) {
    if (layer?.type !== 'text') continue
    // Camada OCULTA não é copy da peça: desde 13/08/2026 o campo que a copy
    // não cobre sai invisível (placeholder do modelo), e contá-lo aqui poria
    // no corpus — e no diff — um texto que não está na arte.
    if (layer.visible === false) continue
    const conteudo = typeof layer.content === 'string' ? layer.content.trim() : ''
    if (!conteudo) continue
    const base = layer.name ?? layer.id ?? 'texto'
    let chave = base
    let n = 2
    while (chave in out) chave = `${base}#${n++}`
    out[chave] = conteudo
  }
  return out
}
