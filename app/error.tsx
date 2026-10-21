"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="notice">
      <h2>We couldn’t load this page.</h2>
      <p>Please try again. If the problem continues, contact the restaurant.</p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
