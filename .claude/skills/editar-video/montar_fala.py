# Montagem de peça COM FALA — lê <RAIZ>/04_DAVINCI/montagem.json, só as peças com "segmentos"
# (formato em montagem-fala.md). As peças com "planos" continuam com o montar.py.
#
# Roda DENTRO do Resolve, pelo MCP (run_script_unsafe, teto de 60 s por chamada). Variáveis injetadas:
#   RAIZ   (obrigatória) pasta do projeto; o plano é <RAIZ>/04_DAVINCI/montagem.json
#   IDS    (opcional)    peças a montar; sem ela, todas as peças com "segmentos"
#   APAGAR (opcional)    True apaga a timeline antiga em vez de guardá-la como "<nome> · anterior"
#   RAIZ = "/Volumes/.../PROJETO"; IDS = ["V1"]
#   exec(open("<skill>/montar_fala.py").read())
# Nunca troca de projeto: recusa se o aberto não for o "projeto" do montagem.json.
#
# Fora do Resolve:
#   python3 montar_fala.py                            → autoconferência: a conta e o caminho de dentro
#       do Resolve, os dois contra um Resolve de mentira com o comportamento medido
#   python3 montar_fala.py <montagem.json> <ID> [--fps F] → onde cada trecho da fala cai na
#       timeline (o mapa, ANTES de montar). O fps de cada arquivo vem do ffprobe; --fps força um valor
#       para todos (plano feito sem o HD). As palavras na timeline são do legenda.py --peca.
#
# Trilhas: V1 imagem (a da própria fala ou cobertura) · A1 fala · A2 música baixa ·
#          V2 legenda (vídeo com alfa, do quadro 0) · V3 logo animada.
#
# Como V1 e A1 ficam alinhadas (medido: recordFrame só vale em trilha VAZIA; DeleteClips não encurta):
# - Cada segmento anexa a IMAGEM na V1 e depois a FALA na A1, cada uma no fim da própria trilha.
#   O script confere o GetStart de cada item e PARA se o append caiu em outro lugar.
# - A fala manda. A 100%, n quadros da fonte dão floor(n × fps_tl/fps_fonte) na timeline (119,88 →
#   29,97: floor(n/4)); o trecho é preso à grade da timeline, então a duração é exata e sem subquadro.
# - A imagem mira o corte da fala. Quando é a própria fala, o ponto de entrada sai da posição REAL da
#   V1: a sincronia é exata e o erro de antes some ali. Cobertura lenta só entrega múltiplos de 4
#   (25%) ou de 2 (50%); a diferença vai para o segmento seguinte.
# - A cobertura com SetSpeed(ripple) entra ANTES da fala do segmento: nada começa depois dela, então
#   o ripple não tem o que empurrar (e o script confere que a A1 não mexeu).
# - A timeline é montada como "<nome> · montando" e só troca de nome no fim, sem erro: se algo
#   falhar, a antiga não é tocada e a nova fica para diagnóstico.
import functools, json, math, os, subprocess, sys, time, unicodedata
from fractions import Fraction


def fps_real(x):
    """Cópia do montar.py: 29.97 → 30000/1001, 119.88 → 120000/1001; 25 → 25."""
    x = float(x)
    k = round(x * 1.001)
    if abs(x - k / 1.001) < 0.005 and abs(x - k) > 0.005:
        return Fraction(k * 1000, 1001)
    return Fraction(x).limit_denominator(1001)


def fps_do_ffprobe(saida):
    """Saída do ffprobe (r_frame_rate) → fps exato ("120000/1001" → 120000/1001). Lê a 1ª linha e
    tira a vírgula final (com csv=p=0 o ffprobe 9 devolve "120000/1001,"). None se não der ("0/0")."""
    try:
        f = Fraction((saida.split() or [""])[0].rstrip(","))
    except (ValueError, ZeroDivisionError):
        return None
    return f if f > 0 else None


def quadros_fonte(d, r):
    """Cópia do montar.py: menor n de quadros da fonte com floor(n*r) == d (r = fps_tl/fps_fonte)."""
    base = math.ceil(Fraction(d) / r)
    n = min(range(max(1, base - 2), base + 3), key=lambda n: (abs(math.floor(n * r) - d), n))
    return n, math.floor(n * r)


class Parada(Exception):
    pass


def fala_quadros(de_s, ate_s, fps, fps_f):
    """Trecho da fala preso à grade da timeline: (início, fim exclusivo) em quadros da fonte e a
    duração na timeline a 100% (floor(n × fps/fps_fonte), a fórmula medida)."""
    k = fps_f / fps
    ini, fim = round(round(de_s * fps) * k), round(round(ate_s * fps) * k)
    return ini, fim, math.floor((fim - ini) / k)


def validar(pc):
    segs, erros = pc.get("segmentos") or [], []
    if not pc.get("fala"):
        erros.append('falta "fala" (o arquivo cuja voz vai na A1)')
    com = [i for i, s in enumerate(segs) if "de_s" in s]
    if not com:
        erros.append("nenhum segmento com fala")
    for i, s in enumerate(segs):
        n, c = f"segmento {i + 1}", s.get("cobertura")
        if c is not None and not (isinstance(c, dict) and c.get("arquivo")):
            erros.append(f"{n}: cobertura precisa de arquivo")
        if "de_s" in s:
            if not s.get("ate_s", -1) > s["de_s"] >= 0:
                erros.append(f"{n}: precisa de 0 <= de_s < ate_s")
        elif not s.get("sem_fala_s", 0) > 0:
            erros.append(f"{n}: sem de_s/ate_s precisa de sem_fala_s > 0")
        elif not c:
            erros.append(f"{n}: segmento sem fala precisa de cobertura")
        elif com and com[0] < i < com[-1]:
            erros.append(f"{n}: segmento sem fala no MEIO da fala (a A1 não pode ter buraco): "
                         "estenda a fala vizinha e cubra com a imagem")
    return erros


def montar_segmentos(segs, fps, info, fala, v1, a1):
    """V1 e A1 crescem juntas. info(arq) → (fps, quadros ou 0); v1(seg, arq, ini, fim, vel, pos) e
    a1(ini, fim, pos) anexam e devolvem (início, duração, quadro de fonte segundo a API ou None),
    em quadros da timeline contados do 0. Devolve (linhas, avisos, fim da V1, fim da A1)."""
    fps_f, n_f = info(fala)
    k = fps_f / fps
    corte, v_fim, a_fim, linhas, avisos = 0, 0, None, [], []
    for i, sg in enumerate(segs):
        L, nome = {"seg": i + 1}, f"segmento {i + 1}"
        if "de_s" in sg:
            ini, fim, d = fala_quadros(sg["de_s"], sg["ate_s"], fps, fps_f)
            if n_f and fim > n_f:
                raise Parada(f"{nome}: a fala vai até o quadro {fim} e o arquivo tem {n_f}")
            a_ini = corte if a_fim is None else a_fim
            T = a_ini + d
        else:
            T = corte + round(sg["sem_fala_s"] * fps)
        alvo = T - v_fim
        if alvo < 1:
            raise Parada(f"{nome}: a V1 já está no quadro {v_fim} e o corte é {T}: segmento curto demais")
        cob = sg.get("cobertura")
        if cob:
            fps_c, n_c = info(cob["arquivo"])
            ini_c = int(cob["inicio_q"]) if "inicio_q" in cob else round(cob.get("inicio_s", 0) * fps_c)
            vel = float(cob.get("velocidade", 100))
            n, _ = quadros_fonte(max(1, round(alvo * vel / 100)), fps / fps_c)
            if n_c and ini_c + n > n_c:
                avisos.append(f"{nome}: a cobertura pede os quadros {ini_c}–{ini_c + n} de um arquivo com {n_c}")
            st, dur, src_v = v1(sg, cob["arquivo"], ini_c, ini_c + n, vel, v_fim)
            L.update(imagem=os.path.basename(cob["arquivo"]), imagem_q=[ini_c, ini_c + n], velocidade=vel)
        else:
            vin = ini + round((v_fim - a_ini) * k)  # a imagem mostra o quadro que a fala toca
            if vin < 0:
                raise Parada(f"{nome}: para ficar em sincronia a imagem começaria no quadro {vin} da fonte")
            st, dur, src_v = v1(sg, fala, vin, fim, 100, v_fim)
            L.update(imagem="fala", imagem_q=[vin, fim])
        if st != v_fim:
            raise Parada(f"{nome}: a imagem entrou no quadro {st} da V1, esperado {v_fim} "
                         "(o append não foi para o fim da trilha)")
        v_fim = st + dur
        L.update(v1_q=[st, v_fim], alvo_q=alvo, dif_q=v_fim - T)
        if "de_s" in sg:
            st, dur, src_a = a1(ini, fim, a_ini)
            if st != a_ini:
                raise Parada(f"{nome}: a fala entrou no quadro {st} da A1, esperado {a_ini} "
                             "(o append não foi para o fim da trilha)")
            if dur != d:
                avisos.append(f"{nome}: a fala saiu com {dur} q, a conta dava {d}")
            a_fim = corte = st + dur
            L.update(fala_s=[sg["de_s"], sg["ate_s"]], fala_q=[ini, fim], a1_q=[st, a_fim])
            if not cob and src_v is not None and src_a is not None:
                L["sinc_q"] = float((src_v - src_a) / k - (L["v1_q"][0] - st))  # 0 = lábio na voz
        else:
            corte = T
        linhas.append(L)
    return linhas, avisos, v_fim, a_fim


def mapa_da_fala(linhas, fps, fps_f):
    """Onde cada trecho da fala (em segundos da fonte, já preso à grade) cai na timeline."""
    return [{"seg": L["seg"], "fonte_s": [round(float(q / fps_f), 4) for q in L["fala_q"]],
             "timeline_s": [round(float(q / fps), 4) for q in L["a1_q"]], "timeline_q": L["a1_q"]}
            for L in linhas if "a1_q" in L]


def palavras_na_timeline(mapa, palavras):
    """Palavras com tempo NA FONTE [{ini, fim, texto}] → tempo NA TIMELINE (o legenda.py --peca usa).
    Entra a palavra cujo MEIO cai num trecho usado, presa às bordas dele; trecho repetido repete.
    Trechos CONTÍGUOS (fonte e timeline encostadas: a fala partida nas pausas, um corte de cobertura
    sobre a fala) viram um só antes: presa à borda de um corte contíguo, a palavra que o cruza
    atrasaria (no V1 do Costela, 7 de 194 palavras, até 75 ms). Fundir de novo não muda nada."""
    fund = []
    for m in mapa:
        u = fund[-1] if fund else None
        if u and m["fonte_s"][0] == u["fonte_s"][1] and m["timeline_s"][0] == u["timeline_s"][1]:
            u["fonte_s"], u["timeline_s"] = [u["fonte_s"][0], m["fonte_s"][1]], [u["timeline_s"][0], m["timeline_s"][1]]
        else:
            fund.append({"fonte_s": list(m["fonte_s"]), "timeline_s": list(m["timeline_s"])})
    out = []
    for m in fund:
        (a, b), t = m["fonte_s"], m["timeline_s"][0]
        for w in palavras:
            if a <= (w["ini"] + w["fim"]) / 2 < b:
                out.append({**w, "ini": round(t + max(w["ini"], a) - a, 3), "fim": round(t + min(w["fim"], b) - a, 3)})
    return sorted(out, key=lambda w: w["ini"])


def simular(segs, fps, info, fala, erro_lenta=(), no_fim_da_timeline=()):
    """Resolve de mentira com o comportamento medido: append no fim da trilha (recordFrame só em
    trilha vazia), 100% = floor(n × fps/fps_fonte), SetSpeed divide pela velocidade, com erro_lenta[j]
    somado à j-ésima cobertura lenta. no_fim_da_timeline=("a",) simula o append dessa trilha indo
    para o fim da TIMELINE (o caso que a montagem precisa pegar)."""
    fila = {"v": [], "a": []}
    erros = iter(erro_lenta)

    def anexar(t, pos, dur, src):
        ends = [s + d for f in (fila.values() if t in no_fim_da_timeline else [fila[t]]) for s, d in f]
        st = max(ends) if ends else pos
        fila[t].append((st, dur))
        return st, dur, src

    def v1(sg, arq, ini, fim, vel, pos):
        d = math.floor((fim - ini) * fps / info(arq)[0])
        return anexar("v", pos, d if vel == 100 else round(d * 100 / vel) + next(erros, 0), ini)

    def a1(ini, fim, pos):
        return anexar("a", pos, math.floor((fim - ini) * fps / info(fala)[0]), ini)

    return montar_segmentos(segs, fps, info, fala, v1, a1) + (fila,)


# Exemplo para a conta: rascunho do V1 do Costela do Edd (QUINTAL, 24/09/2026), com as bordas nas
# palavras da transcrição, antes da pauta aprovada. Só dados de teste: nada disto é padrão da skill.
C = "01_BRUTO/clip/20260921_"
EXEMPLO = [
    {"de_s": 36.0, "ate_s": 38.6, "cobertura": {"arquivo": C + "C0095.MP4", "inicio_q": 60, "velocidade": 25},
     "nota": "gancho: 'nada mais, nada menos que primeiro lugar. Fomos campeões'"},
    {"de_s": 1.05, "ate_s": 5.6, "nota": "'tudo bem? Eu sou o Ed Campos... o seu quintal.'"},
    {"de_s": 9.6, "ate_s": 13.9, "nota": "'Esse aqui é o Diogo Teixeira... Rio de Janeiro.'"},
    {"de_s": 17.2, "ate_s": 25.3, "cobertura": {"arquivo": C + "C0101.MP4", "inicio_q": 0, "velocidade": 25},
     "nota": "'Deixa eu te contar uma coisa... The Jack, lá no Tennessee, Estados Unidos.'"},
    {"de_s": 25.9, "ate_s": 28.2, "nota": "'E nós apresentamos esse prato aqui, né, Diogo?'"},
    {"de_s": 28.2, "ate_s": 33.6, "cobertura": {"arquivo": C + "C0102.MP4", "inicio_q": 0, "velocidade": 50},
     "nota": "'Fizemos Chef's Choice... costela, purê de batata,'"},
    {"de_s": 39.4, "ate_s": 44.4, "nota": "'E esse prato vai, a partir de agora, fazer parte do cardápio...'"},
    {"de_s": 48.1, "ate_s": 54.9, "cobertura": {"arquivo": C + "C0101.MP4", "inicio_s": 5.5, "velocidade": 25},
     "nota": "'Buscar mais um título. O único time brasileiro... importantíssimo.'"},
    {"de_s": 55.3, "ate_s": 64.3, "nota": "'Então, ó, toda vez que você pedir esse prato... Vem provar, conta pra gente.'"},
    {"de_s": 68.1, "ate_s": 69.9, "nota": "brinde: 'Saúde, é pra nós. Valeu.'"},
    {"sem_fala_s": 1.4, "cobertura": {"arquivo": C + "C0100.MP4", "inicio_s": 69.9},
     "nota": "o brinde continua MUDO: a voz da equipe entra em 71,4 s; logo por cima"},
]
INFO = {C + "C0100.MP4": 8700, C + "C0095.MP4": 480, C + "C0101.MP4": 900, C + "C0102.MP4": 1860}


def _checar():
    FPS, F120 = Fraction(30000, 1001), fps_real(119.88)
    r24 = FPS / 24
    for n, d in ((54, 67), (48, 59), (47, 58), (49, 61), (24, 29)):  # medidos em 20/09 (montar.py)
        assert math.floor(n * r24) == d, (n, d)
    assert FPS / F120 == Fraction(1, 4) and quadros_fonte(15, FPS / F120) == (60, 15)
    # fala a 100%: floor(n/4); o trecho preso à grade dá n múltiplo de 4 e duração exata
    assert fala_quadros(17.0, 24.0, FPS, F120) == (2036, 2876, 210)
    for de in (0.0, 0.01, 1.0, 33.5, 67.49):
        ini, fim, d = fala_quadros(de, de + 2.345, FPS, F120)
        assert ini % 4 == 0 and fim % 4 == 0 and d == (fim - ini) // 4

    info = lambda a: (F120, INFO.get(a, 0))
    fala = C + "C0100.MP4"
    for erro in ((), (1, -1, 2), (-2, 2, -2, 2), (3, 3, 3)):
        linhas, avisos, v_fim, a_fim, fila = simular(EXEMPLO, FPS, info, fala, erro)
        assert not avisos, avisos
        falas = [L for L in linhas if "a1_q" in L]
        for L, s in zip(falas, [s for s in EXEMPLO if "de_s" in s]):  # fala exata
            assert L["a1_q"][1] - L["a1_q"][0] == round(s["ate_s"] * FPS) - round(s["de_s"] * FPS), L
        for x, y in zip(fila["a"], fila["a"][1:]):  # A1 e V1 contínuas, sem buraco
            assert x[0] + x[1] == y[0]
        for x, y in zip(fila["v"], fila["v"][1:]):
            assert x[0] + x[1] == y[0]
        assert fila["v"][0][0] == 0 and fila["a"][0][0] == 0
        for L in linhas:
            if L["imagem"] == "fala":  # a imagem da fala: no corte exato e em sincronia
                assert L["dif_q"] == 0 and L["sinc_q"] == 0, L
            else:  # cobertura lenta: erro de arredondamento + o injetado, pago pelo próximo
                assert abs(L["dif_q"]) <= 2 + 3, L
        assert v_fim == a_fim + 42  # a fala acaba no brinde; a imagem dele segue 1,4 s (42 q) muda
        assert 45 <= v_fim / FPS <= 60, float(v_fim / FPS)
    # erro injetado na 1ª cobertura some no segmento seguinte (imagem da fala)
    linhas = simular(EXEMPLO, FPS, info, fala, (3,))[0]
    assert linhas[0]["alvo_q"] == 78 and linhas[0]["dif_q"] == 5  # 25% entrega 80 (+2), +3 injetado
    assert linhas[1]["dif_q"] == 0 and linhas[1]["imagem_q"][0] == linhas[1]["fala_q"][0] + 4 * 5

    # sem fala nas pontas: a A1 começa no corte planejado, não onde a V1 parou
    segs = [{"sem_fala_s": 1.5, "cobertura": {"arquivo": C + "C0095.MP4", "velocidade": 25}},
            {"de_s": 1.0, "ate_s": 3.0},
            {"de_s": 3.0, "ate_s": 5.1, "cobertura": {"arquivo": C + "C0101.MP4", "velocidade": 50}},
            {"sem_fala_s": 2.0, "cobertura": {"arquivo": C + "C0102.MP4", "velocidade": 25}}]
    linhas, _, v_fim, a_fim, fila = simular(segs, FPS, info, fala, (1,))
    assert fila["a"][0][0] == 45 and linhas[1]["sinc_q"] == 0 and linhas[1]["dif_q"] == 0
    assert v_fim == a_fim + 60 + linhas[3]["dif_q"] and abs(linhas[3]["dif_q"]) <= 2

    # rosto partido nas pausas (é como se dá ganho só a quem está longe do microfone): o corte é
    # invisível — mesma fonte, contígua e em sincronia — e a peça sai igual à do trecho inteiro
    cob = {"de_s": 36.0, "ate_s": 38.6, "cobertura": {"arquivo": C + "C0095.MP4", "velocidade": 25}}
    inteiro = [cob, {"de_s": 46.046, "ate_s": 52.9529}]
    partido = [cob, {"de_s": 46.046, "ate_s": 48.1481}, {"de_s": 48.1481, "ate_s": 49.049, "volume_db": 9},
               {"de_s": 49.049, "ate_s": 52.9529}]
    assert validar({"fala": fala, "segmentos": partido}) == []
    for erro in ((), (2,), (-2,), (3,)):  # a cobertura antes erra; a 1ª parte absorve
        Li, _, vi, ai, _ = simular(inteiro, FPS, info, fala, erro)
        linhas, avisos, v_fim, a_fim, fila = simular(partido, FPS, info, fala, erro)
        partes = linhas[1:]
        assert not avisos and (v_fim, a_fim) == (vi, ai)
        assert all(L["imagem"] == "fala" and L["dif_q"] == 0 and L["sinc_q"] == 0 for L in partes), partes
        for x, y in zip(partes, partes[1:]):
            for k in ("imagem_q", "fala_q", "v1_q", "a1_q"):
                assert x[k][1] == y[k][0], (k, x, y)
        for k in ("imagem_q", "fala_q", "v1_q", "a1_q"):  # as partes cobrem exatamente o trecho inteiro
            assert [partes[0][k][0], partes[-1][k][1]] == Li[1][k], (k, partes, Li[1])
        assert len(fila["v"]) == len(fila["a"]) == 4
        # a legenda também sai igual: a palavra que cruza a pausa não fica presa à borda da parte
        pw = [{"ini": 48.0, "fim": 48.4, "texto": "cruza"}, {"ini": 50.0, "fim": 50.2, "texto": "outra"}]
        assert palavras_na_timeline(mapa_da_fala(linhas, FPS, F120), pw) == palavras_na_timeline(mapa_da_fala(Li, FPS, F120), pw)

    # guardas
    assert validar({"fala": fala, "segmentos": segs}) == []
    ruins = validar({"fala": fala, "segmentos": [{"de_s": 1, "ate_s": 2}, {"sem_fala_s": 1, "cobertura": {"arquivo": "x"}},
                                                  {"de_s": 3, "ate_s": 3}, {"sem_fala_s": 1}]})
    assert len(ruins) == 3 and "MEIO" in ruins[0], ruins
    try:  # se o append fosse para o fim da TIMELINE, a montagem para no 1º segmento
        simular(EXEMPLO, FPS, info, fala, no_fim_da_timeline=("a",))
        raise AssertionError("devia parar")
    except Parada as e:
        assert "fala entrou" in str(e) and "segmento 1" in str(e), e
    try:  # V1 atrás da A1 (25% entregou 3 q a menos) e o append da V1 indo para o fim da timeline
        simular(EXEMPLO, FPS, info, fala, (-3,), no_fim_da_timeline=("v",))
        raise AssertionError("devia parar")
    except Parada as e:
        assert "imagem entrou" in str(e) and "segmento 2" in str(e), e
    try:  # V1 atrás da fala logo no começo do arquivo: não há quadro antes do 0 para sincronizar
        simular([{"de_s": 0.0, "ate_s": 1.0, "cobertura": {"arquivo": C + "C0095.MP4", "velocidade": 25}},
                 {"de_s": 0.0, "ate_s": 2.0}], FPS, info, fala, (-3,))
        raise AssertionError("devia parar")
    except Parada as e:
        assert "sincronia" in str(e), e

    m = mapa_da_fala(simular(EXEMPLO, FPS, info, fala)[0], FPS, F120)
    assert m[0]["timeline_s"][0] == 0 and m[1]["timeline_q"][0] == m[0]["timeline_q"][1]
    assert fala_quadros(17.2, 25.3, FPS, F120)[0] == 2060 and m[3]["fonte_s"][0] == round(float(2060 / F120), 4)
    mp = [{"fonte_s": [10.0, 12.0], "timeline_s": [0.0, 2.0]}, {"fonte_s": [20.0, 21.0], "timeline_s": [2.0, 3.0]},
          {"fonte_s": [10.0, 11.0], "timeline_s": [3.0, 4.0]}]
    ws = [{"ini": 9.95, "fim": 10.3, "texto": "corta"}, {"ini": 11.7, "fim": 12.2, "texto": "sai"}, {"ini": 11.9, "fim": 12.5, "texto": "cortada"},
          {"ini": 20.5, "fim": 21.2, "texto": "fim"}, {"ini": 15.0, "fim": 15.2, "texto": "fora"}]
    assert palavras_na_timeline(mp, ws) == [
        {"ini": 0.0, "fim": 0.3, "texto": "corta"}, {"ini": 1.7, "fim": 2.0, "texto": "sai"},
        {"ini": 2.5, "fim": 3.0, "texto": "fim"}, {"ini": 3.0, "fim": 3.3, "texto": "corta"}]
    for s, f in (("120000/1001\n", Fraction(120000, 1001)), ("120000/1001,\n", Fraction(120000, 1001)),
                 ("30000/1001\n30000/1001\n", Fraction(30000, 1001)), ("25/1", 25), ("0/0\n", None), ("", None)):
        assert fps_do_ffprobe(s) == f, (s, fps_do_ffprobe(s))
    _checar_no_resolve(FPS, info, fala)
    print("ok")


def _checar_no_resolve(FPS, info, fala):
    """O caminho de DENTRO do Resolve (este arquivo, exec com `resolve` injetado) num Resolve de mentira
    com o comportamento medido: append no fim da trilha (recordFrame só em trilha vazia), 100% = floor
    na taxa real, SetSpeed divide pela velocidade; SetProperty/SetFades gravam, e NAO_GRAVA simula o
    "aceita e não guarda" do 21.1. Confere os fades e o volume da música, a releitura do volume da fala,
    a mídia importada com a RAIZ em NFD e o erro por ID pedido que não é peça de fala."""
    import shutil, tempfile
    NAO_GRAVA = []

    class Item:
        def __init__(s, st, dur, src):
            s.st, s.dur, s.src, s.p = st, dur, src, {}
        GetStart = lambda s: s.st
        GetEnd = lambda s: s.st + s.dur
        GetDuration = lambda s: s.dur
        GetSourceStartFrame = lambda s: s.src
        GetProperty = lambda s, k: s.p.get(k, 0.0)
        SetCDL = lambda s, d: True

        def SetProperty(s, k, v):
            if k not in NAO_GRAVA:
                s.p[k] = v
            return True

        def SetFades(s, d):
            s.p["fades"] = dict(d)
            return True

        def SetSpeed(s, o):
            s.dur = round(s.dur * 100 / o["Percentage"])
            return True

    class Pasta:
        def __init__(s, nome, clips=()):
            s.nome, s.clips, s.subs = nome, list(clips), []
        GetName = lambda s: s.nome
        GetClipList = lambda s: s.clips
        GetSubFolderList = lambda s: s.subs

    class Clip:
        def __init__(s, fp, fps, q):
            s.pr = {"File Path": fp, "FPS": fps, "Frames": str(q)}
        GetClipProperty = lambda s, k: s.pr.get(k)

        def SetClipProperty(s, k, v):
            s.pr[k] = v
            return True

    class TL:
        def __init__(s, nome):
            s.nome, s.t = nome, {"video": [[]], "audio": [[]]}
        GetName = lambda s: s.nome
        GetStartFrame = lambda s: 108000
        GetSettings = lambda s: {"timelineFrameRate": "29.97", "timelineResolutionWidth": "1080",
                                 "timelineResolutionHeight": "1920"}
        GetTrackCount = lambda s, k: len(s.t[k])
        AddTrack = lambda s, k, *a: s.t[k].append([]) or True
        SetTrackName = lambda s, *a: True
        GetItemListInTrack = lambda s, k, i: list(s.t[k][i - 1])

        def SetName(s, n):
            s.nome = n
            return True

    class Projeto:  # faz também de ProjectManager e de MediaPool
        def __init__(s, clips, disco):
            s.raiz, s.tls, s.atual, s.bin, s.disco = Pasta("Master", clips), [], None, None, disco
        GetName = lambda s: "PROJ"
        IsRenderingInProgress = lambda s: False
        GetCurrentProject = GetMediaPool = lambda s: s
        GetRootFolder = lambda s: s.raiz
        GetTimelineCount = lambda s: len(s.tls)
        GetTimelineByIndex = lambda s, i: s.tls[i - 1]
        SaveProject = lambda s: True

        def SetCurrentFolder(s, f):
            s.bin = f
            return True

        def AddSubFolder(s, pai, nome):
            pai.subs.append(Pasta(nome))
            return pai.subs[-1]

        def ImportMedia(s, arqs):  # só caminho como texto, no bin atual (medido no 21.1)
            s.bin.clips += [Clip(a, "29.97", s.disco[a]) for a in arqs]
            return s.bin.clips[-len(arqs):]

        def SetCurrentTimeline(s, t):
            s.atual = t
            return True

        def CreateEmptyTimeline(s, nome):
            s.tls.append(TL(nome))
            return s.tls[-1]

        def DeleteTimelines(s, ts):
            s.tls = [t for t in s.tls if t not in ts]
            return True

        def AppendToTimeline(s, infos):
            out = []
            for c in infos:
                trilha = s.atual.t["video" if c["mediaType"] == 1 else "audio"][c["trackIndex"] - 1]
                st = trilha[-1].GetEnd() if trilha else c["recordFrame"]
                d = math.floor((c["endFrame"] - c["startFrame"]) * FPS / fps_real(c["mediaPoolItem"].pr["FPS"]))
                trilha.append(Item(st, d, c["startFrame"]))
                out.append(trilha[-1])
            return out

    base = tempfile.mkdtemp()
    raiz = os.path.join(base, unicodedata.normalize("NFD", "PROJÉTO"))  # como o listdir do exFAT devolve
    NC = lambda a: unicodedata.normalize("NFC", os.path.join(raiz, a))
    mus, leg, logo = "05_AUDIO/Trilhas/m.mp3", "06_ELEMENTOS/Motion/leg.mov", "06_ELEMENTOS/Logo/logo.mov"
    os.makedirs(os.path.join(raiz, "04_DAVINCI"))
    os.makedirs(os.path.dirname(os.path.join(raiz, leg)))
    open(os.path.join(raiz, leg), "w").close()  # a legenda está no disco e ainda não no Media Pool
    segs = [{"de_s": 1.0, "ate_s": 2.5, "cobertura": {"arquivo": C + "C0095.MP4", "velocidade": 25}},
            {"de_s": 2.5, "ate_s": 4.4, "volume_db": 6},
            {"sem_fala_s": 1.0, "cobertura": {"arquivo": fala, "inicio_q": 2000, "velocidade": 50}}]
    musica = {"arquivo": mus, "inicio_s": 10, "volume_db": -24, "fade_in_s": 0.5, "fade_out_s": 1.0}
    pc = {"id": "P", "timeline": "P - v01", "fala": fala, "segmentos": segs, "legenda": {"arquivo": leg},
          "voz": {"saida_db": -3, "isolamento": 50, "nivelador": "MORE_LIFT_FOR_LOW_LEVELS"},
          "logo": {"arquivo": logo, "entrada_s": -1.0}, "musica": {**musica, "subida": {"em_s": 4.0, "volume_db": -12}}}
    clips = [Clip(NC(fala), "119.88", 8700), Clip(NC(C + "C0095.MP4"), "119.88", 480),
             Clip(NC(mus), "29.97", 4000), Clip(NC(logo), "29.97", 150)]
    p = Projeto(clips, {NC(leg): 400})
    R = type("R", (), {"GetProjectManager": lambda s: p, "SCALE_FIT": 1, "DIALOGUE_LEVELER_MODE_MORE_LIFT_FOR_LOW_LEVELS": 2})()
    codigo = compile(open(__file__).read(), __file__, "exec")

    def rodar(pc, ids=None, nao_grava=()):
        NAO_GRAVA[:] = nao_grava
        json.dump({"projeto": "PROJ", "pecas": [pc, {"id": "V2a", "timeline": "x", "planos": []}]},
                  open(os.path.join(raiz, "04_DAVINCI", "montagem.json"), "w"))
        g = {"resolve": R, "RAIZ": raiz, **({"IDS": ids} if ids else {})}
        exec(codigo, g)
        return g["result"]["pecas"]

    def bins(f, cam=""):
        cam = f"{cam}/{f.GetName()}" if cam else f.GetName()
        return [(cam, [os.path.basename(c.pr["File Path"]) for c in f.clips])] + [x for s in f.subs for x in bins(s, cam)]

    try:
        # 1) subida + fade de entrada e de saída; a legenda importada com a RAIZ em NFD
        (r,) = rodar(pc)
        assert not r["erros"], r["erros"]
        linhas, _, v_fim, a_fim, _ = simular(segs, FPS, info, fala)
        assert (r["total_q"], r["fala_fim_q"]) == (v_fim, a_fim)  # o caminho do Resolve bate com a conta
        assert r["fala_na_timeline"] == mapa_da_fala(linhas, FPS, info(fala)[0])
        tl = p.tls[0]
        assert [it.p.get("AudioVolume") for it in tl.t["audio"][0]] == [-3.0, 3.0]  # saida_db + volume_db
        a2 = tl.t["audio"][1]
        assert [(it.st - 108000, it.p["AudioVolume"]) for it in a2] == [(0, -24.0), (round(4.0 * FPS), -12.0)]
        assert [it.p["fades"] for it in a2] == [{"FadeIn": 15, "FadeOut": 0}, {"FadeIn": 0, "FadeOut": 30}]
        assert r["musica"]["dif_q"] == 0 and r["musica"]["fades_ok"]
        assert r["legenda"] == {"entrada_q": 0, "dur_q": v_fim} and r["logo"]["entrada_q"] == v_fim - 30
        assert ("Master/06_ELEMENTOS/Motion", ["leg.mov"]) in bins(p.raiz), bins(p.raiz)
        assert not any(".." in cam for cam, _ in bins(p.raiz)), bins(p.raiz)  # nada de bin ".."
        assert p.raiz.subs[0].subs[0].clips[0].pr["Alpha mode"] == "Premultiplied"
        # 2) sem subida, com os dois fades: o item único fica com os DOIS; o volume da fala aceito e não
        #    guardado vira aviso; ID que não é peça de fala vira erro
        rs = rodar({**pc, "musica": musica}, ["P", "V2a", "V9"], nao_grava=("AudioVolume",))
        assert [x["id"] for x in rs] == ["V2a", "V9", "P"] and all("segmentos" in x["erros"][0] for x in rs[:2]), rs
        assert [it.p["fades"] for it in p.tls[-1].t["audio"][1]] == [{"FadeIn": 15, "FadeOut": 30}]
        assert any("voz: falhou" in a and "AudioVolume (pedido -3" in a for a in rs[2]["avisos"]), rs[2]["avisos"]
        assert sorted(t.nome for t in p.tls) == ["P - v01", "P - v01 · anterior"]
    finally:
        shutil.rmtree(base)


if "resolve" not in globals():
    a = sys.argv[1:]
    if not a:
        _checar()
    else:  # mapa previsto da fala (a A1 não depende da V1: é exato se o Resolve seguir a conta)
        if len(a) not in (2, 4) or (len(a) == 4 and a[2] != "--fps"):
            sys.exit("uso: python3 montar_fala.py <montagem.json> <ID> [--fps F]   (sem argumentos: autoconferência)")
        M = json.load(open(a[0]))
        pc = next((x for x in M["pecas"] if x["id"] == a[1] and "segmentos" in x), None)
        if pc is None:
            sys.exit(f'{a[0]}: não há peça "{a[1]}" com "segmentos" (há: '
                     + (", ".join(x["id"] for x in M["pecas"] if "segmentos" in x) or "nenhuma") + ")")
        erros = validar(pc)
        if erros:
            sys.exit("\n".join(erros))
        raiz = os.path.dirname(os.path.dirname(os.path.abspath(a[0])))

        @functools.lru_cache(None)
        def fps_de(arq):  # o fps REAL do arquivo; --fps vale para todos
            if len(a) == 4:
                return fps_real(a[3])
            c = arq if os.path.isabs(arq) else os.path.join(raiz, arq)
            r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                "stream=r_frame_rate", "-of", "default=nw=1:nk=1", c], capture_output=True, text=True)
            f = None if r.returncode else fps_do_ffprobe(r.stdout)
            if not f:
                sys.exit(f"não li o fps de {c}: passe --fps")
            return f

        FPS = Fraction(30000, 1001)  # a timeline da skill (resolve_projeto.py): 29,97
        linhas, _, v_fim, a_fim, _ = simular(pc["segmentos"], FPS, lambda x: (fps_de(x), 0), pc["fala"])
        print(json.dumps({"fps": "30000/1001", "total_q": v_fim, "total_s": round(float(v_fim / FPS), 3),
                          "fala": mapa_da_fala(linhas, FPS, fps_de(pc["fala"]))}, ensure_ascii=False, indent=1))
else:
    T0 = time.time()
    N = lambda s: unicodedata.normalize("NFC", s)
    M = json.load(open(os.path.join(RAIZ, "04_DAVINCI", "montagem.json")))
    IDS = globals().get("IDS") or [x["id"] for x in M["pecas"] if "segmentos" in x]
    caminho = lambda a: N(a if os.path.isabs(a) else os.path.join(RAIZ, a))

    pm = resolve.GetProjectManager()
    p = pm.GetCurrentProject()
    # O Resolve é compartilhado: este script NUNCA troca de projeto.
    if not p or p.GetName() != M["projeto"]:
        raise RuntimeError(f"projeto aberto é '{p.GetName() if p else None}', montagem.json pede '{M['projeto']}'")
    if p.IsRenderingInProgress():
        raise RuntimeError("render em andamento: SetProperties/SetSpeed falham calados até a fila acabar.")

    mp = p.GetMediaPool()
    raiz_bin = mp.GetRootFolder()

    def bin_de(rel):
        atual = raiz_bin
        for parte in rel.split("/"):
            if parte in ("", "."):
                continue
            filhos = {f.GetName(): f for f in (atual.GetSubFolderList() or [])}
            atual = filhos.get(parte) or mp.AddSubFolder(atual, parte)
        return atual

    def indexar():
        idx = {}

        def walk(f):
            for c in f.GetClipList() or []:
                fp = c.GetClipProperty("File Path")
                if fp:
                    idx[N(fp)] = c
            for s in f.GetSubFolderList() or []:
                walk(s)
        walk(raiz_bin)
        return idx

    def ajuste(obj, k):
        try:
            v = (obj.GetSettings() or {}).get(k)
        except Exception:
            v = None
        return v if v not in (None, "") else obj.GetSetting(k)

    def props(it, d):
        """SetProperty chave a chave (medido em 20/09); devolve as chaves que falharam."""
        return [k for k, v in d.items() if not it.SetProperty(k, v)]

    def info(arq):
        c = idx[caminho(arq)]
        return fps_real(c.GetClipProperty("FPS")), int(float(c.GetClipProperty("Frames") or 0))

    def fonte(it):
        try:
            v = it.GetSourceStartFrame()
            return None if v is None else int(v)
        except Exception:
            return None

    pecas = [x for x in M["pecas"] if x["id"] in IDS and "segmentos" in x]
    idx = indexar()
    exigidos = lambda pc: [pc.get("fala")] + [s["cobertura"]["arquivo"] for s in pc.get("segmentos", [])
                                               if isinstance(s.get("cobertura"), dict) and s["cobertura"].get("arquivo")] \
        + ([pc["musica"]["arquivo"]] if pc.get("musica") else [])
    precisa = set()
    for pc in pecas:
        precisa |= {caminho(a) for a in exigidos(pc) if a}
        precisa |= {caminho(pc[k]["arquivo"]) for k in ("legenda", "logo") if pc.get(k)}
    falta_disco = sorted(a for a in precisa if a not in idx and not os.path.exists(a))
    por_pasta = {}
    for a in sorted(precisa - set(idx) - set(falta_disco)):
        por_pasta.setdefault(os.path.dirname(a), []).append(a)
    R = N(RAIZ).rstrip("/")  # em NFC, como os caminhos: com a RAIZ em NFD (o listdir do exFAT) o relpath dava "../.."
    for pasta, arqs in por_pasta.items():
        rel = os.path.relpath(pasta, R) if pasta == R or pasta.startswith(R + "/") else "Externos"
        mp.SetCurrentFolder(bin_de(rel))
        mp.ImportMedia(arqs)  # caminho como TEXTO: com {"FilePath": …} o 21.1 importa zero, calado
    if por_pasta:
        idx = indexar()

    tls = {}
    for i in range(p.GetTimelineCount()):
        t = p.GetTimelineByIndex(i + 1)
        tls.setdefault(t.GetName(), []).append(t)

    rel_pecas = [{"id": i, "erros": [f'não há peça "{i}" com "segmentos" (há: '
                                     + (", ".join(x["id"] for x in M["pecas"] if "segmentos" in x) or "nenhuma")
                                     + '; as de "planos" são do montar.py)']}
                 for i in IDS if i not in {x["id"] for x in pecas}]
    for pc in pecas:
        nome = pc["timeline"]
        tmp = nome + " · montando"
        r = {"id": pc["id"], "timeline": nome, "avisos": [], "erros": validar(pc)}
        rel_pecas.append(r)
        sem = [a for a in exigidos(pc) if a and caminho(a) not in idx]
        if sem:
            r["erros"].append("fora do Media Pool (não existe no disco ou não importou): " + ", ".join(sem))
        if r["erros"]:
            continue

        if tls.get(tmp):
            mp.DeleteTimelines(tls.pop(tmp))
        mp.SetCurrentFolder(bin_de("Timelines"))
        tl = mp.CreateEmptyTimeline(tmp)
        if not tl:
            r["erros"].append(f"CreateEmptyTimeline('{tmp}') falhou")
            continue
        tls[tmp] = [tl]
        p.SetCurrentTimeline(tl)
        s0 = tl.GetStartFrame()
        fps = fps_real(ajuste(tl, "timelineFrameRate"))
        larg, alt = ajuste(tl, "timelineResolutionWidth"), ajuste(tl, "timelineResolutionHeight")
        r["formato"] = f"{larg}x{alt} @ {float(fps):.3f}"
        if (str(larg), str(alt)) != ("1080", "1920"):
            r["avisos"].append(f"timeline em {larg}x{alt}, não 1080x1920: rode o resolve_projeto.py")
        while tl.GetTrackCount("video") < 3 and tl.AddTrack("video"):
            pass
        while tl.GetTrackCount("audio") < 2 and (tl.AddTrack("audio", "stereo") or tl.AddTrack("audio")):
            pass
        if tl.GetTrackCount("video") < 3 or tl.GetTrackCount("audio") < 2:
            r["erros"].append(f"trilhas: {tl.GetTrackCount('video')} de vídeo e {tl.GetTrackCount('audio')} "
                              "de áudio (precisa de 3 e 2)")
            continue
        for tipo, i, n in (("video", 1, "MONTAGEM"), ("video", 2, "LEGENDA"), ("video", 3, "LOGO"),
                           ("audio", 1, "FALA"), ("audio", 2, "TRILHA")):
            tl.SetTrackName(tipo, i, n)

        def anexar(arq, ini, fim, tipo, trilha, pos):
            its = mp.AppendToTimeline([{"mediaPoolItem": idx[caminho(arq)], "startFrame": ini, "endFrame": fim,
                                        "mediaType": tipo, "trackIndex": trilha, "recordFrame": s0 + pos}])
            return its[0] if its else None

        def fim_a1():
            its = tl.GetItemListInTrack("audio", 1) or []
            return max((int(x.GetEnd()) for x in its), default=None)

        atual = {}

        def v1(sg, arq, ini, fim, vel, pos):
            atual["sg"] = sg  # o a1 do mesmo segmento vem logo depois e lê o volume_db dele
            it = anexar(arq, ini, fim, 1, 1, pos)
            if not it:
                raise Parada(f"a imagem {os.path.basename(arq)} [{ini}, {fim}) não entrou na V1")
            st = int(it.GetStart()) - s0
            if vel != 100:
                antes = fim_a1()
                if not it.SetSpeed({"Percentage": vel, "RippleTimeline": True}):
                    r["avisos"].append(f"{os.path.basename(arq)}: SetSpeed({vel}) devolveu falso")
                its = tl.GetItemListInTrack("video", 1) or []
                it = next((x for x in its if int(x.GetStart()) - s0 == st), its[-1])
                if fim_a1() != antes:
                    raise Parada("o SetSpeed com ripple moveu a A1")
            z = sg.get("zoom")
            if z:
                ruins = props(it, {"ZoomX": float(z), "ZoomY": float(z)})
                if ruins:
                    r["avisos"].append(f"{os.path.basename(arq)}: falhou {ruins}")
            cdl = sg["cdl"] if "cdl" in sg else pc.get("cdl")
            if cdl and not it.SetCDL({"NodeIndex": "1", **cdl}):
                r["avisos"].append(f"{os.path.basename(arq)}: SetCDL falhou")
            return st, int(it.GetDuration()), fonte(it)

        def a1(ini, fim, pos):
            it = anexar(pc["fala"], ini, fim, 2, 1, pos)
            if not it:
                raise Parada(f"a fala [{ini}, {fim}) não entrou na A1")
            vz = pc.get("voz")  # {"isolamento": 0–100, "nivelador": "MORE_LIFT_FOR_LOW_LEVELS" | …} por item da A1
            if vz:
                d = {}
                if vz.get("isolamento"):
                    d.update({"AudioVoiceIsolationEnabled": True, "AudioVoiceIsolationAmount": int(vz["isolamento"])})
                modo = getattr(resolve, "DIALOGUE_LEVELER_MODE_" + str(vz.get("nivelador", "")), None)
                if modo is not None:
                    d.update({"AudioDialogueLevelerEnabled": True, "AudioDialogueLevelerMode": modo,
                              "AudioDialogueLevelerReduceLoudDialogue": True, "AudioDialogueLevelerLiftSoftDialogue": True})
                elif vz.get("nivelador") and not any("nivelador" in a for a in r["avisos"]):
                    r["avisos"].append(f"nivelador '{vz['nivelador']}' não existe nesta versão")
            else:
                d = {}
            # volume do item = ganho do trecho (ex.: quem está longe do microfone) + saída da fala (voz.saida_db).
            # A saída vai no volume porque AudioDialogueLevelerOutputGain aceita o Set e fica em 0 (21.1, 24/09).
            db = float((atual.get("sg") or {}).get("volume_db") or 0) + float((vz or {}).get("saida_db") or 0)
            if db:
                d.update({"AudioVolumeEnabled": True, "AudioVolume": db})
            if d:
                ruins = props(it, d)
                try:  # relê o volume: é a mesma falha calada do OutputGain (Set aceito, valor não fica)
                    lido = float(it.GetProperty("AudioVolume"))
                except (TypeError, ValueError):
                    lido = db
                if db and "AudioVolume" not in ruins and abs(lido - db) > 0.05:
                    ruins.append(f"AudioVolume (pedido {db:+g}, lido {lido:+g})")
                if ruins and not any("voz:" in a for a in r["avisos"]):
                    r["avisos"].append(f"voz: falhou {ruins} (ligue na interface, no inspetor de áudio)")
            return int(it.GetStart()) - s0, int(it.GetDuration()), fonte(it)

        try:
            linhas, avisos, total, a_fim = montar_segmentos(pc["segmentos"], fps, info, pc["fala"], v1, a1)
        except Parada as e:
            r["erros"] += [str(e), f"a timeline '{tmp}' ficou para diagnóstico; a antiga não foi tocada"]
            continue
        r["avisos"] += avisos
        r["segmentos"] = linhas
        r["total_q"], r["total_s"], r["fala_fim_q"] = total, round(total / float(fps), 3), a_fim
        r["fala_na_timeline"] = mapa_da_fala(linhas, fps, info(pc["fala"])[0])
        if "de_s" in pc["segmentos"][-1] and total != a_fim:
            r["avisos"].append(f"a V1 termina {total - a_fim:+d} q em relação à fala: termine com a imagem da "
                               "fala ou com um segmento sem fala")

        # --- A2: música baixa, do quadro 0 ao fim da V1 (quadros contados na taxa da timeline) ---
        mus = pc.get("musica")
        if mus:
            ini_s = mus["fim_s"] - total / fps if "fim_s" in mus else mus.get("inicio_s", 0.0)
            ms = max(0, round(ini_s * fps))
            # "subida": {"em_s": s na timeline, "volume_db": dB} → a trilha entra em DOIS itens contíguos da
            # mesma fonte (a API não faz keyframe de volume); o salto cai no quadro pedido — ponha-o num ataque.
            sb = mus.get("subida")
            k = max(1, min(total - 1, round(sb["em_s"] * fps))) if sb else total
            pedacos = [(0, k, float(mus.get("volume_db", -22.0)))]
            if sb:
                pedacos.append((k, total, float(sb["volume_db"])))
            its = []
            for p0, p1, db in pedacos:
                a = mp.AppendToTimeline([{"mediaPoolItem": idx[caminho(mus["arquivo"])], "startFrame": ms + p0,
                                          "endFrame": ms + p1, "mediaType": 2, "trackIndex": 2, "recordFrame": s0 + p0}])
                if not a:
                    r["erros"].append(f"música [{p0}, {p1}) não entrou na A2")
                    break
                ruins = props(a[0], {"AudioVolumeEnabled": True, "AudioVolume": db})
                if ruins:
                    r["avisos"].append(f"música: falhou {ruins} (ajuste o volume na interface)")
                its.append((a[0], db))
            if len(its) == len(pedacos):
                fi = round(mus.get("fade_in_s", 0) * fps)
                fo = round(mus.get("fade_out_s", 0 if "fim_s" in mus else 1.4) * fps)
                fades_ok = its[0][0].SetFades({"FadeIn": fi, "FadeOut": 0 if sb else fo}) if fi else True
                if fo and (sb or not fi):  # item único com os dois fades já saiu inteiro na linha de cima
                    fades_ok = its[-1][0].SetFades({"FadeIn": 0, "FadeOut": fo}) and fades_ok
                dur = sum(int(x.GetDuration()) for x, _ in its)
                r["musica"] = {"inicio_q": ms, "inicio_s": round(ms / float(fps), 3),
                               "entrada_q": int(its[0][0].GetStart()) - s0, "dur_q": dur, "dif_q": dur - total,
                               "itens": [{"entrada_q": int(x.GetStart()) - s0, "dur_q": int(x.GetDuration()),
                                          "volume_db": db, "volume_lido": x.GetProperty("AudioVolume")} for x, db in its],
                               "fade_q": [fi, fo], "fades_ok": bool(fades_ok)}

        fit = getattr(resolve, "SCALE_FIT", None)  # sobreposição não pode herdar o scaleToCrop do projeto

        # --- V2: legenda (vídeo com alfa) do quadro 0 ---
        lg = pc.get("legenda")
        c = idx.get(caminho(lg["arquivo"])) if lg else None
        if lg and not c:
            r["avisos"].append(f"legenda {lg['arquivo']} não está no disco/Media Pool: peça sem legenda")
        elif c:
            n_leg = int(float(c.GetClipProperty("Frames") or 0))
            n, _ = quadros_fonte(total, fps / fps_real(c.GetClipProperty("FPS")))
            if n_leg and n > n_leg:
                r["avisos"].append(f"legenda tem {n_leg} q e a peça pede {n}: termina antes do fim")
                n = n_leg
            alfa = lg.get("alfa", "Premultiplied")  # o legenda.py grava ProRes 4444 PREMULTIPLICADO
            if alfa and not c.SetClipProperty("Alpha mode", alfa):
                r["avisos"].append(f"legenda: Alpha mode = {alfa} falhou (confira borda escura na legenda)")
            L = mp.AppendToTimeline([{"mediaPoolItem": c, "startFrame": 0, "endFrame": n,
                                      "mediaType": 1, "trackIndex": 2, "recordFrame": s0}])
            if not L:
                r["erros"].append("legenda não entrou na V2")
            else:
                ruins = props(L[0], {"Scaling": fit}) if fit is not None else []
                if ruins:
                    r["avisos"].append(f"legenda: falhou {ruins}")
                r["legenda"] = {"entrada_q": int(L[0].GetStart()) - s0, "dur_q": int(L[0].GetDuration())}

        # --- V3: logo animada (como no montar.py) ---
        lg = pc.get("logo")
        c = idx.get(caminho(lg["arquivo"])) if lg else None
        if lg and not c:
            r["avisos"].append(f"logo {lg['arquivo']} não está no disco/Media Pool: peça sem logo")
        elif c:
            n_logo = int(float(c.GetClipProperty("Frames") or 0))
            e = float(lg.get("entrada_s", -3.0))
            ini = max(0, min(total - 1, round((e if e >= 0 else r["total_s"] + e) * fps)))
            n, _ = quadros_fonte(total - ini, fps / fps_real(c.GetClipProperty("FPS")))
            if n_logo <= 1:
                r["avisos"].append("logo é imagem parada (1 quadro): use a logo animada .mov")
            elif n > n_logo:
                r["avisos"].append(f"logo tem {n_logo} q e a janela pede {n}: termina antes do fim")
                n = n_logo
            L = mp.AppendToTimeline([{"mediaPoolItem": c, "startFrame": 0, "endFrame": n,
                                      "mediaType": 1, "trackIndex": 3, "recordFrame": s0 + ini}])
            if not L:
                r["erros"].append("logo não entrou na V3")
            else:
                esc = float(lg.get("escala", 1.0))
                ruins = props(L[0], {**({"Scaling": fit} if fit is not None else {}), "ZoomX": esc, "ZoomY": esc})
                if ruins:
                    r["avisos"].append(f"logo: falhou {ruins}")
                r["logo"] = {"entrada_q": ini, "entrada_s": round(ini / float(fps), 3),
                             "dur_q": int(L[0].GetDuration()), "fim_q": int(L[0].GetEnd()) - s0}

        if r["erros"]:
            r["erros"].append(f"a timeline '{tmp}' ficou para diagnóstico; a antiga não foi tocada")
            continue
        # --- troca: a antiga vira "· anterior" (a anterior da anterior some), a nova ganha o nome ---
        antigas = tls.get(nome, [])
        if antigas and not globals().get("APAGAR"):
            reserva = nome + " · anterior"
            if tls.get(reserva):
                mp.DeleteTimelines(tls.pop(reserva))
            if not antigas[0].SetName(reserva):
                r["erros"].append(f"não consegui renomear a antiga para '{reserva}'; a nova ficou como '{tmp}'")
                continue
            tls[reserva] = [antigas.pop(0)]
            r["avisos"].append(f"timeline antiga guardada como '{reserva}'")
        if antigas:
            mp.DeleteTimelines(antigas)
        if tl.SetName(nome):
            tls[nome] = tls.pop(tmp)
        else:
            r["erros"].append(f"não consegui dar o nome '{nome}' à nova; ela ficou como '{tmp}'")
        r["itens"] = {"v1": len(tl.GetItemListInTrack("video", 1) or []), "a1": len(tl.GetItemListInTrack("audio", 1) or [])}

    pm.SaveProject()
    result = {"pecas": rel_pecas, "segundos": round(time.time() - T0, 1),
              "faltam_no_disco": [os.path.relpath(a, R) for a in falta_disco]}
