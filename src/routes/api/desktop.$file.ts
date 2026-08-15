import { createFileRoute } from "@tanstack/react-router";
import { DESKTOP_FILES, githubDesktopAssetUrl } from "@/lib/kibo/desktop";

const ALLOWED = new Set<string>(Object.values(DESKTOP_FILES));

export const Route = createFileRoute("/api/desktop/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const file = params.file;
        if (!file || !ALLOWED.has(file)) {
          return new Response("Unknown desktop build", { status: 404 });
        }

        const source = githubDesktopAssetUrl(file);
        try {
          const upstream = await fetch(source, {
            redirect: "follow",
            headers: { "User-Agent": "KiboTalk-Desktop", Accept: "application/octet-stream" },
          });
          if (!upstream.ok || !upstream.body) {
            return Response.redirect(source, 302);
          }
          const headers = new Headers();
          headers.set("Content-Type", "application/octet-stream");
          headers.set("Content-Disposition", `attachment; filename="${file}"`);
          const length = upstream.headers.get("content-length");
          if (length) headers.set("Content-Length", length);
          headers.set("Cache-Control", "public, max-age=300");
          return new Response(upstream.body, { status: 200, headers });
        } catch {
          return Response.redirect(source, 302);
        }
      },
    },
  },
});
