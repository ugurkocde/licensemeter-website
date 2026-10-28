import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SupportForm } from "./SupportForm";

describe("SupportForm in-app defaults", () => {
  it("prefills signed-in contact details and opens privacy in a new tab", () => {
    const html = renderToStaticMarkup(
      createElement(SupportForm, {
        initialName: "Ada Admin",
        initialEmail: "ada@example.com",
        successHref: "/app",
        successLabel: "Back to Overview",
        privacyInNewTab: true,
      }),
    );

    expect(html).toContain('value="Ada Admin"');
    expect(html).toContain('value="ada@example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain(", opens in a new tab");
  });

  it("keeps the public form blank by default", () => {
    const html = renderToStaticMarkup(createElement(SupportForm));

    expect(html).not.toContain('value="Ada Admin"');
    expect(html).not.toContain(", opens in a new tab");
  });
});
