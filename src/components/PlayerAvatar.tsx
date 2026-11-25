import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { playerAvatarSource, type PlayerAvatarValue } from "@/utils/playerAvatar";

export function PlayerAvatar({ avatar, className, alt = "" }: {
  avatar: PlayerAvatarValue;
  className?: string;
  alt?: string;
}) {
  const { seed, color } = avatar;
  const src = useMemo(() => playerAvatarSource({ seed, color }), [seed, color]);
  return <img src={src} alt={alt} width={160} height={160} className={cn("h-8 w-8 shrink-0 rounded-full", className)} />;
}
