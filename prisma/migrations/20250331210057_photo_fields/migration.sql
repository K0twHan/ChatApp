-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "message_type" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN     "photo_data" BYTEA,
ALTER COLUMN "content" DROP NOT NULL;
