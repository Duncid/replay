import { useMemo, useState, type FormEvent } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { translationsQuery, useLanguages } from "@/hooks/useLanguages";
import { usePublishedTuneKeys } from "@/hooks/useTuneQueries";
import { bundledStrings, formatDateTime, initialLanguages, languageName, normalizeLocale, stringKeys, US, type LanguageSettings, type Translation } from "@/lib/languages";
import { supabase } from "@/integrations/supabase/client";
import { tuneDisplayTitle } from "@/utils/tunePreview";

const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const fieldClass = "flex flex-col gap-1.5 text-sm";
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
const sampleDate = new Date(2026, 10, 28, 17, 30);

function LocaleDefaults({ language }: { language: LanguageSettings }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [draft, setDraft] = useState(language);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { error } = await supabase.from("language_settings").update({
        notation: draft.notation, date_order: draft.date_order, hour_cycle: draft.hour_cycle,
      }).eq("locale", language.locale).select("locale").single();
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ["language-settings"] });
    } catch (err) { setError(errorText(err)); }
    finally { setSaving(false); }
  }
  return <form onSubmit={save} className="flex flex-wrap items-end gap-4">
    <label className={fieldClass}>{t("languageManager.notation")}
      <select className={selectClass} value={draft.notation} onChange={e => setDraft({ ...draft, notation: e.target.value as LanguageSettings["notation"] })}>
        <option value="abc">ABC</option><option value="solfege">{t("language.musicNotationSolfege")}</option>
      </select></label>
    <label className={fieldClass}>{t("languageManager.date")}
      <select className={selectClass} value={draft.date_order} onChange={e => setDraft({ ...draft, date_order: e.target.value as LanguageSettings["date_order"] })}>
        <option value="MDY">MM/DD/YYYY</option><option value="DMY">DD/MM/YYYY</option><option value="YMD">YYYY-MM-DD</option>
      </select></label>
    <label className={fieldClass}>{t("languageManager.time")}
      <select className={selectClass} value={draft.hour_cycle} onChange={e => setDraft({ ...draft, hour_cycle: e.target.value as LanguageSettings["hour_cycle"] })}>
        <option value="h12">12 h</option><option value="h23">24 h</option>
      </select></label>
    <Button variant="outline" disabled={saving || (language.notation === draft.notation && language.hour_cycle === draft.hour_cycle && language.date_order === draft.date_order)}>{t("menus.save")}</Button>
    <output className="self-end py-2 text-sm text-muted-foreground">{formatDateTime(sampleDate, draft)}</output>
    {error && <p role="alert">{error}</p>}
  </form>;
}

type Cell = Pick<Translation, "locale" | "key" | "kind">;
const id = (cell: Cell) => JSON.stringify([cell.locale, cell.kind, cell.key]);
const tokens = (s: string) => (s.match(/{{[^}]+}}/g) ?? []).sort().join("|");

export function LanguageManagement() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const settings = useLanguages();
  const languages = settings.data ?? initialLanguages;
  const [locale, setLocale] = useState(US);
  const selected = languages.find(row => row.locale === locale) ?? languages[0];
  const columns = [...new Set([...initialLanguages.map(row => row.locale), selected.locale])];
  const queries = useQueries({ queries: columns.map(translationsQuery) });
  const values = new Map(queries.flatMap(query => (query.data ?? []).map(row => [id(row), row.value] as const)));
  const published = usePublishedTuneKeys();
  const [kind, setKind] = useState<Translation["kind"]>("ui");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Cell | null>(null);
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLocale, setNewLocale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tunes = useMemo(() => new Map((published.data ?? []).filter(tune => tune.is_global)
    .map(tune => [tune.tune_key, tune.briefing?.title?.trim() || tuneDisplayTitle(tune.tune_key)])), [published.data]);
  const keys = kind === "ui" ? stringKeys : [...tunes.keys()].sort();
  const base = (code: string, key: string) => kind === "ui" ? bundledStrings[code]?.[key] : code === US ? tunes.get(key) : undefined;
  const direct = (code: string, key: string) => values.get(id({ locale: code, kind, key })) ?? base(code, key);
  const term = search.trim().toLocaleLowerCase();
  const visible = keys.filter(key => !term || [key, ...columns.map(code => direct(code, key) ?? "")].some(s => s.toLocaleLowerCase().includes(term)));
  const loading = settings.isPending || queries.some(query => query.isPending) || (kind === "tune" && published.isPending);
  const loadError = settings.error || queries.find(query => query.error)?.error || (kind === "tune" && published.error);

  async function saveCell(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const trimmed = value.trim();
    if (editing.kind === "ui" && trimmed && tokens(trimmed) !== tokens(bundledStrings[US][editing.key] ?? bundledStrings["fr-FR"][editing.key] ?? "")) {
      setError(t("languageManager.placeholders")); return;
    }
    setError(""); setBusy(true);
    try {
      const table = supabase.from("language_strings");
      const { error } = trimmed
        ? await table.upsert({ ...editing, value: trimmed })
        : await table.delete().match(editing);
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ["language-strings", editing.locale] });
      setEditing(null);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function addLocale(event: FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const [canonical] = Intl.getCanonicalLocales(newLocale.trim());
      const code = normalizeLocale(canonical);
      if (!code || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(code) || !Intl.DateTimeFormat.supportedLocalesOf([code]).length) throw new Error(t("languageManager.invalidLocale"));
      if (!languages.some(row => row.locale === code)) {
        const { error } = await supabase.from("language_settings").upsert({ locale: code }, { ignoreDuplicates: true });
        if (error) throw error;
        await client.invalidateQueries({ queryKey: ["language-settings"] });
      }
      setLocale(code); setNewLocale(""); setAdding(false);
    } catch (err) { setError(err instanceof RangeError ? t("languageManager.invalidLocale") : errorText(err)); }
    finally { setBusy(false); }
  }

  return <section className="w-full flex-1 min-h-0 overflow-auto px-5 pb-8 sm:px-8">
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <h1 className="font-display text-3xl font-semibold">{t("languageManager.title")}</h1>
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className={fieldClass}>{t("language.label")}
            <select className={selectClass} value={selected.locale} disabled={busy || !!editing} onChange={e => setLocale(e.target.value)}>
              {languages.map(row => <option key={row.locale} value={row.locale}>{languageName(row.locale)}</option>)}
            </select></label>
          <Button variant="ghost" disabled={busy || !!editing} onClick={() => { setAdding(!adding); setError(""); }}>{t("languageManager.add")}</Button>
        </div>
        {adding && <form onSubmit={addLocale} className="flex flex-wrap gap-3 items-end">
          <label className={fieldClass}>{t("languageManager.code")}<Input required placeholder="de-DE" list="locale-suggestions" value={newLocale} onChange={e => setNewLocale(e.target.value)} /></label>
          <datalist id="locale-suggestions">{["de-DE","es-ES","it-IT","ja-JP","pt-BR"].map(code => <option key={code} value={code}>{languageName(code)}</option>)}</datalist>
          <Button disabled={busy}>{t("languageManager.add")}</Button></form>}
        <LocaleDefaults key={[selected.locale, selected.notation, selected.date_order, selected.hour_cycle].join("/")} language={selected} />
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        {(["ui","tune"] as const).map(group => <Button key={group} size="sm" disabled={!!editing} aria-pressed={kind === group}
          variant={kind === group ? "secondary" : "ghost"} onClick={() => { setKind(group); setSearch(""); setError(""); }}>{t("languageManager." + group)}</Button>)}
        <Input className="sm:ml-auto sm:w-64" disabled={!!editing} aria-label={t("languageManager.search")} placeholder={t("languageManager.search")} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {(error || loadError) && <div role="alert" className="text-destructive">{error || errorText(loadError)}</div>}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm"><thead className="bg-muted"><tr>
          <th scope="col" className="p-3">{t("languageManager.key")}</th>
          {columns.map(code => <th scope="col" className="p-3" key={code} lang={code}>{languageName(code)} <small className="block font-normal">{code}</small></th>)}
        </tr></thead><tbody>
        {visible.map(key => <tr key={key} className="border-t align-top">
          <th scope="row" className="max-w-56 break-words p-3 font-mono text-xs font-normal text-muted-foreground">{key}</th>
          {columns.map(code => {
            const cell = { locale: code, kind, key };
            const directValue = direct(code, key);
            const fallback = direct(US, key) ?? "";
            return <td className="min-w-40 p-1" key={code}>
              {editing && id(editing) === id(cell) ? <form onSubmit={saveCell} className="p-1 space-y-1">
                <Textarea autoFocus maxLength={8000} aria-label={key + " " + code} placeholder={base(code, key) ?? fallback} value={value} onChange={e => setValue(e.target.value)} />
                <Button size="xs" disabled={busy}>{t("menus.save")}</Button>
                <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => { setEditing(null); setError(""); }}>{t("menus.cancel")}</Button>
              </form> : <button type="button" disabled={!!editing || loading || !!loadError} lang={code} aria-label={key + " " + code}
                className="block w-full rounded p-2 text-left hover:bg-muted focus-visible:outline-ring disabled:cursor-default"
                onClick={() => { setEditing(cell); setValue(directValue ?? ""); setError(""); }}>
                  {directValue ?? <span className="text-muted-foreground italic" title={t("languageManager.fallback")}>{fallback || "—"}</span>}
                </button>}
            </td>;
          })}
        </tr>)}
        </tbody></table>
        {!visible.length && <p className="p-4 text-sm text-muted-foreground">{t(loading ? "languageManager.loading" : "languageManager.empty")}</p>}
      </div>
    </div>
  </section>;
}
