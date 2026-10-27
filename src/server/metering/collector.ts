import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { meteringConnections } from "~/server/db/schema";
import { catalogId, catalogPrograms, collectorScript } from "./catalog";
import { MeteringError } from "./graph";
import { readCatalog } from "./live";

type Connection = typeof meteringConnections.$inferSelect;

/**
 * The collector for the workspace's current Intune app list. Its program list
 * is kept as a setting so device results can be read against the version
 * each device runs. Used for downloads and for writing the script to Intune.
 */
export async function generateCollector(
  connection: Connection,
  deadline: number,
): Promise<{ id: string; programs: string[]; script: string }> {
  const programs = catalogPrograms(
    await readCatalog(connection, { deadline, fresh: true }),
  );
  if (!programs.length) throw new MeteringError("programs");
  const id = catalogId(programs);
  const versions = [
    { id, programs, at: new Date().toISOString() },
    ...connection.collectors.filter((version) => version.id !== id),
  ].slice(0, 10);
  await db
    .update(meteringConnections)
    .set({ collectors: versions })
    .where(
      and(
        eq(meteringConnections.tenantId, connection.tenantId),
        eq(meteringConnections.id, connection.id),
      ),
    );
  return { id, programs, script: await collectorScript(programs) };
}
