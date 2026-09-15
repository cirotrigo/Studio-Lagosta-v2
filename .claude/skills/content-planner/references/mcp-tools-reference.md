# Referencia Rapida — MCP Tools

## Leitura

| Tool | Descricao | Parametros principais |
|------|-----------|-----------------------|
| `list-projects` | Projetos ativos | `status?` |
| `get-knowledge` | Knowledge base | `projectId`, `category?` |
| `list-templates` | Templates disponiveis | `projectId` |
| `get-template-pages` | Pages de um template | `templateId`, `includeLayerDetails?` |
| `list-drive-images` | Imagens do Drive | `projectId`, `folderId?`, `limit?` |
| `search-catalog` | Busca no catalogo indexado | `projectId`, `theme?`, `menuCategory?`, `tags?`, `quality?` |
| `get-image-thumbnail` | Thumbnail do Drive | `driveFileId`, `asBase64?` |
| `list-posts` | Posts por filtro | `projectId`, `status?`, `dateFrom?`, `dateTo?` |

## Escrita

| Tool | Descricao | Parametros principais |
|------|-----------|-----------------------|
| `create-post` | Criar post | `projectId`, `postType`, `caption`, `scheduledDatetime`, `pageId?`, `slotValues?`, `status?` |
| `update-post` | Atualizar post | `postId`, `caption?`, `scheduledDatetime?`, `status?`, `slotValues?` |
| `create-page` | Criar page em template (nasce CONTEUDO) | `templateId`, `name`, `layers?`, `tags?`, `isTemplate?` (so para modelo reutilizavel) |
| `render-story` | Renderizar post | `postId` |
| `delete-posts` | Deletar posts | `postIds` (nunca deleta POSTED) |

## Notas

- **Horarios em BRT:** `"YYYY-MM-DD HH:mm"` — convertido para UTC automaticamente
- **slotValues:** JSON string com campos do template + `_driveImageId`
- **create-post default:** status DRAFT, renderStatus PENDING se tem pageId
- **render-story:** gera PNG 1080x1920, upload pro Vercel Blob, atualiza post
