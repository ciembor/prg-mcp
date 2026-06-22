import type { PrgGeometryType, PrgLayer, PrgLayerCategory, PrgSourceChannel } from "./prg-layer.js";

export const prgLayerCatalog = [
  layer("A00", "A00_Granice_panstwa", "Granice państwa", "administrative", "polygon", "wfs"),
  layer("A01", "A01_Granice_wojewodztw", "Granice województw", "administrative", "polygon", "wfs"),
  layer("A02", "A02_Granice_powiatow", "Granice powiatów", "administrative", "polygon", "wfs"),
  layer("A03", "A03_Granice_gmin", "Granice gmin", "administrative", "polygon", "wfs"),
  layer("A04", "A04_Granice_miast", "Granice miast", "administrative", "polygon", "wfs"),
  layer("A05", "A05_Granice_jednostek_ewidencyjnych", "Granice jednostek ewidencyjnych", "administrative", "polygon", "wfs"),
  layer("A06", "A06_Granice_obrebow_ewidencyjnych", "Granice obrębów ewidencyjnych", "administrative", "polygon", "wfs"),
  layer("A07", "A07_Punkty_adresowe", "Punkty adresowe", "address", "point", "address-package"),
  layer("A08", "A08_Ulice", "Ulice", "address", "line", "address-package"),
  layer("R01", "R01_Granice_rejonow_statystycznych", "Granice rejonów statystycznych", "statistical", "polygon", "wfs"),
  layer("R02", "R02_Granice_obwodow_spisowych", "Granice obwodów spisowych", "statistical", "polygon", "wfs"),
  layer("S01", "S01_Sad_apelacyjny", "Sąd apelacyjny", "court", "polygon", "wfs"),
  layer("S02", "S02_Sad_okregowy", "Sąd okręgowy", "court", "polygon", "wfs"),
  layer("S03", "S03_Sad_rejonowy", "Sąd rejonowy", "court", "polygon", "wfs"),
  layer("S04", "S04_Wojewodzki_sad_administracyjny", "Wojewódzki sąd administracyjny", "court", "polygon", "wfs"),
  layer("P01", "P01_Prokuratura_regionalna", "Prokuratura regionalna", "prosecution", "polygon", "wfs"),
  layer("P02", "P02_Prokuratura_okregowa", "Prokuratura okręgowa", "prosecution", "polygon", "wfs"),
  layer("P03", "P03_Prokuratura_rejonowa", "Prokuratura rejonowa", "prosecution", "polygon", "wfs"),
  layer("K01", "K01_Komenda_wojewodzka_policji", "Komenda wojewódzka policji", "service", "polygon", "wfs"),
  layer("K02", "K02_Komenda_powiatowa_policji", "Komenda powiatowa policji", "service", "polygon", "wfs"),
  layer("K03", "K03_Komenda_stoleczna_policji", "Komenda stołeczna policji", "service", "polygon", "wfs"),
  layer("K04", "K04_Komenda_rejonowa_policji", "Komenda rejonowa policji", "service", "polygon", "wfs"),
  layer("K05", "K05_Komisariat_policji", "Komisariat policji", "service", "polygon", "wfs"),
  layer("K06", "K06_Komenda_wojewodzka_strazy_pozarnej", "Komenda wojewódzka straży pożarnej", "service", "polygon", "wfs"),
  layer("K07", "K07_Komenda_powiatowa_strazy_pozarnej", "Komenda powiatowa straży pożarnej", "service", "polygon", "wfs"),
  layer("K08", "K08_Oddzial_strazy_granicznej", "Oddział straży granicznej", "service", "polygon", "wfs"),
  layer("K09", "K09_Placowka_strazy_granicznej", "Placówka straży granicznej", "service", "polygon", "wfs"),
  layer("K10", "K10_Dywizjon_strazy_granicznej", "Dywizjon straży granicznej", "service", "polygon", "wfs"),
  layer("K11", "K11_Obszar_dzialania_szefa_obrony_cywilnej_wojewodztwa", "Obszar działania szefa obrony cywilnej województwa", "service", "polygon", "wfs"),
  layer("K12", "K12_Obszar_dzialania_szefa_obrony_cywilnej_powiatu", "Obszar działania szefa obrony cywilnej powiatu", "service", "polygon", "wfs"),
  layer("K13", "K13_Obszar_dzialania_szefa_obrony_cywilnej_gminy", "Obszar działania szefa obrony cywilnej gminy", "service", "polygon", "wfs"),
  layer("U01", "U01_Archiwum_panstwowe", "Archiwum państwowe", "office", "polygon", "wfs"),
  layer("U02", "U02_Urzad_skarbowy", "Urząd skarbowy", "office", "polygon", "wfs"),
  layer("U03", "U03_Wyspecjalizowany_urzad_skarbowy", "Wyspecjalizowany urząd skarbowy", "office", "polygon", "wfs"),
  layer("U04", "U04_Urzad_celno-skarbowy", "Urząd celno-skarbowy", "office", "polygon", "wfs"),
  layer("U05", "U05_Izba_administracji_skarbowej", "Izba administracji skarbowej", "office", "polygon", "wfs"),
  layer("U06", "U06_Nadlesnictwo", "Nadleśnictwo", "office", "polygon", "wfs"),
  layer("U07", "U07_Regionalna_dyrekcja_lasow_panstwowych", "Regionalna dyrekcja lasów państwowych", "office", "polygon", "wfs"),
  layer("U08", "U08_Zarzad_zlewni_PGWWP", "Zarząd zlewni PGW WP", "office", "polygon", "wfs"),
  layer("U09", "U09_Regionalny_zarzad_gospodarki_wodnej_PGWWP", "Regionalny zarząd gospodarki wodnej PGW WP", "office", "polygon", "wfs"),
  layer("U10", "U10_Urzad_morski", "Urząd morski", "office", "polygon", "wfs"),
  layer("U11", "U11_Urzad_zeglugi_srodladowej", "Urząd żeglugi śródlądowej", "office", "polygon", "wfs"),
  layer("W01", "W01_Linia_podstawowa_morza_terytorialnego", "Linia podstawowa morza terytorialnego", "maritime", "line", "wfs"),
  layer("W02", "W02_Morze_terytorialne_RP", "Morze terytorialne RP", "maritime", "polygon", "wfs"),
  layer("W03", "W03_Morskie_wody_wewnetrzne", "Morskie wody wewnętrzne", "maritime", "polygon", "wfs"),
  layer("W04", "W04_Wylaczna_strefa_ekonomiczna", "Wyłączna strefa ekonomiczna", "maritime", "polygon", "wfs"),
  layer("W05", "W05_Strefa_przylegla", "Strefa przyległa", "maritime", "polygon", "wfs"),
  layer("W06", "W06_Morskie_linie_brzegowe", "Morskie linie brzegowe", "maritime", "line", "wfs"),
  layer("W07", "W07_Pas_nadbrzezny", "Pas nadbrzeżny", "maritime", "polygon", "wfs"),
  layer("W08", "W08_Pas_ochronny", "Pas ochronny", "maritime", "polygon", "wfs"),
  layer("W09", "W09_Pas_techniczny", "Pas techniczny", "maritime", "polygon", "wfs"),
  layer("W10", "W10_Reda", "Reda", "maritime", "polygon", "wfs"),
  layer("W11", "W11_Port_morski", "Port morski", "maritime", "polygon", "wfs"),
  layer("W12", "W12_Przystan_morska", "Przystań morska", "maritime", "polygon", "wfs"),
] as const satisfies readonly PrgLayer[];

export const prgLayerCatalogVersion = "2026-06-22";

export function getPrgLayer(layerId: string): PrgLayer | undefined {
  return prgLayerCatalog.find((layerDefinition) => layerDefinition.layerId === layerId);
}

export function listPrgLayers(): readonly PrgLayer[] {
  return prgLayerCatalog;
}

function layer(
  layerId: string,
  sourceName: string,
  titlePl: string,
  category: PrgLayerCategory,
  geometryType: PrgGeometryType,
  sourceChannel: PrgSourceChannel,
): PrgLayer {
  return {
    layerId,
    sourceName,
    titlePl,
    category,
    geometryType,
    sourceChannel,
  };
}
