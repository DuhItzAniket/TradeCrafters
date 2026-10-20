import { seedCatalog, closePool } from "@tradecrafters/database";
import { seedMarketPolicies } from "../packages/database/src/policy-fixtures";
import { seedProviderAliases } from "@tradecrafters/database/aliases";
import { seedCatalogSnapshot } from "@tradecrafters/database/catalog";
try {
  console.log(await seedCatalogSnapshot());
  console.log(await seedCatalog());
  console.log(await seedMarketPolicies());
  console.log(await seedProviderAliases());
} finally {
  await closePool();
}
