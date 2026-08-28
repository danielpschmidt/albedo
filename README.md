# 🇨🇭 Mikroklima- & Hitzeinsel-Simulator Schweiz

Interaktiver, browserbasierter Simulator für den städtischen Hitzeinsel-Effekt (Urban Heat Island) in Schweizer Gemeinden. Simuliert, wie sich Flächenversiegelung, Begrünung und Materialwahl auf Lufttemperatur, Oberflächentemperatur und Energiebedarf auswirken – basierend auf dem **InVEST Urban Cooling Model** und kalibriert mit Daten von BAFU und ETH Zürich.

Reines Vanilla-HTML/CSS/JavaScript, kein Build-Prozess, keine Abhängigkeiten ausser [Chart.js](https://www.chartjs.org/) (per CDN).

## Seiten

| Datei | Beschreibung |
|---|---|
| [`index.html`](index.html) | Hauptsimulator: Flächenaufteilung per Regler einstellen (Asphalt, poröser Belag, Gebäude, Grünfläche, Bäume, Dachbegrünung), Schweizer Städte-Voreinstellungen (Carouge, Zürich, Genf, Riehen u.a.) und Live-Messwerte (Kühlleistung, Lufttemperatur, Oberflächentemperatur, Energieersparnis). |
| [`day-cycle.html`](day-cycle.html) | 24-Stunden-Tagesverlaufs-Dashboard mit Zeitraffer-Animation, dynamischem Tag/Nacht-Hintergrund und **Duell-Modus**: zwei Standorte (Schweizer Städte oder generische Siedlungstypen wie Grossstadt, Banlieue, Land, Wald) direkt im Temperaturverlauf gegeneinander vergleichen. |

## Engine

Die gesamte Berechnungslogik steckt in [`microclimate-engine-v2.js`](microclimate-engine-v2.js) (Klasse `MicroclimateEngine`):

- `simulate(inputs)` – statische Momentaufnahme (Kühlleistung, Luft-/Oberflächentemperatur, Energieersparnis) für eine gegebene Flächenzusammensetzung.
- `simulateDayCycle(inputs)` – simuliert den vollen 24h-Tagesverlauf: Referenztemperatur (sinusförmig, Minimum ~05:00, Maximum ~15:00), Hitzeinsel-Intensität (nachts stärker, tagsüber durch Durchmischung abgeschwächt) und Sonneneinstrahlung (aktiv 06:00–20:00, Peak 13:00).

Kernmodell: Kühlleistung (Cooling Capacity) = 60 % Baumschatten + 20 % Albedo + 20 % Evapotranspiration (Verdunstung), gemäss InVEST-Gewichtung.

## Nutzung

Kein Build nötig – einfach im Browser öffnen:

```bash
open index.html
# oder für einen lokalen Server:
python3 -m http.server 8000
```

## Datengrundlage

Reale Versiegelungsgrade der Schweizer Städte-Presets stammen aus der Arealstatistik des Bundesamts für Statistik. Oberflächentemperatur-Kalibrierung basiert auf Messungen von umverkehR in Zürich (bis zu 58 °C auf unbeschattetem Asphalt).
