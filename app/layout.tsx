import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "역사 탐구 질문 코치",
  description: "중학교 역사 탐구 질문 AI 피드백 웹앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
