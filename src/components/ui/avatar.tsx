"use client";

import clsx from "clsx";

const palettes = [
  "from-[#ff9c8f] to-[#ffd18f]",
  "from-[#77d8c8] to-[#8ea5ff]",
  "from-[#f7a5de] to-[#ffbf9f]",
  "from-[#7ac6f1] to-[#86e5b6]",
  "from-[#c89cff] to-[#ff9ab3]",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({
  name = "Member",
  src,
  className,
}: {
  name?: string;
  src?: string | null;
  className?: string;
}) {
  const index =
    (name && name.length > 0 ? name.charCodeAt(0) : 0) % palettes.length;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={clsx(
          "inline-block h-12 w-12 rounded-full object-cover",
          className,
        )}
        aria-label={`${name} avatar`}
      />
    );
  }

  return (
    <div
      className={clsx(
        "flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white",
        palettes[index],
        className,
      )}
      aria-label={`${name} avatar`}
    >
      {initials(name)}
    </div>
  );
}
