/**
 * As VOZES PROPOSTAS para a migração (PR 13 de "Marca simples, copy melhor",
 * 12/09/2026) — uma por cliente de restaurante da carteira, escritas a partir
 * do DNA de texto de cada um (dump de 12/09/2026), no contrato `voz-v1`.
 *
 * O que é e o que não é:
 * - É a SÍNTESE do que o DNA já diz: descrição curta, tratamento, os exemplos
 *   aprovados (frases-assinatura, CTAs e pré-títulos da lista fechada), os
 *   termos de grafia exata, poucas proibições e as "Regras aprendidas na
 *   prática" condensadas, com a data e o motivo que o DNA registra.
 * - NÃO carrega fato: preço, horário, data de campanha, mecânica com número.
 *   O que era fato no DNA aparece na PRÉVIA como sugestão para a base — quem
 *   decide é o Ciro, no manifesto. Nada foi inventado: linha sem origem no
 *   DNA não entrou.
 * - É PROPOSTA: a versão da prévia amarra a aprovação a este texto. Mudou uma
 *   vírgula aqui, a prévia muda e a aprovação anterior não vale.
 *
 * Fora da lista: Ciro Trigo (não é restaurante e não tem DNA de texto) e
 * quem não tinha DNA no dump.
 */
import type { VozCompacta } from '../../src/lib/brand/voz'

const V = 'voz-v1' as const
const COPY_CURTA = {
  texto: 'Copy curta e direta: o que gera desejo e o que a pessoa precisa para agir; quando a peça mostra um prato, não o descreva inteiro (a foto já faz isso); no apoio, destaque as palavras que carregam a informação.',
  motivo: 'Decisão do Ciro em 01/09/2026, estendida a toda a carteira, ao revisar a leva do By Rock: "a copy está muito grande… gere desejo". Aplicada às 20 copies daquela semana, a média caiu de 108 para 71 caracteres.',
  em: '2026-09-01',
  escopo: 'copy' as const,
  ativa: true,
}

export const VOZES_PROPOSTAS: Record<number, { nome: string; voz: VozCompacta }> = {
  1: {
    nome: 'Real Gelateria',
    voz: {
      versao: V,
      descricao: 'Premium, doce e acolhedora, com clareza acima de criatividade: elegante, precisa e afetiva. Vocabulário italianizado (gelato, panna, fior di latte) e nome de produto sempre em italiano. Fala direto, sem enigma nem urgência fabricada; sem "não é X, é Y" e sem pergunta retórica. Toda peça diz de qual unidade fala. Em crise, doçura sóbria que resolve no direct.',
      tratamento: 'você / vocês, com posse afetiva: "sua pausa", "seu momento"',
      exemplos: ['Sua pausa com sabores Real', 'Pausa da tarde merece sabores Real', 'Aqueça seu dia com sabores Real', 'Domingo Doce com Il Vero Gelato', 'Para elevar sua tarde', 'Porque hoje é dia de se permitir', 'Desacelere e desfrute', 'Viva o Extraordinário', 'Il vero gelato onde você estiver', 'Sua próxima parada do Passaporte Real', 'Experimente o sabor do dia', 'Quarta do Crepe'],
      antesDepois: [{ antes: '00h / 24h', depois: 'meia-noite', motivo: 'meia-noite se escreve por extenso nesta casa' }],
      termos: ['gelato', 'panna', 'fior di latte', 'Pistacchio', 'Semifreddo', 'Il Vero Gelato', 'Passaporte Real', 'Crema', 'Praia do Canto', 'Shopping Vitória', 'Real Gelateria'],
      proibicoes: ['as palavras promoção, sorvete, chantilly, creme de leite, corre, imperdível, última chance, barato', 'galera, bora, yummy, deliciaaa, muito gostoso, vamos estar, chave de ouro, click, quentinho', 'urgência gritada e preço como argumento', 'linguagem infantilizada', '"não é X, é Y" e pergunta retórica', 'canal de pedido ou botão de compra que a base não registra (os canais existentes vêm da base)', 'sabor, combinação ou produto fora do cardápio da base'],
      regras: [
        { id: 'regra-2026-08-11-1', texto: 'Nunca o endereço completo na arte: só o NOME da unidade e o horário; rua e número ficam de fora.', motivo: 'feedback da equipe na bancada em 11/08/2026', em: '2026-08-11', escopo: 'ambas', ativa: true },
        { id: 'regra-2026-08-11-2', texto: 'Cada bloco de copy é uma frase inteira: nunca fatiar uma frase entre blocos, porque cada bloco vira uma linha visual independente na arte.', motivo: 'observado nas artes reprovadas em 11/08/2026', em: '2026-08-11', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-16-1', texto: 'A peça de FUNCIONAMENTO comunica todas as unidades vigentes, uma em cada linha do rodapé; é a primeira peça do dia, e as três artes do dia falam para todas elas. Quais são as unidades vem da base, na data da peça.', motivo: 'correção do Ciro em 16/08/2026, que substituiu a regra anterior de "uma unidade por peça"', em: '2026-08-16', escopo: 'ambas', ativa: true },
        { id: 'regra-2026-08-16-2', texto: 'Assunto exclusivo de uma unidade exige peça nomeando essa unidade; quais itens são exclusivos, e de qual unidade, vem da base na data da peça.', motivo: 'correção do Ciro em 16/08/2026', em: '2026-08-16', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-16-3', texto: 'Bloco de texto que não está na copy NÃO entra na arte; a referência de estilo é estilo, nunca conteúdo (nem a foto dela, nem o rodapé de funcionamento).', motivo: 'defeito sistemático diagnosticado pela Roberta na bancada em 16/08/2026 (duas vezes na mesma peça)', em: '2026-08-16', escopo: 'arte', ativa: true },
        { id: 'regra-2026-08-16-4', texto: 'Meia-noite se escreve "meia-noite", nunca em numeral.', motivo: 'observado nas artes de sexta e sábado em 16/08/2026', em: '2026-08-16', escopo: 'copy', ativa: true },
        { id: 'regra-2026-09-01-1', ...COPY_CURTA },
      ],
    },
  },
  2: {
    nome: 'O Quintal Parrilla',
    voz: {
      versao: V,
      descricao: 'Anfitriã, descontraída, próxima, sincera e direta; nunca vendedora, baladeira, íntima demais, irônica ou ácida. Convite no plural, cena do quintal, brasa ancorada em corte, parrilla ou técnica. Sem travessão, no máximo duas exclamações por peça, sem emoji em copy editorial. Em crítica pública, sóbria e responsável.',
      tratamento: 'convite no plural ("bora", "junta a galera"), próximo e direto',
      exemplos: ['Bora pro quintal?', 'A brasa tá acesa', 'Chega mais', 'Reserva sua mesa', 'Vem que tem', 'Junta a galera', 'Te esperamos aqui', 'Vem pra cá', 'SEXTA NO QUINTAL', 'DOMINGOU NO QUINTAL', 'HORA DO ALMOÇO', 'CHEGA PRA DIVIDIR'],
      antesDepois: [{ antes: 'das onze à meia-noite', depois: 'horário em numerais', motivo: 'o horário desta casa se escreve em numerais, nunca por extenso' }],
      termos: ['parrilla', 'churrasco argentino', 'quintal', 'resenha', 'chopp trincando', 'happy hour', 'Praia do Canto', 'O Quintal Parrilla'],
      proibicoes: ['imperdível, corre, últimas unidades, aproveita agora, maravilhoso, incrível, perfeito, demais, top, delícia, sensacional, simplesmente, que tal', 'gourmet, requintado, refinado, experiência gastronômica, vamos estar, chave de ouro, prezados, venha conhecer, hoje vai bombar, esquenta', 'preço, percentual, "de/por" e qualquer valor; delivery, entrega, retirada, WhatsApp, site ou CEP', 'programação em dia ou período em que a casa não recebe: os dias e horários de funcionamento vêm da base, na data da peça; tempo relativo', '"não é X, é Y", "em um mundo onde…", "descubra como…", pergunta retórica de abertura', 'a palavra "canequinha"; chamar sobremesa da carta geral de sobremesa do executivo', 'CTA fora da lista fechada de oito'],
      regras: [
        { id: 'regra-2026-08-20-1', texto: 'Horário sempre em numerais; nunca "meia-noite" nem qualquer horário por extenso.', motivo: 'correção do Ciro em 20/08/2026: a leva de 20 a 23/08 saiu com "à meia-noite" no rodapé de serviço', em: '2026-08-20', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-24-1', texto: 'CTA de lista fechada, cópia literal; CTA novo não entra sem aprovação.', motivo: 'o DNA trazia só quatro dos sete CTAs; lista fechada pela metade faz o gerador completar inventando (varredura de 24/08/2026)', em: '2026-08-24', escopo: 'copy', ativa: false },
        { id: 'regra-2026-08-27-1', texto: 'A lista fechada de CTAs tem OITO opções: Bora pro quintal? · A brasa tá acesa · Chega mais · Reserva sua mesa · Vem que tem · Junta a galera · Te esperamos aqui · Vem pra cá. Cópia literal; CTA novo só com aprovação.', motivo: 'o Ciro trocou à mão o CTA do último slide do carrossel do Best of the Best para "Vem pra cá" em 27/08/2026 e confirmou que vale daqui para a frente', em: '2026-08-27', escopo: 'copy', substitui: 'regra-2026-08-24-1', ativa: true },
        { id: 'regra-2026-09-01-1', ...COPY_CURTA },
      ],
    },
  },
  3: {
    nome: 'TERO',
    voz: {
      versao: V,
      descricao: 'Sofisticada e acolhedora, como um anfitrião experiente: premium sem frieza, sincera e direta, clareza acima de criatividade. A informação prática é parte elegante da peça. Story é convite curto ancorado em dia e horário, sem urgência; feed é editorial de revista gastronômica. Gramática impecável, inclusive em caixa alta. Em crise, sóbria e resolutiva.',
      tratamento: 'você, com gentileza; uma palavra-assinatura por peça (ritual, memorável, desacelerar)',
      exemplos: ['Reserve sua mesa', 'Faça sua reserva', 'Venha para o Tero', 'Escolha seu vinho', 'Fale com a gente', 'Solicite pelo Direct', 'Gastronomia, bons rótulos e o cenário perfeito para brindar', 'Seu fim de semana começa aqui', 'Clássicos Tero'],
      antesDepois: [
        { antes: 'Peça sua reserva', depois: 'Faça sua reserva', motivo: 'pedido do Ciro na revisão de 30/08/2026' },
                      ],
      termos: ['TERO', 'Happy Wine', 'happy hour', 'rolha free', 'Clássicos Tero', 'Almoço executivo', 'carta de vinhos', 'cozinha autoral', 'harmonização'],
      proibicoes: ['imperdível, corre, últimas unidades, aproveita agora, maravilhoso, incrível, perfeito, demais, top, delícia, sensacional, simplesmente, que tal', 'bora, galera, vamos estar, chave de ouro, diminutivo fofo', '"brasa" e "parrilla" em copy; o nome da chef; a sigla "HH"', 'preço de cardápio (só o Happy Wine pode); rótulo, safra ou preço de vinho', 'delivery, WhatsApp, site, CEP, estacionamento; travessão', 'nomear entrada ou sobremesa do executivo; listar os drinks do happy hour', 'período sem funcionamento (dia e horário vêm da base)', 'CTA de deslizar ("arrasta pra ver")'],
      regras: [
        { id: 'regra-2026-08-24-1', texto: 'O happy hour não é desconto: comunica-se pela MECÂNICA vigente, que é fato da base (conferido na data da peça), nunca por percentual. Pré-título com percentual de OFF está revogado.', motivo: 'a mecânica mudou em 17/08/2026 e o DNA seguia listando o percentual (varredura de 24/08/2026)', em: '2026-08-24', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-28-1', texto: 'Valor de menu fechado de evento não entra na peça: no lugar, "Solicite pelo Direct" (canal a incentivar).', motivo: 'decisão do cliente em 28/08/2026: não expor valor de evento; a conversão vai para o Direct', em: '2026-08-28', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-31-1', texto: 'Story de funcionamento: título identifica o DIA como convite ("Quarta no TERO") e o apoio gera desejo; nunca frase administrativa. "QUASE NO FIM DE SEMANA" e "A SEMANA MERECE UMA PAUSA" estão revogados como título.', motivo: 'revisão da semana 1 em 30/08/2026: cinco stories reprovados por copy "simples e fria"', em: '2026-08-31', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-31-2', texto: 'A copy gera desejo, nunca explica funcionamento. O executivo varia o nome ("Almoço executivo", "Almoço Tero", "Sua pausa com sabor e aconchego"). Clássico da casa: título "Clássicos Tero" + nome do prato, sem ingredientes na arte.', motivo: 'revisão de 30/08/2026: executivo, descrição do prato e baião reprovados', em: '2026-08-31', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-31-3', texto: 'A mecânica é a estrela do título: em Happy Wine, happy hour ou rolha free, o NOME da mecânica vai no título em destaque; o dia nunca toma o lugar dela.', motivo: 'revisão de 30/08/2026: Happy Wine e rolha free rebaixados ao apoio', em: '2026-08-31', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-31-4', texto: 'Horário sempre COMPLETO (início e fim), nunca "a partir das"; não repetir termo nas peças do mesmo dia; sem palavra órfã na última linha do apoio.', motivo: 'revisão de 30/08/2026: termo repetido nas artes de segunda e palavra órfã no domingo', em: '2026-08-31', escopo: 'ambas', ativa: true },
        { id: 'regra-2026-08-31-5', texto: 'Rolha free: nome da mecânica em destaque e a janela em que vale — dias e período são fato da base, conferidos na data da peça —, sem explicar a mecânica nem prometer condições; detalhes ficam para o Direct. A foto (taças à mesa) explica.', motivo: 'decisão do Ciro em 31/08/2026', em: '2026-08-31', escopo: 'copy', ativa: true },
        { id: 'regra-2026-09-01-1', ...COPY_CURTA },
      ],
    },
  },
  4: {
    nome: 'Seu Quinto',
    voz: {
      versao: V,
      descricao: 'Boteco raiz, caloroso e direto: popular, boêmio e convidativo, fala como botequim de verdade, nunca como gastrobar ou bar instagramável. Uma ideia concreta por peça; aviso operacional é convite, nunca explicação; nada de slogan. Fórmula de copy em três passos: gancho curto com clima de ocasião, serviço (horário, endereço, produto), convite humano e simples. Gramática impecável mesmo no tom popular.',
      tratamento: 'você, como quem chama pra mesa da calçada',
      exemplos: ['Venha pro boteco', 'Seu boteco favorito', 'Vem pro Seu Quinto', 'Chega no Seu Quinto', 'Já estamos abertos', 'A mesa tá reservada pra você', 'Hoje tem Seu Quinto', 'Domingou no boteco favorito', 'QUARTA NO BOTECO', 'SÁBADO DE BOTECO', 'é BOM DEMAIS!', 'Aprovadíssimo!'],
      antesDepois: [{ antes: 'Quinto', depois: 'Seu Quinto', motivo: 'o nome da casa nunca se abrevia' }],
      termos: ['Seu Quinto', 'chopp trincando', 'torresmo crocante', 'tira-gosto na estufa', 'mesa na calçada', 'botecando', 'estufa', 'happy em dobro', 'Samba do Canto', 'Almoço ao vivo', '@seuquinto'],
      proibicoes: ['abreviar "Seu Quinto" para "Quinto"', 'preço, percentual ou combo; delivery ou CEP; qualquer contato além do Instagram', 'nomear item "do dia" (caldinho, doce, chopp convidado); inventar programação: a programação da casa vem da base, na data da peça', 'convite ou prova social para dia e horário em que a casa não recebe: o funcionamento vem da base, na data da peça', 'copo gelado, petisco da casa, cachaça boa, ambiente aconchegante, convivência, até tarde; imperdível, incrível, gourmet', 'empilhar benefícios; slogan; CTA fora da lista fechada'],
      regras: [
        { id: 'regra-2026-08-24-1', texto: 'FÓRMULA DE COPY em três passos: 1) GANCHO curto com clima de ocasião; 2) SERVIÇO (horário, endereço, produto ou programação); 3) CONVITE humano e simples. Fechamentos da casa: "é BOM DEMAIS!", "Nota 10!", "Aprovadíssimo!".', motivo: 'a fórmula vivia só na base, buscada por relevância; é identidade e o lugar dela é a voz (varredura de 24/08/2026)', em: '2026-08-24', escopo: 'copy', ativa: true },
        { id: 'regra-2026-09-01-1', ...COPY_CURTA },
      ],
    },
  },
  5: {
    nome: 'Bacana',
    voz: {
      versao: V,
      descricao: 'Fala como o dono da casa que te conhece, sabe seu ponto de carne e não precisa te empurrar nada: acolhedora, concreta, descontraída, autocelebrativa, com gramática impecável e clareza acima de criatividade. Usa o próprio nome como adjetivo (mais Bacana, do jeito Bacana). Nunca íntima demais, superlativa, conceitual ou popular de botequim. A informação vem antes da criatividade: unidade e horário são obrigatórios. Não empurra: nenhuma urgência artificial.',
      tratamento: 'você, cordial e direto; "esperamos você"',
      exemplos: ['Reserve sua mesa', 'Faça sua reserva pelo WhatsApp', 'Monte seu prato', 'Peça mal passado ou ao ponto', 'Fale com o gerente para encomendar', 'Te esperamos na brasa', 'Esperamos você', 'SÁBADO PEDE AQUELE ALMOÇO BACANA', 'ALMOÇO DO JEITO BACANA', 'HOJE É DIA DAQUELE TROPEIRO', 'PICANHA NO PONTO PERFEITO'],
      antesDepois: [{ antes: 'Venha aproveitar nosso almoço incrível!', depois: 'Monte seu prato do jeito Bacana.', motivo: 'sem urgência nem superlativo, e sem afirmar o serviço da casa — o que a casa serve vem da base' }],
      termos: ['Bacana', 'mais Bacana', 'do jeito Bacana', 'super profissa', 'os exageros do Bacana', 'no kilo', 'no ponto', 'tropeiro', 'vinagrete', 'farofa', 'chapa', 'monte seu prato', 'tempero do chef', 'corte especial', 'bacaninhas'],
      proibicoes: ['imperdível, corre, últimas unidades, aproveita agora, top, delícia, sensacional, demais, incrível, perfeito, maravilhoso, que tal', 'BORA, GALERA, vamos estar, chave de ouro, gourmet, dry-aged, mise en place, degustação, harmonização, rodízio', '"Não é só X, é Y", "Você merece", "O sabor que você procurava", "Aquele momento especial", "Venha conferir", "saiba mais", "clique aqui"', 'pergunta retórica de abertura; frase começando com emoji; caixa alta na frase inteira', 'prometer canal, serviço ou programação que a base não registra (encomenda, delivery, site, app, happy hour, campanha): o que a casa oferece vem da base'],
      regras: [{ id: 'regra-2026-09-01-1', ...COPY_CURTA }],
    },
  },
  6: {
    nome: 'Espeto Gaúcho',
    voz: {
      versao: V,
      descricao: 'Fala como um amigo convidando para o churrasco, nunca como anúncio: frases curtas, ritmo de conversa, toque regional sem exagero (um "tchê" ou um "bah" por peça, no máximo). Alegre, popular, direta, sensorial e acolhedora; nunca caricatura gaúcha, formal, debochada, publicitária ou exclusivista. Em crise ou reclamação: sério, humano, sem gíria.',
      tratamento: 'você / "a piazada" / "o pessoal", como quem chama pra mesa',
      exemplos: ['Chama a piazada!', 'Vem pra resenha!', 'Partiu Espeto!', 'Garanta seu lugar!', 'Vem curtir o sabor!', 'Vem se servir!', 'Bora pro Espeto!', 'Chama o pessoal!', 'Vem pro boteco do Espeto!', 'SEXTOU COM ESPETO', 'DOMINGO EM FAMÍLIA', 'CHURRASCO DE VERDADE'],
      antesDepois: [
        { antes: 'Vem pra brasa! / Vem pro fogo!', depois: 'Vem pro Espeto!', motivo: 'os dois saíram da lista de CTAs por decisão do Ciro' },
        { antes: 'desmancha no garfo', depois: 'desmancha na boca', motivo: 'a costela desmancha na boca' },
      ],
      termos: ['Espeto Gaúcho', 'tchê', 'bah', 'baita', 'caprichado', 'resenha', 'costela no bafo', 'picanha', 'churrasco gaúcho', 'farofa', 'vinagrete', 'marmitex', 'rodízio de sexta', '@espetogauchoes'],
      proibicoes: ['porteiras, galpão, delivery, entrega, imperdível, promoção relâmpago, qualidade inigualável e clichê de encarte; "galera" em crise ou resposta séria', 'urgência de instante em story ("acabamos de abrir"); "HOJE TEM BRASA" ou "brasa" solta como headline; slogan fixo repetido como headline', 'ancoragem "de X por Y"; preço, percentual, combo ou gramatura inventados', 'misturar as linhas de promoção, cardápio e rodízio na mesma peça', 'WhatsApp, telefone, CEP, estacionamento, delivery e aplicativos de entrega; retirada só como a base registra', '"Vem pro fogo" e "Vem pra brasa" como CTA', 'política partidária e polêmica alheia ao negócio'],
      regras: [
        { id: 'regra-2026-09-01-1', ...COPY_CURTA },
        { id: 'regra-2026-09-04-1', texto: 'Pré-título, manchete e apoio são diagramados separados mas lidos como UMA frase, de cima para baixo: o pré-título termina no conector que puxa a manchete ("no", "de", "com"), e a manchete emenda no apoio. Leia em voz alta antes de fechar.', motivo: 'em 03/09/2026 o Ciro editou o story do aniversário de Vitória deixando "TRADIÇÃO GAÚCHA NO" + "ANIVERSÁRIO DE VITÓRIA" + o apoio e pediu a estratégia daqui para a frente. Não é a regra de 04/09 substituída em 11/09 ("não adicione campos"); é a leitura contínua entre blocos.', em: '2026-09-04', escopo: 'copy', ativa: true },
        { id: 'regra-2026-09-06-1', texto: 'Nunca usar "Vem pro fogo" como CTA.', motivo: 'feedback do Ciro na peça de quarta em 06/09/2026: "Não use mais esse termo… vou aprovar dessa vez mas não uso mais"', em: '2026-09-06', escopo: 'copy', ativa: true },
      ],
    },
  },
  7: {
    nome: 'By Rock',
    voz: {
      versao: V,
      descricao: 'Energia de show e acolhimento: energética, direta, irreverente e contemporânea; nunca agressiva, bajuladora, seca, debochada ou nostálgica. Clareza acima de criatividade, referência musical como tempero (uma metáfora ou bordão por peça). O NOME DA CASA VEM DEPOIS DA INFORMAÇÃO: descreva primeiro o que a pessoa vai comer ou beber, em português comum; o nome temático fecha a frase, como piscada. Em crise, sóbria e direta, sem bordão.',
      tratamento: 'você, com energia; "bora" cabe como bordão (um por peça)',
      exemplos: ['Reserve já', 'Peça no delivery', 'Vem pro By Rock', 'Bora!', 'Garanta sua mesa', 'Chama a galera', 'No volume máximo', 'Liga o som e abre o apetite', 'Vem almoçar', 'Chama a família e vem', 'Vem de happy hour', 'Chama pro vinho'],
      antesDepois: [
        { antes: 'Roberto Carlos: o prato com a combinação do dia.', depois: 'O prato com a combinação do dia. É o Roberto Carlos.', motivo: 'a informação vem antes do nome temático; o que compõe o prato e como ele é preparado vêm da base' },
        { antes: 'os Rock Steaks', depois: 'a seção do cardápio (os Rock Steaks)', motivo: 'seção do cardápio se explica antes de nomear; o preparo vem da base' },
      ],
      termos: ['By Rock', 'rock and roll', 'Main Stage', 'Rock Steaks', 'Palco Nacional', 'happy hour', 'selo HH', 'chopp gelado', 'encore', 'trilha sonora', 'roqueirinhos', 'Chapas do Rock', 'Praia do Canto', 'delivery'],
      proibicoes: ['imperdível, delícia, top, sensacional, gourmet, requintado, corre, últimas unidades, aproveita agora, incrível, perfeito, simplesmente, demais, que tal', 'sofisticado, refinado, heavy metal, underground, vamos estar, chave de ouro', '"Não é X, é Y"; pergunta retórica de abertura; caixa alta em todos os campos; emoji dentro da arte', 'duas metáforas musicais na mesma peça; metáfora antes da informação; abrir a peça pelo nome temático do prato ou da seção', 'empilhar duas ofertas na mesma peça; "de X por Y"', 'técnica ou equipamento de preparo que a base não registra (brasa, chapa, forno, defumação): o modo de preparo dos cortes vem da base; "chapa" só como travessa', 'a sigla HH sozinha: sempre "itens marcados com o selo HH no cardápio"'],
      regras: [
        { id: 'regra-2026-08-24-1', texto: 'O By Rock não mostra preço em arte nem em legenda, em nenhuma hipótese (nem pacote fechado, nem almoço executivo). Oferta se comunica por percentual ou por mecânica.', motivo: 'o DNA dizia que valor podia aparecer em pacote e executivo e a base dizia o contrário; o Ciro confirmou a versão restritiva na varredura de 24/08/2026', em: '2026-08-24', escopo: 'copy', ativa: true },
        { id: 'regra-2026-09-01-1', texto: 'Copy curta e direta: o que gera desejo e o que a pessoa precisa para agir; não descreva o prato inteiro. O nome temático vem DEPOIS da informação, mas a fórmula pode ser curta: "É o Roberto Carlos" basta. No apoio, destaque o que informa.', motivo: COPY_CURTA.motivo, em: '2026-09-01', escopo: 'copy', ativa: true },
      ],
    },
  },
  8: {
    nome: 'Lagosta Criativa',
    voz: {
      versao: V,
      descricao: 'NÃO É RESTAURANTE: é a agência de marketing gastronômico premium que cuida de restaurantes. Fala com autoridade, não com promessa: direto, sóbrio, premium, curto e cinematográfico, especialista de igual para igual com o dono, sem gíria e sem food slang. Vende desejo de premiumização e movimento (fila, demanda, presença). Quando a peça mostra a comida de um cliente, o texto diz de quem é ("a picanha do Quintal"). CTA imperativo, falando COM o dono. Em crise, sóbria e resolutiva, leva pro direct.',
      tratamento: 'você (o dono do restaurante), no imperativo direto',
      exemplos: ['Você faz a comida. A gente faz a fama.', 'Seu restaurante merece aparecer do jeito que a comida sabe.', 'Marketing que não para, resultado que não cai.', 'O melhor atendimento não tira férias.', 'Fotos reais vendem mais.', 'Não vendemos posts. Vendemos mesas ocupadas.', 'Quem não é visto, não é lembrado.', 'Conheça a metodologia', 'Conheça nossos pacotes', 'Fale com a gente no direct', 'Agendar conversa', 'Ver resultados reais'],
      antesDepois: [
        { antes: 'Quero escalar meu restaurante', depois: 'Conheça a metodologia', motivo: 'CTA de peça é imperativo com o dono; a primeira pessoa fica para botão de site e anúncio' },
        { antes: 'A garçonete que não tira férias', depois: 'O melhor atendimento não tira férias.', motivo: 'reescrita do Ciro em 23/08/2026; "garçonete" saiu de linha' },
        { antes: 'o Wine Vix', depois: 'a Wine Vix', motivo: 'Wine Vix é substantivo feminino' },
      ],
      termos: ['Lagosta Criativa', 'Só Fotos', 'Só Vídeos', 'Vídeos Pluss', 'Gestão Participativa', 'Gestão Completa', 'AI Assistant', 'marketing gastronômico', 'conteúdo performático', 'cardápio digital', 'www.lagostacriativa.com.br'],
      proibicoes: ['"nosso cardápio", "venha provar", "nossa cozinha" ou "mesa cheia" como convite próprio: a Lagosta atende restaurantes, não é um', 'top, sensacional, incrível, demais, delícia, perfeito, maravilhoso, simplesmente, imperdível, corre, últimas unidades, aproveita agora, que tal', 'bah, tchê, galera, resenha, fast, barato, promo, queima, liquida (gíria e food slang)', 'travessão em copy editorial; urgência de varejo (selo de OFF, carimbo, confete, contagem regressiva)', 'case, número ou resultado não confirmado na entrada "Provas e números reais" da base (número tirado do site incluído: só entra depois de confirmado lá)', 'citar o Studio Lagosta, a bancada, a agenda ou "plataforma exclusiva": ferramenta interna, nunca produto', 'preço e badge fora de material comercial (story e post do dia a dia não levam preço)', 'tráfego pago solto: só junto com o atendimento por IA'],
      regras: [
        { id: 'regra-2026-08-23-1', texto: 'CTA de peça é imperativo direto com o dono ("Conheça a metodologia", "Fale com a gente no direct"); a primeira pessoa do cliente fica para botão de site e anúncio.', motivo: 'padrão do Ciro ao revisar a Semana 1 em 23/08/2026: trocou todos os CTAs em primeira pessoa por imperativos', em: '2026-08-23', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-23-2', texto: 'Copy da arte em 3 a 4 blocos: abertura com autoridade, argumento (resultado ou diferencial, com dado quando houver), fechamento vendedor e convite/canal. Headline de 4 a 8 palavras; nome de prato como manchete pode sair em Title Case.', motivo: 'calibrada pelas edições do Ciro em 23/08/2026', em: '2026-08-23', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-23-3', texto: 'Recorte de número é decisão do Ciro: antes de repetir um recorte de período, conferir com ele qual vale.', motivo: 'nas peças da Ilha ele trocou "em agosto" por "em 5 dias" (23/08/2026)', em: '2026-08-23', escopo: 'copy', ativa: true },
        { id: 'regra-2026-08-23-4', texto: 'Cliente citado = logomarca do cliente na peça, e a entrega tem dono: toda peça da vitrine diz o que a Lagosta fez ali (foto, vídeo, arte, gestão, atendimento com IA, site ou tráfego).', motivo: 'regras 12 e 13 do DNA, decididas na montagem da Semana 1', em: '2026-08-23', escopo: 'ambas', ativa: true },
      ],
    },
  },
  11: {
    nome: 'Wine Vix',
    voz: {
      versao: V,
      descricao: 'Sofisticada e acolhedora, como um sommelier de confiança: poética com leveza, evoca sensação, aroma e memória sem clichê; refinada mas natural, nunca fria nem técnica demais. Ensina sem constranger. A informação vem antes da sensação; story do dia a dia é convite curto ancorado em dia e horário, sem urgência de relógio. Em crise, sóbria, pessoal e resolutiva, convidando ao direct.',
      tratamento: 'você, com gentileza; uma palavra-assinatura por peça (ritual, memorável, desacelerar, curadoria), sem repetir em peças consecutivas',
      exemplos: ['Reserve no direct', 'Sua mesa já sente sua falta', 'A adega tem o rótulo certo para você', 'winevix.com.br', 'Venha nos visitar', 'A gente vai até você', 'ESCOLHA DO SOMMELIER', 'DA ADEGA PARA VOCÊ', 'COZINHA AUTORAL', 'O TEMPO PASSA MAIS DEVAGAR AQUI', 'SEXTA NA WINE VIX', 'SÁBADO PARA CELEBRAR'],
      antesDepois: [{ antes: 'a chef Mariana Pilon', depois: 'a chef da casa / a cozinha autoral', motivo: 'a chef anterior não é citada em nenhuma variação' }],
      termos: ['Wine Vix', 'a Wine Vix', 'sommelier', 'adega', 'bistrô', 'harmonização', 'curadoria', 'terroir', 'rolha', 'happy hour', 'almoço executivo', 'Praia do Canto', 'winevix.com.br'],
      proibicoes: ['imperdível, corre, últimas unidades, aproveita agora, incrível, perfeito, top, delícia, sensacional, simplesmente, que tal, demais, ao vivo', 'bora, galera, barato, vamos estar, chave de ouro', 'urgência de relógio ("começa em", "já começou", "daqui a pouco"): usar "disponível", "acontece" e horário fixo', 'a chef anterior, em qualquer variação', 'item fora do cardápio da base (bebida, sobremesa ou versão do executivo que a base não registra na data da peça)', 'travessão longo no texto do post (traço médio em faixa de horário pode)', 'CTA fora dos seis aprovados, cópia literal', 'programação em dia sem funcionamento: os dias em que a casa recebe vêm da base, na data da peça'],
      regras: [{ id: 'regra-2026-09-01-1', ...COPY_CURTA }],
    },
  },
  12: {
    nome: 'Empório Fonseca',
    voz: {
      versao: V,
      descricao: 'Acolhedora, elegante e clara; nunca promocional. A informação vem antes da beleza. Na arte, convite calmo e direto em no máximo duas linhas; na legenda longa, técnica e generosa (explica fermentação natural, sous vide). Elegante, atemporal, convidativa e clara; nunca pomposa, insistente ou enigmática. Em crise, sóbria e resolutiva.',
      tratamento: 'você, com gentileza e calma',
      exemplos: ['Reserve sua mesa.', 'Faça sua reserva.', 'Venha viver a experiência.', 'Venha conhecer.', 'Desfrute essa experiência.', 'Aguardamos você.', 'Da nossa curadoria para a sua mesa.', 'A semana começa com', 'Fim de semana com', 'Domingo merece', 'Sábado para'],
      antesDepois: [],
      termos: ['Empório Fonseca', 'curadoria', 'artesanal', 'fermentação natural', 'sous vide', 'molho roti', 'Hario V60', 'programação semanal', 'Happy Wine', 'almoço executivo'],
      proibicoes: ['imperdível, corre, últimas unidades, aproveita agora, top, delícia, sensacional, gourmet, bora, galera', 'pergunta retórica de abertura; urgência de varejo; superlativo empilhado; chamada dupla', 'falsa intimidade; explicar a própria elegância; emoji na arte; reticências suspensivas', 'telefone ou número que a base não registra', 'convidar para dia sem funcionamento: os dias em que a casa recebe vêm da base, na data da peça', 'preço do almoço executivo enquanto não estiver cadastrado na base (o do Happy Wine pode, vindo da base)'],
      regras: [
        { id: 'regra-2026-08-24-1', texto: 'Preço em copy só em dois casos: o do Happy Wine pode aparecer (vindo da base); o do almoço executivo NÃO entra enquanto não estiver cadastrado na base.', motivo: 'o DNA proibia o preço do executivo e a base dizia que podia; prevalece a versão restritiva, decidida pelo Ciro na varredura de 24/08/2026', em: '2026-08-24', escopo: 'copy', ativa: true },
        { id: 'regra-2026-09-01-1', ...COPY_CURTA },
      ],
    },
  },
}

export const PROJETOS_COM_VOZ_PROPOSTA = Object.keys(VOZES_PROPOSTAS).map(Number).sort((a, b) => a - b)
