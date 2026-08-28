/**
 * microclimate-engine-v3.js - Version 3.0
 * 
 * An expanded, highly robust mathematical microclimate and urban heat mitigation calculator 
 * calibrated for Swiss urban areas, based on the InVEST Urban Cooling Model 
 * and empirical data from the Swiss Federal Office for the Environment (BAFU) 
 * and ETH Zurich.
 * 
 * New features in v3.0:
 * - Robust NaN and undefined handling for all parameters.
 * - Auto-fallback to default Swiss values if inputs are invalid.
 */

class MicroclimateEngine {
    /**
     * @param {Object} config - Default global parameters
     */
    constructor(config = {}) {
        this.t_ref = isNaN(parseFloat(config.t_ref)) ? 25.0 : parseFloat(config.t_ref);       // Reference rural temperature in °C
        this.uhi_max = isNaN(parseFloat(config.uhi_max)) ? 5.0 : parseFloat(config.uhi_max);   // Max Urban Heat Island magnitude in °C
        
        // Weights for Cooling Capacity (CC) based on InVEST documentation
        this.weight_shade = isNaN(parseFloat(config.weight_shade)) ? 0.6 : parseFloat(config.weight_shade);
        this.weight_albedo = isNaN(parseFloat(config.weight_albedo)) ? 0.2 : parseFloat(config.weight_albedo);
        this.weight_eti = isNaN(parseFloat(config.weight_eti)) ? 0.2 : parseFloat(config.weight_eti);
    }

    /**
     * Calculates the crop coefficient (Kc) based on vegetation and surface types.
     */
    calculateKc(asphaltFrac, porousFrac, standardRoofFrac, greenRoofFrac, greenFrac, treeFrac) {
        return (
            (asphaltFrac * 0.05) + 
            (porousFrac * 0.35) + 
            (standardRoofFrac * 0.02) + 
            (greenRoofFrac * 0.50) + 
            (greenFrac * 0.60) + 
            (treeFrac * 0.85)
        );
    }

    /**
     * Calculates the weighted Albedo of the area with built-in safeguards.
     */
    calculateWeightedAlbedo(asphaltFrac, asphaltAlbedo, porousFrac, standardRoofFrac, greenRoofFrac, greenFrac, treeFrac) {
        const albedoPorous = 0.18;      
        const albedoStdRoof = 0.12;     
        const albedoGreenRoof = 0.22;   
        const albedoGreen = 0.20;       
        const albedoTrees = 0.15;       
        
        // Robustness safeguard
        const safeAlbedoAsphalt = isNaN(parseFloat(asphaltAlbedo)) ? 0.08 : parseFloat(asphaltAlbedo);
        
        const total = asphaltFrac + porousFrac + standardRoofFrac + greenRoofFrac + greenFrac + treeFrac;
        if (total === 0) return safeAlbedoAsphalt;

        return (
            (asphaltFrac * safeAlbedoAsphalt) + 
            (porousFrac * albedoPorous) + 
            (standardRoofFrac * albedoStdRoof) + 
            (greenRoofFrac * albedoGreenRoof) + 
            (greenFrac * albedoGreen) + 
            (treeFrac * albedoTrees)
        ) / total;
    }

    /**
     * Parses and normalizes raw slider inputs into surface-type fractions plus
     * the derived shade/ETI/albedo/coolingCapacity indices. Shared by simulate()
     * and simulateDayCycle() so both stay consistent.
     */
    _computeComposition(inputs) {
        // Safe parsing with default fallbacks to prevent NaN propagating
        const pctAsphalt = isNaN(parseFloat(inputs.pctAsphalt)) ? 30 : parseFloat(inputs.pctAsphalt);
        const pctPorous = isNaN(parseFloat(inputs.pctPorous)) ? 10 : parseFloat(inputs.pctPorous);
        const pctBuildings = isNaN(parseFloat(inputs.pctBuildings)) ? 25 : parseFloat(inputs.pctBuildings);
        const pctGreen = isNaN(parseFloat(inputs.pctGreen)) ? 20 : parseFloat(inputs.pctGreen);
        const pctTrees = isNaN(parseFloat(inputs.pctTrees)) ? 15 : parseFloat(inputs.pctTrees);
        const pctGreenRoofs = isNaN(parseFloat(inputs.pctGreenRoofs)) ? 50 : parseFloat(inputs.pctGreenRoofs);
        const asphaltAlbedo = isNaN(parseFloat(inputs.asphaltAlbedo)) ? 0.08 : parseFloat(inputs.asphaltAlbedo);

        // 1. Normalize percentages to fractions (0 - 1)
        const totalPct = pctAsphalt + pctPorous + pctBuildings + pctGreen + pctTrees;
        const scale = totalPct > 0 ? 100 / totalPct : 1;

        const asphaltFrac = (pctAsphalt * scale) / 100;
        const porousFrac = (pctPorous * scale) / 100;
        const buildingFrac = (pctBuildings * scale) / 100;
        const greenFrac = (pctGreen * scale) / 100;
        const treeFrac = (pctTrees * scale) / 100;

        // Distribute building rooftops
        const greenRoofFrac = buildingFrac * (pctGreenRoofs / 100);
        const standardRoofFrac = buildingFrac * (1.0 - (pctGreenRoofs / 100));

        // 2. Shade Factor
        const shade = treeFrac;

        // 3. Evapotranspiration Index (ETI)
        const kc = this.calculateKc(asphaltFrac, porousFrac, standardRoofFrac, greenRoofFrac, greenFrac, treeFrac);
        const ETI = Math.min(1.0, kc);

        // 4. Albedo
        const albedo = this.calculateWeightedAlbedo(
            asphaltFrac,
            asphaltAlbedo,
            porousFrac,
            standardRoofFrac,
            greenRoofFrac,
            greenFrac,
            treeFrac
        );

        // 5. InVEST Cooling Capacity (CC) Index
        const coolingCapacity = (this.weight_shade * shade) + (this.weight_albedo * albedo) + (this.weight_eti * ETI);

        return {
            asphaltFrac, porousFrac, buildingFrac, greenFrac, treeFrac,
            greenRoofFrac, standardRoofFrac, shade, kc, ETI, albedo,
            coolingCapacity, asphaltAlbedo
        };
    }

    /**
     * Smooth 0->1 ease-in-out curve used to blend between diurnal anchor points.
     */
    _easeCurve(x) {
        const clamped = Math.max(0, Math.min(1, x));
        return (1 - Math.cos(clamped * Math.PI)) / 2;
    }

    /**
     * Rural reference temperature for a given hour (0-23), sinusoidal with a
     * diurnal minimum around 05:00 (t_ref - 4°C) and maximum around 15:00 (t_ref + 4°C).
     */
    _calculateHourlyRefTemp(hour, tRef) {
        const amp = 4;
        const tMin = tRef - amp;
        const tMax = tRef + amp;

        if (hour >= 5 && hour <= 15) {
            // Rising branch: 05:00 (min) -> 15:00 (max), 10h span
            const t = (hour - 5) / 10;
            return tMin + (tMax - tMin) * this._easeCurve(t);
        }

        // Falling branch: 15:00 (max) -> 05:00 next day (min), 14h span
        const hourAdj = hour < 5 ? hour + 24 : hour;
        const t = (hourAdj - 15) / 14;
        return tMax - (tMax - tMin) * this._easeCurve(t);
    }

    /**
     * Urban Heat Island intensity as a fraction of uhi_max for a given hour.
     * Peaks at 100% overnight (22:00-05:00, stored heat re-radiating), and is
     * suppressed to ~30% during daytime (10:00-17:00, boundary-layer mixing).
     */
    _calculateHourlyUhiFactor(hour) {
        if (hour >= 22 || hour <= 5) return 1.0;
        if (hour > 5 && hour < 10) {
            const t = (hour - 5) / 5;
            return 1.0 - 0.7 * this._easeCurve(t); // 1.0 -> 0.3
        }
        if (hour >= 10 && hour <= 17) return 0.3;
        // hour > 17 && hour < 22
        const t = (hour - 17) / 5;
        return 0.3 + 0.7 * this._easeCurve(t); // 0.3 -> 1.0
    }

    /**
     * Normalized solar irradiance (0-1) for a given hour. Active 06:00-20:00,
     * peaking at 13:00.
     */
    _calculateSolarRadiation(hour) {
        if (hour < 6 || hour > 20) return 0;
        const x = (hour - 6) / 14;
        return Math.max(0, Math.sin(Math.PI * x));
    }

    /**
     * Runs the full microclimate simulation with robust validation.
     */
    simulate(inputs) {
        const comp = this._computeComposition(inputs);
        const {
            asphaltFrac, porousFrac, buildingFrac, standardRoofFrac, greenRoofFrac,
            greenFrac, treeFrac, shade, albedo, coolingCapacity, asphaltAlbedo
        } = comp;

        // 6. Air Temperature calculation (T_air)
        const airTemperature = this.t_ref + (1.0 - coolingCapacity) * this.uhi_max;

        // 7. Empirical Surface Temperature calculation
        const baseSurfaceTemp = this.t_ref + 15;
        const heatingFactor = (
            (asphaltFrac * (1.0 - asphaltAlbedo) * 18) +
            (standardRoofFrac * 16) +
            (porousFrac * (1.0 - 0.18) * 12)
        );
        const coolingFactor = (
            (shade * 20) +
            (greenFrac * 8) +
            (greenRoofFrac * 6)
        );

        const surfaceTemperature = Math.max(this.t_ref, baseSurfaceTemp + heatingFactor - coolingFactor);

        // 8. Economic Impact: Avoided A/C Energy Consumption (kWh per year per 100 m² footprint)
        const tempReduction = (this.t_ref + this.uhi_max) - airTemperature; 
        const annualKwhSavingsPer100m2 = Math.max(0, tempReduction * 1.5 * 100);

        // 9. Qualitative Thermal Comfort rating
        let comfortRating = "Mässig";
        let comfortColor = "#e67e22"; 
        if (airTemperature < this.t_ref + 1.5) {
            comfortRating = "Sehr angenehm (Frisch)";
            comfortColor = "#2ecc71"; 
        } else if (airTemperature < this.t_ref + 3.0) {
            comfortRating = "Angenehm (Leichte Wärme)";
            comfortColor = "#f1c40f"; 
        } else if (airTemperature >= this.t_ref + 4.5) {
            comfortRating = "Extreme Hitzebelastung";
            comfortColor = "#e74c3c"; 
        }

        return {
            composition: {
                asphalt: asphaltFrac,
                porous: porousFrac,
                buildings: buildingFrac,
                standardRoofs: standardRoofFrac,
                greenRoofs: greenRoofFrac,
                green: greenFrac,
                trees: treeFrac
            },
            metrics: {
                coolingCapacity: coolingCapacity,
                airTemperature: airTemperature,
                surfaceTemperature: surfaceTemperature,
                tempReduction: tempReduction,
                annualKwhSavingsPer100m2: annualKwhSavingsPer100m2
            },
            qualitative: {
                comfortRating: comfortRating,
                comfortColor: comfortColor
            }
        };
    }

    /**
     * Simulates the full 24h diurnal cycle (00:00 - 23:00) for a fixed land-cover
     * composition. Returns an array of 24 hourly result objects.
     */
    simulateDayCycle(inputs) {
        const comp = this._computeComposition(inputs);
        const {
            asphaltFrac, porousFrac, standardRoofFrac, greenRoofFrac,
            greenFrac, shade, coolingCapacity, asphaltAlbedo
        } = comp;

        // Full-solar heating/cooling potential of the surface mix (same physical
        // terms as the static model), later scaled hourly by solar irradiance.
        const maxHeatingFactor = (
            (asphaltFrac * (1.0 - asphaltAlbedo) * 18) +
            (standardRoofFrac * 16) +
            (porousFrac * (1.0 - 0.18) * 12)
        );
        const maxCoolingFactor = (
            (shade * 20) +
            (greenFrac * 8) +
            (greenRoofFrac * 6)
        );

        const hourlyResults = [];

        for (let hour = 0; hour < 24; hour++) {
            const t_ref_hour = this._calculateHourlyRefTemp(hour, this.t_ref);
            const uhiFraction = this._calculateHourlyUhiFactor(hour);
            const uhi_intensity = uhiFraction * this.uhi_max;
            const solarRad = this._calculateSolarRadiation(hour);

            // Calculated Air Temperature (T_air)
            const airTemperature = t_ref_hour + (1.0 - coolingCapacity) * uhi_intensity;

            // Surface temperature: solar-driven heating/cooling on top of a
            // solar-scaled baseline, floored at the air temperature (never
            // cooler than the surrounding air, e.g. at night when solar = 0).
            const baseSurfaceTemp = t_ref_hour + solarRad * 13;
            const surfaceTemperatureRaw = baseSurfaceTemp + solarRad * (maxHeatingFactor - maxCoolingFactor);
            const surfaceTemperature = Math.max(airTemperature, surfaceTemperatureRaw);

            // Reduction vs. the theoretical worst-case (zero cooling capacity)
            // scenario at this hour's UHI intensity.
            const tempReduction = coolingCapacity * uhi_intensity;
            const annualKwhSavingsPer100m2 = Math.max(0, tempReduction * 1.5 * 100);

            hourlyResults.push({
                hour,
                t_ref: isNaN(t_ref_hour) ? this.t_ref : t_ref_hour,
                uhi_intensity: isNaN(uhi_intensity) ? 0 : uhi_intensity,
                airTemperature: isNaN(airTemperature) ? this.t_ref : airTemperature,
                surfaceTemperature: isNaN(surfaceTemperature) ? this.t_ref : surfaceTemperature,
                coolingCapacity: isNaN(coolingCapacity) ? 0 : coolingCapacity,
                tempReduction: isNaN(tempReduction) ? 0 : tempReduction,
                annualKwhSavingsPer100m2: isNaN(annualKwhSavingsPer100m2) ? 0 : annualKwhSavingsPer100m2
            });
        }

        return hourlyResults;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MicroclimateEngine;
} else {
    window.MicroclimateEngine = MicroclimateEngine;
}
