import { parseWfsCapabilities } from "./parse-wfs-capabilities.js";
import type { WfsCapabilities } from "../../domain/wfs-capabilities.js";

const defaultOutputFormat = "application/gml+xml; version=3.2";
const defaultRetryOptions = {
  retries: 2,
  initialDelayMs: 100,
} as const;

export type WfsClientOptions = {
  readonly endpoint: string;
  readonly fetch?: WfsFetch;
  readonly sleep?: WfsSleep;
  readonly timeoutMs?: number;
  readonly retry?: Partial<WfsRetryOptions>;
  readonly userAgent?: string;
};

export type WfsRetryOptions = {
  readonly retries: number;
  readonly initialDelayMs: number;
};

export type WfsFetch = (url: string, init: WfsFetchInit) => Promise<WfsResponse>;

export type WfsFetchInit = {
  readonly method: "GET";
  readonly headers: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
};

export type WfsResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly text: () => Promise<string>;
};

export type WfsSleep = (delayMs: number) => Promise<void>;

export type WfsBbox = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly crs: WfsSupportedCrs;
};

export type WfsSupportedCrs = "EPSG:2180" | "EPSG:4326";

export type WfsFeaturePageRequest = {
  readonly typeNames: readonly string[];
  readonly count: number;
  readonly startIndex?: number;
  readonly srsName?: WfsSupportedCrs;
  readonly bbox?: WfsBbox;
  readonly filter?: string;
  readonly outputFormat?: string;
};

export type WfsFeaturePage = {
  readonly url: string;
  readonly xml: string;
  readonly numberMatched: number | "unknown";
  readonly numberReturned: number;
  readonly next?: string;
};

export type WfsClient = {
  readonly getCapabilities: () => Promise<WfsCapabilities>;
  readonly describeFeatureType: (typeNames: readonly string[], outputFormat?: string) => Promise<string>;
  readonly getFeaturePage: (request: WfsFeaturePageRequest) => Promise<WfsFeaturePage>;
  readonly getFeaturePages: (request: WfsFeaturePageRequest) => AsyncGenerator<WfsFeaturePage>;
};

export class WfsClientError extends Error {
  constructor(
    message: string,
    readonly code: "SOURCE_TIMEOUT" | "SOURCE_UNAVAILABLE" | "SOURCE_RATE_LIMITED",
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "WfsClientError";
  }
}

export function createWfsClient(options: WfsClientOptions): WfsClient {
  const fetchImplementation = options.fetch ?? defaultFetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retry = {
    ...defaultRetryOptions,
    ...options.retry,
  };
  const userAgent = options.userAgent ?? "prg-mcp/0.1.0";

  async function requestXml(url: string): Promise<string> {
    for (let attempt = 0; attempt <= retry.retries; attempt += 1) {
      try {
        const response = await fetchWithTimeout(fetchImplementation, url, timeoutMs, userAgent);

        if (response.ok) {
          return response.text();
        }

        if (!shouldRetryStatus(response.status) || attempt === retry.retries) {
          throw createHttpError(response, url);
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw new WfsClientError("WFS request timed out.", "SOURCE_TIMEOUT", { url, timeoutMs });
        }

        if (error instanceof WfsClientError || attempt === retry.retries) {
          throw error;
        }
      }

      await sleep(retry.initialDelayMs * 2 ** attempt);
    }

    throw new WfsClientError("WFS request failed.", "SOURCE_UNAVAILABLE", { url });
  }

  return {
    getCapabilities: async () => {
      const xml = await requestXml(buildWfsUrl(options.endpoint, {
        REQUEST: "GetCapabilities",
      }));

      return parseWfsCapabilities(xml);
    },
    describeFeatureType: async (typeNames, outputFormat = defaultOutputFormat) =>
      requestXml(buildWfsUrl(options.endpoint, {
        REQUEST: "DescribeFeatureType",
        TYPENAMES: formatTypeNames(typeNames),
        OUTPUTFORMAT: outputFormat,
      })),
    getFeaturePage: async (request) => {
      const url = buildGetFeatureUrl(options.endpoint, request);
      const xml = await requestXml(url);

      return {
        url,
        xml,
        ...parseFeatureCollectionPage(xml),
      };
    },
    getFeaturePages: async function* getFeaturePages(request) {
      const pageSize = request.count;
      let startIndex = request.startIndex ?? 0;

      while (true) {
        const page = await this.getFeaturePage({
          ...request,
          count: pageSize,
          startIndex,
        });

        yield page;

        if (page.numberReturned === 0 || isLastPage(page, pageSize, startIndex)) {
          return;
        }

        startIndex += page.numberReturned;
      }
    },
  };
}

export function buildGetFeatureUrl(endpoint: string, request: WfsFeaturePageRequest): string {
  return buildWfsUrl(endpoint, {
    REQUEST: "GetFeature",
    TYPENAMES: formatTypeNames(request.typeNames),
    COUNT: String(request.count),
    STARTINDEX: String(request.startIndex ?? 0),
    OUTPUTFORMAT: request.outputFormat ?? defaultOutputFormat,
    ...(request.srsName ? { SRSNAME: toWfsCrsName(request.srsName) } : {}),
    ...(request.bbox ? { BBOX: formatWfsBbox(request.bbox) } : {}),
    ...(request.filter ? { FILTER: request.filter } : {}),
  });
}

export function formatWfsBbox(bbox: WfsBbox): string {
  const crsName = toWfsCrsName(bbox.crs);

  if (getAxisOrder(bbox.crs) === "yx") {
    return [bbox.minY, bbox.minX, bbox.maxY, bbox.maxX, crsName].join(",");
  }

  return [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY, crsName].join(",");
}

export function toWfsCrsName(crs: WfsSupportedCrs): string {
  if (crs === "EPSG:4326") {
    return "urn:ogc:def:crs:EPSG::4326";
  }

  return "urn:ogc:def:crs:EPSG::2180";
}

export function parseFeatureCollectionPage(xml: string): Omit<WfsFeaturePage, "url" | "xml"> {
  const collectionStart = findFeatureCollectionStartTag(xml);

  if (!collectionStart) {
    throw new Error("WFS GetFeature response is missing FeatureCollection.");
  }

  return {
    numberMatched: parseWfsNumberAttribute(collectionStart, "numberMatched"),
    numberReturned: parseRequiredNumericAttribute(collectionStart, "numberReturned"),
    next: parseOptionalAttribute(collectionStart, "next"),
  };
}

function findFeatureCollectionStartTag(xml: string): string | undefined {
  const nameIndex = xml.indexOf("FeatureCollection");

  if (nameIndex === -1) {
    return undefined;
  }

  const tagStart = xml.lastIndexOf("<", nameIndex);
  const tagEnd = xml.indexOf(">", nameIndex);

  if (tagStart === -1 || tagEnd === -1 || xml[tagStart + 1] === "/") {
    return undefined;
  }

  return xml.slice(tagStart, tagEnd + 1);
}

function buildWfsUrl(endpoint: string, params: Readonly<Record<string, string>>): string {
  const url = new URL(endpoint);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function formatTypeNames(typeNames: readonly string[]): string {
  return typeNames.join(",");
}

function getAxisOrder(crs: WfsSupportedCrs): "xy" | "yx" {
  return crs === "EPSG:4326" ? "yx" : "xy";
}

async function fetchWithTimeout(fetchImplementation: WfsFetch, url: string, timeoutMs: number, userAgent: string): Promise<WfsResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImplementation(url, {
      method: "GET",
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.1",
        "User-Agent": userAgent,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultFetch(url: string, init: WfsFetchInit): Promise<WfsResponse> {
  return fetch(url, init);
}

async function defaultSleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function createHttpError(response: WfsResponse, url: string): WfsClientError {
  if (response.status === 429) {
    return new WfsClientError("WFS request was rate limited.", "SOURCE_RATE_LIMITED", { url, status: response.status });
  }

  return new WfsClientError("WFS request failed.", "SOURCE_UNAVAILABLE", { url, status: response.status, statusText: response.statusText });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function parseWfsNumberAttribute(source: string, attributeName: string): number | "unknown" {
  const value = parseOptionalAttribute(source, attributeName);

  if (!value || value === "unknown") {
    return "unknown";
  }

  return parseWfsNonNegativeInteger(value, attributeName);
}

function parseRequiredNumericAttribute(source: string, attributeName: string): number {
  const value = parseOptionalAttribute(source, attributeName);

  if (!value) {
    throw new Error(`WFS FeatureCollection is missing ${attributeName}.`);
  }

  return parseWfsNonNegativeInteger(value, attributeName);
}

function isLastPage(page: Pick<WfsFeaturePage, "next" | "numberMatched" | "numberReturned">, pageSize: number, startIndex: number): boolean {
  if (page.next) return false;
  if (page.numberMatched !== "unknown") return startIndex + page.numberReturned >= page.numberMatched;
  return page.numberReturned < pageSize;
}

function parseWfsNonNegativeInteger(value: string, attributeName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`WFS FeatureCollection has invalid ${attributeName}: ${value}.`);
  }
  return parsed;
}

function parseOptionalAttribute(source: string, attributeName: string): string | undefined {
  return source.match(new RegExp(`\\b${attributeName}="([^"]*)"`, "u"))?.[1];
}
