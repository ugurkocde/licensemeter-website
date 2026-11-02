import { sql } from "drizzle-orm";

/** Keep large prune sets below Postgres's bind parameter limit. */
export const textSet = (values: string[]) =>
  sql`(select jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))`;
