-- The Pro plan now includes the customer list, so say so on the Plans screen.
--
-- Feature bullets live in the Plan row and are only seeded into an empty
-- database, so an existing deployment would otherwise keep advertising the old
-- feature set. Appending rather than replacing leaves any wording an
-- administrator has edited alone, and the guard makes it idempotent.

UPDATE "Plan"
SET "featureBullets" = "featureBullets" || ARRAY['Customer list with service history per site']
WHERE "tier" = 'PRO'
  AND NOT ('Customer list with service history per site' = ANY ("featureBullets"));
