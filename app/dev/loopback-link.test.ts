import { describe, expect, test } from "bun:test";
import { rewriteMailLinks, signInAsLinkOf } from "./loopback-link";

const PAGE = { protocol: "http:", hostname: "localhost", port: "3100" };

describe("a link pressed on a demo screen", () => {
  test("into this Winyu opens on the other loopback host signed in as the persona", () => {
    expect(signInAsLinkOf("http://localhost:3100/s/abc?x=1", PAGE, "u_krit")).toBe("http://127.0.0.1:3100/dev/as?user=u_krit&next=%2Fs%2Fabc%3Fx%3D1");
    expect(signInAsLinkOf("http://localhost:3100/s/abc", { ...PAGE, hostname: "127.0.0.1" }, "u_krit")).toBe("http://localhost:3100/dev/as?user=u_krit&next=%2Fs%2Fabc");
  });

  test("anywhere else opens as it is", () => {
    expect(signInAsLinkOf("https://winyu.example.com/s/abc", PAGE, "u_krit")).toBe("https://winyu.example.com/s/abc");
    expect(signInAsLinkOf("http://localhost:3299/x", PAGE, "u_krit")).toBe("http://localhost:3299/x");
  });

  test("never opens a script or non-web link", () => {
    expect(signInAsLinkOf("javascript:alert(1)", PAGE, "u_krit")).toBeNull();
    expect(signInAsLinkOf("data:text/html,x", PAGE, "u_krit")).toBeNull();
    expect(signInAsLinkOf("/s/abc", PAGE, "u_krit")).toBeNull();
  });
});

describe("a mail's links", () => {
  test("a Winyu link with an escaped query opens as the persona on the other host", () => {
    const html = '<p><a href="http://127.0.0.1:3100/s/abc?a=1&amp;b=2" style="x">เปิดดู</a></p>';
    expect(rewriteMailLinks(html, { ...PAGE, hostname: "127.0.0.1" }, "u_krit")).toBe('<p><a href="http://localhost:3100/dev/as?user=u_krit&amp;next=%2Fs%2Fabc%3Fa%3D1%26b%3D2" style="x">เปิดดู</a></p>');
  });

  test("other origins stay and script links lose their href", () => {
    const html = `<a href='https://example.com/x'>a</a><a href="javascript:alert(1)">b</a><a HREF=" JavaScript:alert(2)">c</a>`;
    expect(rewriteMailLinks(html, PAGE, "u_krit")).toBe('<a href="https://example.com/x">a</a><a>b</a><a>c</a>');
  });
});
