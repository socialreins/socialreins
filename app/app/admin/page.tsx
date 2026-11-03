import { redirect } from "next/navigation";

// The admin pages moved to their own console.
export default function OldAdmin() {
  redirect("/admin/waitlist");
}
