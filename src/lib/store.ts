import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

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

  // Two businesses whose names slugify identically can race past the
  // check-then-create in generateUniqueSlug and both attempt the same
  // slug; without recovery the loser hits an unhandled P2002 and ends up
  // with zero store rows, permanently unable to create a program (H-4).
  // The DB's businessId unique constraint also catches the sibling race —
  // two concurrent calls for the SAME business landing on two different
  // (both otherwise-available) slugs (I-2) — so both collision kinds reach
  // this same catch. Retry a few times: a concurrent call for THIS
  // business means someone else already created it (re-read and return
  // it); a collision with a different business means we just need a fresh
  // slug.
  //
  // Both known collision kinds recover the exact same way, so there's no
  // need to inspect *which* unique constraint P2002 fired — which is good,
  // because Prisma's reported shape for that isn't stable (verified
  // empirically against this project's real setup — Prisma 7 +
  // `@prisma/adapter-pg`, Postgres 17 — as `error.meta` being an empty
  // object). The 5-attempt bound below is what keeps this from spinning
  // forever if some future, truly unrelated unique constraint starts
  // throwing P2002 here instead.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await generateUniqueSlug(business.name);
    try {
      return await prisma.store.create({
        data: { businessId, name: business.name, slug },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raced = await prisma.store.findFirst({ where: { businessId } });
        if (raced) {
          return raced;
        }
        continue;
      }
      throw err;
    }
  }

  throw new Error("Could not create a unique store slug.");
}
