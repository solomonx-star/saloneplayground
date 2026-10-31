import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salone Playground",
  description: "A home for Sierra Leonean childhood games. Start with Balance Ball.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
