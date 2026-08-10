/**
 * Comparação de texto — as regras que decidem se dois textos são "o mesmo".
 *
 * Extraído de `creative-text-verification.ts` (que importa Prisma e o SDK de
 * IA) para poder ser usado por módulos PUROS: o diff de copy do aprendizado
 * precisa da mesma noção de "mudou de verdade × só mudou a diagramação", e
 * `@/lib/db` **lança no import** quando `DATABASE_URL` não está no ambiente.
 *
 * Continua re-exportado de `creative-text-verification.ts` — nenhum chamador
 * existente muda.
 */
/**
 * Normalização de comparação: uppercase, sem acento, espaços colapsados,
 * aspas/traços tipográficos reduzidos ao ASCII. Pontuação é MANTIDA — preço
 * ("R$ 49,90") é exatamente o caso que não pode passar com vírgula perdida.
 */
export function normalizeForComparison(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    // Separador de lista vira ESPAÇO, não ponto.
    //
    // Ele não é conteúdo: é diagramação. E o modelo escolhe como diagramar —
    // "R$ 89,00 por pessoa · Das 10h às 15h" ele pode desenhar com o ponto
    // médio, com barra, ou simplesmente QUEBRANDO A LINHA. Mapeando para ponto,
    // o esperado virava "…PESSOA.DAS 10H…" (a regra abaixo cola a pontuação nos
    // vizinhos) e a arte com quebra de linha virava "…PESSOA DAS 10H…": nunca
    // casavam. Reprovou duas artes boas do Espeto em 10/08 por causa de um
    // caractere de separação.
    //
    // Como espaço, as três formas convergem. Preço e hora seguem protegidos —
    // a vírgula de "R$ 49,90" e os dígitos não são tocados.
    .replace(/[•∙●・·|]/g, ' ')
    // A visão também espalha espaços em volta da pontuação ("VITÓRIA - ES",
    // "CANTO , VITÓRIA"). Colar a pontuação nos vizinhos normaliza os DOIS
    // lados da comparação sem tocar na pontuação em si.
    .replace(/\s*([.,;:!?\-])\s*/g, '$1')
    // "R$ 9,90" e "R$9,90" são o MESMO preço — o espaço após o símbolo é
    // tipografia, e o modelo usa a forma correta (com espaço) mesmo quando a
    // copy veio sem. Em 10/08/2026 isso reprovou uma arte do Espeto duas
    // vezes: todos os blocos batiam, só o espaço do "R$ 9,90" divergia.
    // O VALOR continua protegido: vírgula ou dígito trocado ainda reprova.
    .replace(/R\$\s+/gi, 'R$')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
