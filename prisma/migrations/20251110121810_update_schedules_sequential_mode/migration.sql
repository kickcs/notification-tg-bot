-- Update existing schedules to use sequential mode based on user settings
-- This migration fixes the issue where schedules were created with useSequentialDelay=false
-- even when users had sequentialMode=true in their settings

UPDATE "public"."schedules"
SET "useSequentialDelay" = true
WHERE "isActive" = true
  AND "useSequentialDelay" = false
  AND "userId" IN (
    SELECT "id" FROM "public"."users" WHERE "sequentialMode" = true
  );

-- Create an index on userId and useSequentialDelay for better performance
CREATE INDEX IF NOT EXISTS "idx_schedules_user_sequential" ON "public"."schedules"("userId", "useSequentialDelay");