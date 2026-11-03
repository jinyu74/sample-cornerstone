/** @type {import("prettier").Config} */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./src/app/styles/globals.css",
  tailwindFunctions: ["cn", "cva"],
};

export default config;
