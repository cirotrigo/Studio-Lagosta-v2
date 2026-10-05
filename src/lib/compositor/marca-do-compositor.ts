/**
 * A MARCA DO COMPOSITOR numa camada (`metadata.compositor`) e o que acontece
 * com ela quando alguém COPIA a camada.
 *
 * A marca diz "esta camada foi DESENHADA pelo compositor a partir do bloco X
 * do contrato": `bloco` e `linhas` (o vínculo que `copyEfetivaDasCamadas` lê),
 * `papel` (a função que ela ocupa na peça) e o que mais o desenho registrou
 * (`encaixe`, `canto`, `elementoDe`). Uma CÓPIA não foi desenhada por ele: é
 * texto novo, com identidade própria — e por isso a marca sai inteira.
 *
 * 🔴 O defeito (PR3-R14-01, revisão FINAL do Codex sobre 539d79fb,
 * 20/09/2026): numa página com contrato, duplicar (ou copiar e colar) a camada
 * do bloco `apoio` com "Sexta" e editar a cópia para "Domingo" fazia
 * `apoio.linhas` virar `['Sexta', 'Domingo']` — a ADIÇÃO registrada como
 * alteração do bloco ORIGINAL, e nenhum bloco livre nascia. É o oposto da
 * decisão do Ciro que o pacote carrega: cópia de texto do compositor vira
 * TEXTO LIVRE em página com contrato.
 *
 * Tirar só `bloco` não bastaria, e o motivo vale registrar: sem ele a cópia
 * ainda carrega o `papel` e disputa a RESERVA por função — na página sem
 * vínculo declarado (composta antes de 20/09) o bloco único da função leva
 * TODAS as camadas dela, e o texto se junta do mesmo jeito; na página com
 * vínculo ela escapa da reserva e vira um SEGUNDO bloco com a MESMA função,
 * que é o que faz a recomposição seguinte morrer em "papel repetido"
 * (PR3-R8-02/R10-01). Sem `papel`, a sobra vira bloco `livre` — texto a mais
 * declarado, com lacuna, que é o que a arte de fato mostra.
 *
 * A marca sai por INTEIRO, nunca chave a chave: chave nova que o desenho grave
 * amanhã já nasce coberta. Isto é o perímetro que o vínculo declarado criou —
 * todo gesto que COPIA uma camada precisa dizer se a marca viaja junto.
 *
 * Duplicar a PÁGINA (ou o template) é outro gesto e a marca VIAJA: ali a peça
 * inteira é copiada, o contrato vai junto e cada bloco continua com o seu dono
 * na cópia.
 *
 * Módulo PURO e sem import nenhum: o editor é client e não pode arrastar o
 * resto do compositor para o bundle (mesma razão de `papel-do-nome.ts`).
 */

// Tipo aberto como o de `oculta-pelo-revisor.ts`: recebe `Layer` do editor e
// objetos de teste.
type CamadaComMarca = { metadata?: Record<string, unknown> }

/** A camada sem a marca do compositor. O resto do `metadata` (grupo, preset, ícone) fica. */
export function semMarcaDoCompositor<L extends CamadaComMarca>(camada: L): L {
  const meta = camada.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !('compositor' in meta)) return camada
  const { compositor: _fora, ...resto } = meta
  return { ...camada, metadata: resto }
}

/**
 * A CÓPIA de uma camada, como o editor a cria (duplicar e colar): identidade
 * nova, destravada e SEM a marca do compositor. Todo caminho que clona camada
 * passa por aqui — o que cada gesto muda é só a identidade.
 */
export function camadaClonada<L extends CamadaComMarca>(
  origem: L,
  identidade: { id: string; name: string; position: { x: number; y: number }; order?: number },
): L {
  return {
    ...semMarcaDoCompositor(origem),
    id: identidade.id,
    name: identidade.name,
    position: identidade.position,
    locked: false,
    ...(identidade.order === undefined ? {} : { order: identidade.order }),
  }
}
