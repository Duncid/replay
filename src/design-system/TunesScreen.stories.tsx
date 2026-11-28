import { tuneCarouselItems } from "./tuneCardFixtures";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Menu, Timer } from "lucide-react";
import { PianoInput } from "@/components/PianoInput";
import { KeyboardSettings, type DisplayNotesPreference } from "@/components/KeyboardSettings";
import { HighwayProvider } from "@/components/highway/HighwayContext";
import { PianoDock } from "@/components/highway/PianoDock";
import type { PianoSoundType } from "@/hooks/usePianoSound";
import Piano from "@/components/Piano";
import { TuneLibraryView } from "@/components/TuneLibraryView";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

function TunesScreen({ connected = false, live = false }: { connected?: boolean; live?: boolean }) {
  const [instrument, setInstrument] = useState<PianoSoundType>("classic");
  const [displayNotes, setDisplayNotes] = useState<DisplayNotesPreference>("auto");
  const showNoteRail = displayNotes === "always";
  const [midi, setMidi] = useState(connected);
  const [mic, setMic] = useState(live);
  const [silent, setSilent] = useState(false);
  const [onKeyboard, setOnKeyboard] = useState(false);
  return <HighwayProvider fullKeyboard={false}><main className="h-dvh min-h-[600px] flex flex-col bg-background">
    <div className="flex-1 min-h-0 overflow-auto">
      <TuneLibraryView tunes={tuneCarouselItems} refetch={() => {}} onSelectTune={() => {}} />
    </div>
    <PianoDock showNoteRail={showNoteRail} midiConnected={midi} toolbar={<div className="keyboard-toolbar flex flex-wrap items-center justify-between gap-2 p-1.5 shrink-0">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="Menu"><Menu /></Button><KeyboardSettings instrument={instrument} onInstrumentChange={setInstrument} displayNotes={displayNotes} onDisplayNotesChange={setDisplayNotes} />
          <label className="flex items-center gap-2"><Timer aria-label="Metronome" className="size-4" /><Switch aria-label="Metronome enabled" defaultChecked /></label></div>
        <PianoInput micEnabled={mic} onMicEnabledChange={setMic} micStatus="running" micLevel={.35}
          isConnected={midi} deviceName={midi ? "Digital Piano" : null} attemptedNoDevice={false} isSupported
          onConnect={() => setMidi(true)} onDisconnect={() => setMidi(false)} silentWhilePlaying={silent}
          onSilentWhilePlayingChange={setSilent} playOnKeyboard={onKeyboard} onPlayOnKeyboardChange={setOnKeyboard} canPlayOnKeyboard />
      </div>}>
      <div className="keyboard-panel">
        <Piano showNoteRail={showNoteRail} className="min-h-0" activeKeys={new Set(["G3", "A#3", "D5"])} allowInput soundType={instrument} language="en" notationPreference="abc" />
      </div>
    </PianoDock>
  </main></HighwayProvider>;
}
const meta = { title: "Patterns/Tunes screen", component: TunesScreen, parameters: { edgeToEdge: true, docs: { story: { inline: false, height: 720 }, description: { component: "Production tune-library view, controls and piano with local fixtures. MIDI and microphone controls demonstrate styling only; they never activate devices. The piano uses the local Patch sound on interaction. Choose a palette in the Storybook toolbar." } } } } satisfies Meta<typeof TunesScreen>;
export default meta;
export const Library: StoryObj<typeof meta> = {};
export const LiveConnections: StoryObj<typeof meta> = { args: { connected: true, live: true } };
