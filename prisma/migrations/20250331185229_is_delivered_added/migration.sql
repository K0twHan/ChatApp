-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "is_delivered" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "bio" DROP NOT NULL;
