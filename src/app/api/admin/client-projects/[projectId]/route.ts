import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { isAdmin } from "@/lib/admin-utils"
import {
  getClientProjectById,
  updateClientProject,
} from "@/lib/services/client-project-service"
import { updateClientProjectSchema } from "@/lib/validations/client-project"

function parseProjectId(raw: string) {
  const projectId = Number(raw)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("ID do projeto inválido")
  }
  return projectId
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: rawProjectId } = await context.params
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const projectId = parseProjectId(rawProjectId)
    const project = await getClientProjectById(projectId)
    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error("Get client project error:", error)
    const message = error instanceof Error ? error.message : "Erro ao carregar projeto"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId: rawProjectId } = await context.params
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const projectId = parseProjectId(rawProjectId)
    const json = await request.json()
    const payload = updateClientProjectSchema.parse(json)

    const updated = await updateClientProject(projectId, payload)
    if (!updated) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Update client project error:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar projeto"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
