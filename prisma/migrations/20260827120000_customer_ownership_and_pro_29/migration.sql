-- Customer ownership.
--
-- Customers were scoped by companyId only. A technician who signs up without
-- a company name has companyId = NULL, so every unaffiliated technician's
-- customers landed in the same NULL bucket and would have been visible to each
-- other once a customer list existed. ownerUserId gives those rows a private
-- owner.

ALTER TABLE "Customer" ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Customer_ownerUserId_name_idx" ON "Customer"("ownerUserId", "name");

-- Backfill: attribute each existing customer to the technician who raised the
-- earliest job against them. Customers with no job stay unowned and remain
-- visible only within their company.
UPDATE "Customer" c
SET "ownerUserId" = j."userId"
FROM (
  SELECT DISTINCT ON ("customerId") "customerId", "userId"
  FROM "Job"
  WHERE "customerId" IS NOT NULL
  ORDER BY "customerId", "createdAt" ASC
) j
WHERE c."id" = j."customerId" AND c."ownerUserId" IS NULL;

-- Pro is $29.00/month, $290.00/year.
--
-- Guarded on the old value so a deployment whose administrator has already set
-- their own price from the admin dashboard is left alone.
UPDATE "Plan"
SET "priceCentsMonthly" = 2900
WHERE "tier" = 'PRO' AND "priceCentsMonthly" = 2999;

UPDATE "Plan"
SET "priceCentsYearly" = 29000
WHERE "tier" = 'PRO' AND "priceCentsYearly" = 29990;

-- Apple In-App Purchase.
--
-- An iOS subscriber is billed by Apple rather than Stripe. The original
-- transaction id is the identity Apple keeps stable across renewals, and is
-- what an App Store server notification arrives keyed on.

ALTER TABLE "Subscription" ADD COLUMN "appleOriginalTransactionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "appleProductId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "appleEnvironment" TEXT;

CREATE UNIQUE INDEX "Subscription_appleOriginalTransactionId_key"
  ON "Subscription"("appleOriginalTransactionId");
