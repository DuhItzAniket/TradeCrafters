import { seedCatalog, closePool } from "@tradecrafters/database";
import { seedMarketPolicies } from "../packages/database/src/policy-fixtures";
try {
  console.log(await seedCatalog());
  console.log(await seedMarketPolicies());
} finally {
  await closePool();
}
