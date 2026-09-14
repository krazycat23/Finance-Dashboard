import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * EDITORIAL PLATE
 * ---------------------------------------------------------------------------
 * The brand block that anchors a reporting page's masthead and the foot of the
 * navigation — the place a printed annual report sets its cover mark.
 *
 * It is drawn, not photographed: a ruled field and a concentric aperture, in
 * flat theme tokens with no gradient and no raster asset. The motif is chosen
 * to read as a printed mark rather than as an illustration — engraved ruling
 * and a struck circle are the vocabulary of a share certificate or a report
 * cover, and both re-tone with the theme rather than sitting on the page as a
 * foreign object.
 *
 * TO REPLACE WITH LICENSED PHOTOGRAPHY: pass `imageSrc` (and `imageAlt`). The
 * drawn mark is the fallback, the caption band and every consumer stay exactly
 * as they are, and no other component needs to change.
 */

interface EditorialPlateProps {
  children?: ReactNode;
  className?: string;
  /** Where the caption band sits within the plate. */
  align?: "top" | "bottom";
  /** Brand photography, when the client has supplied some. */
  imageSrc?: string;
  imageAlt?: string;
}

/** Concentric strokes of the aperture, outermost first. */
const APERTURE = [
  { r: 196, opacity: 0.16 },
  { r: 154, opacity: 0.26 },
  { r: 112, opacity: 0.42 },
];

/** The ruled field behind the mark, as y positions in the 600x400 viewBox. */
const RULES = [36, 62, 88, 114, 140, 166, 192, 218, 244, 270];

export function EditorialPlate({
  children, className, align = "bottom", imageSrc, imageAlt = "",
}: EditorialPlateProps) {
  const caption = children && (
    <div
      className="px-4 py-3 border-t-2 border-t-accent-warm"
      style={{ backgroundColor: "var(--plate-ink)", color: "var(--plate-ink-on)" }}
    >
      {children}
    </div>
  );

  return (
    <div
      className={cn("flex flex-col overflow-hidden min-w-0", className)}
      style={{ backgroundColor: "var(--plate-ground)" }}
    >
      {align === "top" && caption}

      <div className="relative flex-1 min-h-0">
        {imageSrc ? (
          <img src={imageSrc} alt={imageAlt} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 600 400"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 w-full h-full"
          >
            {/* Engraved ruling: the ground of a printed plate. */}
            <g stroke="var(--plate-ink)" strokeWidth="1" opacity="0.14">
              {RULES.map((y) => (
                <line key={y} x1="0" y1={y} x2="600" y2={y} />
              ))}
            </g>

            {/* The aperture, struck off the lower-right so it reads as a mark
                rather than as a centred target. */}
            <g fill="none" stroke="var(--plate-ink)" strokeWidth="1.25">
              {APERTURE.map((ring) => (
                <circle key={ring.r} cx="452" cy="304" r={ring.r} opacity={ring.opacity} />
              ))}
            </g>
            <circle cx="452" cy="304" r="70" fill="var(--plate-ink)" opacity="0.9" />
            <circle cx="452" cy="304" r="70" fill="none" stroke="var(--accent-warm)" strokeWidth="1.5" />

            {/* The baseline the mark stands on, running into the caption band. */}
            <rect x="0" y="356" width="600" height="44" fill="var(--plate-ink)" />
          </svg>
        )}
      </div>

      {align === "bottom" && caption}
    </div>
  );
}
