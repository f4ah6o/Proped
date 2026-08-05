export default defineNuxtConfig({
  compatibilityDate: "2026-08-06",
  devtools: { enabled: false },
  ssr: true,
  telemetry: false,
  nitro: {
    preset: "node-server",
  },
  experimental: {
    payloadExtraction: false,
  },
});
