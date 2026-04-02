import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knack - NAQT Practice",
  description: "High school quizbowl practice app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-surface text-on-surface font-body min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
