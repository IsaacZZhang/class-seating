import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const configured = Boolean(url && key && !url.includes("YOUR_PROJECT") && key !== "sb_publishable_xxx");

if (!configured) {
  root.render(
    <main className="gate">
      <section className="gate-card" role="alert">
        <h1>需要配置 Supabase</h1>
        <p>构建时缺少有效的 Supabase 地址或 publishable key，因此班级数据暂时无法加载。</p>
        {import.meta.env.DEV ? (
          <p>复制 <code>.env.example</code> 为 <code>.env.local</code>，填入项目的真实配置，然后重启开发服务器并刷新页面。</p>
        ) : (
          <p>请在 Cloudflare Workers 的 Build variables and secrets 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY，然后重新构建并部署。</p>
        )}
      </section>
    </main>,
  );
} else {
  void import("./session")
    .then(({ default: Root }) => {
      root.render(
        <React.StrictMode>
          <Root />
        </React.StrictMode>,
      );
    })
    .catch((error: unknown) => {
      console.error("应用加载失败", error);
      root.render(
        <main className="gate">
          <section className="gate-card" role="alert">
            <h1>页面加载失败</h1>
            <p>请刷新页面重试。如果问题仍在，请检查浏览器控制台中的错误。</p>
          </section>
        </main>,
      );
    });
}
