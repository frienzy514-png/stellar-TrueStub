import { renderBrandIcon } from "@/lib/metadata/brand-icon";

// App icon — Issue #170
//
// Generates /icon/32, /icon/192 and /icon/512 from public/img/logo.png so
// browsers pick up a real TrueStub icon (tab, bookmarks) and the web app
// manifest (src/app/manifest.ts) has PWA-sized icons to point at.

export const contentType = "image/png";

const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType,
  }));
}

export default async function Icon({ id }: { id: string }) {
  const size = Number(id) || 32;
  return renderBrandIcon(size);
}
