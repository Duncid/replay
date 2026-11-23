import { useHighwayTopBleed } from "@/components/highway/useHighwayTopBleed";
import { PianoDock } from "@/components/highway/PianoDock";
import { useSheetPlaybackEngine } from "@/hooks/useSheetPlaybackEngine";
import { noteNameToMidi } from "@/utils/noteSequenceUtils";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Piano from "@/components/Piano";
import { NoteHighway } from "@/components/highway/NoteHighway";
import { HighwayProvider, useHighway } from "@/components/highway/HighwayContext";
import type { HighwayNote } from "@/components/highway/model";
import { midiToNoteName } from "@/utils/noteSequenceUtils";

const TUNE: Array<[number, number, number, "user" | "ai"]> = [
  [60,0,1,"user"],[62,1,1,"user"],[64,2,1,"user"],[65,3,1,"user"],[67,4,2,"user"],
  [48,4,2,"ai"],[55,4,2,"ai"],[64,6,1,"user"],[67,7,1,"user"],[69,8,1,"user"],
  [67,9,1,"user"],[64,10,2,"user"],[57,8,2,"ai"],[52,10,2,"ai"],[66,12,1,"user"],
  [67,13,1,"user"],[62,14,2,"user"],[50,12,2,"ai"],[55,14,2,"ai"],
];
type Props = { playing: boolean; beat: number; fullKeyboard: boolean; waiting: boolean; width: number; height: number; gated?: boolean; midiConnected?: boolean; behindTopUI?: boolean };
function Instrument({ playing, beat, fullKeyboard, waiting, height, gated = false, midiConnected = false, behindTopUI = false }: Props) {
  const { stageRef, topBleed } = useHighwayTopBleed(behindTopUI);
  const { setGuidance, registerScroll, syncScroll, bottomOcclusion } = useHighway();
  const clock = useRef(beat);
  const originRef = useRef(performance.now());
  const getBeat = () => gated ? playback.playheadTimeRef.current * 2 : playing ? (beat + (performance.now() - originRef.current) / 500) % 16 : beat;
  const [activeKeys, setActiveKeys] = useState(new Set<string>());
  const [userKeys, setUserKeys] = useState(new Set<string>());
  const [nowLabel, setNowLabel] = useState(beat);
  const notes = useMemo<HighwayNote[]>(() => {
    const result = TUNE.map(([midi,start,duration,who], i): HighwayNote => ({ id: String(i), midi,start,duration,who,
      judgment: !playing && !waiting && who === "user" && start <= beat ? (start === 8 ? "miss" : start === 2 ? "late" : "perfect") : undefined }));
    if (waiting) result.push({ id: "chord", midi: 64, start: 4, duration: 2, who: "user" });
    return result;
  }, [playing, beat, waiting]);
  const gateNotes = useMemo(() => notes.filter(n => n.who === "user").map(n => ({ id: n.id, midi: n.midi, start: n.start / 2, dur: n.duration / 2 })), [notes]);
  const playback = useSheetPlaybackEngine({ notes: gateNotes, enabled: gated });
  useEffect(() => {
    clock.current = beat;
    const origin = performance.now(); originRef.current = origin;
    let last = "", lastUser = "";
    const tick = () => {
      clock.current = playing ? (beat + (performance.now()-origin)/500) % 16 : beat;
      const keys = notes.filter(n => n.who === "ai" && clock.current >= n.start && clock.current < n.start+n.duration).map(n => midiToNoteName(n.midi));
      const key = keys.join(","); if (key !== last) { last = key; setActiveKeys(new Set(keys)); }
      const users = notes.filter(n => n.who === "user" && (playing || n.judgment) && n.judgment !== "miss" && clock.current >= n.start && clock.current < n.start+n.duration).map(n => midiToNoteName(n.midi));
      const userKey = users.join(","); if (userKey !== lastUser) { lastUser = userKey; setUserKeys(new Set(users)); }
      setNowLabel(Math.floor(clock.current * 10)/10);
    };
    tick(); const timer = setInterval(tick, 100); return () => clearInterval(timer);
  }, [playing, beat, notes]);
  const onArmedChange = useCallback((armed: number[]) => setGuidance({ armed, range: [48,69] }), [setGuidance]);
  return <>
    <div className={`relative z-20 flex justify-between gap-3 p-3 font-mono text-xs ${behindTopUI ? "highway-top-header" : ""}`}><span>NOTE HIGHWAY · 120 BPM</span><span>{waiting ? "WAITING FOR CHORD" : playing ? "PLAYING" : "PAUSED"} · BEAT {nowLabel}</span></div>
    <div ref={stageRef} className="relative" style={{ height: height + (midiConnected ? 103 : 0) }}>
    {behindTopUI && <div className="highway-top-chrome absolute right-3 top-3 z-10 max-w-[240px] rounded-xl border border-border p-3 text-sm">Follow the falling notes. The highway continues behind these controls.</div>}
    <div className="note-highway-viewport absolute inset-0" style={{ top: -topBleed, bottom: -bottomOcclusion }} ref={node => registerScroll(node, "highway")} onScroll={e => syncScroll(e.currentTarget)}>
      <div className={fullKeyboard ? "h-full min-w-[1040px]" : "h-full"}>
        <NoteHighway bottomOcclusion={bottomOcclusion} notes={notes} fullKeyboard={fullKeyboard} range={[48,69]} onArmedChange={onArmedChange}
          transport={{ getBeat, getArmed: gated && playback.phase === "waiting" ? () => playback.focusedNoteIds : undefined, getActive: () => new Set(playing ? notes.filter(n => n.who === "user" && n.start <= getBeat() && n.start+n.duration > getBeat()).map(n => n.id) : []), getState: () => (gated && playback.phase === "waiting") || waiting ? "waiting" : playing ? "playing" : "paused", resetId: `${beat}-${playing}-${waiting}` }} />
      </div>
    </div>
    </div>
    <PianoDock midiConnected={midiConnected} keyboardHeight={260} toolbar={<div className="keyboard-toolbar flex items-center justify-between gap-2 p-3 font-mono text-xs"><span>CLASSIC PIANO</span><span>120 BPM · {fullKeyboard ? "88 KEYS" : "COMPACT"}</span></div>}><div className="keyboard-panel"><Piano userActiveKeys={userKeys} activeKeys={activeKeys} allowInput language="en" notationPreference="abc" fullKeyboard={fullKeyboard}
      onNoteStart={gated ? key => playback.handleInputEvent({ type: "noteon", midi: noteNameToMidi(key), timeMs: performance.now() }) : undefined}
      onNoteEnd={gated ? key => playback.handleInputEvent({ type: "noteoff", midi: noteNameToMidi(key), timeMs: performance.now() }) : undefined} /></div></PianoDock>
  </>;
}
function HighwayExample(props: Props) {
  return <div data-highway-surface className="relative isolate" style={{ width: props.width, maxWidth: "100%" }}><HighwayProvider fullKeyboard={props.fullKeyboard}><Instrument {...props} /></HighwayProvider></div>;
}
const meta = {
  title: "Instruments/Note Highway", component: HighwayExample,
  args: { playing: true, beat: 0, fullKeyboard: false, waiting: false, width: 1100, height: 360 },
  parameters: { docs: { description: { component: "Production Pixi Note Highway and playable piano share pitch geometry and horizontal scrolling. Time and judgments belong to the playback engine. Solid = player; outline = bot; ring + beam = next chord; lime hit line = now, above the fixed piano toolbar. Notes continue under the shared blurred toolbar and rail backdrop, fading into the opaque keyboard edge. In practice the canvas also extends to the workspace top behind the header, transport and coaching UI. Layout-only measurements preserve the hit line above the piano while providing more visible approach distance. The main header is fully transparent without tint or blur; transport, coaching and the piano dock retain their blur. Controls remain interactive; the blurred surfaces use an opaque reduced-transparency fallback. Waiting practice freezes at the unresolved chord without timing grades. Range dimming affects the rail and columns only. Reduced motion removes sparks and rising feedback. The native catalog uses the same visual contract with independent SpriteKit rendering." } } },
} satisfies Meta<typeof HighwayExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playing: Story = {};
export const Paused: Story = { args: { playing: false, beat: 3.5 } };
export const WaitingForChord: Story = { args: { playing: false, beat: 4, waiting: true } };
export const PerfectAndBot: Story = { args: { playing: false, beat: 4.12 } };
export const MissAndNext: Story = { args: { playing: false, beat: 8.2 } };
export const FullKeyboard: Story = { args: { playing: false, beat: 4.12, fullKeyboard: true, width: 800 } };
export const Compact: Story = { args: { playing: false, beat: 8.2, width: 600, height: 280 } };

export const GatedPractice: Story = { args: { playing: false, beat: 0, gated: true, waiting: true } };

export const MidiConnected: Story = { args: { playing: false, beat: 4.12, midiConnected: true } };

export const BehindTopUI: Story = { args: { playing: false, beat: 4.12, behindTopUI: true } };
