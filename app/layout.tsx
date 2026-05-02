import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@xterm/xterm/css/xterm.css";

const notoSansMono = localFont({
  src: "./fonts/NotoSansMono-Variable.ttf",
  weight: "100 900",
  style: "normal",
  variable: "--font-noto-mono",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/Inter-Variable.ttf",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pi Agent 桌面版",
  description: "Pi 编程智能体桌面应用",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${notoSansMono.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        {children}
      </body>
    </html>
  );
}
