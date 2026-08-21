-- Private bucket for artwork.
--
-- Private, not public: logos, crests and fonts are the customer's
-- intellectual property, and some of it is unreleased. The app hands out
-- short-lived signed links instead (src/lib/storage.ts), so a share link
-- forwarded around stops working rather than exposing a team's crest forever.
--
-- No storage policies, for the same reason the tables have none — only the
-- service role reaches this, server-side.

insert into storage.buckets (id, name, public, file_size_limit)
values ('artwork', 'artwork', false, 26214400)  -- 25 MB, matching MAX_BYTES
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;
