import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles/globals.css";

export const metadata: Metadata = {
  title: "DICOM 작업실",
  description: "브라우저 로컬에서 DICOM 영상을 측정하고 라벨링하는 작업 도구",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh text-sm antialiased">{children}</body>
    </html>
  );
}
