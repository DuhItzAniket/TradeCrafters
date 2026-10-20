import { seedCatalog, closePool } from "@tradecrafters/database";
try {
  console.log(await seedCatalog());
} finally {
  await closePool();
}
