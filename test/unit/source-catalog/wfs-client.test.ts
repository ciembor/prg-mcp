import { describe, expect, expectTypeOf, it } from "vitest";

import {
  buildGetFeatureUrl,
  createWfsClient,
  formatWfsBbox,
  parseFeatureCollectionPage,
  prgWfsDefaultCrs,
  toWfsCrsName,
  WfsClientError,
  type WfsBbox,
  type WfsClient,
  type WfsClientOptions,
  type WfsFeaturePage,
  type WfsFeaturePageRequest,
  type WfsFetch,
  type WfsRetryOptions,
  type WfsResponse,
  type WfsSleep,
  type WfsSupportedCrs,
} from "../../../src/features/source-catalog/index.js";

const endpoint = "https://example.test/wfs?language=pol";
const capabilitiesXml = `<?xml version="1.0"?>
<wfs:WFS_Capabilities xmlns:wfs="http://www.opengis.net/wfs/2.0" version="2.0.0">
  <FeatureTypeList>
    <FeatureType>
      <Name>ms:A00_Granice_panstwa</Name>
      <Title>A00_Granice_panstwa</Title>
      <DefaultCRS>${prgWfsDefaultCrs}</DefaultCRS>
      <OutputFormats><Format>application/gml+xml; version=3.2</Format></OutputFormats>
    </FeatureType>
  </FeatureTypeList>
</wfs:WFS_Capabilities>`;

describe("WFS 2.0 client", () => {
  it("keeps the exported WFS client type surface intentional", () => {
    expectTypeOf<WfsClientOptions>().toMatchTypeOf<{
      endpoint: string;
      fetch?: WfsFetch;
      sleep?: WfsSleep;
      timeoutMs?: number;
      retry?: Partial<WfsRetryOptions>;
    }>();
    expectTypeOf<WfsClient>().toHaveProperty("getFeaturePages").toEqualTypeOf<
      (request: WfsFeaturePageRequest) => AsyncGenerator<WfsFeaturePage>
    >();
    expectTypeOf<WfsBbox>().toHaveProperty("crs").toEqualTypeOf<WfsSupportedCrs>();
  });

  it("requests and parses GetCapabilities", async () => {
    const requestedUrls: string[] = [];
    const client = createWfsClient({
      endpoint,
      fetch: createFetchMock(requestedUrls, [response(capabilitiesXml)]),
      retry: { retries: 0 },
    });

    await expect(client.getCapabilities()).resolves.toEqual({
      featureTypes: [
        {
          name: "ms:A00_Granice_panstwa",
          title: "A00_Granice_panstwa",
          defaultCrs: prgWfsDefaultCrs,
          otherCrs: [],
          outputFormats: ["application/gml+xml; version=3.2"],
        },
      ],
    });
    expect(new URL(requestedUrls[0] ?? "").searchParams.get("REQUEST")).toBe("GetCapabilities");
  });

  it("requests DescribeFeatureType for selected type names", async () => {
    const requestedUrls: string[] = [];
    const client = createWfsClient({
      endpoint,
      fetch: createFetchMock(requestedUrls, [response("<schema />")]),
      retry: { retries: 0 },
    });

    await expect(client.describeFeatureType(["ms:A00_Granice_panstwa", "ms:A01_Granice_wojewodztw"])).resolves.toBe("<schema />");

    const params = new URL(requestedUrls[0] ?? "").searchParams;
    expect(params.get("REQUEST")).toBe("DescribeFeatureType");
    expect(params.get("TYPENAMES")).toBe("ms:A00_Granice_panstwa,ms:A01_Granice_wojewodztw");
    expect(params.get("OUTPUTFORMAT")).toBe("application/gml+xml; version=3.2");
  });

  it("builds GetFeature requests with paging, bbox, filter and explicit axis order", () => {
    const url = buildGetFeatureUrl(endpoint, {
      typeNames: ["ms:A03_Granice_gmin"],
      count: 50,
      startIndex: 100,
      srsName: "EPSG:4326",
      bbox: {
        minX: 21,
        minY: 52,
        maxX: 22,
        maxY: 53,
        crs: "EPSG:4326",
      },
      filter: "<fes:Filter />",
    });

    const params = new URL(url).searchParams;
    expect(params.get("REQUEST")).toBe("GetFeature");
    expect(params.get("COUNT")).toBe("50");
    expect(params.get("STARTINDEX")).toBe("100");
    expect(params.get("SRSNAME")).toBe("urn:ogc:def:crs:EPSG::4326");
    expect(params.get("BBOX")).toBe("52,21,53,22,urn:ogc:def:crs:EPSG::4326");
    expect(params.get("FILTER")).toBe("<fes:Filter />");
  });

  it("formats CRS names and bbox axis order explicitly", () => {
    expect(toWfsCrsName("EPSG:2180")).toBe("urn:ogc:def:crs:EPSG::2180");
    expect(toWfsCrsName("EPSG:4326")).toBe("urn:ogc:def:crs:EPSG::4326");
    expect(formatWfsBbox({ minX: 100, minY: 200, maxX: 300, maxY: 400, crs: "EPSG:2180" })).toBe(
      "100,200,300,400,urn:ogc:def:crs:EPSG::2180",
    );
    expect(formatWfsBbox({ minX: 21, minY: 52, maxX: 22, maxY: 53, crs: "EPSG:4326" })).toBe(
      "52,21,53,22,urn:ogc:def:crs:EPSG::4326",
    );
  });

  it("parses page metadata and iterates WFS result pages", async () => {
    const requestedUrls: string[] = [];
    const client = createWfsClient({
      endpoint,
      fetch: createFetchMock(requestedUrls, [
        response(featureCollection({ numberMatched: "3", numberReturned: 2, next: "https://example.test/page-2" })),
        response(featureCollection({ numberMatched: "3", numberReturned: 1 })),
      ]),
      retry: { retries: 0 },
    });

    const pages = [];
    for await (const page of client.getFeaturePages({ typeNames: ["ms:A00_Granice_panstwa"], count: 2 })) {
      pages.push(page);
    }

    expect(pages.map(({ numberMatched, numberReturned, next }) => ({ numberMatched, numberReturned, next }))).toEqual([
      {
        numberMatched: 3,
        numberReturned: 2,
        next: "https://example.test/page-2",
      },
      {
        numberMatched: 3,
        numberReturned: 1,
        next: undefined,
      },
    ]);
    expect(new URL(requestedUrls[0] ?? "").searchParams.get("STARTINDEX")).toBe("0");
    expect(new URL(requestedUrls[1] ?? "").searchParams.get("STARTINDEX")).toBe("2");
  });

  it("continues WFS pagination without next links while numberMatched says more data exists", async () => {
    const requestedUrls: string[] = [];
    const client = createWfsClient({
      endpoint,
      fetch: createFetchMock(requestedUrls, [
        response(featureCollection({ numberMatched: "3", numberReturned: 2 })),
        response(featureCollection({ numberMatched: "3", numberReturned: 1 })),
      ]),
      retry: { retries: 0 },
    });

    const pages = [];
    for await (const page of client.getFeaturePages({ typeNames: ["ms:A00_Granice_panstwa"], count: 2 })) {
      pages.push(page);
    }

    expect(pages).toHaveLength(2);
    expect(new URL(requestedUrls[1] ?? "").searchParams.get("STARTINDEX")).toBe("2");
  });

  it("rejects non-finite WFS page counters", async () => {
    const client = createWfsClient({
      endpoint,
      fetch: createFetchMock([], [response(featureCollection({ numberMatched: "NaN", numberReturned: 1 }))]),
      retry: { retries: 0 },
    });

    await expect(client.getFeaturePage({ typeNames: ["ms:A00_Granice_panstwa"], count: 2 })).rejects.toThrow("invalid numberMatched");
  });

  it("retries transient WFS errors and reports stable failures", async () => {
    const requestedUrls: string[] = [];
    const retryDelays: number[] = [];
    const client = createWfsClient({
      endpoint,
      fetch: createFetchMock(requestedUrls, [response("unavailable", 503), response(featureCollection({ numberMatched: "unknown", numberReturned: 0 }))]),
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      retry: { retries: 1, initialDelayMs: 25 },
    });

    await expect(client.getFeaturePage({ typeNames: ["ms:A00_Granice_panstwa"], count: 10 })).resolves.toMatchObject({
      numberMatched: "unknown",
      numberReturned: 0,
    });
    expect(requestedUrls).toHaveLength(2);
    expect(retryDelays).toEqual([25]);
  });

  it("maps timeout aborts to SOURCE_TIMEOUT", async () => {
    const client = createWfsClient({
      endpoint,
      fetch: async () => {
        throw new DOMException("aborted", "AbortError");
      },
      retry: { retries: 0 },
      timeoutMs: 1,
    });

    await expect(client.getCapabilities()).rejects.toMatchObject({
      name: "WfsClientError",
      code: "SOURCE_TIMEOUT",
    } satisfies Partial<WfsClientError>);
  });
});

function createFetchMock(requestedUrls: string[], responses: WfsResponse[]): WfsFetch {
  return async (url) => {
    requestedUrls.push(url);
    const nextResponse = responses.shift();

    if (!nextResponse) {
      throw new Error("Unexpected WFS request.");
    }

    return nextResponse;
  };
}

function response(body: string, status = 200): WfsResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: async () => body,
  };
}

function featureCollection(options: { readonly numberMatched: number | "unknown" | string; readonly numberReturned: number; readonly next?: string }): string {
  const next = options.next ? ` next="${options.next}"` : "";

  return `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" numberMatched="${options.numberMatched}" numberReturned="${options.numberReturned}"${next}></wfs:FeatureCollection>`;
}

describe("WFS FeatureCollection page parser", () => {
  it("rejects invalid page responses", () => {
    expect(() => parseFeatureCollectionPage("<xml />")).toThrow("WFS GetFeature response is missing FeatureCollection.");
  });
});
