import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { accountStorageKey } from "@/utils/accountStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import type { PlayerAvatarValue } from "@/utils/playerAvatar";
import { useCallback, useEffect, useRef, useState } from "react";

const CURRENT_USER_EVENT = "replay:current-user-change";
const PLAYERS_CHANGED_EVENT = "replay:players-changed";

export interface LocalUser {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  avatar_seed?: string | null;
  avatar_color?: string | null;
}

export function useLocalUsers() {
  const { user } = useAuth();
  const storageKey = accountStorageKey(STORAGE_KEYS.CURRENT_USER_ID);
  const requestVersion = useRef(0);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setCurrentUserId = useCallback((id: string | null) => {
    setCurrentUserIdState(id);
    try {
      if (id) {
        localStorage.setItem(storageKey, id);
      } else {
        localStorage.removeItem(storageKey);
      }
      window.dispatchEvent(
        new CustomEvent(CURRENT_USER_EVENT, { detail: { id, accountId: user?.id } })
      );
    } catch (error) {
      console.warn("Failed to persist current user ID:", error);
    }
  }, [storageKey, user?.id]);

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    const version = ++requestVersion.current;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("local_users")
      .select("*")
      .eq("auth_user_id", user.id)
      .order("created_at", { ascending: true });

    if (version !== requestVersion.current) return;
    if (error) {
      console.error("Failed to fetch local users:", error);
      setIsLoading(false);
      return;
    }

    setUsers(data || []);

    let savedId: string | null = null;
    try { savedId = localStorage.getItem(storageKey); } catch { /* storage unavailable */ }
    // Never expose a remembered ID until ownership has been verified by RLS.
    const selected = data?.find(u => u.id === (currentUserId ?? savedId)) ?? data?.[0];
    if (currentUserId !== (selected?.id ?? null)) setCurrentUserId(selected?.id ?? null);

    setIsLoading(false);
  }, [currentUserId, setCurrentUserId, storageKey, user]);

  useEffect(() => {
    const version = requestVersion;
    void fetchUsers();
    return () => { version.current++; };
  }, [fetchUsers]);

  useEffect(() => {
    console.log(`[UserSwitch] currentUserId is now ${currentUserId}`);
  }, [currentUserId]);

  useEffect(() => {
    const handleUserChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string | null; accountId: string }>).detail;
      if (detail?.accountId === user?.id) setCurrentUserIdState(detail.id);
    };

    if (typeof window === "undefined") return undefined;
    window.addEventListener(CURRENT_USER_EVENT, handleUserChange);
    return () => {
      window.removeEventListener(CURRENT_USER_EVENT, handleUserChange);
    };
  }, [user?.id]);

  useEffect(() => {
    const handlePlayersChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId: string }>).detail;
      if (detail?.accountId === user?.id) void fetchUsers();
    };
    window.addEventListener(PLAYERS_CHANGED_EVENT, handlePlayersChange);
    return () => window.removeEventListener(PLAYERS_CHANGED_EVENT, handlePlayersChange);
  }, [fetchUsers, user?.id]);

  const updateUser = useCallback(async (id: string, name: string, avatar: PlayerAvatarValue): Promise<void> => {
    if (!user || !name.trim()) throw new Error("A player name is required");
    const { data, error } = await supabase.from("local_users")
      .update({ name: name.trim(), avatar_seed: avatar.seed, avatar_color: avatar.color }).eq("id", id).eq("auth_user_id", user.id)
      .select().single();
    if (error) throw error;
    ++requestVersion.current;
    setUsers(previous => previous.map(player => player.id === id ? data : player));
    window.dispatchEvent(new CustomEvent(PLAYERS_CHANGED_EVENT, { detail: { accountId: user.id } }));
  }, [user]);

  const deleteUser = useCallback(async (id: string): Promise<void> => {
    if (!user) throw new Error("Sign in to delete a player");
    const { error } = await supabase.from("local_users").delete()
      .eq("id", id).eq("auth_user_id", user.id).select("id").single();
    if (error) throw error;
    ++requestVersion.current;
    setUsers(previous => previous.filter(player => player.id !== id));
    if (currentUserId === id) setCurrentUserId(users.find(player => player.id !== id)?.id ?? null);
    window.dispatchEvent(new CustomEvent(PLAYERS_CHANGED_EVENT, { detail: { accountId: user.id } }));
  }, [currentUserId, setCurrentUserId, user, users]);

  const createUser = useCallback(
    async (name: string, avatar: PlayerAvatarValue): Promise<LocalUser> => {
      if (!user || !name.trim()) throw new Error("A player name and signed-in account are required");
      const { data, error } = await supabase
        .from("local_users")
        .insert({ name: name.trim(), auth_user_id: user.id, avatar_seed: avatar.seed, avatar_color: avatar.color })
        .select()
        .single();

      if (error) {
        console.error("Failed to create user:", error);
        throw error;
      }

      setUsers((prev) => [...prev, data]);
      setCurrentUserId(data.id);
      return data;
    },
    [setCurrentUserId, user]
  );

  const switchUser = useCallback(
    (userId: string) => {
      const userExists = users.some((u) => u.id === userId);
      if (userExists) {
        console.log(`[UserSwitch] Switched user from ${currentUserId} to ${userId}`);
        setCurrentUserId(userId);
      }
    },
    [currentUserId, users, setCurrentUserId]
  );

  const currentUser = users.find((u) => u.id === currentUserId) || null;

  return {
    users,
    currentUser,
    currentUserId,
    isLoading,
    createUser,
    updateUser,
    deleteUser,
    switchUser,
    refetch: fetchUsers,
  };
}
