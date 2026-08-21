-- The conformity pass fills the action fields directly, and the responsible it proposes is a
-- free-text name from the project profile rather than a platform user. Keeping it here lets the
-- register show it in the Responsable column until someone assigns a real member.
ALTER TABLE "regulatory_evaluation_actions"
  ADD COLUMN "responsible_name" TEXT;
