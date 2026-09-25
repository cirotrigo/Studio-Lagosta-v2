# Etapa 2 — cria (ou abre) o projeto no Resolve, importa a estrutura em bins
# espelhados e liga os proxies de 02_PROXIES aos brutos.
#
# Roda DENTRO do Resolve, pelo MCP (run_script_unsafe), com as duas variáveis antes:
#   RAIZ = "/Volumes/.../PROJETO"; NOME = "QUINTAL - Costela do Edd"
#   exec(open("<repo>/.claude/skills/editar-video/resolve_projeto.py").read())
#
# É idempotente: o que já está no Media Pool (mesmo caminho) não é importado de novo,
# e proxy já ligado é religado sem custo. Se o teto de 60 s do MCP cortar um projeto
# grande no meio, rode de novo e ele continua.
import os

PASTAS_IMPORTADAS = ["01_BRUTO", "05_AUDIO", "06_ELEMENTOS"]
MIDIA = {
    ".mp4", ".mov", ".mxf", ".mts", ".m2ts", ".m4v", ".avi", ".mkv", ".webm",
    ".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac", ".aac",
    ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".psd", ".exr", ".dng", ".arw", ".cr3",
}
AJUSTES = {
    "timelineResolutionWidth": "1080",
    "timelineResolutionHeight": "1920",
    "timelineFrameRate": "29.97",
    "timelineOutputResMatchTimelineRes": "1",
    "timelineInputResMismatchBehavior": "scaleToCrop",  # bruto 16:9 preenche o 9:16; o reenquadre é na edição
    "videoMonitorFormat": "HD 1080p 29.97",
    "perfRenderCacheMode": "smart",
    "perfProxyMediaMode": "1",  # usa o proxy quando existe
    "transcriptionLanguage": "pt",
}
# Cache no MESMO disco do projeto (/Volumes/<HD>/CacheClip): o padrão do Resolve é ~/Movies/CacheClip, e o
# cache inteligente em ProRes HQ de bruto 4K a 120 qps encheu o disco do Mac em um dia (9,9 GB só na
# Costela do Edd, 24/09/2026: "Cache de Renderização Desativado", sobrou 913 MB).
_partes = os.path.abspath(RAIZ).split(os.sep)
if len(_partes) > 2 and _partes[1] == "Volumes":
    CACHE = os.path.join(os.sep, "Volumes", _partes[2], "CacheClip")
    os.makedirs(CACHE, exist_ok=True)
    AJUSTES["perfCacheClipsLocation"] = CACHE

# O projeto nasce do MODELO (.drp vazio, ao lado deste script): a TAXA DE REPRODUÇÃO
# (timelinePlaybackFrameRate) é só leitura na API e todo CreateProject nasce em 24 —
# com timeline 29,97, o Resolve toca a 24 e a timeline "agarra" (medido 24/09/2026 na
# Costela do Edd: o visualizador mostrava ● 24). O modelo já vem com reprodução 29,97.
MODELO = globals().get("MODELO") or os.path.join(os.path.dirname(os.path.abspath(
    globals().get("__file__") or "/Users/cirotrigo/Documents/Studio-Lagosta-v2/.claude/skills/editar-video/resolve_projeto.py")),
    "modelo-vertical-2997.drp")
pm = resolve.GetProjectManager()
anterior = pm.GetCurrentProject()
anterior_nome = anterior.GetName() if anterior else None
criado = False
avisos = []
if NOME in (pm.GetProjectListInCurrentFolder() or []):
    proj = pm.LoadProject(NOME)
else:
    if os.path.exists(MODELO) and pm.ImportProject(MODELO, NOME):
        proj = pm.LoadProject(NOME)
    else:
        avisos.append(f"modelo não encontrado/importado ({MODELO}): projeto criado vazio")
        proj = pm.CreateProject(NOME)
    criado = True
if not proj:
    raise RuntimeError(f"não consegui abrir nem criar o projeto '{NOME}'")

ajustes_falhos = [k for k, v in AJUSTES.items() if not proj.SetSetting(k, v)]

mp = proj.GetMediaPool()
raiz_bin = mp.GetRootFolder()


def bin_de(caminho_rel):
    """Bin aninhado com o mesmo caminho da pasta (01_BRUTO/clip → 01_BRUTO > clip)."""
    atual = raiz_bin
    for parte in caminho_rel.split("/"):
        filhos = {f.GetName(): f for f in (atual.GetSubFolderList() or [])}
        atual = filhos.get(parte) or mp.AddSubFolder(atual, parte)
    return atual


def todos_itens(pasta):
    for c in pasta.GetClipList() or []:
        yield c
    for f in pasta.GetSubFolderList() or []:
        yield from todos_itens(f)


ja = {c.GetClipProperty("File Path"): c for c in todos_itens(raiz_bin)}
importados, falhas = 0, []
for topo in PASTAS_IMPORTADAS:
    base = os.path.join(RAIZ, topo)
    if not os.path.isdir(base):
        continue
    for dirpath, dirnames, arquivos in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith((".", "_")))
        novos = [
            os.path.join(dirpath, a) for a in sorted(arquivos)
            if not a.startswith(".") and os.path.splitext(a)[1].lower() in MIDIA
            and os.path.join(dirpath, a) not in ja
        ]
        if not novos:
            continue
        mp.SetCurrentFolder(bin_de(os.path.relpath(dirpath, RAIZ)))
        # Caminho como TEXTO: com {"FilePath": ...} (a forma da documentação) o 21.1 importa zero, calado.
        itens = mp.ImportMedia(novos) or []
        importados += len(itens)
        for c in itens:
            ja[c.GetClipProperty("File Path")] = c
        if len(itens) < len(novos):
            falhas += [p for p in novos if p not in ja]

# Timecode de cada bruto COMO O RESOLVE O LÊ. O proxy só liga se tiver o mesmo, e a Sony
# a 120p é lida como 17:28:14;030 (base 60, com ;) enquanto o ffprobe diz 17:28:14:60 —
# o mesmo instante escrito de outro jeito. proxies.ts grava ESTE texto no proxy.
import json
tcs = {}
for caminho, clip in ja.items():
    if caminho.startswith(os.path.join(RAIZ, "01_BRUTO") + os.sep):
        tcs[os.path.relpath(caminho, RAIZ)] = clip.GetClipProperty("Start TC")
os.makedirs(os.path.join(RAIZ, "04_DAVINCI"), exist_ok=True)
with open(os.path.join(RAIZ, "04_DAVINCI", "timecodes.json"), "w") as f:
    json.dump(tcs, f, indent=2, ensure_ascii=False)

# Proxies: 02_PROXIES espelha 01_BRUTO com extensão .mp4
ligados, sem_proxy = 0, []
bruto = os.path.join(RAIZ, "01_BRUTO")
for caminho, clip in ja.items():
    if not caminho.startswith(bruto + os.sep):
        continue
    rel = os.path.relpath(caminho, bruto)
    proxy = os.path.join(RAIZ, "02_PROXIES", os.path.splitext(rel)[0] + ".mp4")
    if os.path.exists(proxy) and clip.LinkProxyMedia(proxy):
        ligados += 1
    else:
        sem_proxy.append(rel)

reproducao = str(proj.GetSetting("timelinePlaybackFrameRate"))
if reproducao != "29.97":
    avisos.append(f"o Resolve vai REPRODUZIR a {reproducao} qps (timeline 29,97) e a timeline vai agarrar: "
                  "ajuste em Configurações do Projeto > Configurações Principais > Taxa de quadro da reprodução = 29.97 "
                  "(a API não muda esse campo)")
pm.SaveProject()
result = {
    "avisos": avisos,
    "reproducao_qps": reproducao,
    "projeto": NOME,
    "criado": criado,
    "projeto_anterior": anterior_nome,
    "ajustes_falhos": ajustes_falhos,
    "importados_agora": importados,
    "no_media_pool": len(ja),
    "falhas_importacao": [os.path.relpath(p, RAIZ) for p in falhas],
    "timecodes_gravados": len(tcs),
    "proxies_ligados": ligados,
    "brutos_sem_proxy": sem_proxy,
}
