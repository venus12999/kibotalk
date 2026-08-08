import bg from "@/assets/kibo-bg.jpg";

/**
 * Blurred photographic backdrop the whole app floats on.
 * Fixed and non-interactive so glass panels can layer on top of it.
 */
export function AppBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        src={bg}
        alt=""
        width={1536}
        height={1024}
        className="absolute inset-0 size-full scale-110 object-cover blur-3xl"
      />
      {/* Warm gradient wash + soft vignette to keep glass panels readable. */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-soft/70 via-transparent to-accent/60" />
      <div className="absolute inset-0 bg-background/25 dark:bg-background/70" />
      <div className="absolute -top-32 -left-24 size-[38rem] rounded-full bg-primary/35 blur-3xl" />
      <div className="absolute -right-28 bottom-[-10rem] size-[34rem] rounded-full bg-accent-foreground/20 blur-3xl" />
    </div>
  );
}
