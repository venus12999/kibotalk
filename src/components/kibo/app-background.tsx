import { cn } from "@/lib/utils";

type Props = {
  /** Soft rendered wash so frosted glass can show color through. */
  pale?: boolean;
};

/**
 * Soft “rendered” atmosphere — cream base + blurred yellow / peach / cool
 * light blobs (reference mock). Not a flat wash; glass panels need this depth.
 */
export function AppBackground({ pale = true }: Props) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className={cn("absolute inset-0", pale ? "bg-[oklch(98.5%_0.006_95)]" : "bg-background")} />

      {/* Soft cool veil — faint sky tint like the desktop mock */}
      <div className="absolute -top-24 right-[-10%] size-[42rem] rounded-full bg-[oklch(92%_0.03_230_/0.45)] blur-3xl" />
      <div className="absolute top-[18%] left-[-15%] size-[36rem] rounded-full bg-[oklch(96%_0.04_95_/0.7)] blur-3xl" />

      {/* Warm rendered yellow / peach light */}
      <div className="absolute top-[-8%] left-[20%] size-[28rem] rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute right-[-5%] top-[35%] size-[32rem] rounded-full bg-[oklch(88%_0.12_75_/0.35)] blur-3xl" />
      <div className="absolute bottom-[-18%] left-[10%] size-[40rem] rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-[8%] right-[18%] size-[22rem] rounded-full bg-[oklch(94%_0.05_55_/0.5)] blur-3xl" />

      {/* Center bloom so the cloud/orb sits in light */}
      <div className="absolute top-[28%] left-1/2 size-[26rem] -translate-x-1/2 rounded-full bg-[oklch(100%_0_0_/0.55)] blur-3xl" />

      {/* Subtle film so text stays readable without killing color */}
      <div className="absolute inset-0 bg-[oklch(100%_0_0_/0.18)]" />
    </div>
  );
}
