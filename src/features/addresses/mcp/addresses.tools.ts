import { defineZodTool } from "@mcp-craftsman/zod";
import * as z from "zod";

import type { PrgConfig } from "../../../runtime/config.js";
import { prgVoivodeshipCodes } from "../../persistence/index.js";
import type { AddressSummary, StreetSummary } from "../application/address-model.js";
import { getAddress } from "../application/get-address.js";
import { reverseAddress } from "../application/reverse-address.js";
import { searchAddresses } from "../application/search-addresses.js";
import { getStreet, searchStreets } from "../application/streets.js";

const voivodeshipCodeSchema = z.enum(prgVoivodeshipCodes);

const addressSummarySchema = z.object({
  addressId: z.string(),
  buildingNumber: z.string(),
  iipId: z.string().nullable(),
  localityId: z.string().nullable(),
  localityName: z.string().nullable(),
  municipalityCode: z.string().nullable(),
  objectId: z.string(),
  point: z.tuple([z.number(), z.number()]),
  postalCode: z.string().nullable(),
  postalCodeNote: z.literal("postal_code_is_prg_attribute_not_postal_service_validation"),
  sourceProperties: z.record(z.string(), z.unknown()),
  sourceScope: z.string(),
  streetId: z.string().nullable(),
  streetName: z.string().nullable(),
  validFrom: z.string().nullable(),
  versionFrom: z.string().nullable(),
  voivodeshipCode: voivodeshipCodeSchema,
});

const streetSummarySchema = z.object({
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  iipId: z.string().nullable(),
  localityId: z.string().nullable(),
  municipalityCode: z.string().nullable(),
  name: z.string(),
  objectId: z.string(),
  sourceProperties: z.record(z.string(), z.unknown()),
  streetId: z.string(),
  voivodeshipCode: voivodeshipCodeSchema,
});

const geometrySchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ coordinates: z.tuple([z.number(), z.number()]), type: z.literal("Point") }),
    z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])), type: z.literal("MultiPoint") }),
    z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])), type: z.literal("LineString") }),
    z.object({ coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))), type: z.literal("MultiLineString") }),
    z.object({ coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))), type: z.literal("Polygon") }),
    z.object({ coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))), type: z.literal("MultiPolygon") }),
  ]),
);

export function createSearchAddressesTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Searches PRG address points by natural-language text or structured fields; query and structured input are mutually exclusive.",
    handler: async (input) => {
      const result = await searchAddresses(config, input);

      return { structuredContent: { addresses: result.addresses.map(toMutableAddressSummary) } };
    },
    input: z.object({
      limit: z.number().int().min(1).max(100).default(20),
      query: z.string().min(1).optional(),
      structured: z.object({
        buildingNumber: z.string().min(1).optional(),
        localityId: z.string().min(1).optional(),
        localityName: z.string().min(1).optional(),
        municipalityCode: z.string().min(1).optional(),
        postalCode: z.string().min(1).optional(),
        streetId: z.string().min(1).optional(),
        streetName: z.string().min(1).optional(),
      }).optional(),
      voivodeshipCodes: z.array(voivodeshipCodeSchema).max(16).optional(),
    }).refine((input) => Boolean(input.query) !== Boolean(input.structured), {
      message: "search_addresses requires exactly one of query or structured.",
    }),
    name: "search_addresses",
    output: z.object({ addresses: z.array(addressSummarySchema) }),
    policy: "read",
  });
}

export function createGetAddressTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns one PRG address point with IIP identifier, coordinates, postal-code attribute and source provenance.",
    handler: async ({ addressId }) => ({ structuredContent: { address: toMutableAddressSummary(await getAddress(config, addressId)) } }),
    input: z.object({ addressId: z.string().min(1) }),
    name: "get_address",
    output: z.object({ address: addressSummarySchema }),
    policy: "read",
  });
}

export function createReverseAddressTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Finds nearest PRG address points around an EPSG:2180 point using expanding R-tree candidates, exact distance and hard radius/candidate limits.",
    handler: async (input) => {
      const result = await reverseAddress(config, input);

      return {
        structuredContent: {
          addresses: result.addresses.map((address) => ({
            ...toMutableAddressSummary(address),
            distanceMeters: address.distanceMeters,
          })),
          point: [...result.point] as [number, number],
          radiusMeters: result.radiusMeters,
        },
      };
    },
    input: z.object({
      limit: z.number().int().min(1).max(100).default(10),
      maxCandidates: z.number().int().min(1).max(5_000).default(500),
      radiusMeters: z.number().positive().max(10_000).default(500),
      voivodeshipCodes: z.array(voivodeshipCodeSchema).max(16).optional(),
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    name: "reverse_address",
    output: z.object({
      addresses: z.array(addressSummarySchema.extend({ distanceMeters: z.number() })),
      point: z.tuple([z.number(), z.number()]),
      radiusMeters: z.number(),
    }),
    policy: "read",
  });
}

export function createSearchStreetsTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Searches PRG streets, including street records that have no installed address points when A08 street data is present.",
    handler: async (input) => {
      const result = await searchStreets(config, input);

      return { structuredContent: { streets: result.streets.map(toMutableStreetSummary) } };
    },
    input: z.object({
      limit: z.number().int().min(1).max(100).default(20),
      query: z.string().min(1),
      voivodeshipCodes: z.array(voivodeshipCodeSchema).max(16).optional(),
    }),
    name: "search_streets",
    output: z.object({ streets: z.array(streetSummarySchema) }),
    policy: "read",
  });
}

export function createGetStreetTool(config: PrgConfig) {
  return defineZodTool({
    annotations: { readOnlyHint: true },
    description: "Returns one PRG street record with attributes and geometry from installed A08 street data.",
    handler: async ({ streetId }) => {
      const street = await getStreet(config, streetId);

      return { structuredContent: { street: { ...toMutableStreetSummary(street), geometry: street.geometry } } };
    },
    input: z.object({ streetId: z.string().min(1) }),
    name: "get_street",
    output: z.object({ street: streetSummarySchema.extend({ geometry: geometrySchema }) }),
    policy: "read",
  });
}

function toMutableAddressSummary(address: AddressSummary) {
  return {
    ...address,
    point: [...address.point] as [number, number],
  };
}

function toMutableStreetSummary(street: StreetSummary) {
  return {
    ...street,
    bbox: [...street.bbox] as [number, number, number, number],
  };
}
