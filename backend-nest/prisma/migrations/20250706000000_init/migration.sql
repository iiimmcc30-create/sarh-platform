-- CreateEnum
CREATE TYPE "Country" AS ENUM ('SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'BUTCHER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('free', 'starter', 'pro', 'vip');

-- CreateEnum
CREATE TYPE "ListingCategory" AS ENUM ('camels', 'sheep', 'goats', 'cows', 'horses', 'birds', 'feed', 'equipment');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('active', 'sold', 'expired', 'pending_fee', 'suspended');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('pending', 'paid', 'overdue', 'waived');

-- CreateEnum
CREATE TYPE "PaymentReferenceType" AS ENUM ('subscription', 'fee', 'listing_fee');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('mada', 'visa', 'mastercard', 'apple_pay', 'stc_pay');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('like', 'follow', 'comment', 'repost', 'offer', 'order_update', 'fee_due', 'subscription_renew', 'new_message', 'live_start', 'system', 'story_reaction', 'story_reply');

-- CreateEnum
CREATE TYPE "ButcherType" AS ENUM ('regular', 'verified');

-- CreateEnum
CREATE TYPE "MeatCategory" AS ENUM ('whole_livestock', 'lamb', 'beef', 'camel', 'chicken', 'goat', 'special_orders');

-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('daily_slaughter', 'offer', 'new_stock', 'update');

-- CreateEnum
CREATE TYPE "ButcherApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ButcherApplicationDocumentType" AS ENUM ('commercial_license', 'national_id', 'municipal_permit', 'shop_photo', 'other');

-- CreateEnum
CREATE TYPE "ButcherApplicationDocumentStatus" AS ENUM ('UPLOADED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ButcherApplicationTimelineAction" AS ENUM ('CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'REJECT', 'WITHDRAW', 'COMMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "googleId" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordVersion" INTEGER NOT NULL DEFAULT 0,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL,
    "arabicName" TEXT NOT NULL,
    "avatar" TEXT,
    "coverImage" TEXT,
    "bio" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "country" "Country" NOT NULL DEFAULT 'SA',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" "PlanId" NOT NULL DEFAULT 'free',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "renewDate" TIMESTAMP(3) NOT NULL,
    "listingsUsed" INTEGER NOT NULL DEFAULT 0,
    "liveMinutesUsed" INTEGER NOT NULL DEFAULT 0,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "feeId" TEXT,
    "referenceId" TEXT,
    "referenceType" "PaymentReferenceType",
    "orderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "transactionId" TEXT,
    "checkoutUrl" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "arabicTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "arabicDescription" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "category" "ListingCategory" NOT NULL,
    "breed" TEXT,
    "age" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "location" TEXT NOT NULL,
    "arabicLocation" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "images" TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "views" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingFee" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingOffer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "arabicContent" TEXT NOT NULL,
    "image" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "repostsCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostRepost" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostRepost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "caption" TEXT,
    "captionAr" TEXT,
    "location" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 5,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "liveStreamId" TEXT,
    "listingId" TEXT,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "reactionsCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryView" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryReaction" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveStream" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "arabicTitle" TEXT NOT NULL,
    "thumbnail" TEXT,
    "category" TEXT NOT NULL,
    "topic" TEXT,
    "streamKey" TEXT NOT NULL,
    "rtmpUrl" TEXT,
    "hlsUrl" TEXT,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "viewers" INTEGER NOT NULL DEFAULT 0,
    "peakViewers" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveComment" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "arabicName" TEXT,
    "message" TEXT NOT NULL,
    "avatar" TEXT,
    "isOffer" BOOLEAN NOT NULL DEFAULT false,
    "offerAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "text" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "orderId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "participant1" TEXT NOT NULL,
    "participant2" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "type" TEXT NOT NULL,
    "entityId" TEXT,
    "entityType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Butcher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "logo" TEXT,
    "cover" TEXT,
    "type" "ButcherType" NOT NULL DEFAULT 'regular',
    "country" "Country" NOT NULL,
    "city" TEXT NOT NULL,
    "cityAr" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressAr" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT NOT NULL,
    "bioAr" TEXT,
    "bioEn" TEXT,
    "specialties" TEXT[],
    "commercialReg" TEXT,
    "subscriptionActive" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionExpiry" TIMESTAMP(3),
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "orderCompletionRate" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "activityScore" INTEGER NOT NULL DEFAULT 50,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "openTime" TEXT NOT NULL DEFAULT '06:00',
    "closeTime" TEXT NOT NULL DEFAULT '22:00',
    "closedDays" TEXT[],
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "sourceApplicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Butcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherProduct" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "category" "MeatCategory" NOT NULL,
    "images" TEXT[],
    "pricePerKg" DOUBLE PRECISION,
    "priceFixed" DOUBLE PRECISION,
    "pricingNoteAr" TEXT,
    "availableCuts" TEXT[],
    "weightMin" DOUBLE PRECISION,
    "weightMax" DOUBLE PRECISION,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "freshness" TEXT NOT NULL DEFAULT 'fresh',
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "country" "Country" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButcherProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherOffer" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "discountPercent" DOUBLE PRECISION,
    "originalPrice" DOUBLE PRECISION,
    "offerPrice" DOUBLE PRECISION,
    "image" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "country" "Country" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButcherOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherStory" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "caption" TEXT,
    "captionAr" TEXT,
    "mediaUrl" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 15,
    "type" "StoryType" NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButcherStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherOrder" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cutType" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "deliveryType" TEXT NOT NULL DEFAULT 'pickup',
    "deliveryAddress" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButcherOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherReview" (
    "id" TEXT NOT NULL,
    "butcherId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButcherReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationNumber" INTEGER NOT NULL,
    "status" "ButcherApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "nameAr" TEXT,
    "nameEn" TEXT,
    "shopPhone" TEXT,
    "commercialReg" TEXT,
    "country" "Country",
    "city" TEXT,
    "cityAr" TEXT,
    "address" TEXT,
    "addressAr" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "bioAr" TEXT,
    "bioEn" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openTime" TEXT NOT NULL DEFAULT '06:00',
    "closeTime" TEXT NOT NULL DEFAULT '22:00',
    "rejectionReason" TEXT,
    "acceptedTermsAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButcherApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "ButcherApplicationDocumentType" NOT NULL,
    "fileKey" TEXT,
    "status" "ButcherApplicationDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "notes" TEXT,
    "originalFileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButcherApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButcherApplicationTimelineEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "action" "ButcherApplicationTimelineAction" NOT NULL,
    "comment" TEXT,
    "createdBy" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButcherApplicationTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_country_idx" ON "User"("country");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshToken_key" ON "UserSession"("refreshToken");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_transactionId_idx" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_userId_referenceId_referenceType_status_idx" ON "Payment"("userId", "referenceId", "referenceType", "status");

-- CreateIndex
CREATE INDEX "Listing_sellerId_idx" ON "Listing"("sellerId");

-- CreateIndex
CREATE INDEX "Listing_category_idx" ON "Listing"("category");

-- CreateIndex
CREATE INDEX "Listing_country_idx" ON "Listing"("country");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Listing_featured_idx" ON "Listing"("featured");

-- CreateIndex
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListingFee_listingId_key" ON "ListingFee"("listingId");

-- CreateIndex
CREATE INDEX "ListingFee_userId_idx" ON "ListingFee"("userId");

-- CreateIndex
CREATE INDEX "ListingFee_status_idx" ON "ListingFee"("status");

-- CreateIndex
CREATE INDEX "ListingFee_dueDate_idx" ON "ListingFee"("dueDate");

-- CreateIndex
CREATE INDEX "ListingFee_status_dueDate_idx" ON "ListingFee"("status", "dueDate");

-- CreateIndex
CREATE INDEX "ListingOffer_listingId_idx" ON "ListingOffer"("listingId");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostRepost_postId_userId_key" ON "PostRepost"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostComment_postId_idx" ON "PostComment"("postId");

-- CreateIndex
CREATE INDEX "Story_userId_idx" ON "Story"("userId");

-- CreateIndex
CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");

-- CreateIndex
CREATE INDEX "Story_userId_expiresAt_createdAt_idx" ON "Story"("userId", "expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "Story_expiresAt_createdAt_idx" ON "Story"("expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "Story_listingId_idx" ON "Story"("listingId");

-- CreateIndex
CREATE INDEX "StoryView_storyId_createdAt_idx" ON "StoryView"("storyId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryView_viewerId_idx" ON "StoryView"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_storyId_viewerId_key" ON "StoryView"("storyId", "viewerId");

-- CreateIndex
CREATE INDEX "StoryReaction_storyId_idx" ON "StoryReaction"("storyId");

-- CreateIndex
CREATE INDEX "StoryReaction_userId_idx" ON "StoryReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryReaction_storyId_userId_key" ON "StoryReaction"("storyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveStream_streamKey_key" ON "LiveStream"("streamKey");

-- CreateIndex
CREATE INDEX "LiveStream_hostId_idx" ON "LiveStream"("hostId");

-- CreateIndex
CREATE INDEX "LiveStream_isLive_idx" ON "LiveStream"("isLive");

-- CreateIndex
CREATE INDEX "LiveComment_streamId_idx" ON "LiveComment"("streamId");

-- CreateIndex
CREATE INDEX "LiveComment_streamId_createdAt_idx" ON "LiveComment"("streamId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_receiverId_idx" ON "Message"("receiverId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageThread_participant1_idx" ON "MessageThread"("participant1");

-- CreateIndex
CREATE INDEX "MessageThread_participant2_idx" ON "MessageThread"("participant2");

-- CreateIndex
CREATE INDEX "MessageThread_lastMessageAt_idx" ON "MessageThread"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_participant1_participant2_key" ON "MessageThread"("participant1", "participant2");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_actorId_idx" ON "Activity"("actorId");

-- CreateIndex
CREATE INDEX "Activity_targetUserId_idx" ON "Activity"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Butcher_userId_key" ON "Butcher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Butcher_sourceApplicationId_key" ON "Butcher"("sourceApplicationId");

-- CreateIndex
CREATE INDEX "Butcher_country_idx" ON "Butcher"("country");

-- CreateIndex
CREATE INDEX "Butcher_subscriptionActive_idx" ON "Butcher"("subscriptionActive");

-- CreateIndex
CREATE INDEX "Butcher_rating_idx" ON "Butcher"("rating");

-- CreateIndex
CREATE INDEX "Butcher_country_subscriptionActive_rating_idx" ON "Butcher"("country", "subscriptionActive", "rating");

-- CreateIndex
CREATE INDEX "ButcherProduct_butcherId_idx" ON "ButcherProduct"("butcherId");

-- CreateIndex
CREATE INDEX "ButcherProduct_inStock_idx" ON "ButcherProduct"("inStock");

-- CreateIndex
CREATE INDEX "ButcherOffer_butcherId_idx" ON "ButcherOffer"("butcherId");

-- CreateIndex
CREATE INDEX "ButcherOffer_validUntil_idx" ON "ButcherOffer"("validUntil");

-- CreateIndex
CREATE INDEX "ButcherStory_butcherId_idx" ON "ButcherStory"("butcherId");

-- CreateIndex
CREATE INDEX "ButcherStory_expiresAt_idx" ON "ButcherStory"("expiresAt");

-- CreateIndex
CREATE INDEX "ButcherOrder_butcherId_idx" ON "ButcherOrder"("butcherId");

-- CreateIndex
CREATE INDEX "ButcherOrder_customerId_idx" ON "ButcherOrder"("customerId");

-- CreateIndex
CREATE INDEX "ButcherOrder_status_idx" ON "ButcherOrder"("status");

-- CreateIndex
CREATE INDEX "ButcherOrder_butcherId_status_idx" ON "ButcherOrder"("butcherId", "status");

-- CreateIndex
CREATE INDEX "ButcherReview_butcherId_idx" ON "ButcherReview"("butcherId");

-- CreateIndex
CREATE INDEX "ButcherReview_reviewerId_idx" ON "ButcherReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ButcherReview_butcherId_reviewerId_key" ON "ButcherReview"("butcherId", "reviewerId");

-- CreateIndex
CREATE INDEX "ButcherApplication_userId_status_idx" ON "ButcherApplication"("userId", "status");

-- CreateIndex
CREATE INDEX "ButcherApplication_status_submittedAt_idx" ON "ButcherApplication"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ButcherApplication_status_createdAt_idx" ON "ButcherApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ButcherApplication_country_status_idx" ON "ButcherApplication"("country", "status");

-- CreateIndex
CREATE INDEX "ButcherApplication_userId_createdAt_idx" ON "ButcherApplication"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ButcherApplication_userId_applicationNumber_key" ON "ButcherApplication"("userId", "applicationNumber");

-- CreateIndex
CREATE INDEX "ButcherApplicationDocument_applicationId_idx" ON "ButcherApplicationDocument"("applicationId");

-- CreateIndex
CREATE INDEX "ButcherApplicationDocument_applicationId_type_idx" ON "ButcherApplicationDocument"("applicationId", "type");

-- CreateIndex
CREATE INDEX "ButcherApplicationDocument_status_idx" ON "ButcherApplicationDocument"("status");

-- CreateIndex
CREATE INDEX "ButcherApplicationDocument_verifiedBy_idx" ON "ButcherApplicationDocument"("verifiedBy");

-- CreateIndex
CREATE INDEX "ButcherApplicationTimelineEvent_applicationId_createdAt_idx" ON "ButcherApplicationTimelineEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ButcherApplicationTimelineEvent_createdBy_idx" ON "ButcherApplicationTimelineEvent"("createdBy");

-- CreateIndex
CREATE INDEX "ButcherApplicationTimelineEvent_action_idx" ON "ButcherApplicationTimelineEvent"("action");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "ListingFee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFee" ADD CONSTRAINT "ListingFee_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFee" ADD CONSTRAINT "ListingFee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingOffer" ADD CONSTRAINT "ListingOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRepost" ADD CONSTRAINT "PostRepost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRepost" ADD CONSTRAINT "PostRepost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveStream" ADD CONSTRAINT "LiveStream_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveComment" ADD CONSTRAINT "LiveComment_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Butcher" ADD CONSTRAINT "Butcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Butcher" ADD CONSTRAINT "Butcher_sourceApplicationId_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "ButcherApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherProduct" ADD CONSTRAINT "ButcherProduct_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherOffer" ADD CONSTRAINT "ButcherOffer_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherStory" ADD CONSTRAINT "ButcherStory_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherOrder" ADD CONSTRAINT "ButcherOrder_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherOrder" ADD CONSTRAINT "ButcherOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherOrder" ADD CONSTRAINT "ButcherOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ButcherProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherReview" ADD CONSTRAINT "ButcherReview_butcherId_fkey" FOREIGN KEY ("butcherId") REFERENCES "Butcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherReview" ADD CONSTRAINT "ButcherReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherApplication" ADD CONSTRAINT "ButcherApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherApplicationDocument" ADD CONSTRAINT "ButcherApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ButcherApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherApplicationDocument" ADD CONSTRAINT "ButcherApplicationDocument_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherApplicationTimelineEvent" ADD CONSTRAINT "ButcherApplicationTimelineEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ButcherApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButcherApplicationTimelineEvent" ADD CONSTRAINT "ButcherApplicationTimelineEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
