import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const meta = { title: "Inputs/Controls", parameters: { docs: { description: { component: "Use the existing Radix controls and semantic labels. This library deliberately has no second form or control framework." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const TextFields: Story = { render: () => <div className="max-w-sm space-y-5"><div className="space-y-2"><Label htmlFor="title">Tune title</Label><Input id="title" placeholder="Evening practice" /></div><div className="space-y-2"><Label htmlFor="notes">Practice notes</Label><Textarea id="notes" placeholder="What would you like to work on?" /></div><div className="space-y-2"><Label htmlFor="invalid-title">Required title</Label><Input id="invalid-title" aria-invalid="true" aria-describedby="title-error" className="border-destructive" /><p id="title-error" className="text-sm text-destructive">Enter a title to continue.</p></div><div className="space-y-2"><Label htmlFor="disabled-title">Published title</Label><Input id="disabled-title" value="Intro" disabled /></div></div> };
export const Settings: Story = { render: function Settings() { const [silent, setSilent] = useState(false); const [tempo, setTempo] = useState([90]); return <div className="max-w-sm space-y-8"><div className="flex items-center justify-between gap-4"><Label htmlFor="silent">Silent while I play</Label><Switch id="silent" checked={silent} onCheckedChange={setSilent} /></div><div className="space-y-3"><Label id="tempo-label">Tempo · {tempo[0]} BPM</Label><Slider aria-labelledby="tempo-label" value={tempo} onValueChange={setTempo} min={40} max={180} /></div><div className="space-y-2"><Label htmlFor="instrument">Instrument</Label><Select defaultValue="piano"><SelectTrigger id="instrument"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="piano">Acoustic piano</SelectItem><SelectItem value="classic">Classic</SelectItem><SelectItem value="keyboard" disabled>Keyboard · disconnected</SelectItem></SelectContent></Select></div></div>; } };
