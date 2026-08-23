import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF 다운로드 라우트(app/api/inquiry-writing/pdf)가 런타임에 로컬 폰트 파일을
  // 직접 읽는데, 경로를 동적으로(path.join) 구성해서 Next의 자동 파일 추적이
  // 못 잡아낸다 - 서버리스 번들에 강제로 포함시킨다.
  outputFileTracingIncludes: {
    "/api/inquiry-writing/pdf": ["./assets/fonts/**"],
  },
};

export default nextConfig;
