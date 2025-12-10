import { Button } from "@/components/ui/button";
import { KeyboardMusic, Unplug, AlertCircle } from "lucide-react";

interface MidiConnectorProps {
  isConnected: boolean;
  deviceName: string | null;
  error: string | null;
  isSupported: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const MidiConnector = ({
  isConnected,
  deviceName,
  error,
  isSupported,
  onConnect,
  onDisconnect,
}: MidiConnectorProps) => {
  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="w-4 h-4" />
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
        <Button variant="ghost" size="sm" onClick={onDisconnect} className="gap-2 h-8">
          <Unplug className="w-4 h-4" />
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="sm" onClick={onConnect} className="gap-2 h-8">
        <KeyboardMusic className="w-4 h-4" />
        Connect MIDI
      </Button>
      {error && (
        <div className="text-xs text-destructive flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
