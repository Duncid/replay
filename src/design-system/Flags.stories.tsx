import type { Meta, StoryObj } from "@storybook/react-vite";
import { LanguageFlag } from "@/components/LanguageFlag";

const examples = [
  { locale: "en-US", label: "English (United States)" },
  { locale: "en-GB", label: "English (United Kingdom)" },
  { locale: "fr-FR", label: "Français (France)" },
  { locale: null, label: "Automatic (system)" },
  { locale: "de-DE", label: "Deutsch (unbundled flag)" },
];

const meta = {
  title: "Foundations/Flags",
  component: LanguageFlag,
  args: { locale: "en-US" },
  argTypes: {
    locale: {
      control: "select",
      options: examples.map(example => example.locale),
      description: "Locale for the bundled flag. Automatic and unbundled locales use the globe.",
    },
  },
  parameters: {
    docs: { description: { component: "Untitled UI rectangular flags, bundled locally at 24 × 16 px. Flags are decorative and always accompany a language label. Automatic and locales without a bundled flag use the globe." } },
  },
} satisfies Meta<typeof LanguageFlag>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Catalogue: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Language flags</h1>
        <p className="text-sm text-muted-foreground">Original country colors, with a language name alongside each flag.</p>
        <a href="https://www.untitledui.com/resources/flag-icons" target="_blank" rel="noreferrer"
          className="text-sm text-primary underline underline-offset-4">Untitled UI flag icons</a>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {examples.map(({ locale, label }) => (
          <li key={locale ?? "auto"} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <LanguageFlag locale={locale} />
            <span className="flex-1 text-sm">{label}</span>
            <code className="text-xs text-muted-foreground">{locale ?? "auto"}</code>
          </li>
        ))}
      </ul>
    </section>
  ),
};

export const Playground: Story = {
  render: ({ locale }) => (
    <div className="inline-flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <LanguageFlag locale={locale} />
      <span className="text-sm">{examples.find(example => example.locale === locale)?.label ?? locale}</span>
    </div>
  ),
};
