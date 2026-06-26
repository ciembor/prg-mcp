const allowedPackageHostSuffixes = ["geoportal.gov.pl", "gugik.gov.pl"] as const;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export type WmsRedirectFetch = (url: string, init: WmsRedirectFetchInit) => Promise<WmsRedirectResponse>;

export type WmsRedirectFetchInit = {
  readonly method: "HEAD";
  readonly redirect: "manual";
};

export type WmsRedirectResponse = {
  readonly status: number;
  readonly headers: {
    readonly get: (name: string) => string | null;
  };
};

export type ResolvedWmsPackageRedirect = {
  readonly finalUrl: string;
  readonly chain: readonly string[];
};

export class WmsPackageRedirectError extends Error {
  constructor(
    message: string,
    readonly code: "UNTRUSTED_REDIRECT_HOST" | "UNSUPPORTED_REDIRECT_URL" | "REDIRECT_LIMIT_EXCEEDED" | "MISSING_REDIRECT_LOCATION",
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "WmsPackageRedirectError";
  }
}

export function validatePrgPackageUrl(url: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new WmsPackageRedirectError("PRG package URL is not absolute.", "UNSUPPORTED_REDIRECT_URL", { url });
  }

  if (parsed.protocol !== "https:") {
    throw new WmsPackageRedirectError("PRG package URL must use HTTPS.", "UNSUPPORTED_REDIRECT_URL", { url });
  }

  if (!isAllowedPrgPackageHost(parsed.hostname)) {
    throw new WmsPackageRedirectError("PRG package redirect host is not allowed.", "UNTRUSTED_REDIRECT_HOST", {
      host: parsed.hostname,
      url,
    });
  }

  return parsed;
}

export function validatePrgPackageRedirectChain(urls: readonly string[]): ResolvedWmsPackageRedirect {
  if (urls.length === 0) {
    throw new WmsPackageRedirectError("PRG package redirect chain is empty.", "MISSING_REDIRECT_LOCATION");
  }

  for (const url of urls) {
    validatePrgPackageUrl(url);
  }

  return {
    finalUrl: urls.at(-1) ?? urls[0] ?? "",
    chain: urls,
  };
}

export async function resolvePrgPackageRedirects(
  startUrl: string,
  fetchRedirect: WmsRedirectFetch = defaultRedirectFetch,
  maxRedirects = 5,
): Promise<ResolvedWmsPackageRedirect> {
  let currentUrl = validatePrgPackageUrl(startUrl).toString();
  const chain = [currentUrl];

  for (let redirectCount = 0; redirectCount < maxRedirects; redirectCount += 1) {
    const response = await fetchRedirect(currentUrl, {
      method: "HEAD",
      redirect: "manual",
    });

    if (!redirectStatuses.has(response.status)) {
      return validatePrgPackageRedirectChain(chain);
    }

    const location = response.headers.get("location");

    if (!location) {
      throw new WmsPackageRedirectError("PRG package redirect is missing Location header.", "MISSING_REDIRECT_LOCATION", {
        url: currentUrl,
        status: response.status,
      });
    }

    const nextUrl = new URL(location, currentUrl).toString();
    currentUrl = validatePrgPackageUrl(nextUrl).toString();
    chain.push(currentUrl);
  }

  throw new WmsPackageRedirectError("PRG package redirect limit exceeded.", "REDIRECT_LIMIT_EXCEEDED", {
    startUrl,
    maxRedirects,
  });
}

export function isAllowedPrgPackageHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  return allowedPackageHostSuffixes.some((allowedSuffix) => normalizedHostname === allowedSuffix || normalizedHostname.endsWith(`.${allowedSuffix}`));
}

async function defaultRedirectFetch(url: string, init: WmsRedirectFetchInit): Promise<WmsRedirectResponse> {
  return fetch(url, init);
}
