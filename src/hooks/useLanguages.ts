import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { initialLanguages, type Translation } from "@/lib/languages";

export function useLanguages() {
  return useQuery({
    queryKey: ["language-settings"], staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("language_settings").select("*").order("locale");
      if (error) throw error;
      const settings = new Map(initialLanguages.map(row => [row.locale, row]));
      for (const row of data) settings.set(row.locale, row);
      return [...settings.values()];
    },
  });
}

export function translationsQuery(locale: string) {
  return queryOptions({
    queryKey: ["language-strings", locale], staleTime: 60_000,
    queryFn: async () => {
      const rows: Translation[] = [];
      const size = 500;
      for (let offset = 0; ; offset += size) {
        const { data, error } = await supabase.from("language_strings").select("*").eq("locale", locale)
          .order("kind").order("key").range(offset, offset + size - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < size) return rows;
      }
    },
  });
}
