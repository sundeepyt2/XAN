import { redirect } from "next/navigation";

// /bookmarks → /list (merged into My Library page)
export default function BookmarksRedirect() {
  redirect("/list");
}
