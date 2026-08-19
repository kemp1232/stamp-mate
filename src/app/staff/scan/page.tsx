import { redirect } from "next/navigation";

// The scanner now lives directly on /staff — this route just catches
// anyone with the old URL bookmarked or saved as a home-screen shortcut.
export default function StaffScanRedirect() {
  redirect("/staff");
}
