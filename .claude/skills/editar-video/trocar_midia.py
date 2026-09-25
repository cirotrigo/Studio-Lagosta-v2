# Troca a MÍDIA de um item do Media Pool pelo arquivo novo (MediaPoolItem.ReplaceClip) SEM mexer na
# timeline: os itens que usam o clipe ficam no mesmo lugar e com o que o cliente fez neles. É o jeito de
# atualizar a legenda (ou qualquer sobreposição) depois que a cor já foi corrigida — remontar
# (montar_fala.py) recria a timeline e apagaria a correção.
#
# Roda DENTRO do Resolve, pelo MCP (run_script_unsafe). Variáveis injetadas:
#   RAIZ  (obrigatória) pasta do projeto; o nome do projeto sai de <RAIZ>/04_DAVINCI/montagem.json
#   VELHO (obrigatória) arquivo que o Media Pool usa hoje (relativo a RAIZ ou absoluto)
#   NOVO  (obrigatória) arquivo que entra no lugar. Prefira um NOME novo (…-legenda-v2.mov): gravar
#                       por cima do mesmo arquivo pode deixar o Resolve mostrando os quadros em cache
#   ALFA  (opcional)    "Alpha mode" posto depois da troca, só quando o velho tinha alfa. Sem ALFA,
#                       reaplica o que o velho tinha (a legenda do montar_fala.py está em
#                       "Premultiplied"; uma logo em "Straight" continua "Straight"); False não mexe
#   RAIZ = "/Volumes/.../PROJETO"; VELHO = "06_ELEMENTOS/Motion/X-legenda.mov"
#   NOVO = "06_ELEMENTOS/Motion/X-legenda-v2.mov"
#   exec(open("<skill>/trocar_midia.py").read())
#
# Recusa, sem trocar nada: projeto aberto diferente do montagem.json (o Resolve é compartilhado e este
# script NUNCA troca de projeto), render em andamento, arquivo novo ausente, e 0 ou mais de 1 item do
# Media Pool com o caminho velho (comparado em NFC: o macOS devolve acento decomposto). ReplaceClip que
# devolve falso também para ali: não mexe no alfa e não salva.
#
# O montagem.json NÃO é alterado: se o velho está nele (legenda.arquivo, logo.arquivo…), o retorno
# avisa onde trocar — remontar com o nome velho reimportaria a mídia antiga na V2, calado.
#
# NÃO TESTADO NO RESOLVE (24/09/2026): ReplaceClip existe no 21.1 ("replaces the underlying asset and
# metadata", do DaVinciResolveScript.pyi) e devolve só um booleano. Por isso o corpo inteiro roda num
# try: exceção da API vira texto em result["erros"] com a ETAPA em que parou, e nada é suposto — o
# result traz o "File Path" RELIDO depois da troca e os itens da timeline atual que usam o clipe antes
# e depois (trilha, início e duração em quadros contados do início da timeline, nome). Confira que o
# caminho lido é o novo e que as posições não mudaram. "and metadata" é o motivo de reaplicar o alfa.
#
# Fora do Resolve: python3 trocar_midia.py → autoconferência contra um Resolve de mentira.
import json, os, unicodedata

N = lambda s: unicodedata.normalize("NFC", s)


def onde_aparece(x, alvo, caminho, cam=""):
    """Caminhos no montagem.json (V1.legenda.arquivo, V1.segmentos[3].cobertura.arquivo…) cujo valor é
    o arquivo alvo."""
    if isinstance(x, dict):
        return [c for k, v in x.items() for c in onde_aparece(v, alvo, caminho, f"{cam}.{k}" if cam else k)]
    if isinstance(x, list):
        return [c for i, v in enumerate(x) for c in onde_aparece(v, alvo, caminho, f"{cam}[{i}]")]
    return [cam] if isinstance(x, str) and caminho(x) == alvo else []


def trocar(resolve, raiz, velho, novo, alfa=None):
    r = {"erros": [], "avisos": []}
    etapa = "ler o montagem.json"
    try:
        caminho = lambda a: N(a if os.path.isabs(a) else os.path.join(raiz, a))
        velho, novo = caminho(velho), caminho(novo)
        r.update(velho=velho, novo=novo)
        M = json.load(open(os.path.join(raiz, "04_DAVINCI", "montagem.json")))
        etapa = "conferir o projeto aberto"
        pm = resolve.GetProjectManager()
        p = pm.GetCurrentProject()
        if not p or p.GetName() != M["projeto"]:
            r["erros"].append(f"projeto aberto é '{p.GetName() if p else None}', montagem.json pede '{M['projeto']}'")
            return r
        if p.IsRenderingInProgress():
            r["erros"].append("render em andamento: espere a fila acabar e rode de novo")
            return r
        if not os.path.isfile(novo):
            r["erros"].append(f"o arquivo novo não existe: {novo}")
            return r

        etapa = "procurar o clipe no Media Pool"
        achados = []

        def walk(f, onde):
            for c in f.GetClipList() or []:
                if N(c.GetClipProperty("File Path") or "") == velho:
                    achados.append((onde, c))
            for s in f.GetSubFolderList() or []:
                walk(s, onde + "/" + s.GetName())
        raiz_bin = p.GetMediaPool().GetRootFolder()
        walk(raiz_bin, raiz_bin.GetName())
        if len(achados) != 1:
            r["erros"].append(f"{len(achados)} itens do Media Pool com o caminho velho"
                              + (f" (bins: {', '.join(o for o, _ in achados)}): troque na interface" if achados else ""))
            return r
        onde, c = achados[0]

        etapa = "ler os usos na timeline atual"
        tl = p.GetCurrentTimeline()
        mid = c.GetMediaId()

        def usos():
            if not tl:
                return []
            s0, out = tl.GetStartFrame(), []
            for tipo, letra in (("video", "V"), ("audio", "A")):
                for i in range(1, tl.GetTrackCount(tipo) + 1):
                    for it in tl.GetItemListInTrack(tipo, i) or []:
                        m = it.GetMediaPoolItem()
                        if m and m.GetMediaId() == mid:
                            out.append({"trilha": f"{letra}{i}", "inicio_q": int(it.GetStart()) - s0,
                                        "dur_q": int(it.GetDuration()), "nome": it.GetName()})
            return out
        alfa_antes, quadros_antes = c.GetClipProperty("Alpha mode"), c.GetClipProperty("Frames")
        r.update(bin=onde, timeline=tl.GetName() if tl else None, itens_antes=usos())
        if not tl:
            r["avisos"].append("nenhuma timeline aberta: os usos não foram conferidos")
        elif not r["itens_antes"]:
            r["avisos"].append(f"o clipe não aparece na timeline aberta ('{tl.GetName()}'): os usos não foram "
                               "conferidos — abra a timeline da peça e rode de novo para conferir")

        etapa = "ReplaceClip"
        if not c.ReplaceClip(novo):
            r["erros"].append("ReplaceClip devolveu falso (formato não suportado ou caminho recusado): "
                              "nada foi mudado nem salvo")
            r["caminho_lido"] = N(c.GetClipProperty("File Path") or "")
            return r
        etapa = "reaplicar o Alpha mode"
        alfa = alfa_antes if alfa is None else alfa  # sem ALFA, o que o clipe tinha ("and metadata" pode zerar)
        if alfa and alfa_antes not in (None, "", "None") and not c.SetClipProperty("Alpha mode", alfa):
            r["avisos"].append(f"Alpha mode = {alfa} falhou: confira borda escura na sobreposição")

        etapa = "reler depois da troca"
        lido = N(c.GetClipProperty("File Path") or "")
        quadros = c.GetClipProperty("Frames")
        r.update(caminho_lido=lido, alfa=[alfa_antes, c.GetClipProperty("Alpha mode")],
                 quadros=[quadros_antes, quadros], itens_depois=usos())
        if lido != novo:
            r["erros"].append("o Media Pool ainda aponta para outro arquivo: " + lido)
        if quadros != quadros_antes:
            r["avisos"].append(f"o novo tem {quadros} quadros e o velho {quadros_antes}: confira o fim dos itens")
        if [(x["trilha"], x["inicio_q"], x["dur_q"]) for x in r["itens_antes"]] != \
                [(x["trilha"], x["inicio_q"], x["dur_q"]) for x in r["itens_depois"]]:
            r["avisos"].append("os itens da timeline mudaram de posição ou duração: confira na timeline")
        rel = os.path.relpath(novo, N(raiz)) if novo.startswith(N(raiz).rstrip("/") + "/") else novo
        for pc in M.get("pecas", []):
            for cam in onde_aparece(pc, velho, caminho):
                r["avisos"].append(f"atualize o montagem.json: {pc.get('id')}.{cam} = \"{rel}\" "
                                   "(ainda aponta o velho: remontar reimportaria a mídia antiga)")
        etapa = "salvar o projeto"
        pm.SaveProject()
    except Exception as e:  # API sem o método, argumento recusado etc.: a mensagem diz onde parou
        r["erros"].append(f"{etapa}: {type(e).__name__}: {e}")
    return r


def _checar():
    """Resolve de mentira: ReplaceClip troca o caminho e ZERA o alfa ("and metadata")."""
    import tempfile

    class Clip:
        def __init__(self, fp, alfa="None", q="1709", mid="m1"):
            self.pr, self.mid = {"File Path": fp, "Alpha mode": alfa, "Frames": q}, mid
        GetClipProperty = lambda s, k: s.pr.get(k)
        GetMediaId = lambda s: s.mid

        def SetClipProperty(self, k, v):
            self.pr[k] = v
            return True

        def ReplaceClip(self, fp):
            self.pr.update({"File Path": fp, "Alpha mode": "None", "Frames": QUADROS_NOVO[0]})
            return True

    class Pasta:
        def __init__(self, nome, clips=(), subs=()):
            self.nome, self.clips, self.subs = nome, list(clips), list(subs)
        GetName = lambda s: s.nome
        GetClipList = lambda s: s.clips
        GetSubFolderList = lambda s: s.subs

    class Item:
        def __init__(self, c, st, d):
            self.c, self.st, self.d = c, st, d
        GetMediaPoolItem = lambda s: s.c
        GetStart = lambda s: s.st
        GetDuration = lambda s: s.d
        GetName = lambda s: os.path.basename(s.c.pr["File Path"])

    class Timeline:
        def __init__(self, v, a=()):
            self.t = {"video": v, "audio": [list(a)]}
        GetName = lambda s: "QP-COSTELA-V1 - A história do prêmio - v01"
        GetStartFrame = lambda s: 108000
        GetTrackCount = lambda s, k: len(s.t[k])
        GetItemListInTrack = lambda s, k, i: s.t[k][i - 1]

    class Projeto:
        def __init__(self, raiz_bin, tl, nome="QUINTAL - Costela do Edd", rendering=False):
            self.raiz, self.tl, self.nome, self.rendering, self.salvo = raiz_bin, tl, nome, rendering, False
        GetName = lambda s: s.nome
        IsRenderingInProgress = lambda s: s.rendering
        GetMediaPool = lambda s: s
        GetRootFolder = lambda s: s.raiz
        GetCurrentTimeline = lambda s: s.tl
        GetCurrentProject = lambda s: s

        def SaveProject(self):
            self.salvo = True
            return True

    raiz = tempfile.mkdtemp()
    os.makedirs(os.path.join(raiz, "04_DAVINCI"))
    os.makedirs(os.path.join(raiz, "06_ELEMENTOS", "Motion"))
    json.dump({"projeto": "QUINTAL - Costela do Edd", "pecas": []}, open(os.path.join(raiz, "04_DAVINCI", "montagem.json"), "w"))
    VELHO, NOVO = "06_ELEMENTOS/Motion/legenda-prêmio.mov", "06_ELEMENTOS/Motion/legenda-prêmio-v2.mov"
    open(os.path.join(raiz, NOVO), "w").close()
    QUADROS_NOVO = ["1709"]

    def cena(alfa="Premultiplied", outro_bin=False, usado=True, **kw):
        leg = Clip(os.path.join(raiz, VELHO), alfa)
        fala = Clip(os.path.join(raiz, "01_BRUTO/clip/C0100.MP4"), mid="m2")
        motion = Pasta("Motion", [leg] + ([Clip(leg.pr["File Path"], mid="m3")] if outro_bin else []))
        tl = Timeline([[Item(fala, 108000, 88)], [Item(leg, 108000, 1709)] if usado else [], []], [Item(fala, 108000, 88)])
        return Projeto(Pasta("Master", [fala], [Pasta("06_ELEMENTOS", [], [motion])]), tl, **kw), leg
    R = lambda p: type("R", (), {"GetProjectManager": lambda s: p})()
    nfd = lambda s: unicodedata.normalize("NFD", s)

    # troca normal, com o caminho velho em NFD: acha, troca, reaplica o alfa, a timeline não mexe
    p, leg = cena()
    r = trocar(R(p), raiz, nfd(VELHO), NOVO)
    assert not r["erros"] and not r["avisos"], r
    assert r["caminho_lido"] == N(os.path.join(raiz, NOVO)) and r["alfa"] == ["Premultiplied", "Premultiplied"]
    uso = {"trilha": "V2", "inicio_q": 0, "dur_q": 1709}
    assert r["itens_antes"] == [{**uso, "nome": "legenda-prêmio.mov"}], r["itens_antes"]
    assert r["itens_depois"] == [{**uso, "nome": "legenda-prêmio-v2.mov"}], r["itens_depois"]
    assert r["bin"] == "Master/06_ELEMENTOS/Motion" and p.salvo
    # sem ALFA, o alfa de antes volta (uma logo "Straight" não vira "Premultiplied"); ALFA explícito
    # vale; False não mexe; clipe sem alfa não ganha alfa
    for alfa, antes, depois in ((None, "Straight", "Straight"), ("Premultiplied", "Straight", "Premultiplied"),
                                (False, "Premultiplied", "None"), ("Premultiplied", "None", "None")):
        p, leg = cena(antes)
        assert trocar(R(p), raiz, VELHO, NOVO, alfa)["alfa"] == [antes, depois], (alfa, antes)
    # o velho ainda está no montagem.json (relativo ou absoluto, em NFD): avisa onde trocar
    json.dump({"projeto": "QUINTAL - Costela do Edd", "pecas": [
        {"id": "V1", "legenda": {"arquivo": VELHO}, "logo": {"arquivo": "06_ELEMENTOS/Logo/logo.mov"}},
        {"id": "S1", "segmentos": [{"cobertura": {"arquivo": nfd(os.path.join(raiz, VELHO))}}]}]},
        open(os.path.join(raiz, "04_DAVINCI", "montagem.json"), "w"))
    p, leg = cena()
    r = trocar(R(p), raiz, VELHO, NOVO)
    assert [a.split(" = ")[0] for a in r["avisos"]] == ["atualize o montagem.json: V1.legenda.arquivo",
                                                        "atualize o montagem.json: S1.segmentos[0].cobertura.arquivo"], r
    assert f'"{NOVO}"' in r["avisos"][0] and not r["erros"]
    json.dump({"projeto": "QUINTAL - Costela do Edd", "pecas": []}, open(os.path.join(raiz, "04_DAVINCI", "montagem.json"), "w"))
    # a timeline aberta não usa o clipe (é a "· anterior", por exemplo): troca, avisando que não conferiu
    p, leg = cena(usado=False)
    r = trocar(R(p), raiz, VELHO, NOVO)
    assert not r["erros"] and r["itens_antes"] == [] and any("não aparece na timeline aberta" in a for a in r["avisos"]), r
    # quadros diferentes: troca, com aviso
    QUADROS_NOVO[0] = "1650"
    p, leg = cena()
    r = trocar(R(p), raiz, VELHO, NOVO)
    assert not r["erros"] and any("1650 quadros" in a for a in r["avisos"]), r
    QUADROS_NOVO[0] = "1709"
    # recusas: nada é trocado
    for kw, velho, novo, trecho in (({"nome": "OUTRO - projeto"}, VELHO, NOVO, "projeto aberto"),
                                    ({"rendering": True}, VELHO, NOVO, "render em andamento"),
                                    ({}, VELHO, "06_ELEMENTOS/Motion/nao-existe.mov", "não existe"),
                                    ({}, "06_ELEMENTOS/Motion/outro.mov", NOVO, "0 itens"),
                                    ({"outro_bin": True}, VELHO, NOVO, "2 itens")):
        p, leg = cena(outro_bin=kw.pop("outro_bin", False), **kw)
        r = trocar(R(p), raiz, velho, novo)
        assert any(trecho in e for e in r["erros"]) and leg.pr["File Path"].endswith("legenda-prêmio.mov"), (trecho, r)
        assert not p.salvo
    # erro da API vira mensagem com a etapa
    p, leg = cena()
    leg.ReplaceClip = lambda fp: (_ for _ in ()).throw(AttributeError("'NoneType' object has no attribute"))
    r = trocar(R(p), raiz, VELHO, NOVO)
    assert r["erros"] == ["ReplaceClip: AttributeError: 'NoneType' object has no attribute"], r
    p, leg = cena("Straight")
    leg.ReplaceClip = lambda fp: False  # falso calado: para ali, sem mexer no alfa e sem salvar
    r = trocar(R(p), raiz, VELHO, NOVO, "Premultiplied")
    assert any("devolveu falso" in e for e in r["erros"]) and not p.salvo, r
    assert leg.pr["Alpha mode"] == "Straight" and r["caminho_lido"] == N(os.path.join(raiz, VELHO)), r
    print("ok")


if "resolve" in globals():
    result = trocar(resolve, RAIZ, VELHO, NOVO, globals().get("ALFA"))
else:
    _checar()
