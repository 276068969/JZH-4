import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: ["dist", "node_modules"],
    files: ["**/*.{js,ts,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        document: "readonly",
        localStorage: "readonly",
        window: "readonly",
        console: "readonly"
      }
    }
  }
];
