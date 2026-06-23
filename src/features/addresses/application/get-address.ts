import type { PrgConfig } from "../../../runtime/config.js";
import { readAddressById, type AddressSummary } from "./address-model.js";

export async function getAddress(config: PrgConfig, addressId: string): Promise<AddressSummary> {
  return readAddressById(config, addressId);
}
