-- Add optional organization reference to prompts for organization-wide sharing
ALTER TABLE "Prompt"
ADD COLUMN "organizationId" TEXT;

CREATE INDEX "Prompt_organizationId_idx" ON "Prompt"("organizationId");

ALTER TABLE "Prompt"
ADD CONSTRAINT "Prompt_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
