import { Prisma, type Registrant } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DUPLICATE_ID_MESSAGE,
  type RegistrantInput,
} from "@/lib/validation";
import { jstDayKey, jstMonthKey } from "@/lib/date";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; field?: keyof RegistrantInput };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createRegistrant(
  input: RegistrantInput
): Promise<ActionResult<Registrant>> {
  try {
    const registrant = await prisma.registrant.create({ data: input });
    return { ok: true, data: registrant };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, message: DUPLICATE_ID_MESSAGE, field: "realityId" };
    }
    throw error;
  }
}

export async function updateRegistrant(
  id: string,
  input: RegistrantInput
): Promise<ActionResult<Registrant>> {
  try {
    const registrant = await prisma.registrant.update({
      where: { id },
      data: input,
    });
    return { ok: true, data: registrant };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, message: DUPLICATE_ID_MESSAGE, field: "realityId" };
    }
    throw error;
  }
}

export async function deleteRegistrant(id: string): Promise<void> {
  await prisma.registrant.delete({ where: { id } });
}

export async function listRegistrants(): Promise<Registrant[]> {
  return prisma.registrant.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getRegistrant(id: string): Promise<Registrant | null> {
  return prisma.registrant.findUnique({ where: { id } });
}

export type RegistrantStats = {
  total: number;
  today: number;
  thisMonth: number;
  latest: Registrant | null;
};

export async function getRegistrantStats(): Promise<RegistrantStats> {
  const all = await prisma.registrant.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  const now = new Date();
  const todayKey = jstDayKey(now);
  const monthKey = jstMonthKey(now);

  const today = all.filter((r) => jstDayKey(r.createdAt) === todayKey).length;
  const thisMonth = all.filter(
    (r) => jstMonthKey(r.createdAt) === monthKey
  ).length;

  const latest = all.length
    ? await prisma.registrant.findUnique({ where: { id: all[0].id } })
    : null;

  return { total: all.length, today, thisMonth, latest };
}
