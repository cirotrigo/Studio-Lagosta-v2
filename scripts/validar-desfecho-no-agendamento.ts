/**
 * Prova a TERCEIRA superfície do desfecho de copy: AGENDAR um post nascido de
 * item de plano fecha a dica em vez de abrir uma linha paralela de
 * `escolha-propria`. É o ponto de maior volume dos três — todo post que entra
 * na agenda passa por `registrarCopyDoPost`.
 *
 * ⚠️ A Generation de teste precisa carregar a copy em `fieldValues.slotValues`:
 * sem ela, `agendarPost` resolve `copyFinal` como nulo e `registrarCopyDoPost`
 * sai na primeira linha — o teste passaria sem exercitar nada. Foi o que
 * aconteceu na primeira tentativa.
 *
 * São três posts, e os dois últimos existem porque o primeiro sozinho passaria
 * mesmo com a captura quebrada:
 *
 *   2) copy usada como veio  → fecha a dica como `aceita-como-veio`;
 *   3) copy MEXIDA           → fecha como `editada` (o desfecho é calculado com
 *      o lado FINAL, não com a proposta);
 *   4) post SEM leva         → continua abrindo a sua `escolha-propria`. É o
 *      controle: o risco desta mudança é gravar de MENOS.
 *
 * Protocolo da casa: projeto 8, REMINDER, +7 dias, cleanup completo, guard por
 * COMPUTE contra produção.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ID = 8

function computeDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return null
  }
}
function garantirDev(): void {
  const atual = computeDe(process.env.DATABASE_URL)
  if (!atual) { console.error('DATABASE_URL inválida'); process.exit(1) }
  const env = resolve(process.cwd(), '.env')
  /**
   * 🔴 Falha FECHADA. Produção se identifica pelo compute que está no `.env`
   * (regra da casa); sem esse arquivo não há com o que comparar, e seguir em
   * frente seria escrever num banco desconhecido achando que o guard olhou.
   * Acontece de verdade: worktree não herda o `.env`, que é gitignored.
   */
  if (!existsSync(env)) {
    console.error('\n🔴 RECUSADO: não há .env aqui para dizer qual compute é PRODUÇÃO.')
    console.error('   Traga o .env do repositório principal para esta cópia antes de rodar.\n')
    process.exit(1)
  }
  for (const l of readFileSync(env, 'utf8').split('\n')) {
    const m = l.trim().match(/^(DATABASE_URL|DIRECT_URL)=(.*)$/)
    if (!m) continue
    if (computeDe(m[2].trim().replace(/^["']|["']$/g, '')) === atual) {
      console.error(`\n🔴 RECUSADO: ${atual} é PRODUÇÃO.\n`); process.exit(1)
    }
  }
}

let ok = 0, mau = 0
const conferir = (c: boolean, o: string, d = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${o}${d ? ` — ${d}` : ''}`); c ? ok++ : mau++
}

async function main() {
  garantirDev()
  console.log(`banco: ${computeDe(process.env.DATABASE_URL)} (dev)\n`)

  const { db } = await import('@/lib/db')
  const { criarPlano } = await import('@/lib/planos/plano-service')
  const { registrarDicasDeCopy, ancoraDaDica } = await import('@/lib/aprendizado/sinal-de-copy-do-plano')
  const { agendarPost } = await import('@/lib/creatives/agendar')
  const { VERSAO_DA_DICA } = await import('@/lib/planos/dica-de-copy')

  const proj = await db.project.findUnique({ where: { id: PROJECT_ID }, select: { userId: true } })
  if (!proj) throw new Error('projeto 8 não existe')

  const sinaisAntes = new Set(
    (await db.learningSignal.findMany({ where: { projectId: PROJECT_ID }, select: { id: true } })).map(s => s.id),
  )

  const daquiA = (d: number, h: string) => {
    const x = new Date(Date.now() + d * 86_400_000)
    return `${x.toISOString().slice(0, 10)} ${h}`
  }

  let planoId: string | null = null
  const posts: string[] = []
  const gens: string[] = []
  let erro: unknown = null

  try {
    const templateId = (await db.template.findFirst({ where: { projectId: PROJECT_ID }, select: { id: true } }))!.id
    /**
     * A arte de um item, com a copy onde `agendarPost` a procura.
     *
     * ⚠️ `fieldValues.slotValues` não é enfeite do fixture: sem ela `copyFinal`
     * sai nulo e `registrarCopyDoPost` retorna na primeira linha — o teste
     * inteiro passaria sem exercitar nada.
     */
    const criarArte = async (tag: string, blocos: string[]) => {
      const gen = await db.generation.create({
        data: {
          projectId: PROJECT_ID, templateId, status: 'COMPLETED', createdBy: proj.userId,
          resultUrl: `https://example.invalid/${tag}.png`,
          fieldValues: {
            source: 'demo-3a',
            slotValues: Object.fromEntries(blocos.map((b, i) => [`bloco${i + 1}`, b])),
          },
        },
        select: { id: true },
      })
      gens.push(gen.id)
      return gen.id
    }
    const copyDoPost = (postId: string) =>
      db.learningSignal.findMany({
        where: { projectId: PROJECT_ID, tipo: 'copy', postId },
        select: { id: true, sugeridoEm: true, desfecho: true },
      })

    console.log('1) plano com dica de copy registrada (como propor-semana faz)')
    const { plano } = await criarPlano({
      projectId: PROJECT_ID, titulo: '[demo-3a] leva', inicio: daquiA(7, '00:00'), fim: daquiA(9, '23:59'),
      origem: 'propor-semana', versao: 'demo',
      itens: [
        { ordem: 0, quando: daquiA(7, '19:00'), tema: 'happy hour', formato: 'story',
          via: 'ia', copyProposta: ['SEXTA É HAPPY HOUR', 'chopp em dobro'] },
        // Horário DIFERENTE de propósito: sem `sugestaoId`, a âncora da dica é o
        // horário em Brasília — dois itens no mesmo minuto disputariam a mesma
        // proposta e o segundo caso fecharia a dica do primeiro.
        { ordem: 1, quando: daquiA(8, '20:00'), tema: 'noite de cortes', formato: 'story',
          via: 'ia', copyProposta: ['NOITE DE CORTES', 'terça a domingo, das 18h'] },
      ],
    })
    planoId = plano.id
    const [item, itemEditado] = plano.itens

    const gen = await criarArte('demo-3a', ['SEXTA É HAPPY HOUR', 'chopp em dobro'])
    await db.itemDePlano.update({ where: { id: item.id }, data: { generationId: gen } })
    // O item cuja copy alguém MEXEU antes de agendar.
    const genEditada = await criarArte('demo-3a-editada', ['NOITE DE CORTES', 'terça a sábado, das 19h'])
    await db.itemDePlano.update({ where: { id: itemEditado.id }, data: { generationId: genEditada } })

    await registrarDicasDeCopy({
      projectId: PROJECT_ID, servico: 'propor-semana', versao: VERSAO_DA_DICA,
      dicas: [item, itemEditado].map((i) => ({
        ancora: ancoraDaDica(i)!, blocos: i.copyProposta ?? [], legenda: null,
      })),
    })
    const emitidas = await db.learningSignal.count({
      where: { projectId: PROJECT_ID, tipo: 'copy', sugeridoEm: { not: null }, id: { notIn: [...sinaisAntes] } },
    })
    conferir(emitidas === 2, 'as dicas de copy foram EMITIDAS como propostas', `${emitidas} linha(s)`)

    console.log('\n2) agendar o post — o ponto de maior volume')
    const post = await agendarPost({
      projectId: PROJECT_ID, generationId: gen, scheduledDatetime: daquiA(7, '19:00'),
      situacao: 'rascunho', postType: 'STORY', superficie: 'bancada',
    })
    posts.push(post.postId)
    await db.socialPost.update({ where: { id: post.postId }, data: { publishType: 'REMINDER' } })
    // A transição do item não faz parte da prova: quem fecha a dica é o
    // agendarPost acima, e ela acontece antes de o item saber do post.

    const copySignals = await copyDoPost(post.postId)
    conferir(copySignals.length === 1, '🔴 UMA linha de copy, não duas', `${copySignals.length} linha(s)`)
    conferir(!!copySignals[0]?.sugeridoEm, 'a linha continua sendo a PROPOSTA (tem sugeridoEm)')
    conferir(
      copySignals[0]?.desfecho === 'aceita-como-veio',
      'ela ganhou DESFECHO em vez de virar escolha-propria',
      String(copySignals[0]?.desfecho),
    )

    /**
     * O desfecho é CALCULADO, e com o lado FINAL. Sem este caso, um fio trocado
     * — passar a copy PROPOSTA como se fosse a final — deixaria tudo
     * `aceita-como-veio` para sempre e o teste de cima passaria igual.
     */
    console.log('\n3) copy mexida antes de agendar fecha como "editada"')
    const postEditado = await agendarPost({
      projectId: PROJECT_ID, generationId: genEditada, scheduledDatetime: daquiA(8, '20:00'),
      situacao: 'rascunho', postType: 'STORY', superficie: 'bancada',
    })
    posts.push(postEditado.postId)
    await db.socialPost.update({ where: { id: postEditado.postId }, data: { publishType: 'REMINDER' } })

    const daEditada = await copyDoPost(postEditado.postId)
    conferir(daEditada.length === 1, 'também uma linha só', `${daEditada.length} linha(s)`)
    conferir(
      daEditada[0]?.desfecho === 'editada',
      'e o desfecho acompanha o texto que foi de fato comprometido',
      String(daEditada[0]?.desfecho),
    )

    /**
     * ── O CONTROLE ────────────────────────────────────────────────────────
     * O risco desta mudança não é gravar demais: é gravar de MENOS. Se o
     * resolvedor deixasse de devolver `sem-plano` (ou devolvesse `erro` num
     * soluço de banco), TODO post comum perderia a sua linha de copy em
     * silêncio — e é quase só disso que o corpus das primeiras semanas é feito.
     * Os casos de cima passariam iguais com a captura morta.
     */
    console.log('\n4) controle: post que NÃO veio de leva continua sendo escolha própria')
    const genAvulsa = await criarArte('demo-3a-avulsa', ['CHOPP GELADO O DIA TODO'])
    const postAvulso = await agendarPost({
      projectId: PROJECT_ID, generationId: genAvulsa, scheduledDatetime: daquiA(9, '18:00'),
      situacao: 'rascunho', postType: 'STORY', superficie: 'bancada',
    })
    posts.push(postAvulso.postId)
    await db.socialPost.update({ where: { id: postAvulso.postId }, data: { publishType: 'REMINDER' } })

    const daAvulsa = await copyDoPost(postAvulso.postId)
    conferir(daAvulsa.length === 1, 'a arte avulsa gerou a SUA linha', `${daAvulsa.length} linha(s)`)
    conferir(
      daAvulsa[0]?.desfecho === 'escolha-propria' && !daAvulsa[0]?.sugeridoEm,
      'e ela é "escolha-propria", sem metade de cima',
      String(daAvulsa[0]?.desfecho),
    )

    const todas = await db.learningSignal.findMany({
      where: { projectId: PROJECT_ID, tipo: 'copy', id: { notIn: [...sinaisAntes] } },
      select: { desfecho: true },
    })
    conferir(todas.length === 3, 'no total: 3 linhas de copy para 3 posts', `${todas.length} linha(s)`)
    conferir(
      todas.filter((s) => s.desfecho === 'escolha-propria').length === 1,
      'e só a avulsa é escolha-propria — nenhuma linha paralela para as de leva',
    )

    console.log(`\n${mau === 0 ? '✅' : '❌'} ${ok} conferências ok, ${mau} falharam`)
  } catch (e) {
    erro = e
    console.error('\n✗ ERRO:', e instanceof Error ? `${e.name}: ${e.message}` : e)
    if (e instanceof Error && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
  } finally {
    console.log('\ncleanup:')
    for (const id of posts) {
      await db.postLog.deleteMany({ where: { postId: id } })
      await db.socialPost.delete({ where: { id } }).catch(() => {})
    }
    if (planoId) await db.planoDeConteudo.delete({ where: { id: planoId } }).catch(() => {})
    for (const g of gens) await db.generation.delete({ where: { id: g } }).catch(() => {})
    const novos = (await db.learningSignal.findMany({ where: { projectId: PROJECT_ID }, select: { id: true } }))
      .map((s) => s.id).filter((id) => !sinaisAntes.has(id))
    if (novos.length) await db.learningSignal.deleteMany({ where: { id: { in: novos } } })
    console.log('  ', JSON.stringify({
      planos: await db.planoDeConteudo.count({ where: { titulo: { startsWith: '[demo-3a]' } } }),
      sinaisRemovidos: novos.length,
    }))
    await db.$disconnect()
    process.exit(mau === 0 && !erro ? 0 : 1)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
