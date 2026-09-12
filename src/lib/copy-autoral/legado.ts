/**
 * ADAPTADORES DO LEGADO → contrato da copy autoral.
 *
 * Duas formas viajam hoje: `Bloco[]` por papel (`spec.blocos`, do compor-arte)
 * e `string[]` posicional (`ItemDePlano.copyProposta`, do criar-plano). Nenhuma
 * carrega id, grupo de leitura, ordem explícita, fatos ou autoria.
 *
 * A regra do adaptador é DECLARAR o que não sabe e NÃO INVENTAR:
 *  - a autoria vira `desconhecido` (nunca "claude" por palpite);
 *  - a ordem sai da posição no array, e isso fica registrado em `lacunas`;
 *  - grupo de leitura NÃO é deduzido (pré-título + manchete não viram frase por
 *    conta própria — é decisão do autor);
 *  - o `string[]` posicional recebe função `livre` para todos os blocos, porque
 *    o papel de cada um era atribuído pela posição DEPOIS (`copyParaBlocos`) e
 *    esse mapeamento é justamente a transformação silenciosa que o contrato
 *    existe para expor; quem souber o papel passa `funcoes` por posição;
 *  - as linhas são copiadas EXATAMENTE (caixa, acento, quebra, colchetes).
 *
 * Módulo PURO.
 */

import { VERSAO_DO_CONTRATO, type BlocoAutoral, type CopyAutoral, type FuncaoDoBloco } from './contrato'

export interface BlocoLegado {
  papel: string
  linhas: string[]
}

const PAPEIS_LEGADOS: Record<string, FuncaoDoBloco> = {
  pre: 'pre',
  headline: 'headline',
  headline2: 'headline',
  apoio: 'apoio',
  cta: 'cta',
  servico: 'servico',
}

function idUnico(base: string, usados: Set<string>): string {
  const limpo = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'bloco'
  let id = limpo
  let n = 2
  while (usados.has(id)) id = `${limpo}-${n++}`
  usados.add(id)
  return id
}

/**
 * `spec.blocos` (papel + linhas) → contrato. O id nasce do papel (`headline`,
 * `servico-2`…); `headline2` vira uma manchete com as linhas dela na voz 2, se
 * o chamador pedir por `fundirHeadline2` (o padrão mantém como bloco próprio
 * de função `headline`, e a lacuna diz isso).
 */
export function copyDeBlocosLegados(
  blocos: BlocoLegado[],
  opcoes: { em?: string; superficie?: string } = {},
): CopyAutoral {
  const usados = new Set<string>()
  const lacunas = [
    'autoria desconhecida: a copy veio de blocos por papel (spec) sem registro de quem escreveu',
    'ordem de leitura inferida pela posição no array',
    'sem grupos de leitura: o legado não declara que blocos formam uma frase',
  ]
  const saida: BlocoAutoral[] = blocos.map((b, i) => {
    const funcao = PAPEIS_LEGADOS[b.papel]
    if (!funcao) lacunas.push(`bloco ${i} com papel desconhecido "${b.papel}" tratado como livre`)
    return {
      id: idUnico(b.papel, usados),
      funcao: funcao ?? 'livre',
      ordem: i,
      linhas: [...b.linhas],
      ...(b.papel === 'headline2' ? { estilo: { herdaDe: 'headline' as const } } : {}),
    }
  })
  if (blocos.some((b) => b.papel === 'headline2')) lacunas.push('headline2 veio como bloco próprio: a segunda voz não foi declarada por linha')
  return {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'desconhecido', ...(opcoes.em ? { em: opcoes.em } : {}), ...(opcoes.superficie ? { superficie: opcoes.superficie } : {}) },
    blocos: saida,
    revisoes: [],
    lacunas,
  }
}

/**
 * `copyProposta: string[]` (posicional) → contrato. Um bloco por item; `\n`
 * dentro do item vira quebra de linha (o legado colapsava). Sem `funcoes`,
 * todos saem `livre` — atribuir papel pela posição seria repetir o
 * `copyParaBlocos`, que é a perda posicional que o contrato expõe.
 */
export function copyDeListaLegada(
  itens: string[],
  opcoes: { funcoes?: Array<FuncaoDoBloco | null | undefined>; em?: string; superficie?: string } = {},
): CopyAutoral {
  const usados = new Set<string>()
  const lacunas = [
    'autoria desconhecida: a copy veio como lista posicional (copyProposta) sem registro de quem escreveu',
    'ordem de leitura inferida pela posição na lista',
    'sem grupos de leitura: o legado não declara que blocos formam uma frase',
  ]
  const semFuncao = itens.some((_, i) => !opcoes.funcoes?.[i])
  if (semFuncao) lacunas.push('função dos blocos não informada: ficaram "livre" (o papel por posição era a transformação silenciosa)')
  const blocos: BlocoAutoral[] = itens.map((texto, i) => {
    const funcao = opcoes.funcoes?.[i] ?? 'livre'
    return {
      id: idUnico(funcao === 'livre' ? `texto-${i + 1}` : funcao, usados),
      funcao,
      ordem: i,
      linhas: texto.split('\n'),
    }
  })
  return {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'desconhecido', ...(opcoes.em ? { em: opcoes.em } : {}), ...(opcoes.superficie ? { superficie: opcoes.superficie } : {}) },
    blocos,
    revisoes: [],
    lacunas,
  }
}

/**
 * Contrato → `Bloco[]` por papel, para o compositor de HOJE (PR 4 passa a
 * consumir o contrato direto). É a única conversão de saída, e ela NÃO
 * transforma texto: bloco `livre` não tem papel e é devolvido em `semPapel`
 * em vez de sumir — quem chama decide (recusa, camada extra na F3, aviso).
 */
export function blocosParaOCompositor(copy: CopyAutoral): { blocos: BlocoLegado[]; semPapel: BlocoAutoral[] } {
  const blocos: BlocoLegado[] = []
  const semPapel: BlocoAutoral[] = []
  for (const b of [...copy.blocos].sort((a, z) => a.ordem - z.ordem)) {
    if (b.funcao === 'livre') {
      semPapel.push(b)
      continue
    }
    blocos.push({ papel: b.funcao, linhas: [...b.linhas] })
  }
  return { blocos, semPapel }
}
