import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis | AI Incident Response",
  description: "Investigate, diagnose, act, and verify engineering incidents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
