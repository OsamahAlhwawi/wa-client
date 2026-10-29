import { defineConfig } from "vitepress";

export default defineConfig({
  title: "wa-client",
  description: "Typed, zero-dependency client for the WhatsApp Business Cloud API",
  // GitHub Pages serves the site from /<repo-name>/ — the deploy workflow sets DOCS_BASE
  base: process.env.DOCS_BASE ?? "/",
  cleanUrls: true,
  lastUpdated: true,
  head: [["meta", { name: "theme-color", content: "#25d366" }]],

  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API Reference", link: "/reference/api" },
      { text: "npm", link: "https://www.npmjs.com/package/@osamahalhwawi/wa-client" },
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Configuration", link: "/guide/configuration" },
        ],
      },
      {
        text: "Guide",
        items: [
          { text: "Sending Messages", link: "/guide/messages" },
          { text: "Media", link: "/guide/media" },
          { text: "Templates & Bulk", link: "/guide/templates" },
          { text: "Webhooks", link: "/guide/webhooks" },
          { text: "Phone Number & Profile", link: "/guide/phone-profile" },
          { text: "Error Handling", link: "/guide/errors" },
          { text: "Embedded Signup", link: "/guide/embedded-signup" },
        ],
      },
      {
        text: "Reference",
        items: [{ text: "API Reference", link: "/reference/api" }],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/OsamahAlhwawi/wa-client" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/OsamahAlhwawi/wa-client/edit/main/docs/:path",
    },
    footer: {
      message:
        "Released under the MPL-2.0 License. Not affiliated with Meta Platforms, Inc. or WhatsApp LLC.",
    },
  },
});
