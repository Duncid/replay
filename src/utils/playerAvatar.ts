import { Avatar, Style } from "@dicebear/core";
import clay from "@dicebear/styles/clay.json";
import palettes from "@/design-system/palettes.json";

// Keep the generator version and palette stable so saved avatars stay recognizable.
export const AVATAR_COLORS = ["C", "D", "E", "G", "A", "B"] as const;
export type AvatarColor = typeof AVATAR_COLORS[number];
export interface PlayerAvatarValue {
  seed: string;
  color: AvatarColor;
}

const style = new Style(clay);

export function getPlayerAvatar(player: { id: string; avatar_seed?: string | null; avatar_color?: string | null }): PlayerAvatarValue {
  const hash = Array.from(player.id).reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 0);
  return {
    seed: player.avatar_seed || player.id,
    color: AVATAR_COLORS.includes(player.avatar_color as AvatarColor)
      ? player.avatar_color as AvatarColor : AVATAR_COLORS[hash % AVATAR_COLORS.length],
  };
}

export function newPlayerAvatar(): PlayerAvatarValue {
  return { seed: crypto.randomUUID(), color: "A" };
}

export function avatarNoteColor(color: AvatarColor): string {
  return palettes.acid[`note-${color.toLowerCase()}` as keyof typeof palettes.acid];
}

export function playerAvatarSource({ seed, color }: PlayerAvatarValue): string {
  const body = avatarNoteColor(color);
  const accent = palettes.acid[`note-${color.toLowerCase()}-active` as keyof typeof palettes.acid];
  const background = "#" + [1, 3, 5].map(offset =>
    Math.round(parseInt(body.slice(offset, offset + 2), 16) * 0.14 + 255 * 0.86).toString(16).padStart(2, "0")
  ).join("");
  const avatar = new Avatar(style, {
    seed, size: 160, borderRadius: 50, animationProbability: 0,
    bodyColor: [body], accentColor: [accent], backgroundColor: [background],
    inkColor: [palettes.acid["note-ink"]],
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatar.toString())}`;
}
