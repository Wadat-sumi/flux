# Flux real-data source review

Reviewed 6 November 2026 for Bengaluru, Mumbai, Chennai, Pune, Hyderabad and Delhi. A source reference is not proof that matched raw OD counts, signal plans and independent validation data have been acquired. No commercial subscription was purchased; no Snowflake account was connected; no key was printed. The owner is seeking a minimum dated junction survey and timing plan (data-request.md).

## City references

| City | Primary/reference source | Verified availability / limitations |
|---|---|---|
| Bengaluru | [DULT CMP 2020, government-authored report mirror](https://data.opencity.in/dataset/7c5d56b4-3cc7-407a-842a-5cacd28a46f3/resource/538f7e60-4546-4573-aafb-0a1da8787293/download/dult-comprehensive-mobility-plan-2020.pdf), [official DULT report URL](https://dult.karnataka.gov.in/assets/front/pdf/Comprehensive_Mobility_Plan.pdf) | Report/catalogue located; official fetch timed out. Survey year and reuse permission must be checked before ingestion. OpenCity catalogue states no license provided. A separate real OSM road subset is bundled, with zero demand. |
| Mumbai | [MCGM CMP executive summary](https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Roads%20and%20Traffic/Docs/CMP%20for%20Greater%20Mumbai/Executive%20Summary/Executive%20Summary.pdf), [government-hosted CMP report](https://environmentclearance.nic.in/writereaddata/Online/EDS/07_Sep_2017_123242960LCKCFI1LCompliancetoAdditionalDetailsSoughtbyMemberSecretary.pdf) | Historical corridor journey-speed and planning references located. Not a current raw OD/signal-controller feed. Reuse/period matching pending. |
| Chennai | [CMDA Comprehensive Mobility Plan](https://www.cmdachennai.gov.in/pdfs/ComprehensiveMobilityPlan-CMA.pdf) | Downloaded and inspected survey descriptions and relevant tables. Surveys are from 2018; report contains directional counts, separate vehicle/PCU columns and corridor journey speeds. A document restriction requires prior authority for other-project use: no tables/data redistributed or silently loaded. Actual signal stage plans remain missing. |
| Pune | [Maha Metro updated PMR CMP](https://www.punemetrorail.org/download/Updation%20of%20CMP%20for%20PMR.pdf) | Official report located (43 MB); browser extraction limit reached. Count-survey and transport tables require local review of base year, direction, units and permission before ingestion. |
| Hyderabad | [HMDA CTS study description](https://www.hmda.gov.in/developdept9/), [HMDA CTS page](https://dev.hmda.gov.in/cts/) | Official CTS and junction/corridor-improvement work confirmed. Raw matched survey/timing files not acquired; some official fetches timed out. Study horizon 2041 is not the observation year. |
| Delhi | [IIT Delhi/NARL-led traffic/emissions research](https://essd.copernicus.org/articles/15/661/2023/), [associated repository](https://doi.org/10.5281/zenodo.6553770) | Research distinguishes 2018 sampled count/speed observations from modeled hourly traffic/emissions. Do not treat derived PCU/emissions grids as an observed vehicle OD matrix or current signal plan. Raw observation access/appropriate subset still needs verification. |

Public report access does not imply open reuse permission. Keep source/year/direction/units/license and a file hash with any future normalized data. Forecast years, model estimates and observations must remain distinct. Full-city GIS networks exceed the current bounded 300-node engine/import scope; start with a reviewed local corridor.

## Kaggle checks

Kaggle public dataset API metadata was retrieved directly, because rendered data-card pages were intermittently unreadable. These are candidates, **not approved calibration inputs**:

| Candidate | Metadata findings | Decision |
|---|---|---|
| [Bangalore’s Traffic Pulse](https://www.kaggle.com/datasets/preethamgouda/banglore-city-traffic-dataset) | Publisher lists CC0 and an August 2024 version. Description lists traffic metrics but does not identify sensors, sampling interval, raw collection method or traceable measurement agency. | Do not claim synthetic or measured without evidence; provenance unresolved. Useful schema exploration only until verified. |
| [Bangalore Traffic Analysis Dataset](https://www.kaggle.com/datasets/asshridattaaigal/bangalore-traffic-analysis-dataset) | Publisher lists CC BY-SA 4.0 and a June 2026 update, describes 2.1 million route records including coordinates, counts, speeds and signal timings. Description does not establish field collection methodology or controller provenance. | Candidate for further inspection; field names and row count do not establish accuracy. Not automatically imported. |
| [Traffic Prediction Dataset](https://www.kaggle.com/datasets/fedesoriano/traffic-prediction-dataset) | Data card describes 48,120 hourly observations from four junctions, confidential source and educational-only use. No mapping to the six requested cities verified. | Suitable at most for educational pipeline checks under its terms; not a six-city calibration dataset. |
| [Indian Driving Dataset mirror](https://www.kaggle.com/manjotpahwa/indian-driving-dataset/activity) | Road-scene images from Bengaluru/Hyderabad; Kaggle mirror license shown as unknown. | Perception imagery, not direct OD/turning-count or signal-plan input. |

[Original IISc UVH-26 release](https://www.iisc.ac.in/events/aim-iisc-announces-public-release-of-uvh-26-dataset-and-vision-models-for-indian-urban-traffic/) provides annotated Bengaluru traffic images/vehicle classes. It could support a separately validated counting pipeline, but isolated image detections must not be substituted for flow over an observation interval.

## Snowflake Marketplace checks

No Snowflake connector/account was available. Public listings/search were reviewed; no complete road-demand-signal dataset for all six cities was verified. [Pelmorex Weather Source Frostbyte](https://app.snowflake.com/marketplace/listing/GZSOZ1LLEL/pelmorex-weather-source-pelmorex-weather-source-frostbyte) includes Mumbai/Delhi weather coverage, which can be a contextual covariate, not road demand. Placer.ai US retail foot-traffic and SafeGraph US POI listings found in the search are not Indian road-vehicle datasets. Cloud deployment region “Mumbai” is not geographic coverage of observations. No paid listing or private share was acquired.

## TomTom and Google

The optional backend adapter implements [TomTom Flow Segment Data](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data), giving nearest-segment speed/travel-time estimates with confidence. It needs a server-side key and entitlement. [Traffic Stats](https://docs.tomtom.com/traffic-stats/documentation/api/route-analysis) is a separate historical analytics product. [Junction Analytics](https://docs.tomtom.com/junction-analytics/documentation/product-information/introduction) can provide turns/queues/delays for configured junctions; availability and contract must be verified per corridor. TomTom describes junction volume estimates as experimental with variable accuracy. No actual controller signal-plan feed or full classified ground count has been acquired.

[Google Routes](https://developers.google.com/maps/documentation/routes/config_trade_offs) supplies traffic-aware journey estimates; [traffic-aware polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines) encode congestion categories. Its documented routes response is not a classified vehicle-count, observed OD-volume or signal-phase-plan feed. No Google integration was requested or added.

## Accuracy boundary

[FHWA calibration guidance](https://ops.fhwa.dot.gov/publications/fhwahop16072/mod4.htm) motivates comparing modeled volumes/speeds/travel times against observations. The current Flux passenger-vehicle and simple signal assumptions cannot establish calibrated Indian mixed-traffic accuracy. Road/provider integrations make ingestion and comparisons possible; empirical fitting, richer vehicle classes/phasing and independent validation remain work that requires suitable observations. [SUMO calibration](https://eclipse.dev/sumo/docs/Simulation/Calibrator.html) is a possible future engine path; it has not replaced the custom engine.


## Dataset-target follow-up — 7 November 2026

The owner asked to agree on required datasets before selecting them. Provisional preference is one Bengaluru corridor with 2–4 junctions and matched demand/controls/independent validation, with a roundabout option. A fresh search located the DULT CMP report again, including references to CTTS 2015 turning-volume surveys; historical report values are not current observations and PCU totals are not vehicle OD counts. The OpenCity catalogue fetch returned 403 during this follow-up; no fresh license or raw-table access was verified. No data was adopted or ingested.

A new unverified lead, [theTraffic](https://www.thetraffic.in/), describes published Bengaluru signal timing records. Its methodology/research pages returned the same JavaScript shell to the text browser, so controller provenance, dates, usable exports and licensing were not verified. Do not treat its page description as an authoritative signal plan. Follow original source links and verify a matching corridor/time period before recommending adoption. [Caltrans guidance](https://dot.ca.gov/programs/transportation-planning/division-of-transportation-planning/state-planning/statewide-modeling/faq) supports the required input categories; it does not supply Bengaluru observations.


### Confirmed corridor target and newly inspected sources

The owner selected a Bengaluru corridor with 2–4 junctions. Direct public CKAN metadata access succeeded after the catalogue page fetch failed: the BTP-labelled timing collection has 124 PDF resources. A Palmgroove/Richmond timing sheet was downloaded, hashed, extracted and visually checked; it contains day/time phase tables and movement diagrams. No license value is supplied and the catalogue upload date does not prove current controller settings. The BMRCL Phase 3 catalogue/summary is a demand-survey lead with baseline PCU totals and later forecasts, not yet a raw matched vehicle OD pack. Detailed review and acquisition priorities: [Bengaluru shortlist](bengaluru-data-shortlist.md). No values were auto-imported.

Further follow-up downloaded two BBMP survey reports and visually checked their vehicle/PCU tables. The December 2024 final feasibility report's JC Road section contains seven junction count summaries and segment bus/car journey speeds; a September 2024 Hebbal–Silk Board draft DPR identifies August 2024 surveys and seven junction summaries. These are stronger historical leads, but not a matched raw OD/control/independent-validation dataset. JC Road's other-project written-authority requirement is explicit. Source links, PDF page numbers, dates, units, SHA-256 values and remaining gaps are recorded in the shortlist. No report values were adopted into Flux.
