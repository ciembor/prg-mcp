import type { GmlCoordinateGeometry, GmlFeature } from "../../domain/gml-feature.js";

export type EmuiaSchemaVersion = "emuia-2012" | "emuia-2021";

export type EmuiaPointGeometry = {
  type: "Point";
  srsName?: string;
  coordinates: readonly [number, number];
};

export type EmuiaLineStringGeometry = {
  type: "LineString";
  srsName?: string;
  coordinates: readonly (readonly [number, number])[];
};

export type EmuiaAddressPoint = {
  kind: "address-point";
  schemaVersion: EmuiaSchemaVersion;
  sourceFeatureType: "AD_PunktAdresowy";
  objectId?: string;
  localId: string;
  namespace: string;
  versionId?: string;
  lifecycleStart?: string;
  houseNumber: string;
  postalCode?: string;
  validFrom?: string;
  geometry: EmuiaPointGeometry;
};

export type EmuiaStreet = {
  kind: "street";
  schemaVersion: EmuiaSchemaVersion;
  sourceFeatureType: "AD_Ulica" | "AD_UlicaPlac";
  objectId?: string;
  localId: string;
  namespace: string;
  name: string;
  fullName: string;
  ulicId?: string;
  streetType?: string;
  geometry: EmuiaLineStringGeometry;
};

export type EmuiaFeature = EmuiaAddressPoint | EmuiaStreet;

export function detectEmuiaSchemaVersion(input: GmlFeature | string): EmuiaSchemaVersion | undefined {
  const namespace = typeof input === "string" ? input : input.namespaceUri;

  if (!namespace) {
    return undefined;
  }

  if (namespace.includes("urn:gugik:emuia:2012")) {
    return "emuia-2012";
  }

  if (namespace.includes("urn:gugik:emuia:2021")) {
    return "emuia-2021";
  }

  return undefined;
}

export function mapEmuiaFeature(feature: GmlFeature): EmuiaFeature | undefined {
  if (feature.typeName === "AD_PunktAdresowy") {
    return mapEmuiaAddressPoint(feature);
  }

  if (feature.typeName === "AD_Ulica" || feature.typeName === "AD_UlicaPlac") {
    return mapEmuiaStreet(feature);
  }

  return undefined;
}

export function mapEmuiaAddressPoint(feature: GmlFeature): EmuiaAddressPoint {
  const schemaVersion = requireSchemaVersion(feature);
  const geometry = requirePointGeometry(feature.geometries);

  return {
    geometry,
    houseNumber: requireProperty(feature, "numerPorzadkowy"),
    kind: "address-point",
    lifecycleStart: firstProperty(feature, "poczatekWersjiObiektu"),
    localId: requireProperty(feature, "lokalnyId"),
    namespace: requireProperty(feature, "przestrzenNazw"),
    objectId: feature.id,
    postalCode: firstProperty(feature, "kodPocztowy"),
    schemaVersion,
    sourceFeatureType: "AD_PunktAdresowy",
    validFrom: firstProperty(feature, schemaVersion === "emuia-2012" ? "waznyOd" : "dataNadania"),
    versionId: firstProperty(feature, "wersjaId"),
  };
}

export function mapEmuiaStreet(feature: GmlFeature): EmuiaStreet {
  const schemaVersion = requireSchemaVersion(feature);
  const geometry = requireLineStringGeometry(feature.geometries);
  const oldName = firstProperty(feature, "nazwa.AD_NazwaUlicy.nazwaGlownaCzesc");
  const newName = firstProperty(feature, "TERYTNazwa1");
  const fullName = firstProperty(feature, "nazwaPelna") ?? oldName ?? newName;

  if (!fullName) {
    throw new Error(`EMUiA street ${feature.id ?? feature.typeName} is missing a street name.`);
  }

  return {
    fullName,
    geometry,
    kind: "street",
    localId: requireProperty(feature, "lokalnyId"),
    name: oldName ?? newName ?? fullName,
    namespace: requireProperty(feature, "przestrzenNazw"),
    objectId: feature.id,
    schemaVersion,
    sourceFeatureType: feature.typeName as "AD_Ulica" | "AD_UlicaPlac",
    streetType: firstProperty(feature, schemaVersion === "emuia-2012" ? "typ" : "rodzaj"),
    ulicId: firstProperty(feature, schemaVersion === "emuia-2012" ? "nazwa.AD_NazwaUlicy.idTERYT" : "identyfikatorULIC"),
  };
}

function requireSchemaVersion(feature: GmlFeature): EmuiaSchemaVersion {
  const schemaVersion = detectEmuiaSchemaVersion(feature);

  if (!schemaVersion) {
    throw new Error(`Unsupported EMUiA namespace for feature ${feature.id ?? feature.typeName}.`);
  }

  return schemaVersion;
}

function requirePointGeometry(geometries: readonly GmlCoordinateGeometry[]): EmuiaPointGeometry {
  const geometry = geometries.find((candidate) => candidate.type === "Point" && candidate.coordinateElement === "pos");

  if (!geometry) {
    throw new Error("EMUiA address point is missing gml:Point/gml:pos geometry.");
  }

  return {
    coordinates: parseCoordinatePair(geometry.coordinateText),
    srsName: geometry.srsName,
    type: "Point",
  };
}

function requireLineStringGeometry(geometries: readonly GmlCoordinateGeometry[]): EmuiaLineStringGeometry {
  const geometry = geometries.find((candidate) => candidate.type === "LineString" && candidate.coordinateElement === "posList");

  if (!geometry) {
    throw new Error("EMUiA street is missing gml:LineString/gml:posList geometry.");
  }

  return {
    coordinates: parseCoordinateList(geometry.coordinateText),
    srsName: geometry.srsName,
    type: "LineString",
  };
}

function parseCoordinatePair(text: string): readonly [number, number] {
  const values = text.split(/\s+/u).map(Number);

  if (values.length !== 2 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid GML coordinate pair: ${text}`);
  }

  return [values[0] as number, values[1] as number];
}

function parseCoordinateList(text: string): readonly (readonly [number, number])[] {
  const values = text.split(/\s+/u).map(Number);

  if (values.length < 4 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid GML coordinate list: ${text}`);
  }

  const coordinates: Array<readonly [number, number]> = [];

  for (let index = 0; index < values.length; index += 2) {
    coordinates.push([values[index] as number, values[index + 1] as number]);
  }

  return coordinates;
}

function requireProperty(feature: GmlFeature, key: string): string {
  const value = firstProperty(feature, key);

  if (!value) {
    throw new Error(`EMUiA feature ${feature.id ?? feature.typeName} is missing ${key}.`);
  }

  return value;
}

function firstProperty(feature: GmlFeature, key: string): string | undefined {
  return feature.properties[key]?.[0];
}
