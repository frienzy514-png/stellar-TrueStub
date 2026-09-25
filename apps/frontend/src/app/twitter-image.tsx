import OpenGraphImage from "./opengraph-image";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata/site";

// Default Twitter/X card image — Issue #173. Same artwork as opengraph-image.

export const alt = `${SITE_NAME} — ${SITE_DESCRIPTION}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default OpenGraphImage;
