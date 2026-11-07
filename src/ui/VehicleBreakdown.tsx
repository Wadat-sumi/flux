import type { VehicleTypeMetrics } from "../engine/statistics";
import {
  vehicleLabels,
  vehicleColors,
  vehicleTypeIds,
} from "../model/vehicles";

export function VehicleBreakdown({
  metrics,
}: {
  metrics: {
    vehicleTypes?: Array<
      Omit<VehicleTypeMetrics, "meanSpeed" | "meanTravelTime"> & {
        meanSpeed: number | null;
        meanTravelTime: number | null;
      }
    >;
  };
}) {
  const types = metrics.vehicleTypes?.filter((t) => t.generated > 0) ?? [];
  return (
    <div
      className="vehicle-breakdown"
      role="region"
      aria-label="Vehicle type results"
    >
      <h4>By vehicle type</h4>
      {types.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Generated</th>
                <th>Active</th>
                <th>Completed</th>
                <th>Rejected</th>
                <th>Speed km/h</th>
                <th>Travel s</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <th>
                    <i
                      className="vehicle-swatch"
                      style={{
                        background: vehicleColors[vehicleTypeIds.indexOf(t.id)],
                      }}
                    />
                    {vehicleLabels[t.id]}
                  </th>
                  <td>{t.generated}</td>
                  <td>{t.active}</td>
                  <td>{t.completed}</td>
                  <td>{t.rejected}</td>
                  <td>
                    {t.moving && t.meanSpeed !== null
                      ? (t.meanSpeed * 3.6).toFixed(1)
                      : "—"}
                  </td>
                  <td>
                    {t.completed && t.meanTravelTime !== null
                      ? t.meanTravelTime.toFixed(1)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">Vehicle totals appear after trips are generated.</p>
      )}
    </div>
  );
}
