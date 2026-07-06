import { getBasePath } from "./url";
import { IVendor } from "../pages/vendors/model";

export interface VendorLogoManifestPaths {
  web_files?: string[];
  print_files?: string[];
}

interface LogoMatchScore {
  path: string;
  score: number;
}

// Vendor logo extras may be stored as JSON strings or legacy plain text; accept either form for previews.
export function parseExtraString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed.trim() : undefined;
  } catch {
    return value.trim();
  }
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    return value;
  }
  if (value.startsWith("/")) {
    return `${getBasePath()}${value}`;
  }
  return `${getBasePath()}/${value}`;
}

export function slugifyVendorName(name: string | undefined): string {
  if (!name) {
    return "";
  }
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeForMatch(value: string): string {
  return value.replace(/[^a-z0-9]/g, "");
}

function slugFromManifestPath(path: string, type: "web" | "print"): string {
  const filename = path.split("/").pop() ?? "";
  const base = filename.replace(/\.[^.]+$/, "");
  if (type === "web") {
    return base.replace(/-web$/i, "");
  }
  // Generated print logos append hash/suffix markers; strip those so auto-match still keys off the vendor slug.
  return base
    .replace(/-[0-9a-f]{10}-print-auto$/i, "")
    .replace(/-print-auto$/i, "")
    .replace(/-print$/i, "");
}

// Rank manifest entries conservatively so auto-matching prefers vendor-specific files over generic logo names.
function scoreLogoPath(name: string, path: string, type: "web" | "print"): number {
  const targetSlug = slugifyVendorName(name);
  if (!targetSlug) {
    return 0;
  }
  const targetNorm = normalizeForMatch(targetSlug);
  const targetTokens = new Set(targetSlug.split("-").filter(Boolean));
  const targetTokenCount = targetTokens.size;
  const candidateSlug = slugifyVendorName(slugFromManifestPath(path, type));
  if (!candidateSlug) {
    return 0;
  }
  const candidateNorm = normalizeForMatch(candidateSlug);
  const candidateTokens = new Set(candidateSlug.split("-").filter(Boolean));
  const candidateTokenCount = candidateTokens.size;

  if (candidateSlug === targetSlug || candidateNorm === targetNorm) {
    return 100;
  }
  if (candidateNorm === `${targetNorm}s` || `${candidateNorm}s` === targetNorm) {
    // Allow common singular/plural differences (e.g. "bambu-lab" vs "bambu-labs").
    return 94;
  }

  let overlap = 0;
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }
  const targetCoverage = targetTokenCount > 0 ? overlap / targetTokenCount : 0;
  const candidateCoverage = candidateTokenCount > 0 ? overlap / candidateTokenCount : 0;
  // Avoid weak one-word overlaps like "filament-*".
  if (overlap >= 2 && targetCoverage >= 0.66 && candidateCoverage >= 0.5) {
    return 70 + Math.min(overlap, 10);
  }

  return 0;
}

function rankPaths(name: string, paths: string[], type: "web" | "print"): LogoMatchScore[] {
  if (paths.length === 0) {
    return [];
  }
  return paths
    .map((path) => ({ path, score: scoreLogoPath(name, path, type) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Only strong matches should auto-populate preview/logo suggestions; weaker matches stay manual choices.
function findBestPath(name: string, paths: string[], type: "web" | "print"): string | undefined {
  const ranked = rankPaths(name, paths, type);
  if (ranked.length === 0) {
    return undefined;
  }
  const [best] = ranked;
  if (best.score < 70) {
    return undefined;
  }
  return best.path;
}

export function suggestVendorLogoOptions(
  name: string,
  manifest: VendorLogoManifestPaths,
  type: "web" | "print",
  limit = 5,
): string[] {
  const paths = type === "web" ? (manifest.web_files ?? []) : (manifest.print_files ?? []);
  const ranked = rankPaths(name, paths, type);
  return ranked.slice(0, limit).map((entry) => entry.path);
}

export function suggestVendorLogoPaths(name: string, manifest: VendorLogoManifestPaths) {
  const webPath = findBestPath(name, manifest.web_files ?? [], "web");
  const printPath = findBestPath(name, manifest.print_files ?? [], "print");
  return { webPath, printPath };
}

// Try explicit overrides first, then slug-based runtime paths so local logo packs still resolve without saved URLs.
export function getVendorLogoCandidates(vendor: IVendor | undefined, usePrintLogo: boolean): string[] {
  if (!vendor) {
    return [];
  }

  const extraLogo = parseExtraString(vendor.extra?.logo_url);
  const extraPrintLogo = parseExtraString(vendor.extra?.print_logo_url);
  const customLogo = usePrintLogo ? extraPrintLogo : extraLogo;

  const candidates: string[] = [];
  const customUrl = normalizeUrl(customLogo);
  if (customUrl) {
    candidates.push(customUrl);
  }

  const slug = slugifyVendorName(vendor.name);
  if (slug) {
    const basePath = getBasePath();
    // After any explicit URL, fall back to the conventional runtime file paths so blank
    // logo fields can still resolve to local logo-pack files derived from the vendor name.
    const printCandidates = [`${basePath}/vendor-logos/print/${slug}.png`, `${basePath}/vendor-logos/${slug}.png`];
    const webCandidates = [
      `${basePath}/vendor-logos/web/${slug}.png`,
      `${basePath}/vendor-logos/web/${slug}-web.png`,
      `${basePath}/vendor-logos/${slug}.png`,
      `${basePath}/vendor-logos/${slug}-web.png`,
    ];
    candidates.push(...(usePrintLogo ? printCandidates : [...webCandidates, ...printCandidates]));
  }

  return [...new Set(candidates)];
}
