import snapshot from "../data/mic-2026-10-12.json";

export const directorySource = {
  publisher: "ISO 10383 Registration Authority (SWIFT)",
  url: "https://www.iso20022.org/market-identifier-codes",
  downloadUrl:
    "https://www.iso20022.org/sites/default/files/ISO10383_MIC/ISO10383_MIC.csv",
  publishedOn: "2026-10-12",
  changesEffectiveOn: "2026-10-26",
  retrievedOn: "2026-10-20",
  records: snapshot.length,
  classification:
    "MIC reference directory; includes non-equity facilities. Cash-equity classification and data entitlements are unverified.",
} as const;
export const micDirectory = snapshot;
