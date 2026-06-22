import { TextDecoder } from "node:util";

import { SaxesParser } from "saxes";

import {
  GmlSecurityError,
  type GmlCoordinateGeometry,
  type GmlCoordinateGeometryType,
  type GmlFeature,
} from "../../domain/gml-feature.js";

type XmlStackEntry = {
  name: string;
  localName: string;
  namespaceUri?: string;
  attributes: Readonly<Record<string, unknown>>;
  text: string;
};

type GmlFeatureDraft = {
  id?: string;
  typeName: string;
  namespaceUri?: string;
  rootStackIndex: number;
  depth: number;
  properties: Record<string, string[]>;
  geometries: GmlCoordinateGeometry[];
};

type GmlGeometryDraft = {
  type: GmlCoordinateGeometryType;
  rootDepth: number;
  srsName?: string;
  coordinateText?: string;
  coordinateElement?: "pos" | "posList";
};

const gmlNamespaceUri = `http${"://"}www.opengis.net/gml/3.2`;
const forbiddenMarkupPattern = /<!(?:doctype|entity)\b/iu;
const geometryElementNames = new Set<GmlCoordinateGeometryType>([
  "Point",
  "LineString",
  "Polygon",
  "MultiPoint",
  "MultiLineString",
  "MultiPolygon",
  "MultiCurve",
  "MultiSurface",
]);

export async function* parseGmlFeatureMembers(
  chunks: AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>,
): AsyncGenerator<GmlFeature> {
  const decoder = new TextDecoder();
  const parser = new SaxesParser({
    xmlns: true,
  });
  const stack: XmlStackEntry[] = [];
  const emittedFeatures: GmlFeature[] = [];
  const geometryStack: GmlGeometryDraft[] = [];
  let currentFeature: GmlFeatureDraft | undefined;
  let parserFailure: unknown;
  let securityTail = "";

  parser.on("doctype", () => {
    parserFailure = new GmlSecurityError("GML input contains forbidden DTD markup.");
  });

  parser.on("error", (error) => {
    parserFailure = error;
  });

  parser.on("opentag", (tag) => {
    const parent = stack.at(-1);
    const entry = toStackEntry(tag);
    stack.push(entry);

    if (!currentFeature && parent && isGmlFeatureMember(parent) && !isGmlElement(entry)) {
      currentFeature = startFeatureDraft(entry, stack.length - 1);
      return;
    }

    if (!currentFeature) {
      return;
    }

    currentFeature.depth += 1;

    if (isGeometryElement(entry)) {
      geometryStack.push({
        rootDepth: currentFeature.depth,
        srsName: getAttributeValue(entry.attributes, "srsName"),
        type: entry.localName as GmlCoordinateGeometryType,
      });
    }
  });

  parser.on("text", (text) => {
    const currentEntry = stack.at(-1);

    if (currentEntry) {
      currentEntry.text += text;
    }
  });

  parser.on("closetag", () => {
    const entry = stack.at(-1);

    if (!entry) {
      return;
    }

    if (currentFeature) {
      collectCurrentEntryText(currentFeature, geometryStack.at(-1), stack, entry);
      closeCurrentGeometry(currentFeature, geometryStack, entry);

      if (currentFeature.depth === 1 && stack.length - 1 === currentFeature.rootStackIndex) {
        emittedFeatures.push(toGmlFeature(currentFeature));
        currentFeature = undefined;
      } else {
        currentFeature.depth -= 1;
      }
    }

    stack.pop();
  });

  for await (const chunk of chunks) {
    const xml = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    securityTail = assertNoForbiddenMarkup(xml, securityTail);
    writeParserChunk(parser, xml, () => parserFailure);

    while (emittedFeatures.length > 0) {
      yield emittedFeatures.shift() as GmlFeature;
    }
  }

  const trailing = decoder.decode();

  if (trailing.length > 0) {
    assertNoForbiddenMarkup(trailing, securityTail);
    writeParserChunk(parser, trailing, () => parserFailure);
  }

  closeParser(parser, () => parserFailure);

  while (emittedFeatures.length > 0) {
    yield emittedFeatures.shift() as GmlFeature;
  }
}

function toStackEntry(tag: {
  name: string;
  local?: string;
  uri?: string;
  attributes: Readonly<Record<string, unknown>>;
}): XmlStackEntry {
  return {
    attributes: tag.attributes,
    localName: tag.local ?? getXmlLocalName(tag.name),
    name: tag.name,
    namespaceUri: tag.uri,
    text: "",
  };
}

function startFeatureDraft(entry: XmlStackEntry, rootStackIndex: number): GmlFeatureDraft {
  return {
    geometries: [],
    id: getAttributeValue(entry.attributes, "id", gmlNamespaceUri),
    namespaceUri: entry.namespaceUri,
    properties: {},
    rootStackIndex,
    typeName: entry.localName,
    depth: 1,
  };
}

function collectCurrentEntryText(
  feature: GmlFeatureDraft,
  geometry: GmlGeometryDraft | undefined,
  stack: readonly XmlStackEntry[],
  entry: XmlStackEntry,
): void {
  const text = entry.text.trim();

  if (text.length === 0) {
    return;
  }

  const path = stack.slice(feature.rootStackIndex + 1).map((stackEntry) => stackEntry.localName);
  addProperty(feature.properties, entry.localName, text);

  if (path.length > 0) {
    addProperty(feature.properties, path.join("."), text);
  }

  if (geometry && isCoordinateElement(entry)) {
    geometry.coordinateElement = entry.localName;
    geometry.coordinateText = text;
  }
}

function closeCurrentGeometry(
  feature: GmlFeatureDraft,
  geometryStack: GmlGeometryDraft[],
  entry: XmlStackEntry,
): void {
  const geometry = geometryStack.at(-1);

  if (!geometry || geometry.type !== entry.localName || geometry.rootDepth !== feature.depth) {
    return;
  }

  if (geometry.coordinateText && geometry.coordinateElement) {
    feature.geometries.push({
      coordinateElement: geometry.coordinateElement,
      coordinateText: geometry.coordinateText,
      srsName: geometry.srsName,
      type: geometry.type,
    });
  }

  geometryStack.pop();
}

function toGmlFeature(feature: GmlFeatureDraft): GmlFeature {
  return {
    geometries: feature.geometries,
    id: feature.id,
    namespaceUri: feature.namespaceUri,
    properties: feature.properties,
    typeName: feature.typeName,
  };
}

function addProperty(properties: Record<string, string[]>, key: string, value: string): void {
  properties[key] ??= [];
  properties[key].push(value);
}

function isGmlFeatureMember(entry: XmlStackEntry): boolean {
  return entry.namespaceUri === gmlNamespaceUri && (entry.localName === "featureMember" || entry.localName === "featureMembers");
}

function isGmlElement(entry: XmlStackEntry): boolean {
  return entry.namespaceUri === gmlNamespaceUri;
}

function isGeometryElement(entry: XmlStackEntry): boolean {
  return entry.namespaceUri === gmlNamespaceUri && geometryElementNames.has(entry.localName as GmlCoordinateGeometryType);
}

function isCoordinateElement(entry: XmlStackEntry): entry is XmlStackEntry & { localName: "pos" | "posList" } {
  return entry.namespaceUri === gmlNamespaceUri && (entry.localName === "pos" || entry.localName === "posList");
}

function getAttributeValue(
  attributes: Readonly<Record<string, unknown>>,
  localName: string,
  namespaceUri?: string,
): string | undefined {
  for (const [name, rawAttribute] of Object.entries(attributes)) {
    if (typeof rawAttribute === "string") {
      if (name === localName || getXmlLocalName(name) === localName) {
        return rawAttribute;
      }

      continue;
    }

    if (!rawAttribute || typeof rawAttribute !== "object") {
      continue;
    }

    const attribute = rawAttribute as {
      local?: string;
      name?: string;
      uri?: string;
      value?: unknown;
    };
    const matchesName = attribute.local === localName || attribute.name === localName || getXmlLocalName(attribute.name ?? "") === localName;
    const matchesNamespace = namespaceUri === undefined || attribute.uri === namespaceUri;

    if (matchesName && matchesNamespace && typeof attribute.value === "string") {
      return attribute.value;
    }
  }

  return undefined;
}

function writeParserChunk(parser: SaxesParser, xml: string, getFailure: () => unknown): void {
  parser.write(xml);
  throwIfParserFailed(getFailure());
}

function closeParser(parser: SaxesParser, getFailure: () => unknown): void {
  parser.close();
  throwIfParserFailed(getFailure());
}

function throwIfParserFailed(error: unknown): void {
  if (error) {
    throw error;
  }
}

function assertNoForbiddenMarkup(xml: string, previousTail: string): string {
  const searchable = `${previousTail}${xml}`;

  if (forbiddenMarkupPattern.test(searchable)) {
    throw new GmlSecurityError("GML input contains forbidden DTD or ENTITY markup.");
  }

  return searchable.slice(-32);
}

function getXmlLocalName(name: string): string {
  const separatorIndex = name.indexOf(":");

  return separatorIndex === -1 ? name : name.slice(separatorIndex + 1);
}
