/**
 * Guarda do vocabulário (S7, 06/11/2026; proposta § 5): no texto que a pessoa LÊ no editor, na Bancada, na agenda e
 * na vitrine, "Template" não volta. A pasta (`Template` do banco) é "pasta", a página reutilizável é "modelo" e o
 * editor é "Abrir no editor".
 *
 * Lê o TSX com o compilador e olha só o que vira tela: texto de JSX, string em atributo de JSX, string solta dentro
 * de `{…}` no JSX e o valor de `title`/`description`/`label`/`rotulo`/`placeholder` em objeto (toasts, menus).
 * Identificadores, rotas, query keys, comentários e valores como `via: 'template'` não são lidos.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '../../../..')
const PASTAS = [
  'src/components/templates',
  'src/components/bancada',
  'src/components/agenda',
  'src/components/modelos',
  'src/components/ai-creative-generator',
  'src/components/gerar-criativo',
]
const CHAVES_DE_TEXTO = new Set(['title', 'description', 'label', 'rotulo', 'placeholder'])
const PALAVRA = /\btemplates?\b/i
/** Atributos de JSX que não viram texto na tela. */
const ATRIBUTO_INVISIVEL = /^(className|key|href|id|value|name|type|variant|size|src|side|align|role|htmlFor|via|data-.*|on[A-Z].*)$/

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivosTsx(caminho)
    return nome.endsWith('.tsx') ? [caminho] : []
  })
}

/** Os textos visíveis de um arquivo TSX, com a linha. */
export function textosVisiveis(fonte: string, nome = 'x.tsx'): Array<{ linha: number; texto: string }> {
  const sf = ts.createSourceFile(nome, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const achados: Array<{ linha: number; texto: string }> = []
  const anotar = (n: ts.Node, texto: string) =>
    achados.push({ linha: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, texto })
  const textoDe = (n: ts.Node): string | null => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text
    if (ts.isTemplateExpression(n)) return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ')
    return null
  }
  /** Strings que viram tela dentro de `{…}`: a própria, ou os ramos de `a ? b : c` / `a && b` / `a || b`. */
  const ramos = (n: ts.Node) => {
    const t = textoDe(n)
    if (t !== null) return anotar(n, t)
    if (ts.isParenthesizedExpression(n)) return ramos(n.expression)
    if (ts.isConditionalExpression(n)) return (ramos(n.whenTrue), ramos(n.whenFalse))
    if (ts.isBinaryExpression(n) && n.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) ramos(n.right)
  }
  const visitar = (n: ts.Node) => {
    if (ts.isJsxText(n) && n.text.trim()) anotar(n, n.text)
    else if (ts.isJsxAttribute(n) && n.initializer && !ATRIBUTO_INVISIVEL.test(n.name.getText(sf))) {
      if (ts.isStringLiteral(n.initializer)) anotar(n, n.initializer.text)
      else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) ramos(n.initializer.expression)
    } else if (ts.isJsxExpression(n) && n.expression && !ts.isJsxAttribute(n.parent)) ramos(n.expression)
    else if (ts.isPropertyAssignment(n) && CHAVES_DE_TEXTO.has(n.name.getText(sf))) ramos(n.initializer)
    else if (ts.isVariableDeclaration(n) && /^rotulo/i.test(n.name.getText(sf)) && n.initializer) ramos(n.initializer)
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return achados
}

describe('vocabulário: "Template" não aparece no texto do editor, da Bancada, da agenda e da vitrine', () => {
  it('o leitor acha o texto de tela e ignora identificador', () => {
    const fonte = `
      const rotuloEditar = cond ? 'Editar vídeo' : 'Editar Template'
      export const X = () => (
        <div title="Template A" className="template">
          Template B {ok ? 'Template C' : null} {via === 'template' && <span />}
          <TemplatePanel templateId={1} />
          {toast({ title: \`Template \${n}\` })}
        </div>
      )`
    const textos = textosVisiveis(fonte).map((a) => a.texto.trim())
    expect(textos).toEqual(expect.arrayContaining(['Editar Template', 'Template A', 'Template B', 'Template C', 'Template']))
    expect(textos).not.toContain('template')
  })

  it('nenhum texto de tela com "template"', () => {
    const achados = PASTAS.flatMap((pasta) =>
      arquivosTsx(join(RAIZ, pasta)).flatMap((arquivo) =>
        textosVisiveis(readFileSync(arquivo, 'utf8'), arquivo)
          .filter((a) => PALAVRA.test(a.texto))
          .map((a) => `${relative(RAIZ, arquivo)}:${a.linha}  ${a.texto.trim()}`),
      ),
    )
    expect(achados).toEqual([])
  })
})
