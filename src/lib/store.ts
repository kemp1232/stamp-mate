import "server-only";
import { prisma } from "@/lib/prisma";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return slug || "store";
}

async function generateUniqueSlug(base: string) {
  const baseSlug = slugify(base);
  let slug = baseSlug;
  let suffix = 1;

  while (await prisma.store.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  return slug;
}

/**
 * For MVP, a business has exactly one store. Creates it on first use so
 * owners don't need a separate store-setup step before managing a program.
 */
export async function getOrCreateDefaultStore(businessId: string) {
  const existing = await prisma.store.findFirst({ where: { businessId } });
  if (existing) {
    return existing;
  }

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
  });
  const slug = await generateUniqueSlug(business.name);

  return prisma.store.create({
    data: { businessId, name: business.name, slug },
  });
}
