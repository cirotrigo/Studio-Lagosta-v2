/**
 * Bundle do harness do CP-V2d: o `TemplateEditorShell` REAL (rail, títulos, montagem, drawer, `MultiPageProvider`,
 * `TemplateEditorProvider`, `PageSyncWrapper` e o painel "Elementos") com os vizinhos pesados trocados por falsos
 * (`FALSOS`, cada um com o motivo). O CSS é o Tailwind do próprio `globals.css`, compilado pelo postcss.
 *
 * Variantes (controles negativos; `V2D_VARIANTE`):
 * - `base`: o shell e o painel de formas do merge `f561dc2b` (antes do V2d), via `git show`;
 * - `sem-bloqueio`: o painel insere fora de `pronto` (sem `disabled` e sem o estado no construtor);
 * - `d5-solto`: o aviso D5 ligado a "paleta sem cor", ignorando `ausenciaConfirmada` e o erro;
 * - `busca-antiga`: a Marca e o "nada encontrado" como antes da revisão do Codex (a busca escondia carregando/erro).
 *
 * Variantes do CP-V2e (só no bundle; cada uma recusa o bundle se a troca não aplicar):
 * - `sem-confirmacao`: a lixeira da Marca chama a exclusão direto, sem o diálogo;
 * - `hook-permissivo`: a consulta volta a `Array.isArray(d) ? d : []` (HTML 200 e não-lista viram vazia);
 * - `sem-invalidacao`: o `onSettled` das mutações não invalida nada;
 * - `delete-aceita-qualquer-resposta`: a exclusão não passa pelo `lerExclusaoConfirmada`;
 * - `invalida-projeto-atual`: as mutações invalidam o projeto DA TELA (lido da sonda), não o da mutação;
 * - `upload-json`: o envio sai como JSON (`JSON.stringify(FormData)` = `{}`, como o `api.post`), sem multipart.
 */
import { build, type Plugin } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

export const RAIZ = path.resolve(__dirname, '../../..')
export const BASE = 'f561dc2bd0e27996121229e24ab73bc0ba734518'
export type Variante =
  | 'v2d'
  | 'base'
  | 'sem-bloqueio'
  | 'd5-solto'
  | 'busca-antiga'
  | 'sem-confirmacao'
  | 'hook-permissivo'
  | 'sem-invalidacao'
  | 'delete-aceita-qualquer-resposta'
  | 'invalida-projeto-atual'
  | 'upload-json'

/** Troca TODAS as ocorrências de cada par e exige que cada uma tenha aplicado exatamente `vezes` vezes. */
function trocar(atual: string, variante: string, pares: Array<[string, string, number?]>): string {
  let saida = atual
  for (const [de, para, vezes = 1] of pares) {
    const n = saida.split(de).length - 1
    if (n !== vezes) throw new Error(`variante ${variante} não aplicou (${n}× em vez de ${vezes}×): ${de.slice(0, 60)}`)
    saida = saida.split(de).join(para)
  }
  return saida
}

/** Módulo → motivo. Todos vão para `falsos.tsx`; nenhum dos arquivos que o V2d muda está aqui. */
export const FALSOS: Record<string, string> = {
  'next/image': 'otimizador do Next não existe fora do servidor; vira <img>',
  'next/navigation': 'roteador do App Router não existe fora do Next',
  './editor-canvas': 'canvas Konva e stage (atalhos): fora da prova; vira a sonda do contexto',
  './properties-panel': 'painel de propriedades: fora do escopo; pesado',
  '@/hooks/use-credits': 'Clerk e créditos',
  '@/hooks/use-page-config': 'metadado de página do layout autenticado',
  '@clerk/nextjs': 'sem Clerk no harness (nenhum provedor montado; nenhuma rede)',
  // CP-V2e (revisão 2): só a dependência EXTERNA do upload da Identidade visual; a mutação e o componente são os reais
  '@/hooks/use-blob-upload': 'upload direto ao Vercel Blob (rede externa); vira um upload falso controlável pela página',
}

const ehFalso = (spec: string) => Object.prototype.hasOwnProperty.call(FALSOS, spec)

function fonteDaVariante(variante: Variante, arquivo: string): string | null {
  const rel = path.relative(RAIZ, arquivo).split(path.sep).join('/')
  const v2e = fonteDaVarianteV2e(variante, rel, arquivo)
  if (v2e !== null) return v2e
  if (variante === 'base' && rel === 'src/components/templates/template-editor-shell.tsx') {
    return execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: RAIZ }).toString()
  }
  if (variante === 'busca-antiga' && rel === 'src/components/templates/panels/marca-do-projeto.tsx') {
    const atual = readFileSync(arquivo, 'utf8')
    const trocado = atual.replace('if (procurando && elementos.isSuccess && visiveis.length === 0) return null', 'if (procurando && visiveis.length === 0) return null')
    if (trocado === atual) throw new Error('variante busca-antiga não aplicou na Marca')
    return trocado
  }
  if (rel !== 'src/components/templates/panels/elementos-panel.tsx') return null
  const atual = readFileSync(arquivo, 'utf8')
  if (variante === 'busca-antiga') {
    const trocado = atual.replace('grupos.length === 0 && elementos.isSuccess && !marcaCasa', 'grupos.length === 0 && !marcaCasa')
    if (trocado === atual) throw new Error('variante busca-antiga não aplicou no painel')
    return trocado
  }
  if (variante === 'sem-bloqueio') {
    const trocado = atual
      .replace('disabled={!pronto}', 'disabled={false}')
      .replace(
        "const camada = camadaParaInserir(estado, definition, { base: createDefaultLayer('shape'), canvas: design.canvas })",
        "const camada = camadaParaInserir({ estado: 'pronto', marca: { paleta: [], assinaturaCrua: null }, ausenciaConfirmada: true }, definition, { base: createDefaultLayer('shape'), canvas: design.canvas })",
      )
    if (trocado === atual || !trocado.includes('disabled={false}') || !trocado.includes("estado: 'pronto', marca")) throw new Error('variante sem-bloqueio não aplicou')
    return trocado
  }
  if (variante === 'd5-solto') {
    const trocado = atual.replace(
      "estado.estado === 'pronto' && estado.ausenciaConfirmada",
      "estado.estado !== 'carregando' && (paleta.data?.cores ?? []).length === 0",
    )
    if (trocado === atual) throw new Error('variante d5-solto não aplicou')
    return trocado
  }
  return null
}

function fonteDaVarianteV2e(variante: Variante, rel: string, arquivo: string): string | null {
  const HOOK = 'src/hooks/use-project-elements.ts'
  const MARCA = 'src/components/templates/panels/marca-do-projeto.tsx'
  if (variante === 'sem-confirmacao' && rel === MARCA) {
    return trocar(readFileSync(arquivo, 'utf8'), variante, [
      ['useUploadProjectElement, type ProjectElement', 'useUploadProjectElement, useDeleteProjectElement, type ProjectElement'],
      ['const enviar = useUploadProjectElement()', 'const enviar = useUploadProjectElement()\n  const excluirDireto = useDeleteProjectElement()'],
      [
        'onClick={() => exclusao.pedir({ projectId: elemento.projectId, elementId: elemento.id, nome: elemento.name })}',
        'onClick={() => excluirDireto.mutate({ projectId: elemento.projectId, elementId: elemento.id })}',
      ],
    ])
  }
  if (rel !== HOOK) return null
  const atual = readFileSync(arquivo, 'utf8')
  const invalida = 'void invalidarElementosDoProjeto(queryClient, variables.projectId)'
  switch (variante) {
    case 'hook-permissivo':
      return trocar(atual, variante, [
        [
          'queryFn: async () => lerListaDeElementos(await api.get<unknown>(`/api/projects/${projectId}/elements`), projectId as number),',
          'queryFn: async () => { const d = await api.get<unknown>(`/api/projects/${projectId}/elements`); return (Array.isArray(d) ? d : []) as ProjectElement[] },',
        ],
      ])
    case 'sem-invalidacao':
      return trocar(atual, variante, [[invalida, 'void 0', 2]])
    case 'delete-aceita-qualquer-resposta':
      return trocar(atual, variante, [
        ['lerExclusaoConfirmada(await api.delete<unknown>(`/api/projects/${projectId}/elements/${elementId}`))', 'await api.delete<unknown>(`/api/projects/${projectId}/elements/${elementId}`)'],
      ])
    case 'invalida-projeto-atual':
      return trocar(atual, variante, [
        [invalida, 'void invalidarElementosDoProjeto(queryClient, (globalThis as { __v2d?: { projectId: () => number } }).__v2d?.projectId() ?? variables.projectId)', 2],
      ])
    case 'upload-json':
      return trocar(atual, variante, [
        [
          "await fetch(`/api/projects/${projectId}/elements`, { method: 'POST', body: form })",
          "await fetch(`/api/projects/${projectId}/elements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })",
        ],
      ])
    default:
      return null
  }
}

function plugin(variante: Variante, outros: boolean): Plugin {
  return {
    name: 'cp-v2d',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => (ehFalso(a.path) ? { path: path.join(__dirname, 'falsos.tsx') } : undefined))
      // resolução, não falso: o webpack do Next acha `dist/plugins/regions` pela extensão; o esbuild precisa do arquivo
      b.onResolve({ filter: /^wavesurfer\.js\/dist\/plugins\/[a-z-]+$/ }, (a) => ({ path: path.join(RAIZ, 'node_modules', `${a.path}.esm.js`) }))
      // a base (f561dc2b) monta o painel de formas antigo, que não existe mais no worktree
      if (variante === 'base') {
        b.onResolve({ filter: /^\.\/panels\/shapes-panel$/ }, () => ({ path: path.join(RAIZ, 'src/components/templates/panels/shapes-panel.tsx') }))
        b.onLoad({ filter: /panels[\\/]shapes-panel\.tsx$/ }, () => ({
          contents: execFileSync('git', ['show', `${BASE}:src/components/templates/panels/shapes-panel.tsx`], { cwd: RAIZ }).toString(),
          loader: 'tsx',
          resolveDir: path.join(RAIZ, 'src/components/templates/panels'),
        }))
      }
      // "Outros": um item sintético com categoria fora da lista, acrescentado ao catálogo SÓ neste bundle
      if (outros) {
        b.onLoad({ filter: /lib[\\/]assets[\\/]shapes-library\.ts$/ }, (a) => ({
          contents: `${readFileSync(a.path, 'utf8')}\nSHAPES_LIBRARY.push({ id: 'sintetico-xyz', label: 'Sintético XYZ', shapeType: 'svg-path', category: 'xyz' as never, fill: '#000000', pathData: 'M0 0 L100 0 L100 100 Z', versao: 1, slots: [{ canal: 'preenchimento', papelPadrao: 'destaque', rotulo: 'Preenchimento' }] })\n`,
          loader: 'ts',
          resolveDir: path.dirname(a.path),
        }))
      }
      b.onLoad({ filter: /\.(tsx|ts)$/ }, (a) => {
        const contents = fonteDaVariante(variante, a.path)
        return contents === null ? undefined : { contents, loader: 'tsx', resolveDir: path.dirname(a.path) }
      })
    },
  }
}

export async function empacotar(pasta: string, variante: Variante, opcoes: { outros?: boolean } = {}): Promise<{ js: string; css: string }> {
  mkdirSync(pasta, { recursive: true })
  const js = path.join(pasta, 'v2d.js')
  await build({
    entryPoints: [path.join(__dirname, 'entrada.tsx')],
    bundle: true,
    outfile: js,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    tsconfig: path.join(RAIZ, 'tsconfig.json'),
    logLevel: 'error',
    loader: { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [plugin(variante, opcoes.outros === true)],
  })
  const globais = path.join(RAIZ, 'src/app/globals.css')
  const saida = await postcss([tailwind({ base: RAIZ })]).process(readFileSync(globais, 'utf8'), { from: globais })
  const css = path.join(pasta, 'v2d.css')
  writeFileSync(css, saida.css)
  return { js, css }
}

if (require.main === module) {
  const pasta = process.argv[2]
  const variante = (process.argv[3] ?? 'v2d') as Variante
  empacotar(pasta, variante).then((r) => console.log(JSON.stringify(r)))
}
