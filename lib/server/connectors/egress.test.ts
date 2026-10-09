import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { CONNECTOR_HOSTS_ENV, EgressRefused, egressAllowlist, egressFetch, egressProblem, MAX_RESPONSE_BYTES, type Resolver } from "./egress";

const resolvesTo = (addresses: string[]): Resolver => async () => addresses;

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(request): Response {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/to-metadata") return Response.redirect("http://169.254.169.254/latest/meta-data/", 302);
    if (path === "/to-listed") return Response.redirect(`${url.origin}/ok`, 302);
    if (path === "/huge") return new Response("x".repeat(MAX_RESPONSE_BYTES + 1));
    return new Response("ok");
  },
});

const previous = process.env[CONNECTOR_HOSTS_ENV];

afterEach(() => {
  process.env[CONNECTOR_HOSTS_ENV] = previous;
});

afterAll(() => {
  server.stop(true);
});

describe("Winyu connects only where the server's allowlist says", () => {
  const allowlist = egressAllowlist("hris-mcp.boonrawd.internal, 10.20.0.0/16, 127.0.0.1, 169.254.169.254, crm.partner.example:8443");

  test("a host off the list is refused, a listed one with a public address may go", async () => {
    expect(await egressProblem("https://evil.example/mcp", { allowlist, resolve: resolvesTo(["93.184.216.34"]) })).toBe("host_not_allowed");
    expect(await egressProblem("https://crm.partner.example:8443/mcp", { allowlist, resolve: resolvesTo(["93.184.216.34"]) })).toBeNull();
    expect(await egressProblem("https://crm.partner.example/mcp", { allowlist, resolve: resolvesTo(["93.184.216.34"]) })).toBe("host_not_allowed");
  });

  test("cloud metadata is refused even when someone put it on the list", async () => {
    expect(await egressProblem("http://169.254.169.254/latest/meta-data/", { allowlist })).toBe("address_refused");
    expect(await egressProblem("http://[fd00:ec2::254]/", { allowlist: egressAllowlist("fd00:ec2::254") })).toBe("address_refused");
  });

  test("a listed name that resolves to metadata or to a private address not on the list is refused; a private address on the list may go", async () => {
    expect(await egressProblem("https://hris-mcp.boonrawd.internal/mcp", { allowlist, resolve: resolvesTo(["169.254.169.254"]) })).toBe("address_refused");
    expect(await egressProblem("https://hris-mcp.boonrawd.internal/mcp", { allowlist, resolve: resolvesTo(["10.99.0.5"]) })).toBe("address_refused");
    expect(await egressProblem("https://hris-mcp.boonrawd.internal/mcp", { allowlist, resolve: resolvesTo(["10.20.4.7"]) })).toBeNull();
    expect(await egressProblem("https://hris-mcp.boonrawd.internal/mcp", { allowlist, resolve: resolvesTo(["10.20.4.7", "127.0.0.2"]) })).toBe("address_refused");
  });

  test("other schemes, credentials in the URL and names that do not resolve are refused", async () => {
    expect(await egressProblem("file:///etc/passwd", { allowlist })).toBe("bad_url");
    expect(await egressProblem("not a url", { allowlist })).toBe("bad_url");
    expect(await egressProblem("http://admin:pw@127.0.0.1/mcp", { allowlist })).toBe("credentials_in_url");
    expect(await egressProblem("https://hris-mcp.boonrawd.internal/mcp", { allowlist, resolve: async () => [] })).toBe("unresolvable");
  });

  test("an unset allowlist allows nothing", async () => {
    expect(await egressProblem("http://127.0.0.1:3299/mcp", { allowlist: egressAllowlist("") })).toBe("host_not_allowed");
  });

  test("the connector fetch refuses an unlisted host before connecting, and a redirect even to a listed host", async () => {
    process.env[CONNECTOR_HOSTS_ENV] = "127.0.0.1";
    expect(await (await egressFetch(`${server.url}ok`)).text()).toBe("ok");
    const metadata = await egressFetch(`${server.url}to-metadata`).catch((error: unknown) => error);
    expect(metadata).toBeInstanceOf(Error);
    const listed = await egressFetch(`${server.url}to-listed`).catch((error: unknown) => error);
    expect(listed).toBeInstanceOf(Error);
    process.env[CONNECTOR_HOSTS_ENV] = "";
    const refused = await egressFetch(`${server.url}ok`).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(EgressRefused);
  });

  test("a reply over the size cap fails instead of filling memory", async () => {
    process.env[CONNECTOR_HOSTS_ENV] = "127.0.0.1";
    const read = await egressFetch(`${server.url}huge`).then((response) => response.text()).catch((error: unknown) => error);
    expect(read).toBeInstanceOf(Error);
  });
});
