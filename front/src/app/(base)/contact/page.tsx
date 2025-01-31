"use client";
import Hero from "@/components/Hero";
import Link from "@/components/Link";

export default function Page() {
  return (
    <div>
      <Hero text="Contact" />
      <div className="p-6 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center p-4">
          <span className="font-sans font-bold text-emerald-500 underline decoration-8 text-6xl">
            Contact
          </span>
        </div>
        <div className="max-w-prose text-center flex flex-col items-center gap-8 text-lg">
          <div className="flex flex-col items-center gap-2">
            <span>
              The Sonari team is always delighted to connect with our users.
              Feel free to reach out to us at the following email address for
              any questions, comments, or concerns:
            </span>
            <Link
              mode="text"
              padding="p-0"
              href="mailto:sterz@trackit.systems"
            >
              sterz@trackit.systems
            </Link>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span>
              For development-related inquiries or to explore the source code of
              Sonari, you can find our main code repository on GitHub:
            </span>
            <Link
              mode="text"
              padding="p-0"
              href="https://github.com/trackIT-Systems/sonari"
            >
              https://github.com/trackIT-Systems/sonari
            </Link>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p>
              We value your feedback and suggestions, as they play a crucial
              role in shaping the future of Sonari. Thank you for being a part
              of our community!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
