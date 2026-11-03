import type { Preview } from "@storybook/nextjs-vite";

import "../src/app/styles/globals.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // 접근성 위반을 테스트 실패로 처리한다.
    a11y: { test: "error" },
  },
};

export default preview;
