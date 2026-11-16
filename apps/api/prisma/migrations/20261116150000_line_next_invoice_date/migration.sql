-- Next Invoice Date on a line (user, 2026-11-16): for a client moved here mid cycle, the day its
-- first invoice falls due; the billing cycle runs on from it. Additive.
ALTER TABLE "clients" ADD COLUMN "nextBillingDate" DATE;
