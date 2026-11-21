-- ============================================================================
-- Next App: Complete Supabase Schema for Profiles, Friendships & Messaging
-- Safe to run multiple times (idempotent) in Supabase SQL Editor.
-- ============================================================================

-- 1. PROFILES TABLE (Synced 1:1 with Firebase Auth UID & Firestore profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    cover_url TEXT,
    bio TEXT,
    email TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_group BOOLEAN DEFAULT FALSE,
    members TEXT[] DEFAULT '{}',
    admin_id TEXT,
    fcm_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all required columns exist if the table was created earlier with fewer columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS members TEXT[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Deduplicate any legacy case-insensitive duplicate usernames before creating unique index
WITH ranked_usernames AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY LOWER(username)
               ORDER BY
                   COALESCE(is_verified, FALSE) DESC,
                   created_at ASC NULLS LAST,
                   id ASC
           ) AS rn
    FROM public.profiles
    WHERE username IS NOT NULL
      AND username <> ''
      AND COALESCE(is_group, FALSE) = FALSE
)
UPDATE public.profiles p
SET username = p.username || '_' || LOWER(SUBSTRING(MD5(p.id) FROM 1 FOR 4)),
    updated_at = NOW()
FROM ranked_usernames r
WHERE p.id = r.id
  AND r.rn > 1;

-- Case-insensitive unique username for real users (excludes groups without usernames)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique_idx
    ON public.profiles (LOWER(username))
    WHERE username IS NOT NULL AND username <> '' AND COALESCE(is_group, FALSE) = FALSE;

CREATE INDEX IF NOT EXISTS profiles_is_group_idx ON public.profiles (is_group);
CREATE INDEX IF NOT EXISTS profiles_members_gin_idx ON public.profiles USING GIN (members);
CREATE INDEX IF NOT EXISTS profiles_created_at_idx ON public.profiles (created_at DESC);


-- 2. FRIENDSHIPS TABLE (100% Supabase)
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS receiver_id TEXT;
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Deduplicate any legacy friendship rows between the same pair before adding unique index
WITH ranked_friendships AS (
    SELECT ctid,
           ROW_NUMBER() OVER (
               PARTITION BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
               ORDER BY
                   CASE status
                       WHEN 'blocked' THEN 3
                       WHEN 'accepted' THEN 2
                       ELSE 1
                   END DESC,
                   created_at DESC NULLS LAST,
                   id DESC
           ) AS rn
    FROM public.friendships
    WHERE sender_id IS NOT NULL AND receiver_id IS NOT NULL
)
DELETE FROM public.friendships
WHERE ctid IN (SELECT ctid FROM ranked_friendships WHERE rn > 1);

-- Prevent duplicate friendships between the same two users in either direction
CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_user_pair_idx
    ON public.friendships (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id));

CREATE INDEX IF NOT EXISTS friendships_sender_idx ON public.friendships (sender_id);
CREATE INDEX IF NOT EXISTS friendships_receiver_idx ON public.friendships (receiver_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx ON public.friendships (status);


-- 3. MESSAGES TABLE (100% Supabase)
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    chat_id TEXT,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    content TEXT DEFAULT '',
    text TEXT DEFAULT '',
    media_url TEXT,
    media_type TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    deleted_for TEXT[] DEFAULT '{}',
    deleted_for_everyone BOOLEAN DEFAULT FALSE,
    local_created_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS chat_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_for TEXT[] DEFAULT '{}';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS local_created_at TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS messages_chat_id_created_idx ON public.messages (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_receiver_idx ON public.messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_unread_idx ON public.messages (receiver_id, is_read) WHERE is_read = FALSE;


-- 4. POSTS & REELS TABLES (Existing backup tables)
CREATE TABLE IF NOT EXISTS public.posts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source_type TEXT DEFAULT 'local',
    youtube_id TEXT,
    views INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.reels (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    media_url TEXT,
    media_type TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source_type TEXT DEFAULT 'local',
    youtube_id TEXT,
    views INTEGER DEFAULT 0
);


-- 5. ATOMIC "DELETE FOR ME" HELPER FUNCTIONS (Validated inputs; prevents overwriting other user's deletion)
CREATE OR REPLACE FUNCTION public.mark_messages_deleted_for_user(msg_ids TEXT[], uid TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF uid IS NULL OR length(trim(uid)) = 0 OR length(uid) > 128 THEN
        RAISE EXCEPTION 'Invalid uid';
    END IF;
    IF msg_ids IS NULL OR array_length(msg_ids, 1) IS NULL OR array_length(msg_ids, 1) > 200 THEN
        RETURN;
    END IF;

    UPDATE public.messages
    SET deleted_for = array_append(COALESCE(deleted_for, '{}'), uid)
    WHERE id = ANY(msg_ids)
      AND (sender_id = uid OR receiver_id = uid OR receiver_id LIKE 'group_%')
      AND NOT (COALESCE(deleted_for, '{}') @> ARRAY[uid]);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_chat_deleted_for_user(uid TEXT, partner_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF uid IS NULL OR length(trim(uid)) = 0 OR length(uid) > 128 THEN
        RAISE EXCEPTION 'Invalid uid';
    END IF;
    IF partner_id IS NULL OR length(trim(partner_id)) = 0 OR length(partner_id) > 128 THEN
        RAISE EXCEPTION 'Invalid partner_id';
    END IF;

    UPDATE public.messages
    SET deleted_for = array_append(COALESCE(deleted_for, '{}'), uid)
    WHERE (
        (sender_id = uid AND receiver_id = partner_id)
        OR (sender_id = partner_id AND receiver_id = uid)
        OR (partner_id LIKE 'group_%' AND receiver_id = partner_id)
    )
    AND NOT (COALESCE(deleted_for, '{}') @> ARRAY[uid]);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_messages_deleted_for_user(TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_chat_deleted_for_user(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_messages_deleted_for_user(TEXT[], TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_chat_deleted_for_user(TEXT, TEXT) TO authenticated, service_role;


-- 6. ENABLE SUPABASE REALTIME FOR MESSAGES, FRIENDSHIPS & PROFILES
DO $$
DECLARE
    is_all_tables BOOLEAN;
BEGIN
    SELECT puballtables INTO is_all_tables
    FROM pg_publication
    WHERE pubname = 'supabase_realtime';

    IF COALESCE(is_all_tables, FALSE) = FALSE THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- Ensure full row data is sent in UPDATE/DELETE realtime payloads
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;


-- 7. HARDENED ROW LEVEL SECURITY
-- NOTE: Configure Supabase Third-Party Auth for Firebase Auth (recommended), OR set SUPABASE_SERVICE_ROLE_KEY
-- on the server proxy (/api/supabase-proxy) before running the strict policies below in Supabase SQL Editor.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

-- Public read-only access for feed posts/reels & basic profile discovery
DROP POLICY IF EXISTS "posts_public_read" ON public.posts;
CREATE POLICY "posts_public_read" ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "reels_public_read" ON public.reels;
CREATE POLICY "reels_public_read" ON public.reels FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);

-- Authenticated user policies (requires Supabase Third-Party Auth for Firebase JWT, or service_role via /api/supabase-proxy)
DROP POLICY IF EXISTS "profiles_all_access" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_write" ON public.profiles;
CREATE POLICY "profiles_owner_write" ON public.profiles
    FOR ALL
    USING (auth.role() = 'service_role' OR (auth.uid())::text = id OR (is_group = true AND admin_id = (auth.uid())::text))
    WITH CHECK (auth.role() = 'service_role' OR (auth.uid())::text = id OR (is_group = true AND admin_id = (auth.uid())::text));

DROP POLICY IF EXISTS "friendships_all_access" ON public.friendships;
DROP POLICY IF EXISTS "friendships_participant_access" ON public.friendships;
CREATE POLICY "friendships_participant_access" ON public.friendships
    FOR ALL
    USING (auth.role() = 'service_role' OR sender_id = (auth.uid())::text OR receiver_id = (auth.uid())::text)
    WITH CHECK (auth.role() = 'service_role' OR sender_id = (auth.uid())::text OR receiver_id = (auth.uid())::text);

DROP POLICY IF EXISTS "messages_all_access" ON public.messages;
DROP POLICY IF EXISTS "messages_participant_access" ON public.messages;
CREATE POLICY "messages_participant_access" ON public.messages
    FOR ALL
    USING (auth.role() = 'service_role' OR sender_id = (auth.uid())::text OR receiver_id = (auth.uid())::text)
    WITH CHECK (auth.role() = 'service_role' OR sender_id = (auth.uid())::text);

DROP POLICY IF EXISTS "posts_owner_write" ON public.posts;
CREATE POLICY "posts_owner_write" ON public.posts
    FOR ALL
    USING (auth.role() = 'service_role' OR user_id = (auth.uid())::text)
    WITH CHECK (auth.role() = 'service_role' OR user_id = (auth.uid())::text);

DROP POLICY IF EXISTS "reels_owner_write" ON public.reels;
CREATE POLICY "reels_owner_write" ON public.reels
    FOR ALL
    USING (auth.role() = 'service_role' OR user_id = (auth.uid())::text)
    WITH CHECK (auth.role() = 'service_role' OR user_id = (auth.uid())::text);

