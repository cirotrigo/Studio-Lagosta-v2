import { describe, it, expect } from 'vitest'
import {
  fundirGradeComCadencia,
  lerGradeDaBase,
  lerGradeDasEntradas,
  type SlotFixo,
} from '@/lib/posts/grade-da-base'

/** Texto REAL da entrada "Padrões de Postagem — O Quintal Parrilla" (24/08/2026). */
const QUINTAL = `Cadência definida pelo Ciro em 24/08/2026. Três posts por dia, todos os dias da semana.

SLOT FIXO 1 — 08h, de segunda a domingo
Horário de funcionamento e endereço, sempre com foto de ambiente.
O horário anunciado é o do próprio dia: segunda das 11h às 16h, terça a sábado das 11h às 00h, domingo das 11h às 17h.
O título fica na parte superior da arte e o serviço (dia, horário e endereço) no rodapé, em letra miúda. O horário aparece uma única vez na peça.

SLOT FIXO 2 — entre 9h e 10h, de segunda a sexta
Almoço executivo, anunciando que o almoço é servido das 11h às 16h.
Foto de prato executivo ou do ambiente interno na hora do almoço.
Sábado e domingo NÃO entram com o formato "almoço executivo": o fim de semana usa narrativa de encontro, galera e família.

SLOT FIXO 3 — entre 14h e 14h30, de terça a sexta
Happy hour, das 16h às 19h, chope e drinks selecionados em dobro.
Nunca em feriado. Nunca na segunda, no sábado nem no domingo.

SLOTS LIVRES — o restante do dia
Diversificar entre parrilla, petiscos e entradas, tábuas para dividir, drinks e resenha com amigos.
Usar os horários que a casa já pratica: 11h e 12h no fim de semana, 12h e 13h no meio da semana.

REGRAS GERAIS
Não repetir a mesma foto na mesma semana.
Não anunciar programação noturna na segunda nem no domingo, porque a casa fecha às 16h e às 17h.
Sem preço em nenhuma peça.`

/** Trechos REAIS da entrada "Padrões de Postagem — Bacana (grade de stories)" (29/08/2026). */
const BACANA = `Cadência padrão definida pelo Ciro em 29/08/2026: TRÊS stories fixos por dia, todos os dias. Janela de teste de 31/08 a 20/09/2026, revisão em 21/09. O FEED (3 carrosséis por semana) vive em "Cadência e rodízio de temas do FEED — Bacana".

O FUNCIONAMENTO MANDA NA GRADE
Duas unidades com horários DIFERENTES em dia útil. Praia da Costa (Vila Velha): seg a sex das 11h30 às 23h. Bairro de Fátima (Serra): TERÇA a sexta das 17h às 23h — abre só à noite, NÃO tem almoço em dia útil; na SEGUNDA está fechada (desde ago/2026).

SLOT 1 — 09h30, todos os dias
O dia na Bacana: funcionamento do dia + foto de ambiente da unidade certa.
Dia útil: o almoço aponta a Praia da Costa (abre 11h30); o Bairro de Fátima entra como "hoje à noite, a partir das 17h" SÓ de terça a sexta — na SEGUNDA a Fátima está fechada e os stories do dia falam apenas da Praia da Costa.

SLOT 2 — 12h, todos os dias (janela de decisão do almoço)
Seg a sex: Almoço Bacana na Praia da Costa, 11h30 às 16h — monte seu prato.

SLOT 3 — 17h30, todos os dias (a Fátima acabou de abrir em dia útil; na SEGUNDA ela não abre — o slot fala só da Praia da Costa)
seg — carnes no kilo (Picanha Bacana, Ancho; escala de 300g a 1kg)
sáb — noite de sábado em grupo, as duas unidades até 23h
dom — o domingo fecha às 22h: pratos especiais e peixes`

const SEG_DOM = [0, 1, 2, 3, 4, 5, 6]
const SEG_SEX = [1, 2, 3, 4, 5]
const TER_SEX = [2, 3, 4, 5]

const resumo = (slots: SlotFixo[]) => slots.map((s) => `${s.hora} ${s.dias.join(',')}`)

describe('lerGradeDaBase — O Quintal Parrilla', () => {
  it('lê os três slots fixos e ignora funcionamento, happy hour e slots livres', () => {
    const slots = lerGradeDaBase(QUINTAL)
    expect(resumo(slots)).toEqual([
      `08:00 ${SEG_DOM.join(',')}`,
      `09:00 ${SEG_SEX.join(',')}`,
      `14:00 ${TER_SEX.join(',')}`,
    ])
    expect(slots.every((s) => s.origem === 'grade')).toBe(true)
    expect(slots[0].linha).toBe('SLOT FIXO 1 — 08h, de segunda a domingo')
  })

  it('no intervalo "entre 9h e 10h" vale o INÍCIO', () => {
    const [slot] = lerGradeDaBase('SLOT FIXO 2 — entre 9h e 10h, de segunda a sexta')
    expect(slot.hora).toBe('09:00')
    expect(slot.dias).toEqual(SEG_SEX)
  })
})

describe('lerGradeDaBase — Bacana', () => {
  it('lê os três stories do dia, sem se deixar levar pelo "abre 11h30" nem pela SEGUNDA entre parênteses', () => {
    const slots = lerGradeDaBase(BACANA)
    expect(resumo(slots)).toEqual([
      `09:30 ${SEG_DOM.join(',')}`,
      `12:00 ${SEG_DOM.join(',')}`,
      `17:30 ${SEG_DOM.join(',')}`,
    ])
    expect(slots[1].tema).toBe('janela de decisão do almoço')
  })

  it('a forma compacta com tema por hora: "stories 9h30 (…) · 12h (…) · 17h30 (…), todos os dias"', () => {
    const slots = lerGradeDaBase('stories 9h30 (o dia na Bacana) · 12h (almoço) · 17h30 (tema do dia), todos os dias')
    expect(resumo(slots)).toEqual([`09:30 ${SEG_DOM.join(',')}`, `12:00 ${SEG_DOM.join(',')}`, `17:30 ${SEG_DOM.join(',')}`])
    expect(slots.map((s) => s.tema)).toEqual(['o dia na Bacana', 'almoço', 'tema do dia'])
  })

  it('"3 stories por dia: 9h, 12h e 17h" — sem dia declarado é todos os dias, e o ":" não vira tema', () => {
    const slots = lerGradeDaBase('3 stories por dia: 9h, 12h e 17h')
    expect(resumo(slots)).toEqual([`09:00 ${SEG_DOM.join(',')}`, `12:00 ${SEG_DOM.join(',')}`, `17:00 ${SEG_DOM.join(',')}`])
    expect(slots.every((s) => s.tema === undefined)).toBe(true)
  })
})

describe('lerGradeDaBase — formas de escrever dia e hora', () => {
  it('abreviações em range: "seg–sáb" e "ter a sex"; "14:00" também é hora', () => {
    expect(lerGradeDaBase('story 14:00, seg–sáb')[0].dias).toEqual([1, 2, 3, 4, 5, 6])
    expect(lerGradeDaBase('post às 18h, ter a sex')[0].dias).toEqual(TER_SEX)
    expect(lerGradeDaBase('story 14:00, seg–sáb')[0].hora).toBe('14:00')
  })

  it('"até" e "à" como conector, lista com vírgula e "e", e exclusão com "exceto"', () => {
    expect(lerGradeDaBase('story 9h de segunda até quinta')[0].dias).toEqual([1, 2, 3, 4])
    expect(lerGradeDaBase('story 9h, segunda, quarta e sexta')[0].dias).toEqual([1, 3, 5])
    expect(lerGradeDaBase('story 9h todos os dias, exceto segunda')[0].dias).toEqual([0, 2, 3, 4, 5, 6])
  })

  it('"ter" solto é o verbo, não terça — sem outro dia a linha vale para todos', () => {
    expect(lerGradeDaBase('story 20h para ter show ao vivo')[0].dias).toEqual(SEG_DOM)
  })

  it('linha de feed/carrossel e de slot livre ficam de fora, e a hora precisa vir depois da declaração', () => {
    expect(lerGradeDaBase('carrossel de feed: qui 18h30')).toEqual([])
    expect(lerGradeDaBase('SLOT LIVRE — entre 11h e 13h')).toEqual([])
    expect(lerGradeDaBase('abre 11h30 e os stories do dia falam da Praia da Costa')).toEqual([])
  })

  it('texto sem grade devolve []', () => {
    expect(lerGradeDaBase('')).toEqual([])
    expect(lerGradeDaBase('Horário por unidade: segunda a sexta das 11h30 às 23h. Reservas pelo WhatsApp.')).toEqual([])
    expect(lerGradeDaBase('Não repetir a mesma foto na semana. Sem preço em nenhuma peça.')).toEqual([])
  })
})

describe('lerGradeDasEntradas', () => {
  it('a entrada cujo TÍTULO fala de feed fica de fora inteira, e slots repetidos entre entradas contam uma vez', () => {
    const slots = lerGradeDasEntradas([
      { title: 'Cadência e rodízio de temas do FEED — Bacana', content: 'Semana 1: post qui 03/09 18h30 — carnes no kilo' },
      { title: 'Padrões de Postagem — Bacana', content: 'SLOT 1 — 09h30, todos os dias' },
      { title: 'Padrões de Postagem (cópia)', content: 'SLOT 1 — 09h30, todos os dias' },
    ])
    expect(resumo(slots)).toEqual([`09:30 ${SEG_DOM.join(',')}`])
  })
})

describe('fundirGradeComCadencia', () => {
  const cadencia = new Map([
    [4, [{ minutosDoDia: 600, hora: '10:00', motivo: 'costuma postar quinta às 10:00' }, { minutosDoDia: 780, hora: '13:00', motivo: 'costuma postar quinta às 13:00' }]],
    [6, [{ minutosDoDia: 690, hora: '11:30', motivo: 'costuma postar sábado às 11:30' }]],
  ])

  it('nos dias cobertos a grade SUBSTITUI a cadência; nos outros, a cadência continua', () => {
    const grade = lerGradeDaBase('SLOT FIXO 2 — entre 9h e 10h, de segunda a sexta\nSLOT FIXO 3 — entre 14h e 14h30, de terça a sexta')
    const fundido = fundirGradeComCadencia(cadencia, grade)

    expect(fundido.get(4)?.map((s) => `${s.hora} ${s.origem}`)).toEqual(['09:00 grade', '14:00 grade'])
    expect(fundido.get(4)?.[0].motivo).toBe('grade aprovada do cliente: SLOT FIXO 2 — entre 9h e 10h, de segunda a sexta')
    expect(fundido.get(6)?.map((s) => `${s.hora} ${s.origem}`)).toEqual(['11:30 cadencia'])
    expect(fundido.get(1)?.map((s) => s.hora)).toEqual(['09:00'])
    expect(fundido.has(0)).toBe(false)
  })

  it('com grade vazia é a identidade', () => {
    const fundido = fundirGradeComCadencia(cadencia, [])
    expect(fundido.get(4)?.map((s) => `${s.hora} ${s.origem}`)).toEqual(['10:00 cadencia', '13:00 cadencia'])
    expect(fundido.get(6)?.length).toBe(1)
  })

  it('o mesmo horário em dois slots da grade entra uma vez no dia, em ordem', () => {
    const grade = lerGradeDaBase('story 12h todos os dias\nstory 8h seg a sex\nstory 12h seg a sex')
    const fundido = fundirGradeComCadencia(new Map(), grade)
    expect(fundido.get(1)?.map((s) => s.hora)).toEqual(['08:00', '12:00'])
    expect(fundido.get(0)?.map((s) => s.hora)).toEqual(['12:00'])
  })
})
