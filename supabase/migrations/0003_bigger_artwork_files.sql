-- Raise the artwork bucket's file size limit to 50 MB.
--
-- The design reference is the single image the manufacturer builds from, so it
-- arrives as a full-resolution export, not something sized for the web. 25 MB
-- was turning those away.
--
-- This has to move in step with MAX_BYTES in src/lib/storage.ts. If the app
-- allows more than the bucket does, the browser uploads the whole file and
-- Supabase rejects it at the end — the slowest possible way to fail.

update storage.buckets
   set file_size_limit = 52428800  -- 50 MB
 where id = 'artwork';
