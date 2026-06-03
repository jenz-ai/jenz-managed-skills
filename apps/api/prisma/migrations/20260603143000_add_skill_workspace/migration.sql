-- AlterTable
ALTER TABLE "Skill" ADD COLUMN "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "Skill_workspaceId_idx" ON "Skill"("workspaceId");

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
