import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { data } from "react-router";
import { useMDXComponents } from "~/components/mdx";
import { baseOptions } from "~/lib/layout.shared";
import { docs, source } from "~/lib/source";
import type { Route } from "./+types/docs";

function toSlugs(splat: string | undefined) {
  return (splat ?? "").split("/").filter((segment) => segment.length > 0);
}

export async function loader({ params }: Route.LoaderArgs) {
  const page = source.getPage(toSlugs(params["*"]));
  if (!page) throw new Response("Not found", { status: 404 });
  const pageTree = await source.serializePageTree(source.getPageTree());
  return data({ path: page.path, pageTree });
}

function ContentPage({ path }: { path: string }) {
  const page = docs.getPage(path);
  if (!page) throw new Error(`Unknown docs page: ${path}`);
  const Mdx = page.body;
  return (
    <DocsPage toc={page.toc} tableOfContent={{ style: "clerk" }}>
      <title>{`${page.title} | Cop`}</title>
      <meta name="description" content={page.description} />
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <DocsBody>
        <Mdx components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export default function DocsRoute({ loaderData }: Route.ComponentProps) {
  const { path, pageTree } = useFumadocsLoader(loaderData);
  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <ContentPage path={path} />
    </DocsLayout>
  );
}
