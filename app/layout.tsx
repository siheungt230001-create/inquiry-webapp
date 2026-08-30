import type { Metadata } from "next";
import { Jua, Gowun_Dodum } from "next/font/google";
import "./globals.css";

const jua = Jua({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-jua",
});

const gowunDodum = Gowun_Dodum({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-gowun-dodum",
});

export const metadata: Metadata = {
  title: "역사 탐구 질문 코치",
  description: "중학교 역사 탐구 질문 AI 피드백 웹앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`h-full antialiased ${jua.variable} ${gowunDodum.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
