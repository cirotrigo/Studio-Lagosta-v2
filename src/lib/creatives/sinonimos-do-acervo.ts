/**
 * Sinônimos de DOMÍNIO para a busca de fotos — a ponte entre como a equipe
 * pede e como a visão descreveu (07/09/2026).
 *
 * Medido na Real Gelateria: "sorvete" achava 7 fotos num acervo com 2.380
 * marcadas "gelato"; "pistacchio" (como o cliente escreve no cardápio) não
 * achava "pistache"; "salão" não existe no vocabulário do catálogo, que diz
 * "ambiente", "interior", "clientes". Nenhuma regra de casamento resolve isso
 * — é vocabulário, e vocabulário se enumera.
 *
 * Módulo PURO, sem dependências: `ranquear-acervo.ts` o consome e é testado
 * sem banco. Os PILARES aprovados do cliente continuam sendo a expansão por
 * projeto (`palavrasDoTema`); isto é o dicionário comum a toda a carteira de
 * restaurantes.
 *
 * Regras para acrescentar:
 * - Só grafia/termo EQUIVALENTE ou hiperônimo próximo. "gelato" ↔ "sorvete"
 *   sim; "gelato" ↔ "sobremesa" NÃO (ampliaria demais e a maioria das
 *   palavras deixaria de filtrar).
 * - Chaves e valores sem acento e em minúsculas — a comparação normaliza os
 *   dois lados, mas manter o arquivo assim evita duplicata invisível.
 * - Lista curta (≤ ~80 pares). Passou disso, o lugar é o embedding (F2).
 */

const PARES: Array<[string, string[]]> = [
  // doces e gelateria
  ['gelato', ['sorvete', 'gelatos', 'sorvetes']],
  ['sorvete', ['gelato']],
  ['pistache', ['pistacchio', 'pistachio']],
  ['pistacchio', ['pistache']],
  ['casquinha', ['cone', 'cascao']],
  ['cone', ['casquinha']],
  ['taca', ['copo', 'pote', 'copinho', 'potinho']],
  ['pote', ['potinho', 'taca']],
  ['torta', ['bolo', 'fatia']],
  ['crepe', ['crepes', 'creperia']],
  ['waffle', ['waffles']],
  ['cafe', ['cafeteria', 'expresso', 'cappuccino', 'capuccino']],
  ['chocolate', ['cacau', 'nutella', 'brownie']],
  ['acai', ['acai', 'tigela']],
  // carnes e churrasco
  ['churrasco', ['churrasqueira', 'brasa', 'parrilla', 'grelha', 'espeto', 'espetinho']],
  ['brasa', ['churrasco', 'parrilla', 'grelha', 'fogo']],
  ['carne', ['picanha', 'costela', 'ancho', 'chorizo', 'bife', 'corte', 'cortes', 'steak']],
  ['corte', ['carne', 'picanha', 'ancho', 'chorizo', 'bife', 'steak']],
  ['picanha', ['carne']],
  ['costela', ['ribs', 'carne']],
  ['ribs', ['costela']],
  ['hamburguer', ['burger', 'burgers', 'hamburger', 'smash']],
  ['burger', ['hamburguer', 'hamburger', 'smash']],
  ['frango', ['galeto', 'chicken']],
  ['peixe', ['salmao', 'tilapia', 'frutos do mar', 'camarao']],
  ['massa', ['macarrao', 'pasta', 'nhoque', 'gnocchi', 'lasanha', 'ravioli']],
  ['pizza', ['pizzas', 'forno']],
  // bebidas
  ['vinho', ['vinhos', 'taca de vinho', 'garrafa', 'rotulo', 'adega']],
  ['cerveja', ['chopp', 'chope', 'breja', 'long neck', 'pint']],
  ['chopp', ['chope', 'cerveja']],
  ['drink', ['drinks', 'coquetel', 'cocktail', 'caipirinha', 'gin', 'aperol', 'spritz']],
  ['coquetel', ['drink', 'cocktail']],
  ['cafe da manha', ['brunch', 'desjejum', 'manha']],
  // ambiente e gente
  ['salao', ['ambiente', 'interior', 'mesas', 'clientes', 'casa cheia', 'movimento']],
  ['ambiente', ['salao', 'interior', 'decoracao', 'espaco', 'varanda', 'area externa']],
  ['cheio', ['lotado', 'movimento', 'clientes', 'casa cheia', 'movimentado']],
  ['lotado', ['cheio', 'movimento', 'casa cheia']],
  ['fachada', ['entrada', 'frente', 'letreiro', 'exterior']],
  ['noite', ['noturno', 'noturna', 'luzes', 'anoitecer']],
  ['noturna', ['noite', 'noturno']],
  ['noturno', ['noite', 'noturna']],
  ['dia', ['diurno', 'diurna', 'luz do dia']],
  ['familia', ['criancas', 'crianca', 'kids', 'pais', 'maes']],
  ['crianca', ['criancas', 'kids', 'infantil', 'familia']],
  ['casal', ['namorados', 'romantico', 'romantica']],
  ['amigos', ['grupo', 'turma', 'galera', 'encontro']],
  ['equipe', ['funcionario', 'funcionarios', 'garcom', 'chef', 'cozinheiro', 'atendente']],
  ['chef', ['cozinheiro', 'cozinha', 'equipe']],
  ['musica', ['show', 'banda', 'musico', 'palco', 'ao vivo']],
  ['show', ['musica', 'banda', 'palco', 'ao vivo']],
  // ocasiões
  ['happy hour', ['happy', 'hour', 'fim de tarde', 'petisco', 'petiscos', 'aperitivo']],
  ['almoco', ['executivo', 'prato feito', 'meio-dia', 'meio dia']],
  ['executivo', ['almoco', 'prato executivo']],
  ['jantar', ['noite', 'janta']],
  ['sobremesa', ['doce', 'doces']],
  ['doce', ['sobremesa', 'doces']],
  ['petisco', ['petiscos', 'porcao', 'porcoes', 'entrada', 'aperitivo', 'tira-gosto']],
  ['porcao', ['porcoes', 'petisco', 'petiscos']],
  ['delivery', ['embalagem', 'entrega', 'para viagem', 'take away', 'takeaway']],
  ['promocao', ['oferta', 'desconto', 'combo']],
  ['vitrine', ['balcao', 'expositor', 'display', 'cubas']],
  ['prato', ['pratos', 'refeicao', 'comida']],
  ['mesa', ['mesa posta', 'mesas']],
  ['mao', ['maos', 'segurando']],
]

function normalizarChave(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

const MAPA: Map<string, string[]> = new Map(
  PARES.map(([chave, lista]) => [normalizarChave(chave), lista.map(normalizarChave)]),
)

/**
 * Os sinônimos de UMA palavra (ou expressão) do tema, já normalizados e sem
 * a própria palavra. Vazio quando não há entrada.
 */
export function sinonimosDe(palavra: string): string[] {
  const chave = normalizarChave(palavra)
  const lista = MAPA.get(chave) ?? []
  return lista.filter((s) => s !== chave)
}

/** Para testes e inventário: todas as chaves conhecidas. */
export function chavesDeSinonimos(): string[] {
  return [...MAPA.keys()]
}
