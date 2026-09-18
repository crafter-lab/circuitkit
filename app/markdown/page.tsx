import { redirect } from "next/navigation";

export default function MarkdownPage() {
  redirect("/editor?mode=circuitkit");
}
