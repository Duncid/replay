import { supabase } from "@/integrations/supabase/client";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { useCallback, useEffect, useState } from "react";

const CURRENT_USER_EVENT = "replay:current-user-change";

export interface LocalUser {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function useLocalUsers() {
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const setCurrentUserId = useCallback((id: string | null) => {
    setCurrentUserIdState(id);
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      }
      window.dispatchEvent(
        new CustomEvent(CURRENT_USER_EVENT, { detail: id })
      );
    } catch (error) {
      console.warn("Failed to persist current user ID:", error);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("local_users")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch local users:", error);
      setIsLoading(false);
      return;
    }

    setUsers(data || []);

    // If no current user is set, or current user doesn't exist, select first user
    if (data && data.length > 0) {
      const currentExists = data.some((u) => u.id === currentUserId);
      if (!currentUserId || !currentExists) {
        setCurrentUserId(data[0].id);
      }
    }

    setIsLoading(false);
  }, [currentUserId, setCurrentUserId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    console.log(`[UserSwitch] currentUserId is now ${currentUserId}`);
  }, [currentUserId]);

  useEffect(() => {
    const handleUserChange = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail ?? null;
      setCurrentUserIdState(detail);
    };

    if (typeof window === "undefined") return undefined;
    window.addEventListener(CURRENT_USER_EVENT, handleUserChange);
    return () => {
      window.removeEventListener(CURRENT_USER_EVENT, handleUserChange);
    };
  }, []);

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
