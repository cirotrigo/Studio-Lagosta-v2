/**
 * O cleanup da prova de `validar-contexto-da-semana.ts` (PR 6 de "Marca simples,
 * copy melhor"), em PASSOS INDEPENDENTES — R48 da oitava revisão final de
 * 74afb769.
 *
 * O primeiro `generation.deleteMany` do `finally` estava fora do bloco protegido:
 * uma falha de conexão nele pulava todo o resto — posts, sinais, entradas, usos —
 * e nem a conferência final nem o `resultado.json` eram escritos. Aqui cada passo
 * roda no próprio `try`, a falha é ACUMULADA e os passos seguintes rodam do mesmo
 * jeito; quem chama soma as falhas ao placar (saída ≠ 0).
 *
 * Só o que ESTA rodada criou, e só pelo banco que é passado: o módulo não importa
 * o Prisma (o teste usa um banco falso).
 */

type Contagem = Promise<{ count: number }>

export interface BancoDaLimpeza {
  generation: { deleteMany(args: { where: Record<string, unknown> }): Contagem }
  socialPost: {
    findMany(args: { where: Record<string, unknown>; select: { id: true } }): Promise<Array<{ id: string }>>
    deleteMany(args: { where: Record<string, unknown> }): Contagem
  }
  learningSignal: {
    deleteMany(args: { where: Record<string, unknown> }): Contagem
    count(args: { where: Record<string, unknown> }): Promise<number>
  }
  knowledgeBaseEntry: { deleteMany(args: { where: Record<string, unknown> }): Contagem }
  photoUsage: { deleteMany(args: { where: Record<string, unknown> }): Contagem }
}

export interface AlvosDaLimpeza {
  projeto: number
  /** A marca da rodada na legenda/título: recupera o que falhou antes do `push` do id. */
  marca: string
  inicio: Date
  posts: string[]
  /** As Generations do isolamento entre projetos e as das seções 3c–3i: um só passo protegido. */
  geracoes: string[]
  entradas: string[]
  usos: string[]
  sinais: string[]
  sinaisDeSlot: string[]
}

export interface ResultadoDaLimpeza {
  apagados: { posts: number; sinaisDePost: number; entradas: number; sinais: number; sinaisDeSlot: number; geracoes: number; usos: number }
  /** Uma entrada por passo que falhou — vazia é cleanup completo. */
  falhas: string[]
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function limparRodada(db: BancoDaLimpeza, alvos: AlvosDaLimpeza): Promise<ResultadoDaLimpeza> {
  const { projeto, marca, inicio } = alvos
  const falhas: string[] = []
  const apagados = { posts: 0, sinaisDePost: 0, entradas: 0, sinais: 0, sinaisDeSlot: 0, geracoes: 0, usos: 0 }
  const passo = async (nome: string, executar: () => Promise<void>) => {
    try {
      await executar()
    } catch (e) {
      falhas.push(`${nome}: ${mensagem(e)}`)
    }
  }

  // R39: os posts da rodada são identificados ANTES de apagar (os ids coletados + os recuperados pela marca na
  // legenda, que cobrem a falha parcial antes do `posts.push`), e os sinais deles saem restritos por projeto, post e
  // início da rodada — `LearningSignal.postId` não tem FK.
  let postsDaRodada: string[] = []
  await passo('posts', async () => {
    postsDaRodada = (await db.socialPost.findMany({ where: { projectId: projeto, OR: [{ id: { in: alvos.posts } }, { caption: { contains: marca } }] }, select: { id: true } })).map((p) => p.id)
    if (postsDaRodada.length) apagados.sinaisDePost = (await db.learningSignal.deleteMany({ where: { projectId: projeto, postId: { in: postsDaRodada }, createdAt: { gte: inicio } } })).count
    apagados.posts = (await db.socialPost.deleteMany({ where: { projectId: projeto, id: { in: postsDaRodada } } })).count
  })
  await passo('entradas', async () => {
    apagados.entradas = (await db.knowledgeBaseEntry.deleteMany({ where: { projectId: projeto, OR: [{ id: { in: alvos.entradas } }, { title: { contains: marca } }] } })).count
  })
  await passo('geracoes', async () => {
    const ids = [...new Set(alvos.geracoes)]
    if (ids.length) apagados.geracoes = (await db.generation.deleteMany({ where: { id: { in: ids }, projectId: projeto } })).count
  })
  await passo('usos', async () => {
    apagados.usos = (await db.photoUsage.deleteMany({ where: { id: { in: alvos.usos }, projectId: projeto } })).count
  })
  // Só o sinal que ESTA rodada criou: proposta reutilizada de antes da prova (createdAt anterior) fica. Dois passos:
  // a falha nos de foto não pode deixar os de slot para trás.
  await passo('sinais de foto', async () => {
    apagados.sinais = (await db.learningSignal.deleteMany({ where: { id: { in: alvos.sinais }, projectId: projeto, tipo: 'foto', createdAt: { gte: inicio } } })).count
  })
  await passo('sinais de slot', async () => {
    apagados.sinaisDeSlot = (await db.learningSignal.deleteMany({ where: { id: { in: alvos.sinaisDeSlot }, projectId: projeto, tipo: 'slot', createdAt: { gte: inicio } } })).count
  })
  await passo('conferência R39', async () => {
    // Nenhum sinal amarrado a um post desta rodada pode sobrar (o post é novo — não há sinal legítimo anterior a ela).
    const sobraram = postsDaRodada.length ? await db.learningSignal.count({ where: { projectId: projeto, postId: { in: postsDaRodada } } }) : 0
    if (sobraram > 0) throw new Error(`${sobraram} sinal(is) de aprendizado ainda amarrado(s) aos posts desta rodada`)
  })
  return { apagados, falhas }
}
