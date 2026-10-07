import { MetricGrid, MetricTile } from "../components/ui/MetricTile";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { useInstructorOverview } from "../learning/useInstructor";

/**
 * Device, AR and synchronization telemetry.
 *
 * Deliberately separate from `/teach`: tracking losses and xAPI dead letters are operational
 * signals about the equipment, not teaching signals about the learners, and mixing them on one
 * screen made neither readable.
 */
export function InstructorOperationsPage() {
  const overview = useInstructorOverview();

  return (
    <section className="dashboard operations-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Separated operational evidence</span>
          <h1>Devices, AR, and synchronization.</h1>
          <p>
            How the equipment behaved during practical attempts. Learner outcomes live on the
            instructor overview and competency pages.
          </p>
        </div>
      </div>

      <QueryBoundary
        query={overview}
        loading="Loading operational evidence…"
        error="Operational evidence could not be loaded."
      >
        {(data) => {
          const analytics = data.operationalAnalytics;
          if (!analytics) {
            return (
              <div className="empty-learning-state">
                <h2>No operational evidence yet</h2>
                <p>Telemetry appears once learners run attempts on this school&rsquo;s devices.</p>
              </div>
            );
          }

          return (
            <>
              <h2 className="section-title">Learning outcomes</h2>
              <MetricGrid>
                <MetricTile label="Mastered attempts" value={analytics.learning.masteredAttempts} />
                <MetricTile
                  label="Failed attempts"
                  value={analytics.learning.failedAttempts}
                  alert={analytics.learning.failedAttempts > 0}
                />
              </MetricGrid>

              <h2 className="section-title">AR recognition</h2>
              <MetricGrid>
                <MetricTile label="Markers found" value={analytics.recognition.markerFound} />
                <MetricTile
                  label="Tracking losses"
                  value={analytics.recognition.trackingLoss}
                  alert={analytics.recognition.trackingLoss > 0}
                />
                <MetricTile
                  label="Marker mismatches"
                  value={analytics.recognition.markerMismatch}
                />
                <MetricTile label="Placements" value={analytics.recognition.placements} />
              </MetricGrid>

              <h2 className="section-title">Device reliability</h2>
              <MetricGrid>
                <MetricTile
                  label="Asset failures"
                  value={analytics.deviceReliability.assetFailures}
                  alert={analytics.deviceReliability.assetFailures > 0}
                />
                <MetricTile
                  label="Low frame-rate samples"
                  value={analytics.deviceReliability.lowFrameRateSamples}
                  detail={`of ${analytics.deviceReliability.performanceSamples} samples`}
                />
              </MetricGrid>

              <h2 className="section-title">Synchronization</h2>
              <MetricGrid>
                <MetricTile label="State changes" value={analytics.synchronization.stateChanges} />
                <MetricTile label="xAPI pending" value={analytics.synchronization.xapiPending} />
                <MetricTile
                  label="xAPI dead letters"
                  value={analytics.synchronization.xapiDeadLetters}
                  alert={analytics.synchronization.xapiDeadLetters > 0}
                />
              </MetricGrid>

              <h2 className="section-title">Fallback use</h2>
              <MetricGrid>
                <MetricTile
                  label="Accessible attempts"
                  value={analytics.fallback.accessibleAttempts}
                  detail="completed in the 2D equivalent"
                />
                <MetricTile
                  label="AR fallback events"
                  value={analytics.fallback.arFallbackEvents}
                />
              </MetricGrid>

              <section className="export-panel">
                <h2>Export evidence</h2>
                <div className="export-option">
                  <div>
                    <strong>Operational export</strong>
                    <p>
                      Identifies learners by name and email. For teaching and school records inside
                      your institution.
                    </p>
                  </div>
                  <a className="button button-secondary" href="/api/v1/instructor/evidence.csv">
                    Download operational CSV
                  </a>
                </div>
                <div className="export-option">
                  <div>
                    <strong>Research export</strong>
                    <p>
                      Learners are pseudonymized by participant code. Use this whenever evidence
                      leaves the school, including for the pilot study.
                    </p>
                  </div>
                  <a
                    className="button button-secondary"
                    href="/api/v1/instructor/evidence.csv?scope=research"
                  >
                    Download research CSV
                  </a>
                </div>
              </section>
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
