// Generate a simple placeholder-card.png (200x300, dark with logo)
import sharp from "sharp";
import path from "path";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a1a1a"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <linearGradient id="logo" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e94560"/>
      <stop offset="100%" stop-color="#7b2ff7"/>
    </linearGradient>
  </defs>
  <rect width="200" height="300" fill="url(#bg)"/>
  <rect x="80" y="125" width="40" height="40" rx="10" fill="url(#logo)" opacity="0.5"/>
  <polygon points="93,135 93,155 110,145" fill="white" opacity="0.7"/>
  <text x="100" y="195" font-family="sans-serif" font-size="12" font-weight="bold" fill="#666" text-anchor="middle">XAN</text>
  <text x="100" y="212" font-family="sans-serif" font-size="9" fill="#444" text-anchor="middle">No Cover</text>
</svg>`;

const outPath = path.join(process.cwd(), "public", "placeholder-card.png");
sharp(Buffer.from(svg)).png().toFile(outPath).then(() => {
  console.log("Placeholder image written:", outPath);
}).catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
