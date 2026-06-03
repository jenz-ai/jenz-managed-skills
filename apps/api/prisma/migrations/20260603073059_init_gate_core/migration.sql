-- CreateEnum
CREATE TYPE "Risk" AS ENUM ('pending', 'safe', 'suspicious', 'malicious');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "Detector" AS ENUM ('regex', 'llm');

-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('github', 'upload', 'mcp', 'inline');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "SkillSource" NOT NULL,
    "sourceRef" TEXT,
    "risk" "Risk" NOT NULL DEFAULT 'pending',
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillFile" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "SkillFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "quote" TEXT NOT NULL,
    "detector" "Detector" NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SkillFile_skillId_path_key" ON "SkillFile"("skillId", "path");

-- AddForeignKey
ALTER TABLE "SkillFile" ADD CONSTRAINT "SkillFile_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
