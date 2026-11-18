# Melhorar a foto com IA, Fase 1 (o chat): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pelo MCP, melhorar SÓ a foto limpa da página com o Nano Banana 2.1 e deixar o Studio re-renderizar texto, logo e elementos por cima, com opções para alguém escolher.

**Architecture:** um caminho novo dentro da fila `MELHORIA` (`processImprovementInBackground` despacha para `processarMelhoriaDeFoto` quando o job traz `foto`). A Generation do job é uma PROPOSTA (`source: 'melhoria-de-foto'`): guarda leitura, prompt e as opções (foto limpa e prévia no Blob), e nada toca a página. Aplicar é uma segunda chamada, que troca a foto pela porta de `ajustarArte`. Arte sem página, página-modelo e melhoria chapada vão pela reserva, que é o runner de hoje com o gerador forçado em `gemini`.

**Tech Stack:** TypeScript, Prisma, sharp, `@google/genai` (via `gemini-image-client.ts`), `ai` + `@ai-sdk/openai` (diretor), zod, vitest.

**Spec:** `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md` (seções 2, 4, 5, 6, 8, 9 e 13).

## Global Constraints

- Tudo atrás de `MELHORIA_DE_FOTO` (desligada por padrão): com ela desligada, `alvo: 'foto'` é recusado e nada do que existe muda.
- Abordagem B do spec; UMA opção por padrão, `opcoes` 1 ou 2.
- Sem preço em créditos: uma linha de uso por opção gerada, `creditsUsed: 0`, com modelo e custo real em dólar. Nunca `validateCreditsForFeature` nem `deductCreditsForFeature` neste caminho.
- Conferências AVISAM, nunca vetam. Único descarte: `mudancaNaoEntrou`.
- Nada é aplicado a página ou post sem a chamada de aplicar.
- A regra "foto intocável" segue padrão nos modos de diagramação; as receitas são exceções com nome.
- Rosto em foco: aviso em destaque, sem trava por código.
- Sem migração de banco. Sem `@/lib/db` em módulo puro. `Generation.fieldValues` de arte existente só por `mesclarFieldValuesDaArte`.
- Repositório público: nenhuma foto ou arte de cliente no git.
- Fora do escopo: tela do site, `sugerir-melhorias`, `Fotos/IA_LAGOSTA`, campos novos do catálogo, `buscar-fotos`, `melhorar-foto` avulsa, receita de postura e sorriso.

## Review Focus

1. Foto com recorte manual (`style.crop`) ou caixa que não é o quadro inteiro: a foto nova tem de aparecer no MESMO lugar. Teste em `quadro-da-foto.test.ts` (o retângulo-fonte é o de `image-fit.ts` e a camada trocada sai com recorte inteiro).
2. A página mudou entre gerar e aplicar (outra foto, outro recorte): aplicar tem de recusar em vez de colar a foto nova no quadro errado. Teste em `melhoria-de-foto-registro.test.ts` (`fotoAindaEAMesma`).
3. Aplicar duas vezes a mesma opção: a segunda devolve o resultado da primeira, sem outro ajuste. Teste no mesmo arquivo (`opcaoParaAplicar`).
4. Receita desconhecida, repetida ou `ajuste-livre` sem texto: recusa com a lista dos erros, antes de criar Generation. Teste em `receitas-de-foto.test.ts`.
5. `promptPronto` acima de 4.000 ou junto de nada (sem receita): limite conferido e o bloco de preservação da casa entra mesmo sem receita. Teste em `receitas-de-foto.test.ts`.

---

### Task 1: Catálogo de receitas

**Files:** Create `src/lib/ai/receitas-de-foto.ts`; Test `src/lib/ai/__tests__/receitas-de-foto.test.ts`.

**Interfaces (Produces):**

```ts
export const IDS_DAS_RECEITAS = ['humanizar', 'foto-profissional', 'abrir-espaco', 'ajuste-livre'] as const
export type IdDaReceita = (typeof IDS_DAS_RECEITAS)[number]
export type Conferencia = 'assunto-no-lugar' | 'fidelidade-da-cena' | 'rosto-em-foco'
export interface CaixaEmFracoes { x: number; y: number; largura: number; altura: number }
export interface ReceitaPedida { id: IdDaReceita; gesto?: string; lado?: 'esquerda' | 'direita' | 'cima' | 'baixo'; rosto?: boolean; intensidade?: 'leve' | 'marcada'; area?: CaixaEmFracoes; texto?: string }
export interface ReceitaDeFoto { id: IdDaReceita; rotulo: string; descricao: string; parametros: Record<string, string>; trecho: (p: ReceitaPedida) => string; protege: string[]; preserva: string[]; conferencias: Conferencia[] }
export const RECEITAS_DE_FOTO: Record<IdDaReceita, ReceitaDeFoto>
export const TETO_DO_PROMPT_DE_FOTO = 4000
export const receitaPedidaSchema: z.ZodType<ReceitaPedida>
export function normalizarReceitas(entrada: unknown): { receitas: ReceitaPedida[]; erros: string[] }
export function trechosFotograficos(receitas: ReceitaPedida[]): string[]
export function blocoDePreservacao(receitas: ReceitaPedida[]): string
export function montarPromptDeFoto(base: string, receitas: ReceitaPedida[]): string
export function conferenciasDasReceitas(receitas: ReceitaPedida[]): Conferencia[]
export function melhoriaDeFotoLigada(valor?: string): boolean
```

- [ ] Teste: as quatro receitas têm rótulo, descrição em português, `preserva` não vazio e `conferencias`; `normalizarReceitas` recusa id desconhecido, id repetido, `ajuste-livre` sem `texto`, `texto` acima de 500 e `gesto` acima de 200; `blocoDePreservacao([])` traz as regras da casa (comida, lugar, nenhum contraste, rosto real) e, com `humanizar`, "never a suit or blazer" e a entrada pelas bordas; com `rosto: true` não proíbe rosto em foco; `montarPromptDeFoto` termina com o bloco e não duplica quando o base já o tem; `melhoriaDeFotoLigada` só com `true`/`1`.
- [ ] Rodar e ver falhar; implementar; rodar e ver passar; commit.

### Task 2: O quadro da foto

**Files:** Create `src/lib/ai/quadro-da-foto.ts`; Test `src/lib/ai/__tests__/quadro-da-foto.test.ts`.

**Interfaces (Produces):**

```ts
export type MotivoDaReserva = 'sem-pagina' | 'pagina-modelo' | 'ja-e-melhoria' | 'sem-foto-na-pagina'
export type RotaDaFoto = { via: 'pagina'; foto: FotoDaPagina } | { via: 'reserva'; motivo: MotivoDaReserva }
export interface FotoDaPagina { camadaId: string; url: string; caixa: { width: number; height: number }; estilo: { objectFit?: string; cropPosition?: string; crop?: { x: number; y: number; width: number; height: number } } }
export function pageIdDaArte(fieldValues: unknown): string | null            // pageId ?? sourcePageId
export function acharFotoDaPagina(layers: unknown): FotoDaPagina | null     // 1ª camada `image` visível, com fileUrl e id, fora de grade
export function rotaDaMelhoriaDeFoto(origem: { fieldValues: unknown }, pagina: { isTemplate: boolean; layers: unknown } | null): RotaDaFoto
export function retanguloDoQuadro(natural: { width: number; height: number }, foto: FotoDaPagina): { left: number; top: number; width: number; height: number }
export async function recortarQuadro(arquivo: Buffer, foto: FotoDaPagina): Promise<{ buffer: Buffer; width: number; height: number }>
export function proporcaoMaisProxima(largura: number, altura: number): string  // entre as que o Nano Banana aceita
export async function ajustarAoQuadro(gerada: Buffer, quadro: { width: number; height: number }): Promise<Buffer>  // cover, JPEG 92
export function caixaDoTextoNoQuadro(layers: unknown, camadaId: string): CaixaEmFracoes | null
export function camadasComFotoTrocada(layers: unknown, camadaId: string, url: string): PageLayer[]  // fileUrl novo, crop inteiro
export const RECORTE_INTEIRO = { x: 0, y: 0, width: 1, height: 1 }
```

- [ ] Teste: rota `reserva` para origem `source: 'ai_improvement'` (mesmo com página), página nula, `isTemplate`, página sem imagem; rota `pagina` para compositor com imagem. `retanguloDoQuadro` igual ao de `currentSourceRect` (cover e crop manual). `recortarQuadro` numa imagem sintética de 400x300 com caixa 100x200 devolve a proporção da caixa. `proporcaoMaisProxima(1080,1920) === '9:16'`, `(1080,1350) === '4:5'`, `(1080,690) === '3:2'`. `camadasComFotoTrocada` só mexe na camada pedida e deixa `style.crop` inteiro. `caixaDoTextoNoQuadro` devolve a união dos textos visíveis em frações da caixa da foto.
- [ ] Rodar e ver falhar; implementar; passar; commit.

### Task 3: Registro da proposta

**Files:** Create `src/lib/ai/melhoria-de-foto-registro.ts`; Test `src/lib/ai/__tests__/melhoria-de-foto-registro.test.ts`.

**Interfaces (Produces):**

```ts
export const FONTE_DA_MELHORIA_DE_FOTO = 'melhoria-de-foto'
export const TRILHA_DA_FOTO_MELHORADA = 'foto-melhorada'
export const CUSTO_POR_OPCAO_USD = 0.05   // Nano Banana 2.1 em 2K, tabela do Google lida em 17/11/2026
export interface AvisoDaOpcao { tipo: 'assunto' | 'cena' | 'rosto' | 'risco' | 'conferencia'; texto: string; destaque?: boolean }
export interface OpcaoDeFoto { opcao: number; fotoUrl: string | null; previaUrl: string | null; avisos: AvisoDaOpcao[]; descartada?: string; areaAlterada?: number; custoUsd: number; tokens?: { entrada?: number; saida?: number }; segundos: number }
export interface RegistroDaMelhoriaDeFoto { trilha: 'foto-melhorada'; pageId: string; camadaId: string; fotoDeOrigemUrl: string; recorteDeOrigem: unknown; quadro: { width: number; height: number }; receitas: ReceitaPedida[]; pedido: string; promptDe: 'diretor' | 'chat'; leitura: string | null; prompt: string; riscos: string[]; rostoEmFoco: boolean | null; opcoes: OpcaoDeFoto[]; postId: string | null; aplicada: { opcao: number; generationId: string; url: string; em: string; postId?: string | null } | null }
export function lerRegistroDaMelhoriaDeFoto(fieldValues: unknown): RegistroDaMelhoriaDeFoto | null
export function fotoAindaEAMesma(registro: RegistroDaMelhoriaDeFoto, atual: FotoDaPagina | null): boolean
export function opcaoParaAplicar(registro: RegistroDaMelhoriaDeFoto, opcao: number): { ok: true; opcao: OpcaoDeFoto } | { ok: false; codigo: 'OPCAO_NAO_EXISTE' | 'OPCAO_DESCARTADA' | 'OUTRA_OPCAO_JA_APLICADA'; mensagem: string } | { ok: 'ja-aplicada'; aplicada: NonNullable<RegistroDaMelhoriaDeFoto['aplicada']> }
export function retornoDasOpcoes(registro: RegistroDaMelhoriaDeFoto): { leitura: string | null; prompt: string; riscos: string[]; opcoes: Array<{ opcao: number; previaUrl: string | null; fotoUrl: string | null; avisos: string[]; avisosEmDestaque: string[]; descartada?: string }>; aplicada: { opcao: number; generationId: string; url: string } | null }
```

- [ ] Teste dos cinco comportamentos (os itens 2 e 3 do Review Focus aqui). Falhar; implementar; passar; commit.

### Task 4: Diretor de foto

**Files:** Create `src/lib/ai/diretor-de-foto.ts`; Modify `src/lib/ai/diretor-de-arte.ts` (exportar `PLANNER_MODEL` e `ACEITA_TEMPERATURA`); Test `src/lib/ai/__tests__/diretor-de-foto.test.ts`.

**Interfaces (Produces):**

```ts
export interface PlanejarMelhoriaDeFotoArgs { foto: Buffer; arte?: Buffer | null; arteChapada?: boolean; receitas: ReceitaPedida[]; pedido?: string; marca?: string | null; cozinha?: string | null; direcaoDeFoto?: string | null; sobreAFoto?: { prato?: string | null; caixaDoAssunto?: CaixaEmFracoes | null }; caixaDoTexto?: CaixaEmFracoes | null; proporcao: string; controle?: ControleDoDiretor; timeoutMs?: number }
export interface PlanoDeFoto { leitura: string; prompt: string; riscos: string[]; rostoEmFoco: boolean; modelo: string; ms: number; tentativas: number }
export function contextoDaFoto(args: PlanejarMelhoriaDeFotoArgs): string
export function problemasDoPromptDeFoto(prompt: string): string[]
export async function planejarMelhoriaDeFoto(args: PlanejarMelhoriaDeFotoArgs): Promise<PlanoDeFoto | null>   // nunca lança
export async function verRostoEmFoco(foto: Buffer): Promise<boolean | null>
```

Regras conferidas por código em `problemasDoPromptDeFoto`: até 4.000 caracteres; tem lista de preservação (`keep`/`unchanged`/`exactly`); não pede véu, gradiente, tarja nem escurecimento. System prompt segue a estrutura da seção 5 do spec (verbo primeiro, o que muda, o que fica igual, câmera/lente/abertura/luz, frases afirmativas). Três rodadas, como `planejarMelhoria`.

- [ ] Teste das partes puras: o contexto cita receitas, direção de foto do DNA, caixa do texto e do assunto, e diz quando a imagem é arte chapada; `problemasDoPromptDeFoto` acusa os três casos e aceita um prompt bom. Falhar; implementar; passar; commit.

### Task 5: Uso sem cobrança e gancho do acervo

**Files:** Create `src/lib/credits/registrar-uso-sem-cobranca.ts`, `src/lib/ai/foto-melhorada-no-acervo.ts`.

```ts
export async function registrarUsoSemCobranca(p: { clerkUserId: string; feature: FeatureKey; details: Record<string, unknown> }): Promise<boolean>   // findUnique por clerkId (nunca cria User); sem saldo cadastrado, só avisa
export async function registrarFotoMelhoradaNoAcervo(p: { projectId: number; fotoUrl: string; fotoDeOrigemUrl: string; receitas: string[]; generationId: string }): Promise<void>   // gancho da próxima sessão: sem efeito
```

- [ ] Implementar (sem lógica a testar além do que o ponta a ponta exercita); commit junto com a Task 6.

### Task 6: Runner e serviço

**Files:** Create `src/lib/ai/melhoria-de-foto-runner.ts`, `src/lib/ai/melhoria-de-foto-service.ts`; Modify `src/lib/ai/creative-improvement-runner.ts` (campos `foto`, `gerador`, `fotoPelaReserva` em `ImprovementJobArgs`; despacho; os três desvios da reserva), `src/lib/ai/creative-improvement-service.ts` (repassar `gerador` e `fotoPelaReserva`, pular a validação de saldo neles), `src/lib/ai/recompor-por-zona.ts` (opção `tudoEZona`).

**Interfaces (Produces):**

```ts
// runner
export interface MelhoriaDeFotoArgs { pageId: string; receitas: ReceitaPedida[]; pedido: string; promptPronto: string | null; opcoes: 1 | 2; postId: string | null }
export async function processarMelhoriaDeFoto(args: ImprovementJobArgs & { foto: MelhoriaDeFotoArgs }): Promise<void>
// service
export interface StartMelhoriaDeFotoInput { projectId: number; generationId: string; receitas: unknown; pedido?: string; promptPronto?: string | null; opcoes?: number; postId?: string | null; actorClerkId: string; canal?: CanalDaArte | null; dedupeWindowMinutes?: number }
export async function startMelhoriaDeFoto(input: StartMelhoriaDeFotoInput): Promise<{ jobGenerationId: string; reused: boolean; runnerArgs: ImprovementJobArgs | null; via: 'pagina' | 'reserva'; motivoDaReserva?: MotivoDaReserva; avisos: string[] }>
export async function aplicarOpcaoDeFoto(input: { projectId: number; melhoriaId: string; opcao: number; postId?: string | null; decididoPor?: string | null; canal?: CanalDaArte | null }): Promise<{ aplicada: true; jaEstavaAplicada?: boolean; generationId: string; pageId: string; url: string; editUrl: string; postsInvalidados: number; postNoZernio?: { aplicada: boolean; motivo?: string }; avisos: string[] }>
```

Runner, na ordem do spec (seção 6): foto e página; quadro; prompt (diretor, ou `promptPronto` + bloco); N gerações em paralelo no Nano Banana 2.1, modo edição, 2K; por opção: ajustar ao quadro, `mudancaNaoEntrou` (descarta), avisos (assunto, cena, rosto, riscos do diretor), foto no Blob, prévia renderizada em memória com `camadasComFotoTrocada` e também no Blob; uso sem cobrança por opção gerada; `COMPLETED` com `resultUrl` = a primeira prévia válida, ou `FAILED` "a mudança pedida não entrou" (com `pedirNovaTentativa` quando há fila).

Aplicar: troca a foto por `ajustarArte({ camadas: [{ op: 'definir', id, campos: { fileUrl, crop: RECORTE_INTEIRO } }], versaoEsperada })`. É a porta de `ajustarArte` (mesmo render, mesma invalidação, mesma recomposição da arte congelada), pela operação de camadas e não por `imageUrl`: `imageUrl` não zera o recorte nem garante a mesma camada. Post com `laterPostId`: recusa conferida ANTES de tocar a página (`recusaDeArteNoZernio`), e a arte renderizada entra por `aplicarArteMelhoradaAoPost`.

Reserva: `startImprovement` com `gerador: 'gemini'`, `fotoPelaReserva` e sem `applyToPostId`. No runner: o prompt vem do diretor de foto (arte chapada), a foto muda de propósito, a logo da origem volta por `recomporPorZona(..., { tudoEZona: true, logo })`, e o uso é registrado sem cobrança.

- [ ] Implementar; `npm run typecheck`; rodar os testes de `src/lib/ai` tocados; commit e push.

### Task 7: MCP

**Files:** Modify `src/lib/mcp/catalogo/arte-ia.ts`, `src/lib/mcp/instrucoes.ts`, `scripts/validar-registro-mcp.ts` (snapshot do `melhorar-arte` e a tool nova); Test: `npx tsx scripts/validar-registro-mcp.ts` e `npx vitest run src/lib/mcp --maxWorkers=4`.

- `melhorar-arte`: `alvo` (`foto` | `arte`, padrão `arte`), `receitas[]`, `promptPronto` (até 4.000), `opcoes` (1 | 2), `instrucaoImagem` (até 1.200, só com `alvo: 'arte'`).
- `ver-geracao`: `leitura` e `prompt` em toda melhoria; para a proposta de foto, `opcoes`, `riscos` e `aplicada`.
- Tool nova `aplicar-opcao-de-foto` (`projectId`, `melhoriaId`, `opcao`, `postId?`). Fora do perfil só-rascunho (allowlist).
- `instrucoes.ts`: a linha que manda pedir "luz e tratamento da foto" no `pedido` passa a dizer que foto é `alvo: 'foto'` com receita.

- [ ] Implementar; validar o registro; rodar os testes do MCP; commit e push.

### Task 8: Regras

**Files:** Modify `docs/regras/melhoria.md` (seção nova, datada), `AGENTS.md` (uma célula do índice), `.env.example`.

- [ ] Escrever; commit.

### Task 9: Ponta a ponta e bancada

**Files:** Create `scripts/medir-melhoria-de-foto.ts` (bancada; recusa o banco do `.env`; não sobe nada ao Drive; folha em `~/Documents/Clientes/_medicoes/2026-11-melhorar-foto/`).

- [ ] Ponta a ponta no banco de dev: arte do By Rock (projectId 7) com página → `startMelhoriaDeFoto` → `enfileirarMelhoria` → `dispararJobAgora` → conferir opção, prévia, uso; `aplicarOpcaoDeFoto` → conferir página, Generation nova e recorte.
- [ ] Bancada: 4 clientes × 3 receitas × 1 opção. Rodar, olhar a folha, anotar.
- [ ] `npm run typecheck`, `npm run lint`, testes; PR (não mesclar).

---

## O que mudou na execução (17 e 18/11/2026)

O plano acima é o que foi escrito antes do código. O que a implementação e a
bancada mudaram:

- **O descarte ganhou uma segunda medida.** `mudancaNaoEntrou` sozinho descartava
  a receita Foto profissional (tratamento global não vira zona). A opção só é
  "igual" quando não há elemento novo E a `diferencaDeTom` fica abaixo de
  `PISO_DE_TOM`.
- **O runner virou três funções** (`prepararMelhoriaDeFoto`,
  `gerarFotoDaOpcao`, e o guardar dentro de `processarMelhoriaDeFoto`) para a
  bancada medir o código de produção sem subir nada.
- **Página editada depois da arte.** O registro ganhou `antesUrl` e a opção
  ganhou um aviso: a prévia é a página de hoje, que pode não ser mais a arte de
  origem.
- **A área da logo vai ao diretor** (`caixasDaMarcaNoQuadro`): o gesto do
  Humanizar saía embaixo dela.
- **`ver-geracao` devolve as miniaturas** do antes e de cada opção, para o chat
  mostrar o par.
- **`registrarUsoSemCobranca`** em vez de `deductCreditsForFeature`: a dedução
  registra o preço cheio da feature mesmo sem debitar, e debitaria com
  `CREDITOS_APLICADOS` ligado.
