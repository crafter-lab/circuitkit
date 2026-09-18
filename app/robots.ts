import type { MetadataRoute } from "next";
import { siteOrigin } from "./agent-content.ts";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteOrigin}/sitemap.xml` };
}
