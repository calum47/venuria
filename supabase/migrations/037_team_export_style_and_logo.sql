-- 037: per-team look of exported PDFs/JPGs (Settings → Exports) and the team logo.
--
-- * teams.export_style  JSON the app validates (font, sizes, colour, spacing, footer, logo position/size).
--                       Readable by every team member (they all export); writable by the manager only,
--                       through the existing manager_update_team policy.
-- * teams.logo_path     Path of the logo in the private `team-logos` bucket: {team_id}/logo-<timestamp>.<ext>
-- * team-logos bucket   Private, 1 MB, png/jpeg/webp. Team members read their own team's folder;
--                       only the manager uploads, replaces or deletes.

alter table public.teams
  add column if not exists export_style jsonb not null default '{}'::jsonb,
  add column if not exists logo_path text;

alter table public.teams
  add constraint teams_export_style_is_small_object
    check (jsonb_typeof(export_style) = 'object' and pg_column_size(export_style) < 4096),
  add constraint teams_logo_path_in_own_folder
    check (logo_path is null or (length(logo_path) <= 200 and logo_path like id::text || '/%'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy team_read_own_logo on storage.objects
  for select to authenticated
  using (bucket_id = 'team-logos' and (storage.foldername(name))[1] = public.current_team_id()::text);

create policy manager_write_own_logo on storage.objects
  for all to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = public.current_team_id()::text
    and public.current_planner_role() = 'manager'
  )
  with check (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[1] = public.current_team_id()::text
    and public.current_planner_role() = 'manager'
  );
