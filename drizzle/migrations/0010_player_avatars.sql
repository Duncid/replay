-- The pinned Clay generator renders these choices locally; no uploaded images.
-- Null values give existing players a stable default derived from their profile ID.
ALTER TABLE public.local_users
  ADD COLUMN avatar_seed text CHECK (char_length(avatar_seed) BETWEEN 1 AND 100),
  ADD COLUMN avatar_color text CHECK (avatar_color IN ('C', 'D', 'E', 'G', 'A', 'B'));

COMMENT ON COLUMN public.local_users.avatar_seed IS 'DiceBear Clay 10.6.0 seed, independent of the player name.';
COMMENT ON COLUMN public.local_users.avatar_color IS 'Replay Acid note palette color; F is excluded from the avatar picker.';
