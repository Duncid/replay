import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { accountStorageKey } from "@/utils/accountStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { useCallback, useEffect, useRef, useState } from "react";

const CURRENT_USER_EVENT = "replay:current-user-change";

export interface LocalUser {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
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

  const createUser = useCallback(
    async (name: string): Promise<LocalUser | null> => {
      const { data, error } = await supabase
        .from("local_users")
        .insert({ name: name.trim() })
        .select()
        .single();

      if (error) {
        console.error("Failed to create user:", error);
        return null;
      }

      setUsers((prev) => [...prev, data]);
      setCurrentUserId(data.id);
      return data;
    },
    [setCurrentUserId]
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
    switchUser,
    refetch: fetchUsers,
  };
}
