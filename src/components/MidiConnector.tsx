import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { AlertCircle, KeyboardMusic, Unplug, MoreHorizontal } from "lucide-react";

interface MidiConnectorProps {
  isConnected: boolean;
  deviceName: string | null;
  attemptedNoDevice: boolean;
  isSupported: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  silentWhilePlaying: boolean;
  onSilentWhilePlayingChange: (value: boolean) => void;
  playOnKeyboard: boolean;
  onPlayOnKeyboardChange: (value: boolean) => void;
  canPlayOnKeyboard: boolean;
}

export const MidiConnector = ({
  isConnected,
  deviceName,
  attemptedNoDevice,
  isSupported,
  onConnect,
  onDisconnect,
  silentWhilePlaying, onSilentWhilePlayingChange,
  playOnKeyboard, onPlayOnKeyboardChange, canPlayOnKeyboard,
}: MidiConnectorProps) => {
  const { t } = useTranslation();
  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle />
        <span>MIDI not supported in this browser</span>
      </div>
    );
  }

  if (deviceName === "Connecting...") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (isConnected && deviceName && deviceName !== "No devices") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-foreground font-medium">{deviceName}</span>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("piano.midiSettings")}>
              <MoreHorizontal />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-64 space-y-4">
            <label className="flex items-center justify-between gap-4 text-sm cursor-pointer">
              <span>{t("piano.playOnKeyboard")}</span>
              <Switch checked={playOnKeyboard} onCheckedChange={onPlayOnKeyboardChange} disabled={!canPlayOnKeyboard} />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm cursor-pointer">
              <span>{t("piano.silentWhilePlaying")}</span>
              <Switch checked={silentWhilePlaying} onCheckedChange={onSilentWhilePlayingChange} />
            </label>
          </PopoverContent>
        </Popover>
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

  if (attemptedNoDevice) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 bg-red-500 rounded-full" />
          <span className="text-muted-foreground">No MIDI device</span>
        </div>
        <Button variant="outline" size="sm" onClick={onConnect}>
          <KeyboardMusic />
          Retry
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
