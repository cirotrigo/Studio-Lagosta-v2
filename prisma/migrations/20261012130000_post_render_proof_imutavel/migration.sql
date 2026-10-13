-- A prova do render é APPEND-ONLY também no banco (B1d, checkpoint e do PR #211 — revisão do Codex).
-- Uma linha de "PostRenderProof" não muda nem some por escrita direta: só nasce (INSERT) e só sai junto com o
-- post (o cascade da FK). Aditiva e idempotente.

CREATE OR REPLACE FUNCTION "PostRenderProof_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- O cascade da exclusão do post: o post já não existe quando a FK apaga as provas dele.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "SocialPost" WHERE "id" = OLD."postId") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'PostRenderProof é append-only: % recusado (post %, mídia %)', TG_OP, OLD."postId", OLD."mediaUrl"
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS "PostRenderProof_append_only" ON "PostRenderProof";
CREATE TRIGGER "PostRenderProof_append_only"
  BEFORE UPDATE OR DELETE ON "PostRenderProof"
  FOR EACH ROW EXECUTE FUNCTION "PostRenderProof_append_only"();
