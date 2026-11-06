import type { Metadata } from "next";
import AppUpdates from "@/components/AppUpdates";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salone Playground",
  description: "A home for Sierra Leonean childhood games. Start with Balance Ball.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en"><body>{children}<AppUpdates /></body></html>
  );
}
