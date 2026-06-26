import { SaxesParser } from "saxes";

import type { WmsCapabilities, WmsLayer } from "../../domain/wms-capabilities.js";

type WmsLayerDraft = {
  name?: string;
  title?: string;
  queryable: boolean;
};

export function parseWmsCapabilities(xml: string): WmsCapabilities {
  const parser = new SaxesParser({
    xmlns: false,
  });
  const stack: string[] = [];
  const layerStack: WmsLayerDraft[] = [];
  const layers: WmsLayer[] = [];
  let textBuffer = "";

  parser.on("opentag", (tag) => {
    const localName = getXmlLocalName(tag.name);
    stack.push(localName);
    textBuffer = "";

    if (localName === "Layer") {
      const inheritedQueryable = layerStack.at(-1)?.queryable ?? false;
      const queryableAttribute = getAttributeValue(tag.attributes, "queryable");
      layerStack.push({
        queryable: queryableAttribute === undefined ? inheritedQueryable : queryableAttribute === "1",
      });
    }
  });

  parser.on("text", (text) => {
    textBuffer += text;
  });

  parser.on("closetag", (tag) => {
    const localName = getXmlLocalName(tag.name);
    const currentLayer = layerStack.at(-1);
    const text = textBuffer.trim();

    if (currentLayer && text.length > 0 && !isInsideStyle(stack)) {
      if (localName === "Name") {
        currentLayer.name = text;
      } else if (localName === "Title") {
        currentLayer.title = text;
      }
    }

    if (localName === "Layer") {
      const closedLayer = layerStack.pop();

      if (closedLayer?.name && closedLayer.title) {
        layers.push({
          name: closedLayer.name,
          title: closedLayer.title,
          queryable: closedLayer.queryable,
        });
      }
    }

    stack.pop();
    textBuffer = "";
  });

  parser.write(xml).close();

  return {
    layers,
  };
}

function getAttributeValue(attributes: Record<string, unknown>, name: string): string | undefined {
  const value = attributes[name];

  return typeof value === "string" ? value : undefined;
}

function getXmlLocalName(name: string): string {
  const separatorIndex = name.indexOf(":");

  return separatorIndex === -1 ? name : name.slice(separatorIndex + 1);
}

function isInsideStyle(stack: readonly string[]): boolean {
  return stack.includes("Style");
}
