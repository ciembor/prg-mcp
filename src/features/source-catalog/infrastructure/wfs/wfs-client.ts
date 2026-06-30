import { SaxesParser } from "saxes";

import { packageUserAgent } from "../../../../runtime/package-metadata.js";
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
  readonly maxPages?: number;
  readonly maxRecords?: number;
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
  const userAgent = options.userAgent ?? packageUserAgent;

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
        handleRequestError(error, { attempt, retries: retry.retries, timeoutMs, url });
      }

      await sleep(retry.initialDelayMs * 2 ** attempt);
    }

    throw new WfsClientError("WFS request failed.", "SOURCE_UNAVAILABLE", { url });
  }

  async function getFeaturePageFromUrl(url: string): Promise<WfsFeaturePage> {
    const xml = await requestXml(url);

    return {
      url,
      xml,
      ...parseFeatureCollectionPage(xml),
    };
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
      return getFeaturePageFromUrl(buildGetFeatureUrl(options.endpoint, request));
    },
    getFeaturePages: async function* getFeaturePages(request) {
      const pageSize = request.count;
      const maxPages = request.maxPages ?? 10_000;
      const maxRecords = request.maxRecords ?? Number.MAX_SAFE_INTEGER;
      let startIndex = request.startIndex ?? 0;
      let nextUrl: string | undefined;
      let pageCount = 0;
      let recordCount = 0;
      const visitedUrls = new Set<string>();

      while (true) {
        assertPageLimit(pageCount, maxPages);

        const page = nextUrl
          ? await getFeaturePageFromUrl(nextUrl)
          : await this.getFeaturePage({
            ...request,
            count: pageSize,
            startIndex,
          });

        pageCount += 1;
        recordCount += page.numberReturned;
        assertRecordLimit(recordCount, maxRecords);

        yield page;

        if (page.numberReturned === 0 || isLastPage(page, pageSize, startIndex)) {
          return;
        }

        startIndex += page.numberReturned;
        nextUrl = page.next ? sameOriginNextUrl(options.endpoint, page.next) : undefined;
        rememberNextUrl(visitedUrls, nextUrl);
      }
    },
  };
}

function assertPageLimit(pageCount: number, maxPages: number): void {
  if (pageCount >= maxPages) {
    throw new WfsClientError("WFS pagination exceeded maxPages.", "SOURCE_UNAVAILABLE", { maxPages });
  }
}

function assertRecordLimit(recordCount: number, maxRecords: number): void {
  if (recordCount > maxRecords) {
    throw new WfsClientError("WFS pagination exceeded maxRecords.", "SOURCE_UNAVAILABLE", { maxRecords });
  }
}

function rememberNextUrl(visitedUrls: Set<string>, nextUrl: string | undefined): void {
  if (!nextUrl) {
    return;
  }

  if (visitedUrls.has(nextUrl)) {
    throw new WfsClientError("WFS pagination returned a repeated next URL.", "SOURCE_UNAVAILABLE", { nextUrl });
  }

  visitedUrls.add(nextUrl);
}

function handleRequestError(
  error: unknown,
  context: { readonly attempt: number; readonly retries: number; readonly timeoutMs: number; readonly url: string },
): void {
  if (isAbortError(error)) {
    throw new WfsClientError("WFS request timed out.", "SOURCE_TIMEOUT", { timeoutMs: context.timeoutMs, url: context.url });
  }

  if (error instanceof WfsClientError) {
    throw error;
  }

  if (context.attempt === context.retries) {
    throw new WfsClientError("WFS request failed.", "SOURCE_UNAVAILABLE", {
      cause: error instanceof Error ? error.message : String(error),
      url: context.url,
    });
  }
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
  const collectionStart = readFeatureCollectionAttributes(xml);

  if (!collectionStart) {
    throw new Error("WFS GetFeature response is missing FeatureCollection.");
  }

  return {
    numberMatched: parseWfsNumberAttribute(collectionStart, "numberMatched"),
    numberReturned: parseRequiredNumericAttribute(collectionStart, "numberReturned"),
    next: getAttributeValue(collectionStart, "next"),
  };
}

function readFeatureCollectionAttributes(xml: string): Record<string, unknown> | undefined {
  const parser = new SaxesParser({ xmlns: false });
  let attributes: Record<string, unknown> | undefined;

  parser.on("opentag", (tag) => {
    if (!attributes && getXmlLocalName(tag.name) === "FeatureCollection") {
      attributes = tag.attributes;
    }
  });

  parser.write(xml).close();

  return attributes;
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

function parseWfsNumberAttribute(source: Record<string, unknown>, attributeName: string): number | "unknown" {
  const value = getAttributeValue(source, attributeName);

  if (!value || value === "unknown") {
    return "unknown";
  }

  return parseWfsNonNegativeInteger(value, attributeName);
}

function parseRequiredNumericAttribute(source: Record<string, unknown>, attributeName: string): number {
  const value = getAttributeValue(source, attributeName);

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

function sameOriginNextUrl(endpoint: string, next: string): string | undefined {
  try {
    const endpointUrl = new URL(endpoint);
    const nextUrl = new URL(next, endpointUrl);
    return nextUrl.origin === endpointUrl.origin ? nextUrl.toString() : undefined;
  } catch {
    return undefined;
  }
}

function parseWfsNonNegativeInteger(value: string, attributeName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`WFS FeatureCollection has invalid ${attributeName}: ${value}.`);
  }
  return parsed;
}

function getAttributeValue(attributes: Record<string, unknown>, attributeName: string): string | undefined {
  const value = attributes[attributeName];

  return typeof value === "string" ? value : undefined;
}

function getXmlLocalName(name: string): string {
  const separatorIndex = name.indexOf(":");

  return separatorIndex === -1 ? name : name.slice(separatorIndex + 1);
}
