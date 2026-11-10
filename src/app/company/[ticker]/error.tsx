"use client";

import Link from "next/link";

export default function CompanyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
      <h1 className="text-2xl font-semibold text-navy">The data source did not respond</h1>
      <p className="mt-3 text-muted leading-relaxed">
        This page is built live from the SEC&rsquo;s filing database, which limits how fast anyone may request data. It was either busy or
        temporarily unreachable. Nothing is wrong with the ticker; please try again in a moment.
      </p>
      <div className="mt-6 flex gap-4 items-center">
        <button onClick={() => reset()} className="rounded bg-navy text-white px-5 py-2.5 font-medium hover:bg-ink">
          Try again
        </button>
        <Link href="/" className="link text-sm">
          Back to the home page
        </Link>
      </div>
    </div>
  );
}
