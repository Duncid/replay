import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** One entry per primitive so each control is findable by name in the sidebar. */
const meta = { title: "Components/Primitives" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SwitchToggle: Story = { name: "Switch (toggle)", render: function S() {
  const [on, setOn] = useState(true);
  return <div className="space-y-4">
    <div className="flex items-center gap-3"><Switch id="s1" checked={on} onCheckedChange={setOn} /><Label htmlFor="s1">{on ? "On" : "Off"}</Label></div>
    <div className="flex items-center gap-3"><Switch id="s2" disabled /><Label htmlFor="s2">Disabled off</Label></div>
    <div className="flex items-center gap-3"><Switch id="s3" disabled checked /><Label htmlFor="s3">Disabled on</Label></div>
  </div>; } };
export const SliderControl: Story = { name: "Slider", render: function S() {
  const [v, setV] = useState([60]);
  return <div className="max-w-sm space-y-3"><Label id="sl">Value · {v[0]}</Label><Slider aria-labelledby="sl" value={v} onValueChange={setV} /></div>; } };
export const SelectControl: Story = { name: "Select", render: () => <div className="max-w-xs"><Select defaultValue="a"><SelectTrigger aria-label="Choice"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a">Option A</SelectItem><SelectItem value="b">Option B</SelectItem><SelectItem value="c" disabled>Disabled</SelectItem></SelectContent></Select></div> };
export const InputField: Story = { name: "Input", render: () => <div className="max-w-sm space-y-3"><Label htmlFor="i1">Name</Label><Input id="i1" placeholder="Type here" /><Input aria-label="Disabled" disabled placeholder="Disabled" /></div> };
export const TextareaField: Story = { name: "Textarea", render: () => <div className="max-w-sm space-y-2"><Label htmlFor="t1">Notes</Label><Textarea id="t1" placeholder="Longer text" /></div> };
export const Badges: Story = { name: "Badge", render: () => <div className="flex gap-2"><Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge><Badge variant="destructive">Destructive</Badge></div> };
export const CardSurface: Story = { name: "Card", render: () => <Card className="max-w-sm"><CardHeader><CardTitle>Card title</CardTitle><CardDescription>Supporting description</CardDescription></CardHeader><CardContent>Card body content.</CardContent></Card> };
