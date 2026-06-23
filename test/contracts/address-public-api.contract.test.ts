import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AddressToolError,
  decodeAddressId,
  decodeStreetId,
  encodeAddressId,
  encodeStreetId,
  type AddressIdentifier,
  type AddressStructuredQuery,
  type AddressSummary,
  type ReverseAddressInput,
  type ReverseAddressResult,
  type SearchAddressesInput,
  type SearchAddressesResult,
  type SearchStreetsInput,
  type SearchStreetsResult,
  type StreetIdentifier,
  type StreetSummary,
  type StreetWithGeometry,
} from "../../src/features/addresses/index.js";
import type { PrgGeometry } from "../../src/features/spatial/index.js";

describe("address public API", () => {
  it("keeps exported identifiers, errors and use-case DTOs stable", () => {
    const addressIdentifier: AddressIdentifier = { objectId: "pa-1", voivodeshipCode: "14" };
    const streetIdentifier: StreetIdentifier = { objectId: "ul-1", voivodeshipCode: "14" };
    const addressId = encodeAddressId(addressIdentifier);
    const streetId = encodeStreetId(streetIdentifier);

    expect(decodeAddressId(addressId)).toEqual(addressIdentifier);
    expect(decodeStreetId(streetId)).toEqual(streetIdentifier);
    expect(new AddressToolError("ADDRESS_NOT_FOUND", "missing")).toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    expectTypeOf<AddressStructuredQuery>().toMatchTypeOf<{ localityName?: string; buildingNumber?: string }>();
    expectTypeOf<SearchAddressesInput>().toMatchTypeOf<{ query?: string; structured?: AddressStructuredQuery }>();
    expectTypeOf<SearchAddressesResult>().toMatchTypeOf<{ addresses: readonly AddressSummary[] }>();
    expectTypeOf<ReverseAddressInput>().toMatchTypeOf<{ x: number; y: number }>();
    expectTypeOf<ReverseAddressResult>().toMatchTypeOf<{ addresses: readonly (AddressSummary & { readonly distanceMeters: number })[] }>();
    expectTypeOf<SearchStreetsInput>().toMatchTypeOf<{ query: string }>();
    expectTypeOf<SearchStreetsResult>().toMatchTypeOf<{ streets: readonly StreetSummary[] }>();
    expectTypeOf<StreetWithGeometry>().toMatchTypeOf<StreetSummary & { geometry: PrgGeometry }>();
  });
});
