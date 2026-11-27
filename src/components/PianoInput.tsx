import { AudioLines, ChevronDown, KeyboardMusic, Mic, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

export interface PianoInputProps {
  micEnabled: boolean;
  onMicEnabledChange: (enabled: boolean) => void;
  micStatus?: string;
  micLevel?: number;
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

export function PianoInput({ micEnabled, onMicEnabledChange, micStatus, micLevel = 0,
  isConnected, deviceName, attemptedNoDevice, isSupported, onConnect, onDisconnect,
  silentWhilePlaying, onSilentWhilePlayingChange, playOnKeyboard, onPlayOnKeyboardChange,
  canPlayOnKeyboard }: PianoInputProps) {
  const { t } = useTranslation();
  const connecting = deviceName === "Connecting...";
  const midiConnected = isConnected && !!deviceName && deviceName !== "No devices" && !connecting;
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="sm" aria-label={t("piano.input")}>
        <AudioLines aria-hidden="true" />
        {t("piano.input")}
        {(micEnabled || midiConnected) && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
        <ChevronDown aria-hidden="true" className="size-4 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent side="top" align="end" className="w-72 max-w-[calc(100vw-1rem)] space-y-4" aria-label={t("piano.input")}>
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-3 text-sm font-medium cursor-pointer">
          <span className="flex items-center gap-2"><Mic aria-hidden="true" className="size-4" />{t("piano.microphone")}</span>
          <Switch checked={micEnabled} onCheckedChange={onMicEnabledChange} />
        </label>
        {micEnabled && <div className="space-y-1.5">
          <p role="status" className="text-xs text-muted-foreground">{t(micStatus === "running" ? "piano.listening" : "piano.startingMic")}</p>
          <div role="meter" aria-label={t("piano.inputLevel")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(1, micLevel)) * 100)} className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, micLevel)) * 100}%` }} />
          </div>
        </div>}
      </div>
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><KeyboardMusic aria-hidden="true" className="size-4" />MIDI</div>
        {!isSupported ? <p className="text-xs text-muted-foreground">{t("piano.midiUnsupported")}</p>
          : connecting ? <p role="status" className="text-xs text-muted-foreground">{t("piano.connecting")}</p>
          : midiConnected ? <>
            <p role="status" className="text-sm text-primary break-words">{deviceName}</p>
            <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
              <span>{t("piano.playOnKeyboard")}</span>
              <Switch checked={playOnKeyboard} onCheckedChange={onPlayOnKeyboardChange} disabled={!canPlayOnKeyboard} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
              <span>{t("piano.silentWhilePlaying")}</span>
              <Switch checked={silentWhilePlaying} onCheckedChange={onSilentWhilePlayingChange} />
            </label>
            <Button variant="outline" size="sm" className="w-full" onClick={onDisconnect}><Unplug aria-hidden="true" />{t("piano.disconnectMidi")}</Button>
          </> : <>
            {attemptedNoDevice && <p role="status" className="text-xs text-muted-foreground">{t("piano.noMidiDevice")}</p>}
            <Button variant="outline" size="sm" className="w-full" onClick={onConnect}>{t(attemptedNoDevice ? "piano.retryMidi" : "piano.connectMidi")}</Button>
          </>}
      </div>
    </PopoverContent>
  </Popover>;
}
