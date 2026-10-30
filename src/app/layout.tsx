import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salone Playground — Touch",
  description: "A home for Sierra Leonean childhood games. Start with Touch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
