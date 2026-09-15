import { PrismaClient, type Size } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error(
    "Falta DATABASE_URL. Corre con dotenv y el .env de test: dotenv -e .env.test -- npm run seed:e2e",
  );
  process.exit(1);
}

// Mismo patrón que tests/integration/prisma.ts: Prisma 7 requiere driver
// adapter. Usa DATABASE_URL del entorno (cargado vía dotenv-cli).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Datos de catálogo mínimos para el flujo E2E de checkout (Playwright).
// Slugs con sufijo "-e2e" a propósito: nunca deben chocar con datos reales.
const CATEGORY = {
  name: "Vestidos de Baño E2E",
  slug: "vestidos-bano-e2e",
  description: "Categoría de catálogo para pruebas E2E de checkout — no son datos reales.",
};

const PRODUCT = {
  name: "Vestido de Baño Tropical E2E",
  slug: "vestido-de-bano-tropical-e2e",
  description: "Producto sembrado para el flujo E2E de checkout — no son datos reales.",
  basePrice: 120000,
  weightGrams: 300,
};

const IMAGE = {
  url: "https://res.cloudinary.com/hallyboutique/image/upload/v1/e2e/vestido-de-bano-tropical.jpg",
  altText: "Vestido de baño tropical E2E",
  position: 0,
};

const VARIANTS: { size: Size; color: string; sku: string; stock: number }[] = [
  { size: "S", color: "Verde", sku: "E2E-VBT-S-VER", stock: 25 },
  { size: "M", color: "Verde", sku: "E2E-VBT-M-VER", stock: 20 },
  { size: "L", color: "Azul", sku: "E2E-VBT-L-AZU", stock: 15 },
];

async function main(): Promise<string[]> {
  const category = await prisma.category.upsert({
    where: { slug: CATEGORY.slug },
    update: { name: CATEGORY.name, description: CATEGORY.description, isActive: true },
    create: CATEGORY,
  });

  const product = await prisma.product.upsert({
    where: { slug: PRODUCT.slug },
    update: {
      name: PRODUCT.name,
      description: PRODUCT.description,
      basePrice: PRODUCT.basePrice,
      weightGrams: PRODUCT.weightGrams,
      categoryId: category.id,
      isActive: true,
    },
    create: {
      ...PRODUCT,
      categoryId: category.id,
      isActive: true,
    },
  });

  const existingImage = await prisma.productImage.findFirst({
    where: { productId: product.id, position: IMAGE.position },
  });
  if (existingImage) {
    await prisma.productImage.update({
      where: { id: existingImage.id },
      data: { url: IMAGE.url, altText: IMAGE.altText },
    });
  } else {
    await prisma.productImage.create({
      data: { productId: product.id, ...IMAGE },
    });
  }

  for (const variant of VARIANTS) {
    await prisma.variant.upsert({
      where: { sku: variant.sku },
      update: {
        productId: product.id,
        size: variant.size,
        color: variant.color,
        stock: variant.stock,
        priceDelta: 0,
        isActive: true,
      },
      create: {
        productId: product.id,
        ...variant,
        priceDelta: 0,
        isActive: true,
      },
    });
  }

  return [
    `categoría: ${category.slug} (${category.name})`,
    `producto: ${product.slug} (${product.name})`,
    `imagen: ${IMAGE.url}`,
    `variantes: ${VARIANTS.map((v) => `${v.size}/${v.color} (${v.stock})`).join(", ")}`,
  ];
}

try {
  const lines = await main();
  console.log("Seed E2E listo:");
  for (const line of lines) {
    console.log(`  - ${line}`);
  }
  console.log(`GET /api/products → busca el slug "${PRODUCT.slug}"`);
} catch (err) {
  console.error("Seed E2E falló:", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
