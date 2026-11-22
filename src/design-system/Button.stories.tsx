import type { Meta, StoryObj } from "@storybook/react-vite";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const meta = { title: "Actions/Button", component: Button, args: { children: "Start practice" }, argTypes: { variant: { control: "select", options: ["default", "secondary", "outline", "ghost", "destructive", "link", "connected", "live"] }, size: { control: "select", options: ["default", "sm", "xs", "lg", "icon", "play"] }, onClick: { action: "pressed" } } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Outline: Story = { args: { variant: "outline" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Destructive: Story = { args: { variant: "destructive", children: "Delete tune" } };
export const Disabled: Story = { args: { disabled: true, children: "Complete Intro first" } };
export const Playback: Story = { args: { size: "play", "aria-label": "Play demo", children: <Play aria-hidden /> } };
export const Sizes: Story = { render: () => <div className="flex flex-wrap items-center gap-4">{(["xs", "sm", "default", "lg"] as const).map(size => <Button key={size} size={size}>{size}</Button>)}</div> };

export const Connected: Story = { args: { variant: "connected", children: "MIDI connected" } };
export const Live: Story = { args: { variant: "live", children: <> <span aria-hidden className="size-[7px] rounded-full bg-ai" />Mic on</> } };
