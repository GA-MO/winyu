import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Logo } from "~/components/home/ui";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Logo />, url: "/" },
    links: [
      { text: "เอกสาร", url: "/docs", active: "nested-url" },
      { text: "การเชื่อมต่อ", url: "/docs/connect", active: "nested-url" },
      { text: "ความปลอดภัย", url: "/docs/security", active: "nested-url" },
    ],
  };
}
