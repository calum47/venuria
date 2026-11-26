-- Payments and project documents can now carry pictures and screenshots, not only PDFs.
-- The private bucket `project-documents` restricted uploads to application/pdf (migration 015);
-- allow JPEG, PNG and WebP too. Size limit (10 MB), privacy (private bucket) and the access
-- policies are unchanged. Reading payment details out of a file ("Add payment from PDF" /
-- "Fill from PDF") still needs a PDF.
--
-- Applied directly to the live project via MCP; this file keeps the migration history in sync.

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'project-documents';
