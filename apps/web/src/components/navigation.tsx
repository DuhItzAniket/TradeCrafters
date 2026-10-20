"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [
  { href: "/", title: "Market explorer", icon: "◎", number: "01" },
  { href: "/directory", title: "Venue directory", icon: "▦", number: "02" },
  { href: "/account", title: "Account & wallets", icon: "◫", number: "03" },
];
export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="navigation" aria-label="Main navigation">
      {links.map((item) => (
        <Link
          href={item.href}
          key={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          {item.title}
          <span className="nav-number">{item.number}</span>
        </Link>
      ))}
    </nav>
  );
}
