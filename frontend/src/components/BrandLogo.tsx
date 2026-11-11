/**
 * The OPedu wordmark from the brand kit. Both versions are in the page and the stylesheet shows
 * the one that fits the theme: black and green on light backgrounds, white and green on dark.
 */
export function BrandLogo({ height = 40 }: { height?: number }) {
  const width = Math.round((height * 181) / 96);
  return (
    <span className="brand-logo" style={{ height }}>
      <img
        className="brand-logo-light"
        src="/brand/logo-light.webp"
        width={width}
        height={height}
        alt="OPedu"
      />
      <img
        className="brand-logo-dark"
        src="/brand/logo-dark.webp"
        width={width}
        height={height}
        alt=""
        aria-hidden="true"
      />
    </span>
  );
}
