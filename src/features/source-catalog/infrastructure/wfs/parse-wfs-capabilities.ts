import { SaxesParser } from "saxes";

import type { WfsCapabilities, WfsFeatureType } from "../../domain/wfs-capabilities.js";

type FeatureTypeDraft = {
  name?: string;
  title?: string;
  defaultCrs?: string;
  otherCrs: string[];
  outputFormats: string[];
};

export function parseWfsCapabilities(xml: string): WfsCapabilities {
  const parser = new SaxesParser({
    xmlns: false,
  });
  const featureTypes: WfsFeatureType[] = [];
  const elementStack: string[] = [];
  let currentFeatureType: FeatureTypeDraft | undefined;
  let textBuffer = "";

  parser.on("opentag", (tag) => {
    elementStack.push(getXmlLocalName(tag.name));
    textBuffer = "";

    if (isCurrentElement("FeatureType", elementStack)) {
      currentFeatureType = {
        otherCrs: [],
        outputFormats: [],
      };
    }
  });

  parser.on("text", (text) => {
    textBuffer += text;
  });

  parser.on("closetag", (tag) => {
    const localName = getXmlLocalName(tag.name);
    const text = textBuffer.trim();

    if (currentFeatureType && text.length > 0) {
      collectFeatureTypeText(currentFeatureType, localName, text);
    }

    if (localName === "FeatureType" && currentFeatureType) {
      featureTypes.push(toFeatureType(currentFeatureType));
      currentFeatureType = undefined;
    }

    elementStack.pop();
    textBuffer = "";
  });

  parser.write(xml).close();

  return {
    featureTypes,
  };
}

function collectFeatureTypeText(featureType: FeatureTypeDraft, localName: string, text: string): void {
  if (localName === "Name") {
    featureType.name = text;
    return;
  }

  if (localName === "Title") {
    featureType.title = text;
    return;
  }

  if (localName === "DefaultCRS" || localName === "DefaultSRS") {
    featureType.defaultCrs = text;
    return;
  }

  if (localName === "OtherCRS" || localName === "OtherSRS") {
    featureType.otherCrs.push(text);
    return;
  }

  if (localName === "Format") {
    featureType.outputFormats.push(text);
  }
}

function toFeatureType(featureType: FeatureTypeDraft): WfsFeatureType {
  if (!featureType.name || !featureType.title || !featureType.defaultCrs) {
    throw new Error("WFS capabilities FeatureType is missing Name, Title or DefaultCRS.");
  }

  return {
    name: featureType.name,
    title: featureType.title,
    defaultCrs: featureType.defaultCrs,
    otherCrs: featureType.otherCrs,
    outputFormats: featureType.outputFormats,
  };
}

function getXmlLocalName(name: string): string {
  const separatorIndex = name.indexOf(":");

  return separatorIndex === -1 ? name : name.slice(separatorIndex + 1);
}

function isCurrentElement(name: string, stack: readonly string[]): boolean {
  return stack.at(-1) === name;
}
