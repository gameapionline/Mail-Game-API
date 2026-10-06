create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  phone text,
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  email_address text not null unique,
  display_name text not null default 'Game API Mail',
  provider text not null default 'hostinger',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  name text not null,
  system_name text,
  created_at timestamptz not null default now(),
  unique(mailbox_id,name)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.mailboxes(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  provider_uid text,
  message_id text,
  thread_id text,
  in_reply_to text,
  sender_name text,
  sender_email text,
  subject text not null default '',
  body_text text,
  body_html text,
  preview text,
  received_at timestamptz,
  sent_at timestamptz,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  is_important boolean not null default false,
  has_attachments boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(mailbox_id,provider_uid)
);

create table public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  recipient_type text not null check(recipient_type in ('to','cc','bcc')),
  name text,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_name text not null,
  content_type text,
  file_size bigint,
  storage_path text not null,
  content_id text,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  avatar_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,email)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  device_label text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,endpoint)
);

create table public.mail_sync_state (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null unique references public.mailboxes(id) on delete cascade,
  last_synced_at timestamptz,
  last_uid text,
  sync_status text not null default 'idle' check(sync_status in ('idle','running','error')),
  last_error text,
  updated_at timestamptz not null default now()
);

create index messages_mailbox_folder_idx on public.messages(mailbox_id,folder_id,received_at desc);
create index messages_sender_idx on public.messages(sender_email);
create index messages_thread_idx on public.messages(thread_id);
create index recipients_message_idx on public.message_recipients(message_id);
create index attachments_message_idx on public.attachments(message_id);
create index contacts_user_idx on public.contacts(user_id);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.profiles enable row level security;
alter table public.mailboxes enable row level security;
alter table public.folders enable row level security;
alter table public.messages enable row level security;
alter table public.message_recipients enable row level security;
alter table public.attachments enable row level security;
alter table public.contacts enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.mail_sync_state enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid())=id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);

create policy mailboxes_select_own on public.mailboxes for select to authenticated using ((select auth.uid())=owner_id);
create policy mailboxes_insert_own on public.mailboxes for insert to authenticated with check ((select auth.uid())=owner_id);
create policy mailboxes_update_own on public.mailboxes for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);

create policy folders_select_own on public.folders for select to authenticated using (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));
create policy folders_insert_own on public.folders for insert to authenticated with check (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));
create policy folders_update_own on public.folders for update to authenticated using (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid()))) with check (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));

create policy messages_select_own on public.messages for select to authenticated using (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));
create policy messages_insert_own on public.messages for insert to authenticated with check (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));
create policy messages_update_own on public.messages for update to authenticated using (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid()))) with check (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));
create policy messages_delete_own on public.messages for delete to authenticated using (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));

create policy recipients_select_own on public.message_recipients for select to authenticated using (exists(select 1 from public.messages x join public.mailboxes m on m.id=x.mailbox_id where x.id=message_id and m.owner_id=(select auth.uid())));
create policy attachments_select_own on public.attachments for select to authenticated using (exists(select 1 from public.messages x join public.mailboxes m on m.id=x.mailbox_id where x.id=message_id and m.owner_id=(select auth.uid())));

create policy contacts_select_own on public.contacts for select to authenticated using ((select auth.uid())=user_id);
create policy contacts_insert_own on public.contacts for insert to authenticated with check ((select auth.uid())=user_id);
create policy contacts_update_own on public.contacts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy contacts_delete_own on public.contacts for delete to authenticated using ((select auth.uid())=user_id);

create policy push_select_own on public.push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy push_insert_own on public.push_subscriptions for insert to authenticated with check ((select auth.uid())=user_id);
create policy push_update_own on public.push_subscriptions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy push_delete_own on public.push_subscriptions for delete to authenticated using ((select auth.uid())=user_id);

create policy sync_select_own on public.mail_sync_state for select to authenticated using (exists(select 1 from public.mailboxes m where m.id=mailbox_id and m.owner_id=(select auth.uid())));