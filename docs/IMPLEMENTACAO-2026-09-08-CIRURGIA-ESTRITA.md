# Terceira entrega: recomposição local estrita

Correção da garantia geométrica da passada cirúrgica, antecipada da fase 4 por ser um defeito determinístico já reproduzido. Sem interface nova, sem deploy e sem chamadas reais ao provedor nesta entrega.

## O que mudou

A cirurgia não chama mais `restaurarFotoForaDasZonas`: essa função legada recupera pixels numa faixa externa para salvar letras que transbordam e, por isso, não garante o exterior. Continua disponível para os experimentos anteriores. O casamento tonal da geração normal permanece intacto.

`recomporCirurgiaEstrita` começa com uma cópia dos pixels da origem e só escreve dentro do retângulo selecionado. Não há expansão implícita de 1% nem recuperação externa. O feather é interno e limitado pelo tamanho da zona, preservando um núcleo de edição inclusive em regiões pequenas. Nas bordas do quadro, a edição pode chegar até o limite sem misturar novamente conteúdo antigo.

`passadaCirurgica` agora:

1. Orienta a origem pelo EXIF e normaliza para sRGB com alpha.
2. Valida a zona e registra o retângulo efetivo em pixels, sem aceitar coordenadas invertidas ou fora da imagem.
3. Encaixa a imagem no quadro pedido à API preservando sua proporção, com padding transparente quando necessário, e transforma a zona para esse quadro.
4. Confere as dimensões recebidas, retira somente o padding criado e leva a edição à resolução da origem.
5. Recompõe exclusivamente o interior da zona sobre a origem original orientada.
6. Compara todos os pixels e canais RGBA do exterior; qualquer alteração impede a entrega do resultado como cirurgia preservada.

O retorno inclui dimensões finais, retângulo efetivo, quantidade de pixels externos e quantidade de pixels externos alterados. Os campos `difForaAntes` e `difForaDepois` agora medem média absoluta RGBA integral; não devem ser comparados numericamente à antiga métrica em cinza reduzida. O script de cirurgia salva o PNG mestre junto da prévia JPEG.

## Garantia e limites

A garantia é de igualdade dos pixels externos na representação sRGB orientada do PNG mestre. Não é igualdade dos bytes do arquivo de entrada, de metadados EXIF ou de uma prévia JPEG reencodificada. Quando a zona cobre o quadro inteiro, a contagem de pixels externos é zero: não existe área externa protegida.

Dentro da zona, o resultado continua dependente do modelo. Tipografia, texto, cor, objetos e acabamento precisam de avaliação humana. A nova recomposição estrita não aplica a LUT global da recomposição antiga; o interior recebe a edição com feather. Isso evita transformar a camada externa e deve entrar nos próximos ensaios visuais da cirurgia. A zona ainda precisa conter o conteúdo antigo com folga escolhida por quem edita; uma borda atravessando uma letra pode produzir fantasma dentro da zona.

A geração normal permanece sem máscara. Esta correção não ativa cirurgia automática nem revisor que regenere por conta própria. Integração de UI, fila, preço, versionamento e aplicação explícita continua pendente.

## Evidência

O contraexemplo da análise foi incorporado aos testes: numa origem de 256×256, uma edição externa altera 1.200 pixels. Após a recomposição estrita, são **zero pixels externos alterados**, com diferença máxima zero.

Os 16 testes novos também cobrem imagens com um, três e quatro canais; transparência; núcleo de edição efetivo; zona de dois pixels; borda inferior; zona integral; coordenadas inválidas; padding; resolução original; EXIF; ausência de chamada ao provedor para zona inválida; e rejeição de dimensão inesperada do provedor. Chamadas de imagem são simuladas. Não foi gerada nova arte real para alegar melhora estética.

Verificação final da branch: 278 testes aprovados em 28 arquivos, TypeScript sem erros, lint sem erros (cinco avisos em arquivos não alterados) e `git diff --check` aprovado.
