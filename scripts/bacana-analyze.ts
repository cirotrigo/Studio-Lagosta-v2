/**
 * Stage 1 — Análise: classifica fotos em 99_A-Classificar/ com Claude Vision.
 * Gera manifest JSON em _sistema/manifests/.
 *
 * Uso: npx dotenv-cli -e .env -- npx tsx scripts/bacana-analyze.ts [--dry-run] [--limit N]
 *
 * Flags:
 *   --dry-run   Analisa mas não salva manifest no Drive (salva localmente)
 *   --limit N   Processa no máximo N fotos (útil para testes)
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as path from 'path'
import { googleDriveService } from '../src/server/google-drive-service'

const FOLDER_MAP_PATH = path.join(__dirname, '../.bacana-folders.json')
const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT_IDX = process.argv.indexOf('--limit')
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1]) : Infinity

if (!fs.existsSync(FOLDER_MAP_PATH)) {
  console.error('❌ .bacana-folders.json não encontrado. Rode bacana-setup-folders.ts primeiro.')
  process.exit(1)
}

const folderMap: Record<string, string> = JSON.parse(fs.readFileSync(FOLDER_MAP_PATH, 'utf-8'))

function getFolderId(path: string): string | null {
  return folderMap[path] ?? null
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

// gemini-2.0-flash foi aposentado: `generateContent` devolve 404 ainda que o
// nome continue aparecendo no ListModels. Override por env se precisar fixar
// outra versão.
const GEMINI_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o classificador de acervo fotográfico da Bacana Churrascaria.
Sua tarefa é analisar cada foto e retornar um JSON estruturado com a classificação.

## Estrutura de pastas disponíveis
01_Carnes/No-Espeto/Picanha-Bovina
01_Carnes/No-Espeto/Picanha-Suina
01_Carnes/No-Espeto/Ancho
01_Carnes/No-Espeto/Alcatra
01_Carnes/No-Espeto/Maminha
01_Carnes/No-Espeto/Fraldinha
01_Carnes/No-Espeto/Cordeiro
01_Carnes/No-Espeto/Espeto-Misto
01_Carnes/Chapas
01_Carnes/Chapas-Especiais
01_Carnes/Cortes-Especiais
01_Carnes/Pratos-Especiais-Recheados
01_Carnes/Pratos-Especiais-com-Molho
01_Carnes/Pratos-Montados
02_Outros-Pratos/Almoco-Bacana
02_Outros-Pratos/Executivos
02_Outros-Pratos/Kids-Bacaninha
02_Outros-Pratos/Grandes-Porcoes
03_Peixes-e-Frutos-do-Mar/Tilapia
03_Peixes-e-Frutos-do-Mar/Camarao
03_Peixes-e-Frutos-do-Mar/Peroa
04_Entradas-e-Porcoes/Paes-Queijos-Linguicas
04_Entradas-e-Porcoes/Frango-Porcoes
04_Entradas-e-Porcoes/Frutos-do-Mar-Porcoes
04_Entradas-e-Porcoes/Alcatra-a-Palito
04_Entradas-e-Porcoes/Calabresa-e-Torresmo
04_Entradas-e-Porcoes/Pasteis
04_Entradas-e-Porcoes/Cebola-e-Outros
05_Saladas-e-Caldos/Saladas
05_Saladas-e-Caldos/Caldo-Amigo
06_Sobremesas/Tacas-e-Cremes
06_Sobremesas/Quentes-com-Sorvete
06_Sobremesas/Churros-e-Casquinhas
07_Bebidas/Cervejas
07_Bebidas/Sucos-Naturais
07_Bebidas/Drinks-e-Destilados
07_Bebidas/Refrigerantes-Aguas-Cafes
08_Ambiente/Dia
08_Ambiente/Noite
09_Espaco-Kids
10_Clientes-e-Pessoas/Sem-Rostos-Uso-Livre
10_Clientes-e-Pessoas/Com-Rostos-Aguardando-Autorizacao
10_Clientes-e-Pessoas/Autorizados
10_Clientes-e-Pessoas/Reviews-e-Depoimentos
11_Equipe-e-Bastidores/Churrasqueiro-em-Acao
11_Equipe-e-Bastidores/Churrasqueira-e-Grelha
11_Equipe-e-Bastidores/Cozinha-Preparo
11_Equipe-e-Bastidores/Atendimento-Garcom
12_Eventos-e-Datas
99_Revisar-Manual

## Regras críticas de classificação

### Hierarquia de confiança
1. IDENTIDADE DO PRODUTO (decisivo): capa de gordura, textura, formato, ingredientes visíveis
2. MÉTODO DE PREPARO: espeto, chapa, empanado, molho, grelha
3. SUPORTE/LOUÇA (apoio): bandeja preta lisa, frigideira redonda com cabo, chapa retangular com alças
4. CONTEXTO/STYLING (contextual): fundo, iluminação, ângulo

### Regras específicas (v1.1)
- ANCHO no espeto: formato orgânico, capa externa FINA, peça curta e espessa. Marmoreio só visível em corte transversal — NÃO é marcador principal.
- ANCHO com Batatas Coradas: frigideira de ferro com cabo claro (Fun Alfa), 2 medalhões grandes (não peça única).
- ESPETO MISTO: múltiplos itens (frango + bovina + cebola + linguiça). Apresentação canônica: espeto vertical cenital.
- Picanha Bovina: capa de gordura GROSSA e dourada — marcador mais forte.
- Bife de Chorizo: peça oval em BANDEJA PRETA LISA (sem alças). Sem espeto.
- Filé Mignon com Bacon: medalhões cilíndricos enrolados em bacon, no espeto, em bandeja preta.
- LGPD: rostos nítidos reconhecíveis → SEMPRE 10_Clientes-e-Pessoas/Com-Rostos-Aguardando-Autorizacao

### Threshold de confiança
- ≥ 0.90: mover direto
- 0.75–0.89: mover e marcar revisar_recomendado: true
- < 0.75: 99_Revisar-Manual (liste hipóteses alternativas)

### Suporte visual invariante do Bacana
- Caneca laranja com logo "A": tem_caneca_bacana: true
- Bowl quadrado branco: tem_bowl_arroz: true
- Mesa marrom escura + sofá capitonê preto = ambiente_restaurante

## Formato de resposta (JSON puro, sem markdown)
{
  "destino": "01_Carnes/No-Espeto/Picanha-Bovina",
  "confianca": 0.88,
  "novo_nome_sugerido": "picanha-bovina-espeto-vertical",
  "analise": {
    "categoria": "carne_no_espeto",
    "corte": "picanha_bovina",
    "metodo_preparo": "espeto",
    "descricao_visual": "Descrição objetiva do que aparece na foto",
    "estilo_foto": "profissional|informal|bastidor|cliente",
    "qualidade_tecnica": "alta|media|baixa",
    "contexto_foto": "estudio|ambiente_restaurante|cozinha|externa",
    "mood": "diurno|noturno|premium|casual",
    "tem_pessoas": "nao|maos|pessoa_parcial|rostos",
    "tem_caneca_bacana": false,
    "tem_bebida": "",
    "tem_bowl_arroz": false,
    "usos_recomendados": ["feed_instagram", "cardapio_digital", "google_meu_negocio", "stories_bastidores"],
    "tags": ["tag1", "tag2"],
    "hipoteses_alternativas": [],
    "motivo_revisao": ""
  },
  "revisar_recomendado": false
}`

// ── ANÁLISE DE UMA FOTO ────────────────────────────────────────────────────────
async function analyzePhoto(fileId: string, fileName: string): Promise<Record<string, unknown>> {
  const { stream } = await googleDriveService.getThumbnailStream(fileId, 800)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const imageBuffer = Buffer.concat(chunks)
  const base64 = imageBuffer.toString('base64')

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
  })

  const prompt = [
    { inlineData: { mimeType: 'image/jpeg', data: base64 } },
    `Classifique esta foto do acervo do Bacana Churrascaria.\nArquivo original: ${fileName}\nRetorne apenas o JSON, sem markdown.`,
  ]

  // Retry with backoff on 429
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await model.generateContent(prompt)
      const raw = result.response.text().trim()
      const json = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '')
      return JSON.parse(json)
    } catch (e) {
      const msg = (e as Error).message ?? ''
      if (msg.includes('429') && attempt < 3) {
        const wait = (attempt + 1) * 30_000
        process.stdout.write(` [429 - aguardando ${wait / 1000}s]`)
        await new Promise((r) => setTimeout(r, wait))
      } else {
        throw e
      }
    }
  }
  throw new Error('Max retries exceeded')
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  const aClassificarId = getFolderId('99_A-Classificar')
  if (!aClassificarId) {
    console.error('❌ Pasta 99_A-Classificar não encontrada no mapa. Rode setup primeiro.')
    process.exit(1)
  }

  console.log(`=== Stage 1 — Análise de Fotos${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`)
  console.log(`Buscando fotos em 99_A-Classificar/...`)

  const files = await googleDriveService.listFiles({
    folderId: aClassificarId,
    mode: 'images',
  })

  if (!files.items?.length) {
    console.log('Nenhuma foto encontrada em 99_A-Classificar/. Coloque as fotos e rode novamente.')
    return
  }

  const toProcess = files.items.slice(0, LIMIT)
  console.log(`${files.items.length} fotos encontradas${LIMIT < Infinity ? ` (processando ${toProcess.length})` : ''}.\n`)

  const execId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16).replace('T', '_')
  const operacoes: Record<string, unknown>[] = []
  let ok = 0, revisao = 0, erro = 0

  for (let i = 0; i < toProcess.length; i++) {
    const file = toProcess[i]
    const idx = String(i + 1).padStart(3, '0')
    process.stdout.write(`[${idx}/${toProcess.length}] ${file.name} ... `)

    if (i > 0) await new Promise((r) => setTimeout(r, 4000))

    try {
      const result = await analyzePhoto(file.id!, file.name!)
      const confianca = Number((result as { confianca: number }).confianca)
      const destino = String((result as { destino: string }).destino)
      const revisar = Boolean((result as { revisar_recomendado: boolean }).revisar_recomendado) || confianca < 0.9

      operacoes.push({
        id: `op_${idx}`,
        arquivo_origem: file.name,
        file_id_drive: file.id,
        destino,
        destino_folder_id: getFolderId(destino) ?? null,
        confianca,
        acao: 'mover',
        revisar_recomendado: revisar,
        analise: (result as { analise: unknown }).analise,
        novo_nome_sugerido: (result as { novo_nome_sugerido: string }).novo_nome_sugerido,
      })

      if (destino.startsWith('99_Revisar-Manual') || confianca < 0.75) {
        console.log(`→ REVISÃO (${confianca}) → ${destino}`)
        revisao++
      } else {
        console.log(`→ ${confianca >= 0.9 ? '✓' : '~'} (${confianca}) → ${destino}`)
        ok++
      }
    } catch (e) {
      console.log(`→ ❌ ERRO: ${(e as Error).message}`)
      operacoes.push({
        id: `op_${idx}`,
        arquivo_origem: file.name,
        file_id_drive: file.id,
        destino: '99_Revisar-Manual',
        destino_folder_id: getFolderId('99_Revisar-Manual'),
        confianca: 0,
        acao: 'mover',
        revisar_recomendado: true,
        erro: (e as Error).message,
      })
      revisao++
      erro++
    }
  }

  const manifest = {
    execucao_id: execId,
    cliente: 'Bacana',
    pasta_origem: '99_A-Classificar/',
    data: new Date().toISOString(),
    total_fotos: toProcess.length,
    dry_run: DRY_RUN,
    operacoes,
    resumo: {
      classificadas: ok,
      para_revisao: revisao,
      erros: erro,
      por_pasta: operacoes.reduce<Record<string, number>>((acc, op) => {
        const dest = String((op as { destino: string }).destino)
        acc[dest] = (acc[dest] ?? 0) + 1
        return acc
      }, {}),
    },
  }

  const manifestJson = JSON.stringify(manifest, null, 2)
  const manifestName = `${execId}_analise.json`

  // Salva localmente sempre
  const localPath = path.join(__dirname, `../.bacana-manifest-${execId}.json`)
  fs.writeFileSync(localPath, manifestJson)
  console.log(`\n✓ Manifest salvo localmente: ${localPath}`)

  // Sobe para Drive (se não for dry-run)
  if (!DRY_RUN) {
    const sistemaManifoldsId = getFolderId('_sistema/manifests')
    if (sistemaManifoldsId) {
      const buffer = Buffer.from(manifestJson)
      await googleDriveService.uploadFileToFolder({
        buffer,
        fileName: manifestName,
        mimeType: 'application/json',
        folderId: sistemaManifoldsId,
      })
      console.log(`✓ Manifest enviado para _sistema/manifests/${manifestName}`)
    }
  }

  console.log(`\n=== Resumo ===`)
  console.log(`Classificadas: ${ok} | Para revisão: ${revisao} | Erros: ${erro}`)
  console.log(`\nPróximo passo: revise o manifest e rode bacana-execute.ts ${manifestName}`)
}

main().catch(console.error)
