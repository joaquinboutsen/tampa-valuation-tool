import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
      <h1 className="text-2xl font-semibold text-navy">Page not found</h1>
      <p className="mt-3 text-muted">That page does not exist.</p>
      <p className="mt-4">
        <Link href="/" className="link">
          Back to the home page
        </Link>
      </p>
    </div>
  );
}
