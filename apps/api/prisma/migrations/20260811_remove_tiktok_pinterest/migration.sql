-- AlterTable (enum rebuild — this server's grammar has no ALTER TYPE ... DROP VALUE)
CREATE TYPE "Platform_new" AS ENUM ('meta', 'x', 'linkedin', 'youtube');
ALTER TABLE "SocialAccount" ALTER COLUMN "platform" TYPE "Platform_new" USING ("platform"::text::"Platform_new");
ALTER TABLE "PostPlatformVariant" ALTER COLUMN "platform" TYPE "Platform_new" USING ("platform"::text::"Platform_new");
ALTER TABLE "Inbox" ALTER COLUMN "platform" TYPE "Platform_new" USING ("platform"::text::"Platform_new");
DROP TYPE "Platform";
ALTER TYPE "Platform_new" RENAME TO "Platform";
