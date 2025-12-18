import { HOST } from "@/api/common";
import Link from "next/link"

import type { User } from "@/types";

function Brand() {
  return (
    <Link href="/" className="flex items-center">
      <span className="self-center whitespace-nowrap text-2xl font-bold text-emerald-500 underline decoration-4">
        Sonari
      </span>
    </Link>
  );
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        className="block rounded py-2 pl-3 pr-4 md:bg-transparent md:p-0"
        aria-current="page"
      >
        {label}
      </a>
    </li>
  );
}

function Navigation() {
  const navItems = [
    { href: HOST + "/guide/", label: "User Guide" },
    { href: HOST + "about/", label: "About" },
    { href: HOST + "/contact/", label: "Contact" },
  ];
  return (
    <div className="hidden w-full md:block md:w-auto" id="navbar-default">
      <ul className="mt-4 flex flex-col rounded-lg border p-4 font-medium md:mt-0 md:flex-row md:space-x-8 md:border-0 md:p-0">
        {navItems.map((link) => (
          <NavItem key={link.href} href={link.href} label={link.label} />
        ))}
      </ul>
    </div>
  );
}

export function NavBar() {
  return (
    <nav>
      <div className="z-50 flex max-w-screen-xl flex-wrap items-center justify-between p-4">
        <Brand />
        <Navigation />
      </div>
    </nav>
  );
}
