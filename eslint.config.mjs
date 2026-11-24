import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 允许用解构剔除字段后取剩余部分，如 const { password, ...rest } = user
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
      // 页面中的图片都是 base64 data URL 或本地 blob URL（题目原图、裁剪预览），next/image 无法优化
      "@next/next/no-img-element": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "测试中不要用裸 Date.now()，请用 vi.useFakeTimers() / vi.setSystemTime()。",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "测试中不要用无参 new Date()，请用 vi.useFakeTimers() / vi.setSystemTime()。",
        },
        {
          selector: "CallExpression[callee.name='setTimeout']",
          message: "测试中不要用 setTimeout 真实 sleep，请用 vi.useFakeTimers() / vi.advanceTimersByTimeAsync()。",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
