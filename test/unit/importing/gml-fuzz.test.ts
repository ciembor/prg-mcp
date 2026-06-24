import { describe, expect, it } from "vitest";

import { GmlSecurityError, parseGmlFeatureMembers } from "../../../src/features/importing/index.js";

describe("GML parser bounded fuzz coverage", () => {
  it("rejects forbidden DTD and ENTITY markers even when split across chunks", async () => {
    const payloads = [
      ["<!DOC", "TYPE root []><root />"],
      ["<!ENT", "ITY x SYSTEM 'file:///etc/passwd'><root />"],
      ["<root><!doc", "type root []></root>"],
    ];

    for (const chunks of payloads) {
      await expect(collect(parseGmlFeatureMembers(chunks)), chunks.join("")).rejects.toThrow(GmlSecurityError);
    }
  });

  it("does not emit features for bounded malformed XML fuzz cases", async () => {
    for (const xml of fuzzCases()) {
      await expect(collect(parseGmlFeatureMembers(split(xml, 7))), xml).rejects.toThrow();
    }
  });
});

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
}

function split(value: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) chunks.push(value.slice(index, index + chunkSize));
  return chunks;
}

function fuzzCases(): readonly string[] {
  return [
    "<gml:FeatureCollection xmlns:gml=\"http://www.opengis.net/gml/3.2\"><gml:featureMember>",
    "<gml:FeatureCollection xmlns:gml=\"http://www.opengis.net/gml/3.2\"><gml:featureMember><x:a></x:b></gml:featureMember></gml:FeatureCollection>",
    "<gml:FeatureCollection xmlns:gml=\"http://www.opengis.net/gml/3.2\"><gml:featureMember><x:a xmlns:x=\"urn:x\">\u0000</x:a></gml:featureMember></gml:FeatureCollection>",
  ];
}
