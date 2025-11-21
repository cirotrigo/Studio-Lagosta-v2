import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { isAdmin } from "@/lib/admin-utils"
import { listClientProjects } from "@/lib/services/client-project-service"
import { clientProjectFiltersSchema } from "@/lib/validations/client-project"

function parseFilters(request: Request) {
  const url = new URL(request.url)
  return clientProjectFiltersSchema.parse({
    status: url.searchParams.get("status") ?? undefined,
    clientEmail: url.searchParams.get("clientEmail") ?? undefined,
  })
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const filters = parseFilters(request)
    const projects = await listClientProjects(filters)
    return NextResponse.json(projects)
  } catch (error) {
    console.error("List client projects error:", error)
    return NextResponse.json({ error: "Erro ao listar projetos" }, { status: 500 })
  }
}
