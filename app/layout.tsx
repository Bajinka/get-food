import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: "GET-FOOD | Scan. Order. Enjoy.",
  description: "Gambian favourites from GET-FOOD Demo Restaurant.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <Link className="brand" href="/">
            GET<span>•</span>FOOD<small>SCAN. ORDER. ENJOY.</small>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/menu">Menu</Link>
            <Link href="/cart">Cart</Link>
            <Link href="/login">Staff sign in</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          GET-FOOD Demo Restaurant · The Gambia
          <br />
          <small>Developed by GET-PC TECHNICAL SOLUTION</small>
        </footer>
      </body>
    </html>
  );
}
