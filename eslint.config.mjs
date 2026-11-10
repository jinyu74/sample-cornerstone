import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import boundaries from "eslint-plugin-boundaries";
import storybook from "eslint-plugin-storybook";

/**
 * FSD 계층. 위에서 아래로만 의존한다.
 * Next.js App Router 라우트는 src/app 에 있으며 FSD app 계층을 겸한다.
 * FSD pages 계층은 Pages Router 와 충돌하지 않도록 src/views 를 사용한다.
 */
const layers = ["app", "views", "widgets", "features", "entities", "shared"];

const elements = [
  { type: "app", pattern: "src/app" },
  { type: "views", pattern: "src/views/*", capture: ["slice"] },
  { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
  { type: "features", pattern: "src/features/*", capture: ["slice"] },
  { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
  { type: "shared", pattern: "src/shared/*", capture: ["segment"] },
];

/** 각 계층이 import 할 수 있는 하위 계층 */
const allowedBelow = (layer) => layers.slice(layers.indexOf(layer) + 1);

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...storybook.configs["flat/recommended"],
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "storybook-static/**",
      "playwright-report/**",
      "test-results/**",
      "public/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": elements,
      "boundaries/include": ["src/**/*"],
      "import/resolver": { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      // 상위 → 하위 계층만 허용. 같은 계층의 다른 슬라이스 직접 참조 금지.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          // 같은 슬라이스 내부 의존은 같은 element 로 취급되어 검사 대상이 아니다.
          // 같은 계층의 다른 슬라이스는 허용 목록에 없으므로 금지된다(shared 는 세그먼트 간 허용).
          policies: [
            ...layers.slice(0, -1).map((layer) => ({
              from: { element: { type: layer } },
              allow: { to: { element: { types: allowedBelow(layer) } } },
            })),
            {
              from: { element: { type: "shared" } },
              allow: { to: { element: { type: "shared" } } },
            },
          ],
        },
      ],
      // 슬라이스 외부에서는 공개 진입점(index.ts)만 사용한다.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/views/*/*",
                "@/widgets/*/*",
                "@/features/*/*",
                "@/entities/*/*",
                // 승인된 서버 전용 공개 진입점 하나만 허용한다(그 하위 경로는 다시 금지)
                "!@/entities/dicom-study/server",
                "@/entities/dicom-study/server/**",
              ],
              message:
                "슬라이스는 공개 진입점(@/<layer>/<slice>)으로만 import 합니다.",
            },
          ],
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  prettier,
];

export default config;
