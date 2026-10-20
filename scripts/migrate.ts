import { migrate } from "@tradecrafters/database/migrate";
import { closePool } from "@tradecrafters/database";
try {
  await migrate();
} finally {
  await closePool();
}
