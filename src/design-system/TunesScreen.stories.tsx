import { tuneCarouselItems } from "./tuneCardFixtures";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Menu, ChevronDown, Timer, Mic, KeyboardMusic } from "lucide-react";
import Piano from "@/components/Piano";
import { TuneLibraryView } from "@/components/TuneLibraryView";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function TunesScreen({ connected = false, live = false }: { connected?: boolean; live?: boolean }) {
  const [full, setFull] = useState(false);
  return <main className="h-dvh min-h-[600px] flex flex-col bg-background">
    <header className="flex items-center justify-between p-2">
      <div className="flex gap-2 items-center"><Button variant="ghost" size="icon" aria-label="Menu"><Menu /></Button>
        <Tabs value="tunes"><TabsList><TabsTrigger value="tunes">Tunes</TabsTrigger><TabsTrigger value="compose">Compose</TabsTrigger></TabsList></Tabs></div>
    </header>
    <div className="flex-1 min-h-0 overflow-auto">
      <TuneLibraryView tunes={tuneCarouselItems} refetch={() => {}} onSelectTune={() => {}} />
    </div>
    <div className="keyboard-panel shrink-0 flex flex-col">
      <div className="keyboard-toolbar flex flex-wrap items-center justify-between gap-2 p-1.5 shrink-0">
        <div className="flex items-center gap-3"><Button variant="outline" size="sm">Acoustic Piano <ChevronDown /></Button>
          <label className="flex items-center gap-2"><Timer aria-label="Metronome" className="size-4" /><Switch aria-label="Metronome enabled" defaultChecked /></label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={full} onCheckedChange={setFull} />Full keyboard</label></div>
        <div className="flex gap-2"><Button variant={live ? "live" : "outline"} size="sm"><Mic />{live && <span aria-hidden className="size-[7px] rounded-full bg-ai" />}{live ? "Mic on" : "Mic off"}</Button>
          <Button variant={connected ? "connected" : "outline"} size="sm"><KeyboardMusic />{connected ? "MIDI connected" : "Connect MIDI"}</Button></div>
      </div>
      <Piano className="flex-1 min-h-0" activeKeys={new Set(["G3", "A#3", "D5"])} allowInput soundType="classic" language="en" notationPreference="abc" fullKeyboard={full} />
    </div>
  </main>;
}
const meta = { title: "Patterns/Tunes screen", component: TunesScreen, parameters: { edgeToEdge: true, docs: { story: { inline: false, height: 720 }, description: { component: "Production tune-library view, controls and piano with local fixtures. MIDI and microphone controls demonstrate styling only; they never activate devices. The piano uses the local Patch sound on interaction. Choose a palette in the Storybook toolbar." } } } } satisfies Meta<typeof TunesScreen>;
export default meta;
export const Library: StoryObj<typeof meta> = {};
export const LiveConnections: StoryObj<typeof meta> = { args: { connected: true, live: true } };
