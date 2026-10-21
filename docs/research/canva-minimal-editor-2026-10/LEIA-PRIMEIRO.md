# Pesquisa do editor (Canva minimalista) — o que está versionado aqui

Versionado em 20/10/2026, na preparação do CP-V0 local, a partir da pasta sem commit do checkout compartilhado.
**Os textos foram copiados sem alteração**; esta nota é a única coisa nova.

## Base velha

- A pesquisa foi escrita em 14/10/2026 sobre `origin/main` `1cab1ab85fb89a3f432a7be8380c707e6a3a1cde`.
- Os `arquivo:linha` citados valem para aquela base. **Reconferir no código atual antes de usar** (a `main` andou
  centenas de commits; o próprio plano pede isso no cabeçalho).
- O estado de cada checkpoint em 19/10/2026 está na conciliação revisada
  `human-output/relatorios/pr238-bundle-visual/CONCILIACAO-SVG-ELEMENTOS-CANVA.md` (fora do repositório,
  sha256 `f24a6077eae66bcfcb4378d0e99318cea6f9d320d5a2710b65de4e646260eb8a`, APTO documental do revisor).
- As decisões do owner (página de decisões, `d01`–`d11`, `p225a/b`, `p226a/b`) **não foram recuperadas** na consulta
  de 19/10; isso não quer dizer que não foram dadas. Os "recomendados" dos documentos são proposta.

## Arquivos versionados (sha256 iguais aos da pasta de origem)

| arquivo | sha256 |
|---|---|
| `PLANO-IMPLEMENTACAO-EDITOR.md` | `d7a87084b07269770939cd98be9fbbe63138468f946aac8e07affd0a83dd3a18` |
| `ARQUITETURA-VETORES.md` | `391e89b945136d2a3c56fa5458117599a5e0091d388fd04bb73b2edde72bf7d2` |
| `SVG-ELEMENTOS.md` | `8b6f85e36417c19c0e56cedd49a2e3238ac93788469366b7d7b132a515c26ec1` |
| `ARQUITETURA-EDITOR-PROPOSTA.md` | `37490a651897f1836354a490e80b3c53718b4355e3e4c2473a77e674b24663a2` |
| `AUDITORIA-EDITOR-ATUAL.md` | `7a65b49a10bda7876a647ec0224e9b4ffcfaa0209c0815e69787fd6c42c7cbad` |
| `CATALOGO-CANDIDATO-STUDIO.md` | `68571affe77f18844fa1797d5d177dfb5348f6bd38da5276a146f4b298f4668f` |
| `TAXONOMIA.md` | `8ad49f70b6764aa52a13de72cff87b2a522e7048ebb351799592b47d682d0134` |
| `REVISAO-CODEX.md` | `b35ac985e7f538b4b8a425670fe28626b075fa698ee3c31cc8c014430bf91197` |

## O que ficou de fora, de propósito

- `evidencias/` inteira: capturas de tela do Canva, amostras e catálogos de modelos de terceiros, relatórios brutos dos
  auditores e a saída bruta da revisão. Os documentos acima citam caminhos dessa pasta; eles **não existem** no
  repositório.
- `RELATORIO.md`: o resumo da pesquisa registra detalhes da sessão na conta do owner (perfil do navegador, porta de
  depuração, id de um design criado na conta do Canva, ids de evidência do REA).
- `RECONSTRUCOES.md`: medidas de 29 modelos de terceiros, com trechos do texto desses modelos.

Os dois arquivos excluídos continuam na pasta de origem, sem commit, no checkout compartilhado.
