import type { Metadata } from "next";

// A page-level openGraph replaces the root one, file-based share image included, so name the image again.
export function publicPage(path: string): Pick<Metadata, "alternates" | "openGraph"> {
  return {
    alternates: { canonical: path },
    openGraph: {
      url: path,
      images: {
        url: "/opengraph-image.png",
        type: "image/png",
        width: 1200,
        height: 630,
        alt: "SocialReins: every social account, one set of reins. Open-source social media manager.",
      },
    },
  };
}
