import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Renders public/img/logo.png (512x512 master) as a square PNG of the given
 * size. Shared by the App Router `icon` and `apple-icon` metadata routes.
 */
export async function renderBrandIcon(size: number, background = "transparent") {
  const logo = await readFile(join(process.cwd(), "public/img/logo.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={src} width={size} height={size} />
      </div>
    ),
    { width: size, height: size },
  );
}
