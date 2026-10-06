import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ del: vi.fn(), invalidate: vi.fn(async () => {}) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: mocks.invalidate }), useMutation: (config: unknown) => config }))
vi.mock('@/lib/api-client', () => ({ api: { delete: mocks.del } }))
import { useDeleteOrgKnowledgeEntry } from '../use-org-knowledge'
import { useDeleteKnowledgeEntry } from '../admin/use-admin-knowledge'
beforeEach(() => vi.clearAllMocks())
for (const [surface, hook] of [['org', useDeleteOrgKnowledgeEntry], ['admin', useDeleteKnowledgeEntry]] as const) {
  const config = () => hook() as unknown as { mutationFn(id: string): Promise<unknown>; onSuccess(): void }
  it(`DELETE ${surface}: parcial 202 rejeita mutateAsync para impedir toast/navegação de exclusão concluída e recarrega dados`, async () => {
    mocks.del.mockResolvedValueOnce({ success: false, exclusao: { status: 'partial', recovery: { status: 'reindexed' } }, aviso: 'Exclusão não concluída; entrada preservada.' })
    await expect(config().mutationFn('e')).rejects.toThrow('Exclusão não concluída; entrada preservada.')
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: [surface, 'knowledge'] })
  })
  it(`DELETE ${surface}: exclusão completa preserva caminho de sucesso`, async () => {
    const complete = { success: true, exclusao: { status: 'complete' } }
    mocks.del.mockResolvedValueOnce(complete)
    const current = config(); expect(await current.mutationFn('e')).toEqual(complete)
    current.onSuccess(); expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: [surface, 'knowledge'] })
  })
}
