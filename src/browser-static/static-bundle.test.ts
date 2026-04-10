import { describe, expect, test } from "bun:test";
import { buildAssetManifest, detectContentType, renderShellAppMarkup, renderStaticIndexHtml } from "./static-bundle";

describe("static browser bundle helpers", () => {
  test("detects content types for browser assets", () => {
    expect(detectContentType("/assets/app.css")).toBe("text/css; charset=utf-8");
    expect(detectContentType("/assets/app.js")).toBe("text/javascript; charset=utf-8");
    expect(detectContentType("/assets/font.ttf")).toBe("font/ttf");
  });

  test("renders a self-hostable index with no preview dependency", () => {
    const html = renderStaticIndexHtml({
      scriptPath: "/assets/app.js",
      stylesheetPaths: ["/assets/app.css"],
      modeLabel: "static-dist",
    });
    expect(html).toContain('window.__CSH_BROWSER_STATIC_PREVIEW__ = {"modeLabel":"static-dist"}');
    expect(html).toContain('<script type="module" src="/assets/app.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/assets/app.css">');
  });

  test("renders the shell chrome markup for both preview and static dist hosts", () => {
    const markup = renderShellAppMarkup({
      modeLabel: "static-dist",
      enableTestSigner: true,
    });
    expect(markup).toContain('data-action="connect"');
    expect(markup).toContain('data-field="profile-select"');
    expect(markup).toContain('data-field="profile-import"');
    expect(markup).toContain("Preview Test Signer");
  });

  test("builds a manifest from emitted assets", () => {
    const manifest = buildAssetManifest({
      scriptPath: "/assets/app.js",
      stylesheetPaths: ["/assets/app.css"],
      assetPaths: ["/assets/app.js", "/assets/app.css", "/assets/MesloLGSNF-Regular.ttf"],
    });
    expect(manifest.scriptPath).toBe("/assets/app.js");
    expect(manifest.stylesheetPaths).toEqual(["/assets/app.css"]);
    expect(manifest.assetPaths).toContain("/assets/MesloLGSNF-Regular.ttf");
  });
});
