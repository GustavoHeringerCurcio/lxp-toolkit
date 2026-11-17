import { useEffect, useState } from "react";
import { fetchAppLink, reportAppUrl } from "@/api";

/**
 * The public (Tailscale) URL of this app, when the backend knows one.
 *
 * The browser reports the `*.ts.net` origin it reached, so a session on
 * `localhost` can open the same app from another device by clicking the logo.
 * Cached at module level: one request per page load, shared by every caller.
 */
let cached: Promise<string | null> | null = null;

function isTailnetHost(hostname: string): boolean {
  return hostname.endsWith(".ts.net");
}

/** Record the Tailscale origin on boot (no-op when served from localhost/LAN). */
export function reportAppUrlOnce(): void {
  if (!isTailnetHost(window.location.hostname)) return;
  void reportAppUrl(window.location.origin).catch(() => {
    // Best effort: the link stays whatever the server already knows.
  });
}

export function useAppLink(): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    cached ??= fetchAppLink()
      .then((link) => link.url)
      .catch(() => null);
    void cached.then((link) => {
      if (alive) setUrl(link);
    });
    return () => {
      alive = false;
    };
  }, []);

  return url;
}
