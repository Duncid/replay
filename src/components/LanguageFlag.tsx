import { Globe } from "lucide-react";

/** Decorative flag: the surrounding control supplies the language name. */
export function LanguageFlag({ locale }: { locale: string | null }) {
  const country = locale && ({ "en-US": "US", "en-GB": "GB", "fr-FR": "FR" } as Record<string, string>)[locale];
  return country ? <img src={`/flags/${country}.svg`} alt="" aria-hidden="true" className="h-4 w-6 shrink-0 rounded-[2px] object-cover" />
    : <Globe aria-hidden="true" className="h-4 w-6 shrink-0" />;
}
