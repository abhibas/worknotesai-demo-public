/*
  Warnings:

  - You are about to drop the column `description` on the `Experience` table. All the data in the column will be lost.
  - You are about to drop the column `priority` on the `Experience` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `Experience` table. All the data in the column will be lost.
  - You are about to drop the column `grade` on the `Response` table. All the data in the column will be lost.
  - You are about to drop the `Gap` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `title` on table `Experience` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Gap" DROP CONSTRAINT "Gap_experienceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Response" DROP CONSTRAINT "Response_experienceId_fkey";

-- AlterTable
ALTER TABLE "Experience" DROP COLUMN "description",
DROP COLUMN "priority",
DROP COLUMN "state",
ADD COLUMN     "tags" TEXT,
ALTER COLUMN "title" SET NOT NULL;

-- AlterTable
ALTER TABLE "Response" DROP COLUMN "grade";

-- DropTable
DROP TABLE "public"."Gap";

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
