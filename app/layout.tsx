import "reactflow/dist/style.css";
import "@xterm/xterm/css/xterm.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zoral Clone — Low-Code Node Graph",
  description:
    "Low-code workflow editor — renders Zoral .xml process configurations as an editable JSON node graph.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0b1020",
          color: "#e2e8f0",
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
