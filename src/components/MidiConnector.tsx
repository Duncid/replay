import { Button } from "@/components/ui/button";
import { AlertCircle, KeyboardMusic, Unplug } from "lucide-react";

interface MidiConnectorProps {
  isConnected: boolean;
  deviceName: string | null;
  isSupported: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const MidiConnector = ({
  isConnected,
  deviceName,
  isSupported,
  onConnect,
  onDisconnect,
}: MidiConnectorProps) => {
  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle />
        <span>MIDI not supported in this browser</span>
      </div>
    );
  }

  if (isConnected && deviceName) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-foreground font-medium">{deviceName}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          className="gap-2"
        >
          <Unplug />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onConnect}>
      <KeyboardMusic />
      Connect MIDI
    </Button>
  );
};
