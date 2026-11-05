# Dados estruturados — lagostacriativa.com.br (05/10/2026)

**Nota: 5/100 em produção hoje (nenhum JSON-LD). Com o PR #198 como está: ~45. Com as recomendações abaixo: ~85.**

## Detecção
- Produção: nenhum JSON-LD, Microdata ou RDFa na home.
- PR #198 (`src/app/page.tsx`): 1 bloco JSON-LD `ProfessionalService`, renderizado no servidor (bom: não depende de JS), com `<` escapado.

## Validação do bloco do PR #198
| Item | Resultado |
|---|---|
| `@context` https | OK |
| `@type` ProfessionalService (subtipo de LocalBusiness/Organization) | OK, tipo válido e não depreciado |
| `@id` `https://lagostacriativa.com.br/#lagosta-criativa` | OK, estável e absoluto |
| `founder` com `@id` `https://cirotrigo.com.br/#ciro-trigo` | OK, mantido (junta a pessoa entre os dois sites) |
| `logo`, `image` | OK, `lagosta-logo.png` e `og-lagosta.png` existem em `public/` |
| URLs absolutas | OK |
| Placeholder | nenhum |
| `address` | Válido, mas só cidade/UF. Sem rua, não habilita rich result de negócio local. Não invente: deixe assim. |
| `taxID` | Válido no schema.org, mas o Google ignora; o CNPJ já é público no site/CONTEXTO. Pode ficar. |
| `email` contato@lagostacriativa.com.br | **Confirmar que aparece no site.** Não consta no texto da home extraído; se não estiver visível, remover ou exibi-lo. |

Veredito: **passa**, sem erro de sintaxe. É mínimo: faltam WebSite, contato por telefone, serviços/ofertas e `publisher`.

## Problemas e recomendações

### Médio
1. **Falta `WebSite`** com `@id` próprio e `publisher` apontando para o `@id` da agência. Sem `SearchAction` (o site não tem busca; não adicionar).
2. **Falta o catálogo de serviços e planos** (`hasOfferCatalog`). Todos os preços saem de `OfferSection.tsx`. Regras para manter só fatos do site:
   - Só Fotos R$ 990 por sessão; Só Vídeos R$ 1.990 por sessão; Edição de Vídeo R$ 500 por 3 vídeos (6 vídeos: R$ 890).
   - Gestão Participativa R$ 1.990/mês; Gestão Completa R$ 3.290/mês; AI Assistant R$ 1.590/mês.
   - **Site + Cardápio Digital ("Sob consulta") e Tráfego ("Incluso na Gestão Completa") não têm preço**: entram como `Service` sem `price` (nunca inventar valor, nem `0`).
   - Promoção encerrada (`PROMOCAO_ATIVA = false`): não emitir `priceValidUntil` nem preço antigo.
   - Os preços das abas inativas não estão no HTML inicial (Radix só monta a aba ativa). Isso é aceitável (o usuário alcança com um clique), mas o JSON-LD precisa acompanhar a tabela: **gere-o a partir da mesma constante** de `OfferSection` (extraia `categories` para um módulo sem `"use client"`) para o preço mudar num lugar só e `PROMOCAO_ATIVA` valer nos dois. Preço duplicado à mão vai divergir.
3. **Falta `telephone`/`contactPoint`**: o WhatsApp `+55 27 99757-8627` é o canal de venda (links `wa.me/5527997578627`). Pode entrar como `contactPoint` (`contactType: "sales"`, `availableLanguage: "pt-BR"`).

### Baixo
4. **FAQPage para ObjectionsSection: não recomendo.** O Google aposentou o rich result de FAQ para todos os sites em 07/05/2026, então não há ganho em SERP; o benefício para IA/GEO não é confirmado. Além disso, as "perguntas" são objeções de vendas ("Já tenho alguém que posta para mim"), não dúvidas reais. Se um dia quiser mesmo assim, é Info, sem prioridade.
5. **BreadcrumbList: não se aplica** (home única, sem hierarquia pública). Só faria sentido em páginas internas de CMS (`/[...slug]`), que hoje não foram auditadas.
6. **Sem `aggregateRating`/`Review`**: o site não exibe avaliações; não adicionar. Os "7 restaurantes no ar" e métricas do painel (950+ mensagens, 96,4%) são prova de produto, não avaliação; não marcar.
7. `sameAs` da agência: só o Instagram. Adicione outros perfis oficiais **apenas se existirem e estiverem linkados no site**.
8. `knowsAbout`/`alternateName` opcionais; não trazem ganho comprovado, pulei.

### Fora do escopo de schema, mas bloqueia descoberta
- `/robots.txt`, `/sitemap.xml` e `/llms.txt` retornam 307 para `/sign-in` (middleware). Sem eles, o JSON-LD perde alcance. Liberar essas rotas no `middleware.ts` é prioridade maior que qualquer schema novo.
- A home passa por handshake do Clerk (instância de desenvolvimento) antes do 200; crawlers sem cookie podem receber o 307 inicial. Vale revisar.
- O mesmo domínio serve o app (Studio); manter o JSON-LD só em `page.tsx` (como no PR), nunca no `layout.tsx`.

## JSON-LD pronto (substitui o `JSON_LD` do PR; mantém `@id` do fundador)
Em `page.tsx`, trocar por `@graph`. Os valores de preço devem vir da constante compartilhada; aqui estão literais para conferência.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://lagostacriativa.com.br/#website",
      "url": "https://lagostacriativa.com.br",
      "name": "Lagosta Criativa",
      "inLanguage": "pt-BR",
      "publisher": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" }
    },
    {
      "@type": "ProfessionalService",
      "@id": "https://lagostacriativa.com.br/#lagosta-criativa",
      "name": "Lagosta Criativa",
      "url": "https://lagostacriativa.com.br",
      "logo": "https://lagostacriativa.com.br/lagosta-logo.png",
      "image": "https://lagostacriativa.com.br/og-lagosta.png",
      "description": "Não vendemos posts. Vendemos mesas ocupadas. Foto e vídeo, gestão de redes, atendimento com IA, sites e tráfego pago para restaurantes — a única empresa do ES que une tudo isso com método.",
      "email": "contato@lagostacriativa.com.br",
      "telephone": "+5527997578627",
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "sales",
        "telephone": "+5527997578627",
        "availableLanguage": "pt-BR",
        "url": "https://wa.me/5527997578627"
      },
      "address": { "@type": "PostalAddress", "addressLocality": "Vitória", "addressRegion": "ES", "addressCountry": "BR" },
      "taxID": "21.339.876/0001-37",
      "areaServed": [
        { "@type": "City", "name": "Vitória" },
        { "@type": "State", "name": "Espírito Santo" }
      ],
      "sameAs": ["https://www.instagram.com/lagostacriativa/"],
      "founder": {
        "@type": "Person",
        "@id": "https://cirotrigo.com.br/#ciro-trigo",
        "name": "Ciro Trigo",
        "url": "https://cirotrigo.com.br/sobre",
        "sameAs": ["https://www.instagram.com/cirotrigo/", "https://www.linkedin.com/in/ciro-trigo/"]
      },
      "hasOfferCatalog": {
        "@type": "OfferCatalog",
        "name": "Serviços de marketing gastronômico",
        "itemListElement": [
          { "@type": "Offer", "priceCurrency": "BRL", "price": "990",
            "priceSpecification": { "@type": "UnitPriceSpecification", "price": "990", "priceCurrency": "BRL", "unitText": "sessão" },
            "itemOffered": { "@type": "Service", "name": "Só Fotos", "serviceType": "Fotografia gastronômica",
              "description": "Sessão de 2 horas de produção, média de 100 fotos editadas, tratamento profissional de imagem, entrega via link digital.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } },
          { "@type": "Offer", "priceCurrency": "BRL", "price": "1990",
            "priceSpecification": { "@type": "UnitPriceSpecification", "price": "1990", "priceCurrency": "BRL", "unitText": "sessão" },
            "itemOffered": { "@type": "Service", "name": "Só Vídeos", "serviceType": "Produção de vídeo gastronômico",
              "description": "Sessão de 3 horas, captação profissional, 2 vídeos editados e entrega de todos os vídeos brutos via link digital.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } },
          { "@type": "Offer", "priceCurrency": "BRL", "price": "500",
            "priceSpecification": { "@type": "UnitPriceSpecification", "price": "500", "priceCurrency": "BRL", "unitText": "3 vídeos" },
            "itemOffered": { "@type": "Service", "name": "Edição de Vídeo", "serviceType": "Edição de vídeo",
              "description": "Edição do material bruto do cliente: 3 vídeos por R$ 500 ou 6 vídeos por R$ 890, com entrega via link digital.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } },
          { "@type": "Offer", "priceCurrency": "BRL", "price": "1990",
            "priceSpecification": { "@type": "UnitPriceSpecification", "price": "1990", "priceCurrency": "BRL", "unitCode": "MON", "billingDuration": 1, "unitText": "mês" },
            "itemOffered": { "@type": "Service", "name": "Gestão Participativa", "serviceType": "Gestão de redes sociais",
              "description": "3 posts semanais no Feed, sessão mensal de até 2 horas, consultoria para Stories e planejamento semanal aprovado pelo cliente.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } },
          { "@type": "Offer", "priceCurrency": "BRL", "price": "3290",
            "priceSpecification": { "@type": "UnitPriceSpecification", "price": "3290", "priceCurrency": "BRL", "unitCode": "MON", "billingDuration": 1, "unitText": "mês" },
            "itemOffered": { "@type": "Service", "name": "Gestão Completa", "serviceType": "Gestão de redes sociais e tráfego pago",
              "description": "Sessão de 5 horas (foto e vídeo), 4 posts semanais no Feed, 2 posts diários nos Stories, gestor de tráfego incluso e consultoria e treinamento de equipe.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } },
          { "@type": "Offer", "priceCurrency": "BRL", "price": "1590",
            "priceSpecification": { "@type": "UnitPriceSpecification", "price": "1590", "priceCurrency": "BRL", "unitCode": "MON", "billingDuration": 1, "unitText": "mês" },
            "itemOffered": { "@type": "Service", "name": "AI Assistant", "serviceType": "Atendimento com IA e CRM",
              "description": "Atendimento 24 horas no WhatsApp e no Instagram, 500 respostas por mês, CRM com funil de reservas e base de conhecimento própria.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } },
          { "@type": "Offer",
            "itemOffered": { "@type": "Service", "name": "Site + Cardápio Digital", "serviceType": "Criação de sites e cardápio digital",
              "description": "Projeto sob medida com cardápio digital atualizável em um clique, pedido pelo WhatsApp e reserva integrada ao agente de atendimento. Preço sob consulta.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } },
          { "@type": "Offer",
            "itemOffered": { "@type": "Service", "name": "Tráfego Gerenciado", "serviceType": "Tráfego pago",
              "description": "Gestor de tráfego dedicado, incluso na Gestão Completa.",
              "provider": { "@id": "https://lagostacriativa.com.br/#lagosta-criativa" } } }
        ]
      }
    }
  ]
}
```

Notas de implementação:
- Os dois últimos `Offer` (sem preço) são de propósito: o site diz "Sob consulta" e "Incluso", e não há valor a declarar.
- Se `PROMOCAO_ATIVA` voltar a `true`, os preços de Só Fotos/Só Vídeos passam a R$ 890/R$ 1.490 e é necessário `priceValidUntil` com a data real; gerar da mesma constante.
- Validar depois do deploy no Rich Results Test / validator.schema.org (sem credenciais aqui, não executei).
- Não editei o repositório.
