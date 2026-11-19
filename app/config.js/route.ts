import { connection } from "next/server";
import { brainUrl } from "@/lib/brain-url";
import { gaId } from "@/lib/ga";

// Hands brain's URL (and the GA4 id, null when analytics is off) to the browser at request time; the root layout loads this before any app code.
export async function GET() {
  await connection();
  return new Response(`window.__BRAIN_URL = ${JSON.stringify(brainUrl())};\nwindow.__GA_ID = ${JSON.stringify(gaId())};\n`, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}
