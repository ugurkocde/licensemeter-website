const TONES = [
  "bg-brand-soft text-brand-deep",
  "bg-gold-soft text-gold-text",
  "bg-teal-soft text-teal-ink",
  "bg-plum-soft text-plum",
  "bg-slate-soft text-slate-ink",
  "bg-moss-soft text-moss",
] as const;

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
};

const toneOf = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length]!;
};

/** Initials tile for a workspace or a person; colour is stable per name. */
export const InitialsAvatar = ({
  name,
  className = "size-9 text-xs",
}: {
  name: string;
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={`flex shrink-0 items-center justify-center rounded-[10px] font-semibold tracking-wide select-none ${toneOf(name)} ${className}`}
  >
    {initialsOf(name)}
  </span>
);
