import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-sans-app", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Field Shift — советник по севообороту",
  description: "Фото поля → данные AgroMap и NASA → сценарии севооборота по доходу, воде и почве.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#059669",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full overscroll-none">{children}</body>
    </html>
  );
}
