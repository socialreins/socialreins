import { connection } from "next/server";
import { indexNowKey } from "@/lib/indexnow";

// The IndexNow key file: search engines fetch it to check that a ping for this host came from its owner.
export async function GET() {
  await connection();
  const key = indexNowKey();
  if (!key) return new Response("Not found\n", { status: 404 });
  return new Response(`${key}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
