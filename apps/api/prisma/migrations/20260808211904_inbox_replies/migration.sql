-- CreateTable
CREATE TABLE "InboxReply" (
    "id" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "repliedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxReply_inboxId_idx" ON "InboxReply"("inboxId");

-- AddForeignKey
ALTER TABLE "InboxReply" ADD CONSTRAINT "InboxReply_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxReply" ADD CONSTRAINT "InboxReply_repliedBy_fkey" FOREIGN KEY ("repliedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
