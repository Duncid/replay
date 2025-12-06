import { MidiConnector } from "@/components/MidiConnector";
import { AskButton } from "@/components/AskButton";

interface TopBarProps {
  midiConnected: boolean;
  midiDeviceName: string | null;
  midiError: string | null;
  midiSupported: boolean;
  onMidiConnect: () => void;
  onMidiDisconnect: () => void;
  onAskSubmit: (prompt: string, model: string) => Promise<void>;
  askDisabled: boolean;
}

export const TopBar = ({
  midiConnected,
  midiDeviceName,
  midiError,
  midiSupported,
  onMidiConnect,
  onMidiDisconnect,
  onAskSubmit,
  askDisabled,
}: TopBarProps) => {
  return (
    <header className="w-full flex items-center justify-between px-4 py-2 bg-card border-b border-border">
      <h1 className="text-lg font-semibold text-foreground">Piano AI</h1>
      <div className="flex items-center gap-3">
        <MidiConnector
          isConnected={midiConnected}
          deviceName={midiDeviceName}
          error={midiError}
          isSupported={midiSupported}
          onConnect={onMidiConnect}
          onDisconnect={onMidiDisconnect}
        />
        <AskButton 
          onAskSubmit={onAskSubmit}
          disabled={askDisabled}
        />
      </div>
    </header>
  );
};
