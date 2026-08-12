import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** 0–1 mic / speech energy. */
  level?: number;
  /** Speaking / capturing — sphere starts floating + morphing. */
  active?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
};

const sizeClass = {
  sm: "voice-sphere-sm",
  md: "voice-sphere-md",
  lg: "voice-sphere-lg",
  xl: "voice-sphere-xl",
} as const;

/**
 * Round yellow sphere (same language as home). Idle stays circular;
 * when `active` / speech level rises it floats and gently morphs.
 */
export function VoiceCloud({
  level = 0,
  active = false,
  className,
  size = "lg",
}: Props) {
  const amp = Math.min(1, Math.max(0, level));
  const speaking = active || amp > 0.2;
  return (
    <div
      aria-hidden
      className={cn(
        "voice-sphere",
        sizeClass[size],
        speaking && "voice-sphere-speaking",
        className,
      )}
      style={{ "--voice-level": String(amp) } as CSSProperties}
    >
      <span className="voice-sphere-glow" />
      <span className="voice-sphere-ball">
        <span className="voice-sphere-wave">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
    </div>
  );
}
