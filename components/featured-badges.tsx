// Directory badges the listings ask for, hotlinked so each site can verify them. Keep the img src and href as the directory gave them.
const badges = [
  { href: "https://twelve.tools", src: "https://twelve.tools/badge0-white.svg", alt: "Featured on Twelve Tools", w: 148, h: 40 },
  {
    href: "https://startupfa.me/s/socialreins?utm_source=socialreins.com",
    src: "https://startupfa.me/badges/featured-badge-small.webp",
    alt: "SocialReins - Featured on Startup Fame",
    w: 224,
    h: 36,
  },
  { href: "https://turbo0.com/item/socialreins", src: "https://img.turbo0.com/badge-listed-light.svg", alt: "Listed on Turbo0", w: 0, h: 54 },
];

// The second group is a copy for a seamless loop: hidden from assistive tech and the tab order. See .featured-slider in globals.css.
function Group({ copy }: { copy?: boolean }) {
  return (
    <div className="featured-group" aria-hidden={copy || undefined}>
      {badges.map((b) => (
        <a key={b.href} href={b.href} target="_blank" rel="noopener" tabIndex={copy ? -1 : undefined} className="featured-badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.src} alt={b.alt} width={b.w || undefined} height={b.h} loading="lazy" decoding="async" />
        </a>
      ))}
    </div>
  );
}

export function FeaturedBadges() {
  return (
    <section className="featured-slider" aria-label="Featured on directory sites">
      <div className="featured-track">
        <Group />
        <Group copy />
      </div>
    </section>
  );
}
