export function SiteLogo() {
  return (
    <span className="site-logo" aria-hidden="true">
      <img
        className="site-logo-light"
        src="/brand-assets/logo-horizontal-light.svg"
        width={160}
        height={32}
        alt=""
      />
      <img
        className="site-logo-dark"
        src="/brand-assets/logo-horizontal-dark.svg"
        width={160}
        height={32}
        alt=""
      />
    </span>
  );
}
