import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// No dedicated favicon asset exists anywhere in the original Shopify export (confirmed -- it was
// never configured on the original store either), and the one real brand asset that does exist
// (public/brand/logo.png) is a wide wordmark, not a square mark -- cropping it square would just
// show a cut-off text fragment. This uses only the site's own established real brand colors
// (fg/bg from tailwind.config.ts, the same black/white already used for every primary CTA button)
// and the store's own first initial, not a newly invented logo.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 600,
        }}
      >
        J
      </div>
    ),
    { ...size }
  );
}
