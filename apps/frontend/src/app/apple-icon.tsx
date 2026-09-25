import { renderBrandIcon } from "@/lib/metadata/brand-icon";
import { BRAND_BACKGROUND_COLOR } from "@/lib/metadata/site";

// Apple touch icon — Issue #170
//
// iOS ignores SVG touch icons and renders transparency as black, so this
// serves an opaque 180x180 PNG for home-screen bookmarks.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderBrandIcon(size.width, BRAND_BACKGROUND_COLOR);
}
