"use client";

import dynamic from "next/dynamic";

// The dashboard runs in the browser only: it keeps the admin token in this tab's storage and talks to the game server.
const AdminDashboard = dynamic(() => import("@/components/admin/AdminDashboard"), { ssr: false });

export default function AdminLoader() {
  return <AdminDashboard />;
}
