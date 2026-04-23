const js = require("@eslint/js");

const browserGlobals = {
  chrome: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  document: "readonly",
  globalThis: "readonly",
  MutationObserver: "readonly",
  module: "readonly",
  navigator: "readonly",
  requestAnimationFrame: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  window: "readonly",
};

const nodeGlobals = {
  console: "readonly",
  module: "readonly",
  process: "readonly",
  require: "readonly",
};

module.exports = [
  {
    ignores: ["icons/**", "preview.png"],
  },
  {
    ...js.configs.recommended,
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: browserGlobals,
      sourceType: "script",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    ...js.configs.recommended,
    files: ["eslint.config.js", "tests/**/*.js", "vitest.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...nodeGlobals,
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
      },
      sourceType: "script",
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
