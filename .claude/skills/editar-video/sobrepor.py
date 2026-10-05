# Põe o .mov de grafismos da peça (pc.grafismos.arquivo, saído do motion.py) na trilha GRAFISMOS, do quadro 0 até
# o fim da V1, numa timeline que JÁ EXISTE. Não remonta nada: a cor e os ajustes do Ciro ficam.
#
# Roda DENTRO do Resolve, pelo MCP (run_script_unsafe). Variáveis injetadas:
#   RAIZ (obrigatória) pasta do projeto; IDS (obrigatória) peças do 04_DAVINCI/montagem.json
#   UID  (opcional)    GetUniqueId da timeline, com UMA peça em IDS: vence o nome do montagem.json (variante,
#                      timeline renomeada, Cmd+Z que ressuscitou outra com o mesmo nome)
#   RAIZ = "/Volumes/.../PROJETO"; IDS = ["A1"]
#   exec(open("<repo>/.claude/skills/editar-video/sobrepor.py").read())
#
# - Trilha: a de nome GRAFISMOS; sem ela, uma NOVA no topo (recordFrame só é respeitado em trilha vazia).
#   Já com este arquivo → não põe de novo. Com OUTRO arquivo → recusa: versão nova entra pelo trocar_midia.py.
# - Clipe fora do Media Pool → importado no bin 06_ELEMENTOS/Motion (ImportMedia do 21.1: caminho como texto,
#   no bin atual).
# - Alpha mode = pc.grafismos.alfa, padrão "Straight": o motion.py grava alfa direto. O PIL (legenda.py, o
#   grafismos.py da Wine Vix) grava premultiplicado: modo errado dá borda escura ou clara. Scaling Fit: sem ele
#   herda o scaleToCrop do projeto.
# - Recusa projeto aberto diferente do montagem.json (o Resolve é compartilhado; este script NUNCA troca de
#   projeto) e render em andamento (SetProperty falha calado).
#
# Fora do Resolve: python3 sobrepor.py → autoconferência contra um Resolve de mentira.
import json, os, unicodedata

N = lambda s: unicodedata.normalize("NFC", os.path.normpath(s))


def sobrepor(resolve, raiz, ids, uid=None):
    m = json.load(open(os.path.join(raiz, "04_DAVINCI", "montagem.json"), encoding="utf-8"))
    pm = resolve.GetProjectManager()
    proj = pm.GetCurrentProject()
    if not proj or proj.GetName() != m["projeto"]:
        raise RuntimeError(f"projeto aberto é '{proj.GetName() if proj else None}', o montagem.json pede "
                           f"'{m['projeto']}' (Resolve compartilhado: confira antes de trocar)")
    if proj.IsRenderingInProgress():
        raise RuntimeError("render em andamento: SetProperty falha calado até a fila acabar")
    if not ids or (uid and len(ids) != 1):
        raise RuntimeError("IDS é obrigatória, e o UID vale para UMA peça")
    mp = proj.GetMediaPool()
    tls = [proj.GetTimelineByIndex(i + 1) for i in range(proj.GetTimelineCount())]

    def do_pool(f, caminho):
        for c in f.GetClipList() or []:
            if N(c.GetClipProperty("File Path") or "") == caminho:
                return c
        for s in f.GetSubFolderList() or []:
            c = do_pool(s, caminho)
            if c:
                return c

    feitos, erros = [], []
    for pc in [p for p in m["pecas"] if p["id"] in ids]:
        pid, g = pc["id"], pc.get("grafismos")
        if not g:
            erros.append(f'{pid}: sem "grafismos" no montagem.json'); continue
        alvo = [t for t in tls if (t.GetUniqueId() == uid if uid else t.GetName() == pc["timeline"])]
        if len(alvo) != 1:
            erros.append(f'{pid}: {len(alvo)} timelines com {"o UID " + uid if uid else repr(pc["timeline"])}'
                         f'{"" if uid else " (passe UID)"}'); continue
        tl, arq = alvo[0], N(os.path.join(raiz, g["arquivo"]))
        if not os.path.isfile(arq):
            erros.append(f'{pid}: {g["arquivo"]} não existe (rode o motion.py)'); continue
        clip = do_pool(mp.GetRootFolder(), arq)
        if not clip:
            b = mp.GetRootFolder()
            for nome in ("06_ELEMENTOS", "Motion"):
                b = next((s for s in b.GetSubFolderList() or [] if s.GetName() == nome), b)
            mp.SetCurrentFolder(b)
            clip = (mp.ImportMedia([arq]) or [None])[0]
        if not clip:
            erros.append(f'{pid}: não importei {g["arquivo"]}'); continue
        proj.SetCurrentTimeline(tl)
        faixa = next((i for i in range(1, tl.GetTrackCount("video") + 1) if tl.GetTrackName("video", i) == "GRAFISMOS"), None)
        if faixa:
            usados = [N(x.GetMediaPoolItem().GetClipProperty("File Path") or "")
                      for x in tl.GetItemListInTrack("video", faixa) or [] if x.GetMediaPoolItem()]
            if arq in usados:
                feitos.append({"peca": pid, "timeline": tl.GetName(), "trilha": faixa, "ja_estava": True}); continue
            if usados:
                erros.append(f'{pid}: a GRAFISMOS (V{faixa}) já tem {[os.path.basename(u) for u in usados]}: '
                             f'troque com o trocar_midia.py'); continue
        else:
            if not tl.AddTrack("video"):
                erros.append(f"{pid}: não consegui criar a trilha GRAFISMOS"); continue
            faixa = tl.GetTrackCount("video")
            tl.SetTrackName("video", faixa, "GRAFISMOS")
        s0 = tl.GetStartFrame()
        fim_v1 = max((x.GetEnd() for x in tl.GetItemListInTrack("video", 1) or []), default=s0) - s0
        n = min(int(float(clip.GetClipProperty("Frames") or 0)), fim_v1)
        if n <= 0:
            erros.append(f"{pid}: V1 vazia ou clipe sem quadros"); continue
        avisos = []
        if not clip.SetClipProperty("Alpha mode", g.get("alfa", "Straight")):
            avisos.append("Alpha mode não aceito: confira borda e fundo da sobreposição")
        L = mp.AppendToTimeline([{"mediaPoolItem": clip, "startFrame": 0, "endFrame": n, "mediaType": 1,
                                  "trackIndex": faixa, "recordFrame": s0}])  # endFrame exclusivo
        if not L:
            erros.append(f"{pid}: o append na V{faixa} falhou"); continue
        fit = getattr(resolve, "SCALE_FIT", None)
        if fit is not None and not L[0].SetProperty("Scaling", fit):
            avisos.append("Scaling Fit não aceito")
        if n < fim_v1:
            avisos.append(f"o .mov tem {n} q e a V1 {fim_v1}: o grafismo acaba antes da peça")
        feitos.append({"peca": pid, "timeline": tl.GetName(), "uid": tl.GetUniqueId(), "trilha": faixa,
                       "inicio_q": L[0].GetStart() - s0, "dur_q": L[0].GetDuration(), "fim_v1_q": fim_v1,
                       "alfa": clip.GetClipProperty("Alpha mode"), **({"avisos": avisos} if avisos else {})})
    if feitos:
        pm.SaveProject()
    return {"feitos": feitos, "erros": erros}


def _checar():
    import tempfile

    class Clip:
        def __init__(self, fp, q=1058):
            self.pr = {"File Path": fp, "Frames": str(q), "Alpha mode": "None"}
        GetClipProperty = lambda s, k: s.pr.get(k)
        def SetClipProperty(s, k, v):
            s.pr[k] = v; return True

    class Pasta:
        def __init__(s, nome, subs=()):
            s.nome, s.clips, s.subs = nome, [], list(subs)
        GetName = lambda s: s.nome
        GetClipList = lambda s: s.clips
        GetSubFolderList = lambda s: s.subs

    class Item:
        def __init__(s, c, ini, dur):
            s.c, s.ini, s.dur, s.pr = c, ini, dur, {}
        GetMediaPoolItem = lambda s: s.c
        GetStart = lambda s: s.ini
        GetEnd = lambda s: s.ini + s.dur
        GetDuration = lambda s: s.dur
        def SetProperty(s, k, v):
            s.pr[k] = v; return True

    class Timeline:
        def __init__(s, nome, uid, s0=108000):
            s.nome, s.uid, s.s0 = nome, uid, s0
            s.trilhas = [["V1", [Item(Clip("/bruto/a.mov"), s0, 1057)]], ["LOGO", [Item(Clip("/logo.mov"), s0 + 907, 150)]]]
        GetName = lambda s: s.nome
        GetUniqueId = lambda s: s.uid
        GetStartFrame = lambda s: s.s0
        GetTrackCount = lambda s, t: len(s.trilhas)
        GetTrackName = lambda s, t, i: s.trilhas[i - 1][0]
        GetItemListInTrack = lambda s, t, i: s.trilhas[i - 1][1]
        def AddTrack(s, t):
            s.trilhas.append(["", []]); return True
        def SetTrackName(s, t, i, nome):
            s.trilhas[i - 1][0] = nome; return True

    class MediaPool:
        def __init__(s, tls):
            s.motion = Pasta("Motion")
            s.raiz, s.atual, s.tls = Pasta("Master", [Pasta("01_BRUTO"), Pasta("06_ELEMENTOS", [s.motion])]), None, tls
        GetRootFolder = lambda s: s.raiz
        def SetCurrentFolder(s, f):
            s.atual = f; return True
        def ImportMedia(s, caminhos):
            assert isinstance(caminhos[0], str)  # 21.1: caminho como texto
            c = Clip(caminhos[0]); s.atual.clips.append(c); return [c]
        def AppendToTimeline(s, pedidos):
            p, tl = pedidos[0], s.tls.atual
            faixa = tl.trilhas[p["trackIndex"] - 1][1]
            assert not faixa and p["mediaType"] == 1  # recordFrame só vale em trilha vazia
            faixa.append(Item(p["mediaPoolItem"], p["recordFrame"], p["endFrame"] - p["startFrame"])); return [faixa[-1]]

    class Projeto:
        def __init__(s, nome, tls):
            s.nome, s.tls, s.atual, s.salvo = nome, tls, None, 0
            s.mp = MediaPool(s)
        GetName = lambda s: s.nome
        IsRenderingInProgress = lambda s: False
        GetMediaPool = lambda s: s.mp
        GetTimelineCount = lambda s: len(s.tls)
        GetTimelineByIndex = lambda s, i: s.tls[i - 1]
        def SetCurrentTimeline(s, tl):
            s.atual = tl; return True

    def resolve_com(p):
        pm = type("PM", (), {"GetCurrentProject": lambda s: p, "SaveProject": lambda s: setattr(p, "salvo", p.salvo + 1) or True})()
        return type("R", (), {"GetProjectManager": lambda s: pm, "SCALE_FIT": 1})()

    with tempfile.TemporaryDirectory() as raiz:
        os.makedirs(os.path.join(raiz, "04_DAVINCI"))
        os.makedirs(os.path.join(raiz, "06_ELEMENTOS", "Motion"))
        for nome in ("A1-grafismos.mov", "A1-grafismos-v2.mov"):
            open(os.path.join(raiz, "06_ELEMENTOS", "Motion", nome), "w").close()
        m = {"projeto": "QUINTAL - Teste", "pecas": [
            {"id": "A1", "timeline": "QP-A1 - v01", "grafismos": {"arquivo": "06_ELEMENTOS/Motion/A1-grafismos.mov"}},
            {"id": "A2", "timeline": "QP-A2 - v01"}]}
        gravar = lambda: json.dump(m, open(os.path.join(raiz, "04_DAVINCI", "montagem.json"), "w"))
        gravar()
        a1, a2 = Timeline("QP-A1 - v01", "uid-a1"), Timeline("QP-A2 - v01", "uid-a2")
        p = Projeto("QUINTAL - Teste", [a1, a2])
        R = resolve_com(p)

        # 1ª vez: importa no bin Motion, cria a V3 GRAFISMOS no topo, quadro 0 até o fim da V1, Straight, Fit
        r = sobrepor(R, raiz, ["A1"])
        f = r["feitos"][0]
        assert not r["erros"] and f["trilha"] == 3 and f["inicio_q"] == 0 and f["dur_q"] == 1057 == f["fim_v1_q"], r
        assert f["alfa"] == "Straight" and a1.trilhas[2][0] == "GRAFISMOS" and len(p.mp.motion.clips) == 1 and p.salvo == 1
        assert a1.trilhas[2][1][0].pr == {"Scaling": 1} and a2.trilhas[2:] == []
        # de novo: idempotente
        r = sobrepor(R, raiz, ["A1"])
        assert r["feitos"][0].get("ja_estava") and len(a1.trilhas[2][1]) == 1, r
        # versão nova com a GRAFISMOS ocupada: recusa e manda para o trocar_midia.py
        m["pecas"][0]["grafismos"]["arquivo"] = "06_ELEMENTOS/Motion/A1-grafismos-v2.mov"; gravar()
        r = sobrepor(R, raiz, ["A1"])
        assert not r["feitos"] and "trocar_midia" in r["erros"][0], r
        # nome repetido (Cmd+Z ressuscita timeline): pede UID; com UID acha a certa; peça sem grafismos é erro
        p.tls.append(Timeline("QP-A1 - v01", "uid-a1-velha"))
        assert "passe UID" in sobrepor(R, raiz, ["A1"])["erros"][0]
        r = sobrepor(R, raiz, ["A1"], uid="uid-a1-velha")
        assert r["feitos"][0]["uid"] == "uid-a1-velha" and r["feitos"][0]["trilha"] == 3, r
        assert "sem \"grafismos\"" in sobrepor(R, raiz, ["A2"])["erros"][0]
        # alfa do PIL (premultiplicado) passa pelo montagem.json
        m["pecas"][0]["grafismos"]["alfa"] = "Premultiplied"; gravar()
        p.tls.append(Timeline("QP-A1 - outra", "uid-outra"))
        assert sobrepor(R, raiz, ["A1"], uid="uid-outra")["feitos"][0]["alfa"] == "Premultiplied"
        # projeto aberto diferente: recusa sem tocar em nada
        for ruim in (Projeto("OUTRO", []), None):
            try:
                sobrepor(resolve_com(ruim), raiz, ["A1"]); raise AssertionError("devia recusar")
            except RuntimeError as e:
                assert "montagem.json pede" in str(e), e
    print("ok")


if "resolve" in globals():
    result = sobrepor(resolve, RAIZ, globals().get("IDS"), globals().get("UID"))
else:
    _checar()
