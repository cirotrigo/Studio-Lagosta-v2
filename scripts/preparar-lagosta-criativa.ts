/**
 * Prepara o projeto LAGOSTA CRIATIVA (id 8) para gerar conteúdo diário:
 *
 *   1. DNA — atualiza o portfólio (de 3 categorias para as 5 frentes da
 *      solução completa), acrescenta regras sobre print/cliente/número e
 *      escreve o crivo de aprovação (que estava VAZIO).
 *   2. PILARES — grava e aprova a taxonomia de 7 pilares (estava ZERO, e sem
 *      pilar o `propor-semana` sai sem tema).
 *   3. BASE — cria as entradas que a copy precisa (ficha, solução completa,
 *      atendimento com IA + CRM, sites, Studio, provas e números, FAQ).
 *
 * Levantado em 23/08/2026 (docs/lagosta-criativa/ESTUDO-2026-08-23-CONTEUDO-DIARIO.md).
 *
 * DRY-RUN por padrão: imprime o que mudaria. `--confirmar` grava.
 * Idempotente nas entradas da base (não duplica título já existente) e no DNA
 * (o patch substitui a seção inteira — o texto anterior está no dump do estudo).
 *
 *   npx tsx scripts/preparar-lagosta-criativa.ts
 *   npx tsx scripts/preparar-lagosta-criativa.ts --confirmar
 */
import { db } from '../src/lib/db'
import { updateBrandDNA, loadBrandContext } from '../src/lib/brand/brand-context'
import { salvarPilares } from '../src/lib/aprendizado/pilares-service'
import { criarEntradaBase } from '../src/lib/knowledge/entries'

const PROJECT_ID = 8
/** User.id INTERNO do Ciro (dono do projeto) — nunca o clerkId. */
const AUTOR = 'cmgh24zg30003swtn395ct5k6'
const CONFIRMAR = process.argv.includes('--confirmar')

// ─────────────────────────────────────────────────────────────────────────────
// 1. DNA
// ─────────────────────────────────────────────────────────────────────────────

const TONE_OF_VOICE = `Lagosta Criativa, @lagostacriativa. NÃO É RESTAURANTE — é a agência de marketing gastronômico premium que cuida de restaurantes.

Atende restaurantes e marcas de alto padrão que querem escalar com conteúdo performático, branding sofisticado e estratégia de redes. VENDE DESEJO DE PREMIUMIZAÇÃO E MOVIMENTO — fila, demanda, presença. FALA COM AUTORIDADE, NÃO COM PROMESSA.

TOM: direto, autoritativo, premium. Curto e cinematográfico. Linguagem de quem entrega resultado. NADA DE GÍRIA, NADA DE FOOD SLANG. Foco em conversão e percepção premium. Pode usar termos de marketing e business (escalar, performar, posicionar, autoridade, demanda) com naturalidade.

RÉGUAS: 3/10 descontraído (sóbrio e autoritativo, o registro mais business da carteira) · 6/10 próximo (especialista que fala de igual pra igual com o dono, sem informalidade) · 10/10 sincero (zero ironia, zero hype) · 9/10 direto (afirmação, não metáfora) · 7/10 técnico (vocabulário de marketing sem jargão de agência vazio).

VOCABULÁRIO: escalar, performar, posicionar, autoridade, demanda, fila, desejo, movimento, presença, premium, estratégia, resultado real, conversão, branding, conteúdo performático, marketing gastronômico, exclusividade, sofisticação, alto padrão, metodologia, case, diferencial, posicionamento de marca, atendimento 24h, reserva confirmada, cardápio digital, mesa ocupada.

CTAs: Quero escalar meu restaurante · Ver resultados reais · Falar com especialista · Quero crescer · Agendar conversa · Conhecer a metodologia · Vamos conversar · Posicionar minha marca.

FRASES DE APOIO DA CASA: "Você faz a comida. A gente faz a fama." (assinatura geral) · "Seu restaurante merece aparecer do jeito que a comida sabe." (foto e vídeo) · "Marketing que não para, resultado que não cai." (Gestão Completa) · "A melhor garçonete não tira férias." (AI Assistant) · "Não vendemos posts. Vendemos mesas ocupadas." (posicionamento) · "Quem não é visto, não é lembrado." (constância).

ESTRUTURA DE LEGENDA, 3 MOVIMENTOS: (1) ABERTURA — frase curta com autoridade ou observação estratégica sobre o mercado, sem floreio · (2) ARGUMENTO — resultado, posicionamento ou diferencial; pode citar dado, case ou metodologia, direto ao ponto · (3) CONVITE — chamada direta para DM, link ou agendamento. Curto. Story: 120–240 caracteres. Carrossel: 350–600.

O PORTFÓLIO — A SOLUÇÃO COMPLETA EM CINCO FRENTES, contratáveis separadas ou combinadas. A história que a Lagosta conta é a do restaurante inteiro: a foto gera desejo, a rede gera constância, o atendimento converte a mensagem em reserva, o site fecha o pedido e o tráfego amplia tudo. Frentes:
- PRODUÇÃO AUDIOVISUAL (fotos e vídeos): Só Fotos (100 fotos editadas, 2h de sessão) · Só Vídeos (badge MAIS POPULAR) · Vídeos Pluss (4h, acervo bruto completo — o diferencial é a entrega sem filtro).
- GESTÃO DE REDES: Gestão Participativa (3 posts semanais, acesso ao Studio Lagosta e ao banco de imagem) · Gestão Completa (badge RECOMENDADO — gestor de tráfego incluso, 4 posts semanais, 2 stories diários, treinamento de equipe).
- ATENDIMENTO COM IA + CRM: AI Assistant (badge INOVAÇÃO) — agente treinado no cardápio e nas regras da casa responde Instagram e WhatsApp 24h, coleta a reserva, passa o que importa para a equipe (aviso no Telegram com botão de confirmar) e tudo fica organizado num CRM com funil, conversas, base de conhecimento e relatório diário. É o funcionário digital que atende de madrugada e não inventa resposta.
- SITES E CARDÁPIO DIGITAL: site do restaurante com cardápio digital que o cliente atualiza em um clique, pedido montado e enviado pelo WhatsApp, reserva que cai direto no atendimento. Complementa o agente: o site mostra, o agente responde.
- TRÁFEGO PAGO: anúncios para a região e o público certos, incluso na Gestão Completa; amplia o que o conteúdo e o atendimento já fazem.
O STUDIO LAGOSTA é a plataforma proprietária que sustenta tudo isso (criação de arte com a identidade da marca, agenda, aprovação pelo celular) — diferencial exclusivo, citar como tal.

TOM POR FRENTE: foto — qualidade, constância, editorial, apetitoso · vídeo — movimento, alcance, viralidade, tendência · Vídeos Pluss — abundância, controle, liberdade, acervo · Gestão Participativa — parceria, suporte, estratégia, "junto" · Gestão Completa — autoridade, resultado, 360°, crescimento · AI Assistant e CRM — inovação, eficiência, 24h, reserva confirmada, organização · Sites — clareza, pedido fácil, cardápio sempre atualizado · Tráfego — alcance certo, público certo, casa cheia nos dias fracos.

COMO FALAR DE IA SEM ASSUSTAR: o dono de restaurante costuma ter receio. Humanizar — "é como treinar um novo funcionário, só que ele nunca esquece o que aprendeu" · "você continua no controle: a IA responde o básico e passa pra você o que é importante" · "ele não inventa preço nem promoção: o que não sabe, passa para a equipe". VENDER COMO FUNCIONÁRIO DIGITAL QUE ATENDE 24H, NÃO COMO TECNOLOGIA.

PROVAS: número, case e depoimento só saem da entrada "Provas e números reais" da base, com o cliente e o período. Os números do site (+40%, +2,5k mesas, +15 marcas) NÃO estão confirmados — não usar até confirmação do Ciro.

CRISE: resposta sóbria e resolutiva — reconhece, responde, leva pro direct. Sem defensiva, sem tom institucional frio.`

const CONTENT_RULES = `1. A LAGOSTA NÃO É RESTAURANTE. Nunca escrever "nosso cardápio", "venha provar", "mesa cheia" (como convite próprio), "nossa cozinha". A Lagosta ATENDE restaurantes, não é um. ESTE É O ERRO MAIS PROVÁVEL DESTE CLIENTE, porque todo o resto da carteira é restaurante. Quando a peça mostra a comida de um cliente, o texto deixa claro de quem é: "a picanha do Quintal", "o risoto do Wine Vix".

2. PREÇO E BADGE SÓ EM MATERIAL COMERCIAL. Proposta, apresentação e carrossel de pacotes podem trazer valor e badge (MAIS POPULAR, RECOMENDADO, INOVAÇÃO). STORY E POST DE FEED DO DIA A DIA NÃO LEVAM PREÇO — serviço de agência se precifica em conversa. Quando o preço aparecer, conferir se está atualizado e se o badge é o correto do pacote.

3. NOME DE PACOTE E BENEFÍCIO SEMPRE EXATOS. Só Fotos · Só Vídeos · Vídeos Pluss · Gestão Participativa · Gestão Completa · AI Assistant. Não inventar benefício, inclusão ou entregável que não esteja na tabela oficial. Em material com preço, incluir o rodapé "Valores para contratos mensais".

4. HEADLINE DE 4 A 8 PALAVRAS. Regra dura do design system.

5. SEM TRAVESSÃO em copy editorial. Vírgula, ponto ou dois-pontos.

6. SEM GÍRIA E SEM FOOD SLANG. Proibidos: top · sensacional · incrível · demais · delícia · perfeito · maravilhoso · simplesmente · imperdível · corre · últimas unidades · aproveita agora · que tal · bah · tchê · galera · resenha · fast · barato · promo · queima · liquida.

7. NADA DE URGÊNCIA DE VAREJO. Sem selo circular de OFF, sem carimbo de desconto, sem confete, sem contagem regressiva. A Lagosta vende autoridade, não liquidação.

8. GRAMÁTICA E ORTOGRAFIA IMPECÁVEIS em todas as peças. É uma agência falando — erro aqui custa credibilidade.

9. NÃO INVENTAR CASE, NÚMERO OU RESULTADO. Dado só entra se for real e confirmado: a fonte é a entrada "Provas e números reais" da base, citando cliente e período. Os números do site (+40%, +2,5k mesas reservadas, +15 marcas) NÃO estão confirmados e não entram em peça nenhuma até o Ciro confirmar.

10. CLIENTE REAL, SIM; DADO DE CLIENTE FINAL, NUNCA. Citar o restaurante atendido pelo nome e @ é bem-vindo quando a peça mostra trabalho entregue (foto, arte, site, atendimento). Mas print de conversa, CRM ou painel entra com nome, foto e telefone do cliente final borrados ou trocados por "Cliente" — nenhuma mensagem privada identificável na arte.

11. PRINT É DOCUMENTO, NÃO ILUSTRAÇÃO. Tela do CRM, conversa do agente, painel de números e site entram como print fiel (recorte real, pode ser emoldurado num celular ou laptop), nunca redesenhados pela IA nem com número ou texto inventado. Sem print disponível, a peça vira tipográfica sobre preto.

12. A ENTREGA TEM DONO. Toda peça da vitrine de clientes diz, na copy ou na info de rodapé, o que a Lagosta fez ali: foto, vídeo, arte, gestão, atendimento com IA, site ou tráfego. Mostrar um prato bonito sem dizer que foi a Lagosta que fotografou é conteúdo do restaurante, não da agência.

DIFERENCIAIS QUE VALEM SER DITOS: o STUDIO LAGOSTA é a plataforma proprietária da agência — é diferencial exclusivo, mencionar como tal · o GESTOR DE TRÁFEGO INCLUSO na Gestão Completa equivale a R$ 800–1.200 de serviço embutido · a ENTREGA DE ACERVO BRUTO no Vídeos Pluss é o que nenhum concorrente dá · o ATENDIMENTO COM IA vem com CRM, base de conhecimento e aviso no Telegram, não é só um robô de resposta · o SITE com cardápio digital atualiza pelo mesmo painel do atendimento.`

const PHOTO_DIRECTION = `IMAGEM CINEMATOGRÁFICA COMO PROTAGONISTA — lembrando que, sendo agência, ela nem sempre é um prato.

LUZ: quente e dramática, de alta gastronomia. Contraste cinematográfico, profundidade real com profundidade de campo rasa, acabamento de estúdio. NUNCA iluminação flat, NUNCA cara de banco de imagem.

O QUE PODE SER O HERÓI VISUAL: foto de comida ou ambiente de um cliente · bastidores de sessão (fotógrafo, softbox, câmera, o set montado, mãos ajustando o prato) · mockup (celular com o feed, tela de resultado) · PRINT FIEL de tela (conversa do agente, painel do CRM, cardápio digital, site) emoldurado em celular ou laptop ou recortado com cantos arredondados sobre o preto · textura premium (mármore, madeira nobre, latão, vidro fumê) · close conceitual · composição gráfica abstrata · OU NENHUMA IMAGEM, quando a peça for puramente tipográfica sobre preto.

PRINT DE TELA É DOCUMENTO: entra como está (texto legível, interface real), nunca reconstruído pela IA, nunca com número ou mensagem inventada. Nomes, fotos e telefones de clientes finais borrados. O print ocupa o meio do quadro, o preto respira em volta, a headline fala sobre ele.

FIDELIDADE AO QUE FOR ENVIADO: não distorcer, não recolorir, não inventar cenário novo.

GLOW LARANJA SUTIL em detalhes, como gradiente radial — nunca chapando.

PESSOAS: naturais e contemporâneas, em contexto de trabalho ou de mesa — equipe da Lagosta em ação, chef e equipe do cliente, mãos e costas. Nunca sorriso forçado direto pra câmera, nunca pose corporativa de banco de imagem, nunca rosto de cliente final do restaurante sem autorização.

ANTI-FOTOGRAFIA: iluminação flat ou fria · filtro vintage · cara de stock · estética de delivery ou dark kitchen · overlay escuro cobrindo a imagem inteira.`

const APPROVAL_CHECKLIST = `A peça fala como AGÊNCIA, sem "nosso cardápio", "venha provar", "nossa cozinha"?
O restaurante citado está certo, autorizado, e a copy diz o que a Lagosta fez ali (foto, vídeo, arte, gestão, atendimento, site ou tráfego)?
Nenhum nome, foto ou telefone de cliente final aparece legível em print de conversa, CRM ou painel?
Todo número ou resultado veio da entrada "Provas e números reais" da base, com cliente e período, e nenhum dos números não confirmados do site (+40%, +2,5k, +15) foi usado?
Nome de pacote e benefício batem com a tabela oficial (Só Fotos, Só Vídeos, Vídeos Pluss, Gestão Participativa, Gestão Completa, AI Assistant)?
Story e post de feed do dia a dia estão sem preço?
A headline tem de 4 a 8 palavras, em Title Case, no estilo brush laranja do logotipo?
A copy está sem travessão, sem gíria e sem food slang (top, incrível, imperdível, corre, promo)?
A peça está sem urgência de varejo (selo de OFF, carimbo de desconto, confete, contagem regressiva)?
Print de tela, quando há, é fiel e legível, sem reconstrução por IA e sem texto inventado?
A paleta é preto + laranja + branco/cinza, com o laranja só na headline, no logo e em acento pontual?
A logo está pequena (2 a 3% da largura), com o gradiente original, fora do centro e longe das bordas?
O CTA é um dos oficiais (Quero escalar meu restaurante, Ver resultados reais, Falar com especialista, Quero crescer, Agendar conversa, Conhecer a metodologia, Vamos conversar, Posicionar minha marca)?
A gramática e a ortografia estão impecáveis?`

// ─────────────────────────────────────────────────────────────────────────────
// 2. PILARES
// ─────────────────────────────────────────────────────────────────────────────

const PILARES = [
  {
    slug: 'bastidores-da-producao',
    nome: 'Bastidores da Produção',
    descricao:
      'O making-of das sessões de foto e vídeo nos clientes: equipe em ação, luz e câmera, o set montado, o antes do clique. Mostra o método e humaniza a agência.',
    exemplos: ['sessão de fotos no TERO', 'montando a luz para o prato', 'dia de gravação no Seu Quinto', 'o set antes do clique', 'fotógrafo em ação'],
  },
  {
    slug: 'vitrine-dos-clientes',
    nome: 'Vitrine dos Clientes',
    descricao:
      'A entrega: a foto, o vídeo, a arte ou o feed feitos para um cliente real, sempre dizendo o que a Lagosta fez ali. Antes e depois, a campanha que saiu, o story da semana.',
    exemplos: ['a picanha do Quintal fotografada pela Lagosta', 'o story que saiu hoje no By Rock', 'antes e depois do feed', 'campanha de Dia dos Pais da Real', 'o risoto do Wine Vix'],
  },
  {
    slug: 'atendimento-ia-e-crm',
    nome: 'Atendimento com IA e CRM',
    descricao:
      'O agente que responde Instagram e WhatsApp 24h, coleta a reserva, avisa a equipe no Telegram e organiza tudo num CRM. Prints de conversa, painel de números, base de conhecimento.',
    exemplos: ['print de conversa com o agente', 'reserva confirmada com um toque no Telegram', '96% das mensagens respondidas', 'o cardápio que o agente sabe de cor', 'atendimento de madrugada'],
  },
  {
    slug: 'sites-e-cardapio-digital',
    nome: 'Sites e Cardápio Digital',
    descricao:
      'Sites e cardápios digitais feitos pela Lagosta: cardápio que atualiza em um clique, pedido montado e enviado pelo WhatsApp, reserva que cai no atendimento. O site mostra, o agente responde.',
    exemplos: ['o site do Clericot Café', 'cardápio digital do Empório Fonseca', 'pedido pelo WhatsApp sem taxa de aplicativo', 'reserva pelo site', 'site pensado para o celular'],
  },
  {
    slug: 'trafego-e-resultados',
    nome: 'Tráfego Pago e Resultados',
    descricao:
      'Anúncios para a região e o público certos e os resultados reais da carteira, sempre com fonte, cliente e período. Casa cheia nos dias fracos, reservas, pedidos.',
    exemplos: ['anúncio que encheu a terça', 'campanha de feijoada do Seu Quinto', 'resultado do mês com autorização', 'público certo na região certa', 'case de reservas'],
  },
  {
    slug: 'metodo-e-autoridade',
    nome: 'Método e Autoridade',
    descricao:
      'Conteúdo educativo e de opinião para o dono de restaurante: por que a maioria fracassa no digital, constância, engenharia de cardápio, IA sem medo, o Sistema Lagosta.',
    exemplos: ['marketing sem estratégia só deixa o restaurante mais bonito', 'três erros do Instagram de restaurante', 'por que foto de celular custa caro', 'o ciclo da falência digital', 'como a IA atende sem inventar'],
  },
  {
    slug: 'studio-lagosta',
    nome: 'Studio Lagosta e Tecnologia Própria',
    descricao:
      'A plataforma proprietária da agência: arte criada com a identidade da marca, agenda da semana, aprovação pelo celular, conferência automática. O que sustenta a constância.',
    exemplos: ['arte pronta em minutos com a identidade da marca', 'a semana aprovada pelo celular', 'plataforma própria da Lagosta', 'bancada de criação', 'agenda que não falha'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 3. BASE DE CONHECIMENTO
// ─────────────────────────────────────────────────────────────────────────────

interface Entrada {
  category: 'ESTABELECIMENTO_INFO' | 'DIFERENCIAIS' | 'FAQ'
  title: string
  tags: string[]
  content: string
}

const ENTRADAS: Entrada[] = [
  {
    category: 'ESTABELECIMENTO_INFO',
    title: 'Ficha da Lagosta Criativa — quem é, onde está, como contratar',
    tags: ['ficha', 'contato', 'clientes', 'agência'],
    content: `LAGOSTA CRIATIVA — agência de marketing gastronômico. Vitória, Espírito Santo. Responsável: Ciro Trigo.
Instagram: @lagostacriativa · Site: lagostacriativa.com.br · E-mail: contato@lagostacriativa.com.br · WhatsApp comercial: (27) 99757-8627 (o mesmo do botão "Quero escalar meu restaurante" do site).
Posicionamento: "Não vendemos posts. Vendemos mesas ocupadas." A única empresa do ES que une produção audiovisual, marketing estratégico, atendimento com IA e automação para restaurantes. Assinatura: "Você faz a comida. A gente faz a fama."

CLIENTES ATENDIDOS (registros de agosto/2026 — confirmar autorização antes de citar numa peça):
- Conteúdo e gestão de redes (no Studio Lagosta): Real Gelateria, O Quintal Parrilla, TERO, Seu Quinto, Bacana, Espeto Gaúcho, By Rock, Wine Vix, Empório Fonseca.
- Atendimento com IA + CRM: Empório Fonseca (agente Sofia), Ilha do Caranguejo (agente Papitito), Coronel Picanha, Wine Vix, Bacana, Clericot Café, Cypra Brasil.
- Sites e cardápio digital: Clericot Café, Empório Fonseca, Cypra Brasil.
- Sessões de foto e vídeo registradas no acervo: Farofa, Coronel Picanha, Raiz Brasil, Ilha do Caranguejo, além dos clientes de conteúdo.
Depoimento publicado no site: Jefinho, proprietário do Coronel Picanha — "A IA da Lagosta agilizou tudo e aumentou muito nossas reservas diariamente."

COMO CONTRATAR: conversa pelo WhatsApp ou DM; proposta por frente (fotos, vídeos, gestão de redes, atendimento com IA, site, tráfego) ou combinada. Valores e pacotes estão na entrada "Pacotes Lagosta Criativa".`,
  },
  {
    category: 'DIFERENCIAIS',
    title: 'Solução completa — as cinco frentes e como se combinam',
    tags: ['solução completa', 'frentes', 'posicionamento', 'funil'],
    content: `A Lagosta vende o restaurante inteiro funcionando, não peças soltas. A história que a copy conta é uma cadeia:

1. PRODUÇÃO DE FOTO E VÍDEO gera desejo: sessões presenciais, fotos editadas, vídeos para stories e reels, acervo bruto no Vídeos Pluss. Comida de verdade, nunca banco de imagem nem IA fake.
2. GESTÃO DE REDES gera constância: posts no feed, stories diários, planejamento semanal, tudo criado no Studio Lagosta com a identidade da marca do cliente.
3. ATENDIMENTO COM IA + CRM converte a mensagem em reserva: o agente responde Instagram e WhatsApp 24h com o cardápio e as regras da casa, coleta a reserva, avisa a equipe no Telegram e organiza as conversas num CRM com funil e relatório diário.
4. SITE E CARDÁPIO DIGITAL fecham o pedido: cardápio que atualiza em um clique no mesmo painel, pedido montado e enviado pelo WhatsApp, reserva que cai no atendimento.
5. TRÁFEGO PAGO amplia tudo: anúncios para a região e o público certos, incluso na Gestão Completa.

O que sustenta a cadeia é tecnologia própria: o Studio Lagosta (criação, agenda, aprovação pelo celular) e o CRM com agente. Por isso a Lagosta se chama de "backend completo de crescimento para negócios gastronômicos", e não de agência.

Como usar na copy: cada peça puxa UMA frente, e a legenda pode lembrar que ela faz parte de um todo ("a foto chama, o agente responde, a mesa enche"). Combinações vendidas: Só Vídeos + Gestão Participativa (Combo Crescimento); Gestão Completa + AI Assistant (Combo Completo); Só Fotos + AI Assistant (Combo Entrada).`,
  },
  {
    category: 'DIFERENCIAIS',
    title: 'Atendimento com IA + CRM — o que o agente faz (para copy)',
    tags: ['ia', 'agente', 'crm', 'atendimento', 'reservas', 'whatsapp', 'instagram', 'telegram'],
    content: `O AI Assistant da Lagosta é um agente de atendimento treinado para cada restaurante, ligado a um CRM próprio. Em linguagem de benefício:

- RESPONDE 24H no Instagram (direct) e no WhatsApp, em português natural, com a personalidade da casa (cada cliente dá um nome ao agente: Sofia no Empório Fonseca, Papitito na Ilha do Caranguejo).
- SABE O CARDÁPIO DE COR: a base de conhecimento recebe cardápio em PDF, página do site ou texto; promoção do dia e horário ficam fixados e entram em toda resposta. Atualizar é um clique no painel, sem reprogramar nada.
- NÃO INVENTA: preço só com link do cardápio, alergênico e disponibilidade vão para a equipe, reserva nunca é confirmada pela IA sozinha. O que não sabe, passa adiante.
- COLETA A RESERVA (unidade, dia, horário, número de pessoas) e AVISA A EQUIPE NO TELEGRAM com resumo e botões: "Confirmar reserva" responde o cliente e move o card; "Assumir" pausa a IA e registra quem assumiu; "Abrir no CRM" leva ao atendimento.
- PASSA PARA O HUMANO quando a conversa pede (reclamação, grupo grande, palavra-chave) e volta a responder se a equipe some.
- ENTENDE ÁUDIO E FOTO, responde em bolhas curtas como gente (medido: de 4,7 para 1,55 mensagens por resposta depois do ajuste), espera a pessoa terminar de digitar antes de responder, e envia a foto do prato quando faz sentido.
- LEMBRA DO CLIENTE: quem volta é reconhecido, com o resumo do atendimento anterior.
- ORGANIZA TUDO NO CRM: funil visual (novo contato, reserva solicitada, confirmada, pós-venda), conversas com toggle "IA ativa/pausada", base de conhecimento, painel com mensagens enviadas, novos contatos, tempo de primeira resposta e taxa de resposta, relatório diário no Telegram à meia-noite e alerta de atendimento parado.
- MÚLTIPLAS UNIDADES e horário de funcionamento respeitados; fora do horário, resposta própria.

Pacote: AI Assistant (badge INOVAÇÃO) — 500 respostas por mês, WhatsApp e Instagram, treinamento do cardápio, integração com agenda, automações. Frase da casa: "A melhor garçonete não tira férias."`,
  },
  {
    category: 'DIFERENCIAIS',
    title: 'Provas e números reais — atualizado em 23/08/2026',
    tags: ['provas', 'números', 'resultados', 'cases', 'depoimento'],
    content: `USAR SÓ ESTES NÚMEROS, sempre com cliente e período. Fonte: painéis dos CRMs e acervos, lidos em 23/08/2026.

ATENDIMENTO COM IA (mês de agosto/2026, até 23/08):
- Ilha do Caranguejo (agente no ar desde 10/08/2026): 950 mensagens enviadas no mês, 829 pela IA e 121 pela equipe; 308 novos contatos; 96,4% das conversas respondidas (297 de 308); 599 conversas numa única semana; 8 reservas solicitadas no funil na leitura.
- Empório Fonseca (agente Sofia): 558 mensagens enviadas no mês, 532 pela IA; 66 novos contatos; tempo de primeira resposta abaixo de 1 minuto; 95,5% das conversas respondidas (64 de 67).
- 7 negócios com agente de atendimento instalado (Empório Fonseca, Ilha do Caranguejo, Coronel Picanha, Wine Vix, Bacana, Clericot Café, Cypra Brasil).
- Qualidade de conversa: depois do ajuste de 18 a 21/08, o agente da Ilha passou de 4,7 para 1,55 mensagens por resposta (análise de 15 conversas reais). Avisos no Telegram: 100% entregues nos últimos dias medidos.

PRODUÇÃO DE CONTEÚDO:
- Cerca de 1.000 fotos novas entraram nos acervos dos clientes nos últimos 30 dias (contagem dos catálogos em 23/08/2026) — usar como ordem de grandeza ("mais de mil fotos por mês"), não como manchete exata sem confirmar.
- 9 restaurantes com conteúdo e agenda cuidados pelo Studio Lagosta.

SITES ENTREGUES: Clericot Café (site completo com cardápios, experiências e eventos), Empório Fonseca (site com cardápio digital e pedido pelo WhatsApp), Cypra Brasil.

DEPOIMENTO PUBLICADO: Jefinho, proprietário do Coronel Picanha — "A IA da Lagosta agilizou tudo e aumentou muito nossas reservas diariamente."

NÃO USAR (não confirmados): "+40% de crescimento médio de receita", "+2,5k mesas reservadas por mês", "+15 marcas transformadas" e as frases de resultado dos cards de case do site (Seu Quinto, TERO, Espeto Gaúcho) até o Ciro confirmar por escrito.`,
  },
  {
    category: 'DIFERENCIAIS',
    title: 'Sites e cardápio digital — o que já foi entregue',
    tags: ['site', 'cardápio digital', 'pedido', 'whatsapp', 'clericot', 'empório', 'cypra'],
    content: `A Lagosta desenvolve o site do restaurante como parte da solução: o site mostra, o agente responde, o pedido fecha no WhatsApp.

ENTREGAS (agosto/2026):
- EMPÓRIO FONSECA (emporiofonseca.vercel.app): site institucional com cardápio digital lido do mesmo painel do atendimento (atualizou o cardápio, atualizou o site), carrinho que monta o pedido e envia pelo WhatsApp, botão "Reservar via WhatsApp" que cai direto no agente, campanhas da semana (Happy Wine, Dia da Pizza, executivo) e localização.
- CLERICOT CAFÉ (clericot.vercel.app): site editorial completo, sete páginas — home com a assinatura animada da marca, Menu Cafeteria, Menu Praia, Carta de Bebidas (mais de 50 itens cada, com busca e filtros), Experiências (yoga na praia, musicalização, clube de corrida, CleriOffice), Petit Comité (eventos de 20 a 50 pessoas) — feito para o celular, com reserva e pedido pelo WhatsApp.
- CYPRA BRASIL (cyprabrasil.com.br): site institucional com as linhas da marca (Flammes, Cháxado, café, vinhos) e pedido.

O QUE DIZER NA COPY: cardápio digital que o dono atualiza em um clique · pedido sem taxa de aplicativo, direto no WhatsApp da casa · reserva que chega ao atendimento na hora · site pensado para o celular · a mesma base do atendimento alimenta o site. NÃO prometer loja virtual com pagamento, app próprio nem integração com iFood — não existem.`,
  },
  {
    category: 'DIFERENCIAIS',
    title: 'Studio Lagosta — a plataforma própria (como explicar)',
    tags: ['studio lagosta', 'plataforma', 'tecnologia', 'agenda', 'bancada'],
    content: `O STUDIO LAGOSTA é a plataforma proprietária da agência. É o que permite prometer constância sem perder identidade — e é diferencial exclusivo: cliente de Gestão Participativa tem acesso a ela.

O QUE FAZ, em linguagem de benefício:
- Guarda o DNA de cada marca (tom de voz, regras, tipografia, paleta, direção de foto) e cria as artes com essa identidade, não com um modelo genérico.
- Bancada de criação: escolhe a foto do acervo do cliente, escreve a copy e gera a arte; carrossel com visual coerente entre os slides.
- Agenda semanal: propõe os horários com base no histórico real de cada restaurante, monta a leva da semana e publica nos stories e no feed; a equipe aprova pelo celular.
- Conferência automática: confere o texto da arte antes de agendar e verifica se o story foi publicado de fato.
- Acervo organizado: as fotos das sessões ficam catalogadas por tema, e a busca acha "foto de happy hour" sem abrir pasta.
- Base de conhecimento por cliente: horários, cardápio e campanhas entram na copy sem inventar preço nem promoção.

COMO FALAR: "plataforma própria", "tecnologia da casa", "a agenda da semana aprovada pelo celular", "arte com a identidade da marca em minutos". NÃO falar em IA generativa como argumento principal — a promessa é constância com identidade; a tecnologia é o meio.`,
  },
  {
    category: 'FAQ',
    title: 'Objeções e respostas do dono de restaurante',
    tags: ['faq', 'objeções', 'vendas', 'respostas'],
    content: `"JÁ TENHO ALGUÉM QUE POSTA PARA MIM." Postar não é o problema; vender é. A Lagosta entra com estratégia, foto e vídeo de verdade, atendimento que responde a mensagem que o post gera e os números para decidir a próxima promoção. Quem posta pode continuar; o que muda é o resultado.

"MEU CARDÁPIO VENDE BEM." Ótimo: então a conta é quantas mesas ficam vazias na terça e quantas mensagens ficam sem resposta de madrugada. Marketing gastronômico é encher o dia fraco e aumentar o ticket, não trocar o que já funciona.

"EU MESMO FAÇO MINHAS FOTOS." Foto de celular custa caro quando é a primeira impressão. Luz, ângulo e edição mudam a percepção de valor do prato — e a sessão mensal entrega material para o mês inteiro, sem depender de inspiração no meio do serviço.

"TENHO MEDO DE IA." O agente não inventa: responde com o cardápio e as regras da casa, não confirma reserva sozinho, passa para a equipe o que é importante e avisa no Telegram. É como treinar um novo funcionário que nunca esquece o que aprendeu, e você continua no controle.

"E SE A IA ERRAR?" Ela é treinada com o cardápio e as regras do negócio; caso complexo vai para a equipe; tudo fica registrado no CRM. O erro por demora ou mensagem sem resposta é maior e mais caro.

"MEUS CLIENTES NÃO VÃO GOSTAR DE FALAR COM ROBÔ." A maioria nem percebe; o que percebem é que foram atendidos na hora, em bolhas curtas, no tom da casa.

"É CARO." São planos mensais a partir de R$ 890 (Só Fotos); o AI Assistant sai por R$ 1.590 e atende de madrugada sem hora extra. A conta se faz em mesas ocupadas, não em posts. (Preço só em conversa ou material comercial, nunca em story do dia a dia.)

"NÃO TENHO TEMPO DE ACOMPANHAR." Na Gestão Completa a Lagosta opera tudo, e a aprovação é pelo celular, em minutos. O relatório do atendimento chega no Telegram todo dia.`,
  },
]

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Projeto ${PROJECT_ID} · ${CONFIRMAR ? 'GRAVANDO' : 'dry-run (nada será escrito)'}`)

  // 1. DNA
  const atual = (await loadBrandContext(PROJECT_ID))?.dna
  const patch = {
    toneOfVoice: TONE_OF_VOICE,
    contentRules: CONTENT_RULES,
    photoDirection: PHOTO_DIRECTION,
    approvalChecklist: APPROVAL_CHECKLIST,
  }
  for (const [campo, novo] of Object.entries(patch)) {
    const antes = (atual as any)?.[campo] ?? ''
    console.log(`DNA.${campo}: ${antes.length} → ${novo.length} chars`)
    if (novo.length > 10_000) throw new Error(`DNA.${campo} estoura o teto de 10.000 chars`)
  }
  if (CONFIRMAR) {
    await updateBrandDNA(PROJECT_ID, patch)
    console.log('DNA gravado (composition e visualStyle intocados).')
  }

  // 2. PILARES
  const pilaresAtuais = await db.contentPillar.count({ where: { projectId: PROJECT_ID } })
  console.log(`Pilares hoje: ${pilaresAtuais} · novos: ${PILARES.length}`)
  if (CONFIRMAR) {
    const r = await salvarPilares(PROJECT_ID, PILARES, { aprovar: true, aprovadoPor: AUTOR })
    console.log(`Pilares gravados: ${r.pilares.map((p) => p.slug).join(', ')}`)
    for (const a of r.avisos) console.log('  aviso:', a)
  }

  // 3. BASE
  const titulos = new Set(
    (await db.knowledgeBaseEntry.findMany({ where: { projectId: PROJECT_ID }, select: { title: true } })).map((e) => e.title),
  )
  for (const e of ENTRADAS) {
    if (titulos.has(e.title)) { console.log(`Base: "${e.title}" já existe — pulada`); continue }
    console.log(`Base: + [${e.category}] "${e.title}" (${e.content.length} chars)`)
    if (CONFIRMAR) {
      const r = await criarEntradaBase({
        projectId: PROJECT_ID,
        category: e.category,
        title: e.title,
        content: e.content,
        tags: e.tags,
        metadata: { origem: 'preparar-lagosta-criativa', data: '2026-08-23' },
        autor: AUTOR,
      })
      console.log(`  gravada ${r.id}`)
    }
  }

  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
