import { aliasLookupSchema } from "@tradecrafters/domain/catalog";
import { resolveProviderAlias } from "@tradecrafters/database/aliases";
import { api, ApiError, json } from "@/lib/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const params = new URL(request.url).searchParams;
    const value = aliasLookupSchema.safeParse(Object.fromEntries(params));
    if (!value.success || params.size !== 2)
      throw new ApiError(
        "INVALID_REQUEST",
        400,
        "Supply one provider and alias without date overrides.",
      );
    const result = await resolveProviderAlias(
      value.data.provider,
      value.data.alias,
    );
    return json(
      result,
      result.status === "conflict"
        ? 409
        : result.status === "missing"
          ? 404
          : 200,
    );
  }, request);
}
