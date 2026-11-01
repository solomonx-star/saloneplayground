import type { Metadata } from "next";
import AdminLoader from "@/components/admin/AdminLoader";

export const metadata: Metadata = {
  title: "Admin · Salone Playground",
  robots: { index: false, follow: false },
};

// The admin dashboard: players online, what they are playing, and play statistics. Opened with the ADMIN_TOKEN secret.
export default function AdminPage() {
  return <AdminLoader />;
}
