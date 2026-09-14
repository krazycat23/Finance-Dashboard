import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * EDITORIAL PLATE
 * ---------------------------------------------------------------------------
 * The masthead block that anchors the report's opening spread and the foot of
 * the navigation — the place a printed annual report would set a photograph.
 *
 * It is drawn, not photographed: flat bands of theme tokens, no gradient, no
 * raster asset and no third-party imagery to license or fail to load. Because
 * it is built from the same tokens as everything else, it re-tones with the
 * theme rather than sitting on the page as a foreign object — forest and stone
 * in Sand, charcoal and bronze in Obsidian.
 *
 * It always carries content. A plate with nothing to say is decoration; a plate
 * carrying the reporting context is the cover of the pack.
 */

interface EditorialPlateProps {
  children?: ReactNode;
  className?: string;
  /** Where the overlaid content sits within the plate. */
  align?: "top" | "bottom";
}

export function EditorialPlate({ children, className, align = "top" }: EditorialPlateProps) {
  return (
    <div className={cn("relative overflow-hidden bg-inset min-w-0", className)}>
      <svg
        aria-hidden
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        {/* Contour rules — the register marks of a printed plate. */}
        <g stroke="var(--border-default)" strokeWidth="1" opacity="0.5">
          <line x1="0" y1="54" x2="600" y2="54" />
          <line x1="0" y1="86" x2="430" y2="86" />
          <line x1="0" y1="118" x2="600" y2="118" />
          <line x1="0" y1="150" x2="360" y2="150" />
        </g>
        <path
          d="M0,238 L90,168 L150,202 L240,126 L330,192 L420,142 L510,198 L600,156 L600,400 L0,400 Z"
          fill="var(--fill-muted-strong)"
        />
        <path
          d="M0,282 L120,214 L200,258 L300,186 L390,248 L480,198 L600,264 L600,400 L0,400 Z"
          fill="var(--series-3)"
          opacity="0.85"
        />
        <path
          d="M0,330 L100,276 L190,318 L290,258 L380,310 L470,270 L600,322 L600,400 L0,400 Z"
          fill="var(--plate-ink)"
        />
      </svg>

      {/* Overlaid content sits on a solid band of the accent, never as light
          text washed over the artwork: a plate that cannot be read is a
          picture, and this one is carrying the reporting context. */}
      {children && (
        <div
          className={cn(
            "relative h-full flex flex-col",
            align === "bottom" ? "justify-end" : "justify-start",
          )}
        >
          <div
            className="px-4 py-3 border-t-2 border-t-accent-warm"
            style={{ backgroundColor: "var(--plate-ink)", color: "var(--plate-ink-on)" }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
