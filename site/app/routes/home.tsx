import { Hero, TopNav } from "~/components/home/hero";
import { WorksWith } from "~/components/home/works-with";
import { Architecture, Capabilities, Connect, Footer, Journey, Prepare, Principle, Roadmap, Security, Start } from "~/components/home/sections";

export function meta() {
  return [
    { title: "Cop · ผู้ช่วยข้อมูลสำหรับทุกคนในองค์กร" },
    { name: "description", content: "Cop อ่านข้อมูลจากระบบเดิมขององค์กร ณ วินาทีที่ถาม ตามสิทธิ์ของแต่ละคน โดยไม่ย้ายข้อมูลออกมาเก็บเอง" },
  ];
}

export default function Home() {
  return (
    <div className="bg-paper text-foreground">
      <TopNav />
      <main>
        <Hero />
        <WorksWith />
        <Capabilities />
        <Principle />
        <Architecture />
        <Connect />
        <Journey />
        <Security />
        <Prepare />
        <Roadmap />
        <Start />
      </main>
      <Footer />
    </div>
  );
}
