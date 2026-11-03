import { redirect } from "next/navigation";

// The waitlist is the console's only page so far.
export default function AdminHome() {
  redirect("/admin/waitlist");
}
