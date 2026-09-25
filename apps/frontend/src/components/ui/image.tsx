/**
 * ui/image — Next.js optimised image wrapper.
 *
 * Wraps `next/image` so components throughout the codebase can import from
 * "@/components/ui/image" without knowing the underlying implementation, while
 * still getting automatic resizing, lazy loading, and responsive srcsets.
 *
 * Replaces the previous plain-<img> implementation (issue #79).
 *
 * Props accepted by this wrapper:
 *   src        — required.  URL string (local or remote).
 *   alt        — image description (defaults to empty string for decorative use).
 *   className  — CSS class forwarded to the <img> element produced by Next.
 *   width      — intrinsic width in pixels (optional; enables static layout).
 *   height     — intrinsic height in pixels (optional; enables static layout).
 *   fill       — when true the image fills its positioned parent (takes priority
 *               over width/height).
 *   priority   — set true for above-the-fold / LCP images to disable lazy loading.
 *   sizes      — responsive sizes hint forwarded to Next's srcset generation.
 *
 * When neither `fill` nor explicit `width`/`height` are supplied, the wrapper
 * defaults to `fill` so that the common "card thumbnail" usage continues to work
 * without changes at call sites (same behaviour as the previous wrapper that
 * stretched the img to its container via "w-full h-full object-cover").
 */
import NextImage from "next/image";

interface ImageProps {
  src: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
}

export default function Image({
  src,
  alt = "",
  className,
  width,
  height,
  fill,
  priority = false,
  sizes,
}: ImageProps) {
  // If the caller supplied explicit dimensions or fill mode, honour them.
  // Otherwise default to fill so the image continues to cover its container.
  const useFill = fill ?? (width === undefined && height === undefined);

  if (useFill) {
    return (
      <NextImage
        src={src}
        alt={alt}
        fill
        className={className}
        priority={priority}
        sizes={sizes ?? "100vw"}
      />
    );
  }

  return (
    <NextImage
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      sizes={sizes}
    />
  );
}
