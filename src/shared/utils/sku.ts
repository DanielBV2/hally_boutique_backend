function normalize(text: string): string {
  return text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function buildSkuBase(productName: string, color: string, size: string): string {
  const nameAbbr = normalize(productName)
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 3)
    .map((word) => word.slice(0, 3))
    .join("-");

  const colorAbbr = normalize(color).slice(0, 2);

  return `${nameAbbr}-${colorAbbr}-${size}`;
}

export async function generateUniqueSku(
  productName: string,
  color: string,
  size: string,
  checkExists: (sku: string) => Promise<boolean>,
): Promise<string> {
  const base = buildSkuBase(productName, color, size);
  let sku = base;
  let counter = 2;
  while (await checkExists(sku)) {
    sku = `${base}${counter}`;
    counter++;
  }
  return sku;
}
