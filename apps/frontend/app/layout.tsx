import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PILO",
  description: "AI-powered project collaboration platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
