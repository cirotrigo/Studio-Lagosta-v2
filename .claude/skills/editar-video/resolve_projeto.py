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
    "perfProxyMediaMode": "1",  # usa o proxy quando existe
    "transcriptionLanguage": "pt",
}

pm = resolve.GetProjectManager()
anterior = pm.GetCurrentProject()
anterior_nome = anterior.GetName() if anterior else None
criado = False
if NOME in (pm.GetProjectListInCurrentFolder() or []):
    proj = pm.LoadProject(NOME)
else:
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

pm.SaveProject()
result = {
    "projeto": NOME,
    "criado": criado,
    "projeto_anterior": anterior_nome,
    "ajustes_falhos": ajustes_falhos,
    "importados_agora": importados,
    "no_media_pool": len(ja),
    "falhas_importacao": [os.path.relpath(p, RAIZ) for p in falhas],
    "proxies_ligados": ligados,
    "brutos_sem_proxy": sem_proxy,
}
