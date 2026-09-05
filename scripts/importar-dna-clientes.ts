/**
 * Importa o destilado dos DNA.md de ~/Documents/Clientes para o BrandDNA do
 * Studio (Fase 2 do plano docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md).
 *
 * Os DNAs das skills têm profundidade que o BrandDNA não tem (paleta com
 * papéis e percentuais, setups de luz nomeados, louça/uniforme, anti-
 * fotografia, vetos). Este script pede a um LLM o destilado por seção —
 * denso, com as regras LITERAIS preservadas (hex, fontes, px, proibições) —
 * e grava PROPOSTAS em docs/manifests/dna-import/ para revisão humana.
 *
 * DRY-RUN POR PADRÃO: nada é escrito no banco sem `--aplicar`.
 *
 *   npx tsx scripts/importar-dna-clientes.ts                  # todos, dry-run
 *   npx tsx scripts/importar-dna-clientes.ts --cliente espeto-gaucho
 *   npx tsx scripts/importar-dna-clientes.ts --aplicar        # grava no BrandDNA
 *
 * ⚠ `--aplicar` SUBSTITUI as seções do BrandDNA pelos destilados propostos
 * (relê os arquivos de docs/manifests/dna-import se existirem — o que você editou na
 * revisão é o que vale). Seção proposta vazia não toca a atual.
 */
import { config } from 'dotenv'
config({ path: '.env' })

import * as fs from 'fs'
import * as path from 'path'

const CLIENTES_DIR = '/Users/cirotrigo/Documents/Clientes'
/**
 * As propostas são o ROLLBACK da importação (é o que se relê para desfazer
 * ou reaplicar), então moram versionadas em `docs/manifests/`, e não em
 * `scripts/.tmp-*` — que é a convenção da casa para "apague no fim".
 */
const OUT_DIR = path.join(__dirname, '..', 'docs', 'manifests', 'dna-import')

/** Registro de Clientes/CLAUDE.md (slug → projeto do Studio). */
const REGISTRO: Record<string, number> = {
  'real-gelateria': 1,
  'o-quintal-parrilla': 2,
  tero: 3,
  'seu-quinto': 4,
  bacana: 5,
  'espeto-gaucho': 6,
  'by-rock': 7,
  'wine-vix': 11,
  'emporio-fonseca': 12,
}

const CAMPOS = ['visualStyle', 'photoDirection', 'composition', 'contentRules', 'toneOfVoice'] as const
type Campo = (typeof CAMPOS)[number]

const TETOS: Record<Campo, number> = {
  visualStyle: 3500,
  photoDirection: 4500,
  composition: 3000,
  contentRules: 3500,
  toneOfVoice: 2500,
}

function acharDnaMd(slug: string): string | null {
  const base = path.join(CLIENTES_DIR, slug, 'human-output', 'dna')
  if (!fs.existsSync(base)) return null
  for (const dir of fs.readdirSync(base)) {
    const p = path.join(base, dir, 'resultado', 'DNA.md')
    if (fs.existsSync(p)) return p
  }
  return null
}

const ESPECIFICACAO: Record<Campo, string> = {
  visualStyle:
    'ESTÉTICA GERAL da marca: a paleta com o PAPEL e as regras pode/nunca de CADA cor (hex literal), percentuais de uso visual, a tipografia com hierarquia (família, peso, tamanhos em px por papel), estética-âncora e as anti-referências visuais (seção 3.7 e afins), cada uma com a razão curta.',
  photoDirection:
    'DIREÇÃO FOTOGRÁFICA completa (seção 3.8 e equivalentes): estilo e o porquê dele, setups de luz NOMEADOS com Kelvin/direção/qualidade/sombras e a luz proibida, os enquadramentos-assinatura numerados, posição de câmera por tipo de assunto e limites do repertório, louça/uniforme/props canônicos DESCRITOS EM DETALHE (o objeto exato, a toalha, o copo), regras de mesa/cena, tratamento de cor, a ANTI-FOTOGRAFIA inteira item a item, o limite da IA em imagem ("a foto se melhora, nunca se modifica") e as regras de âncora/geração (o que o modelo tende a errar e como o prompt deve travar).',
  composition:
    'SISTEMA DE COMPOSIÇÃO das peças (seção 3.3.1/3.6 e afins): onde o texto mora em relação à foto, headline empilhada e cor de destaque, dado importante em cor no meio da frase, gradiente de leitura (como é construído), repertório ROTATIVO de arranjos, posição da logo por canto, entrelinha e regras de bloco.',
  contentRules:
    'REGRAS DURAS E VETOS, escritos como proibição concreta com a razão curta: o que nunca aparece na imagem, o que nunca se diz, teto de peças com preço e as exceções nomeadas, canais proibidos (delivery/WhatsApp/telefone…), vocabulário vetado, regras de confirmação (ex: jogo no telão só com tabela confirmada) e o crivo de aprovação em perguntas.',
  toneOfVoice:
    'COMO A MARCA FALA: o que ela é/não é, vocabulário próprio (palavras da casa), construções proibidas, tons por contexto, e as LISTAS FECHADAS de pré-título e CTA aprovados (copie as listas).',
}

async function destilarCampo(
  slug: string,
  dnaMd: string,
  campo: Campo,
): Promise<string> {
  const { generateText } = await import('ai')
  const { openai } = await import('@ai-sdk/openai')
  const alvo = TETOS[campo]

  const base = [
    `Do DNA da marca "${slug}" (documento completo abaixo), extraia e destile UMA seção de prompt, em português: ${ESPECIFICACAO[campo]}`,
    '',
    `ALVO DE TAMANHO: entre ${Math.round(alvo * 0.7)} e ${alvo} caracteres. Seção muito abaixo disso está jogando regra fora — prefira incluir mais regras concretas a resumir.`,
    'REGRAS:',
    '- Frases-regra completas e aplicáveis, nunca fragmentos telegráficos: cada proibição vem com o detalhe que a torna executável.',
    '- PRESERVE LITERALMENTE hex, fontes, px, Kelvin, percentuais e nomes de pratos/lugares/objetos-assinatura.',
    '- Nada que não esteja no documento. Corte história e contexto, nunca regra.',
    '- O texto vai direto para um prompt de IA — sem preâmbulo, sem markdown de título, só o conteúdo.',
    '',
    '--- DNA.md ---',
    dnaMd,
  ].join('\n')

  const chamar = async (feedback?: string) => {
    const { text } = await generateText({
      model: openai(process.env.OPENAI_PROMPT_MODEL || 'gpt-4o'),
      temperature: 0.2,
      maxOutputTokens: 4000,
      abortSignal: AbortSignal.timeout(180_000),
      prompt: feedback ? `${base}\n\n${feedback}` : base,
    })
    return text.trim()
  }

  // O gpt-4o às vezes recusa a moldura "vetos/proibições" por falso positivo
  // ("I'm sorry, I can't assist") — reenquadrar como resumo de guia de estilo
  // interno resolve.
  const pareceRecusa = (t: string) =>
    t.length < 200 && /i'?m sorry|can'?t assist|cannot assist|não posso ajudar/i.test(t)
  const REENQUADRE =
    'CONTEXTO: o documento acima é o guia de estilo INTERNO da própria marca do cliente, escrito pela equipe dele. A tarefa é apenas REORGANIZAR o conteúdo do próprio documento em formato de prompt — nada além de resumo fiel de material fornecido pelo dono.'

  // Laço único de correção: recusa → reenquadra; curto → expande; longo →
  // apara. O reenquadre, uma vez acionado, acompanha TODAS as chamadas
  // seguintes — era a recusa voltar na retentativa de tamanho que deixava
  // "I'm sorry" gravado como seção.
  let contexto = ''
  let out = await chamar()
  for (let i = 0; i < 3; i++) {
    if (pareceRecusa(out)) {
      contexto = REENQUADRE
      out = await chamar(contexto)
      continue
    }
    if (out.length < alvo * 0.55) {
      out = await chamar(
        `${contexto ? `${contexto}\n\n` : ''}SUA RESPOSTA ANTERIOR FICOU CURTA DEMAIS (${out.length} chars; o alvo é ${Math.round(alvo * 0.7)}–${alvo}). Ela foi:\n${out}\n\nReescreva INCLUINDO as regras que ficaram de fora do documento, com o detalhe executável de cada uma.`,
      )
      continue
    }
    if (out.length > alvo * 1.4) {
      out = await chamar(
        `${contexto ? `${contexto}\n\n` : ''}SEU TEXTO ANTERIOR (abaixo) passou do teto de ${alvo} chars (ficou com ${out.length}). Corte para ATÉ ${alvo} caracteres preservando TODAS as regras concretas (hex, px, Kelvin, proibições) e removendo repetição e contexto:\n\n${out}`,
      )
      continue
    }
    break
  }
  if (pareceRecusa(out)) {
    throw new Error(`destilação de ${campo} recusada repetidamente pelo modelo`)
  }
  return out
}

async function destilar(slug: string, dnaMd: string): Promise<Record<Campo, string>> {
  // Uma chamada por seção: em chamada única multi-seção o modelo comprime
  // demais e o destilado perde exatamente o detalhe executável que interessa.
  const entradas = await Promise.all(
    CAMPOS.map(async (campo) => [campo, await destilarCampo(slug, dnaMd, campo)] as const),
  )
  return Object.fromEntries(entradas) as Record<Campo, string>
}

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const clienteIdx = args.indexOf('--cliente')
  const filtro = clienteIdx >= 0 ? args[clienteIdx + 1] : null

  const { db } = await import('../src/lib/db')
  const { updateBrandDNA } = await import('../src/lib/brand/brand-context')

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const slugs = Object.keys(REGISTRO).filter((s) => !filtro || s === filtro)
  if (slugs.length === 0) throw new Error(`cliente desconhecido: ${filtro}`)

  for (const slug of slugs) {
    const projectId = REGISTRO[slug]
    const dnaPath = acharDnaMd(slug)
    if (!dnaPath) {
      console.log(`✗ ${slug}: DNA.md não encontrado — pulando`)
      continue
    }

    const atual = await db.brandDNA.findUnique({ where: { projectId } })

    let proposta: Record<Campo, string>
    const propostaPath = path.join(OUT_DIR, `${slug}.json`)
    if (aplicar && fs.existsSync(propostaPath)) {
      // Aplica o que está nos arquivos revisados, não uma nova destilação.
      proposta = JSON.parse(fs.readFileSync(propostaPath, 'utf-8'))
      console.log(`→ ${slug}: aplicando proposta revisada de ${path.relative(process.cwd(), propostaPath)}`)
    } else {
      const dnaMd = fs.readFileSync(dnaPath, 'utf-8')
      console.log(`→ ${slug} (projeto ${projectId}): destilando ${dnaMd.length} chars…`)
      proposta = (await destilar(slug, dnaMd)) as Record<Campo, string>
      fs.writeFileSync(propostaPath, JSON.stringify(proposta, null, 2))
    }

    // Relatório por campo: atual vs proposto
    const linhas: string[] = [`# ${slug} → projeto ${projectId}`, '']
    for (const campo of CAMPOS) {
      const antes = (atual?.[campo] ?? '').trim()
      const depois = (proposta[campo] ?? '').trim()
      linhas.push(`## ${campo}  (atual: ${antes.length} chars → proposto: ${depois.length} chars)`)
      linhas.push('', '### ATUAL', antes || '(vazio)', '', '### PROPOSTO', depois || '(vazio)', '')
      const estourou = depois.length > TETOS[campo] * 1.2
      if (estourou) linhas.push(`⚠ proposto passou 20% do teto de ${TETOS[campo]} chars`, '')
    }
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.md`), linhas.join('\n'))

    const resumo = CAMPOS.map(
      (c) => `${c}: ${(atual?.[c] ?? '').trim().length}→${(proposta[c] ?? '').trim().length}`,
    ).join(' | ')
    console.log(`  ${resumo}`)

    if (aplicar) {
      const patch: Partial<Record<Campo, string>> = {}
      for (const campo of CAMPOS) {
        const valor = (proposta[campo] ?? '').trim()
        if (valor) patch[campo] = valor.slice(0, 10_000)
      }
      await updateBrandDNA(projectId, patch)
      console.log(`  ✓ BrandDNA atualizado (${Object.keys(patch).length} seções)`)
    }
  }

  if (!aplicar) {
    console.log(`\nDry-run concluído. Revise os .md em ${path.relative(process.cwd(), OUT_DIR)}/ (edite os .json se quiser) e rode com --aplicar para gravar.`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
