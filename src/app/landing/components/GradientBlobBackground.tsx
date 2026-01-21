/**
 * Gradient blob background system for the landing page.
 * Creates a unified set of decorative gradient blobs positioned throughout
 * the page to create depth and visual interest.
 */
export function GradientBlobBackground() {
  return (
    <>
      {/* Top section blobs */}
      <div
        className="from-primary/40 to-accent/30 absolute top-20 -left-20 h-96 w-96 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="from-primary/30 to-accent/20 absolute top-40 -right-20 h-80 w-80 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>

      {/* Middle section blobs */}
      <div
        className="from-destructive/20 to-accent/20 absolute top-[33%] left-1/4 h-64 w-64 rounded-full bg-gradient-to-br opacity-40 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="from-primary/20 to-accent/20 absolute top-1/2 right-1/4 h-56 w-56 rounded-full bg-gradient-to-br opacity-40 blur-3xl"
        aria-hidden="true"
      ></div>

      {/* Lower section blobs */}
      <div
        className="from-primary/30 to-accent/30 absolute top-[66%] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gradient-to-br opacity-50 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="from-primary/20 to-accent/20 absolute top-[75%] right-10 h-48 w-48 rounded-full bg-gradient-to-br opacity-40 blur-3xl"
        aria-hidden="true"
      ></div>

      {/* Bottom section blobs */}
      <div
        className="from-primary/40 to-accent/30 absolute bottom-20 -left-20 h-96 w-96 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="from-primary/30 to-accent/20 absolute -right-20 bottom-40 h-80 w-80 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="from-destructive/20 to-accent/20 absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
    </>
  );
}
