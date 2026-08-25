/**
 * `definirTool`: valida a declaração NO LOAD do módulo e deriva o JSON Schema
 * uma vez. Registro incompleto ou nome fora do formato portátil quebra o boot
 * — nunca chega a servir uma chamada (mesma postura do check-mcp do Invokta:
 * catálogo ambíguo não é publicado).
 *
 * Módulo puro: zod + zod-to-json-schema (que já estava na árvore como
 * dependência do próprio SDK MCP — zero supply chain novo).
 */

import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ToolDoStudio, ToolPronta } from './tipos'

/** Formato portátil de nome de tool MCP (^[a-z0-9-]{1,64}$, como os 48 atuais). */
const NOME_VALIDO = /^[a-z0-9-]{1,64}$/

export function definirTool<S extends z.ZodRawShape>(def: ToolDoStudio<S>): ToolPronta {
  if (!NOME_VALIDO.test(def.nome)) {
    throw new TypeError(`Tool com nome fora do formato portátil (^[a-z0-9-]{1,64}$): "${def.nome}"`)
  }
  for (const apelido of def.apelidos ?? []) {
    if (!NOME_VALIDO.test(apelido)) {
      throw new TypeError(`Apelido fora do formato portátil em ${def.nome}: "${apelido}"`)
    }
  }
  if (!def.descricao?.trim()) {
    throw new TypeError(`Tool ${def.nome} sem descrição.`)
  }
  if (
    typeof def.annotations?.readOnlyHint !== 'boolean' ||
    typeof def.annotations?.destructiveHint !== 'boolean'
  ) {
    // Decidir os dois hints faz parte de registrar — é o que o cliente MCP usa
    // para liberar leitura sem perguntar e travar ação irreversível.
    throw new TypeError(`Tool ${def.nome} sem readOnlyHint/destructiveHint explícitos.`)
  }
  if (!def.acesso) {
    throw new TypeError(`Tool ${def.nome} sem acesso declarado.`)
  }
  if (def.acesso.tipo === 'proprio' && !def.acesso.motivo?.trim()) {
    throw new TypeError(`Tool ${def.nome} com acesso "proprio" sem motivo.`)
  }
  if (!def.superficies?.length) {
    throw new TypeError(`Tool ${def.nome} sem superfícies declaradas.`)
  }

  // Chave desconhecida vira erro de validação, nunca descarte silencioso — a
  // trava que hoje vive em dois remendos (parametrosDesconhecidos no remoto,
  // toolEstrita no local) passa a ser propriedade do registro.
  const estrito = def.schema.strict()

  const schemaJson = derivarSchemaJson(def.nome, estrito)

  return Object.freeze({
    nome: def.nome,
    apelidos: Object.freeze([...(def.apelidos ?? [])]),
    descricao: def.descricao,
    schema: estrito as ToolPronta['schema'],
    schemaJson,
    annotations: Object.freeze({ ...def.annotations }),
    acesso: Object.freeze({ ...def.acesso }) as ToolPronta['acesso'],
    superficies: Object.freeze([...def.superficies]),
    handler: def.handler as ToolPronta['handler'],
  })
}

/**
 * Deriva o JSON Schema que o tools/list serve.
 *
 * `$refStrategy: 'none'` é obrigatório: schema com objeto reusado sairia com
 * `$ref`/`definitions`, que nem todo cliente MCP resolve. O `$schema` é
 * removido (os literais de hoje não o têm, e ele só engorda o catálogo).
 */
function derivarSchemaJson(
  nome: string,
  schema: z.ZodType,
): Record<string, unknown> {
  const bruto = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>

  delete bruto.$schema

  if (bruto.type !== 'object') {
    throw new TypeError(`Tool ${nome}: o schema derivado não tem raiz de objeto.`)
  }
  if (bruto.additionalProperties !== false) {
    throw new TypeError(`Tool ${nome}: o schema derivado não fecha a porta (additionalProperties).`)
  }
  if (bruto.properties === undefined) {
    // z.object({}) estrito pode sair sem `properties`; o tools/list e a
    // mensagem de "parâmetros aceitos" contam com a chave existir.
    bruto.properties = {}
  }
  return bruto
}
