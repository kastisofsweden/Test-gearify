import tv55 from "@/assets/led-tv-55.png.asset.json";
import tv65 from "@/assets/led-tv-65.png.asset.json";
import tv75 from "@/assets/led-tv-75.png.asset.json";
import stand from "@/assets/speaker-stand.jpg.asset.json";
import mount from "@/assets/vesa-mount.png.asset.json";
import skirt from "@/assets/speaker-stand-skirt.jpg.asset.json";
import guitar from "@/assets/guitar-stands.jpg.asset.json";
import kit55 from "@/assets/55-tv-with-stand-skirt.jpg.asset.json";
import kit65 from "@/assets/65-tv-with-stand-skirt.jpg.asset.json";
import kit75 from "@/assets/75-tv-with-stand-skirt.jpg.asset.json";
import monitor55 from "@/assets/confidence-monitor-basic.jpg.asset.json";
import monitor65 from "@/assets/simple-confidence-monitor-65.jpg.asset.json";
import { imageOf, type SitePage } from "@/lib/site";

const productImages: Record<string, string> = {
  "led-tv-55": tv55.url,
  "led-tv-65": tv65.url,
  "led-tv-75": tv75.url,
  "speaker-stand": stand.url,
  "vesa-mount": mount.url,
  "speaker-stand-skirt": skirt.url,
  "guitar-stands": guitar.url,
  "55-tv-with-stand-skirt": kit55.url,
  "65-tv-with-stand-skirt": kit65.url,
  "75-tv-with-stand-skirt": kit75.url,
  "confidence-monitor-basic": monitor55.url,
  "simple-confidence-monitor-65": monitor65.url,
};

export function catalogueImage(page: SitePage) {
  return productImages[page.slug] || imageOf(page);
}

/** All distinct images for a product page gallery (primary first). */
export function galleryImages(page: SitePage) {
  const list = [
    catalogueImage(page),
    imageOf(page),
    ...(page.content?.sv?.sections ?? []).flatMap((s) => s.items.map((i) => i.image)),
  ];
  return Array.from(new Set(list.filter((src): src is string => Boolean(src && src.trim()))));
}
