import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { describeApiError } from "../api/client";
import { getCertificate, verifyCertificate, type Certificate } from "../api/open";
import "../styles/engagement.css";

function CertificateSheet({
  certificate,
  verifyUrl,
}: {
  certificate: Certificate;
  verifyUrl?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !verifyUrl) return;
    void QRCode.toCanvas(canvas.current, verifyUrl, {
      width: 140,
      margin: 1,
      color: { dark: "#071d19", light: "#ffffff" },
    });
  }, [verifyUrl]);
  const date = certificate.completedAt
    ? new Date(certificate.completedAt).toLocaleDateString(undefined, { dateStyle: "long" })
    : "";
  return (
    <article className={`certificate-sheet level-${certificate.level}`}>
      <span className="certificate-org">{certificate.organisation}</span>
      <span className="certificate-level">{certificate.levelTitle}</span>
      <h1>{certificate.learnerName}</h1>
      <p className="certificate-lesson">{certificate.lessonTitle}</p>
      <p className="certificate-course">
        {certificate.courseTitle} · {certificate.trade}
      </p>
      <p className="certificate-statement">{certificate.statement}</p>
      <p className="certificate-disclaimer">
        Practice record of virtual training on OPedu. It is not a certificate or qualification;
        OPedu is not a college.
      </p>
      <dl>
        <div>
          <dt>Date</dt>
          <dd>{date}</dd>
        </div>
        {certificate.score ? (
          <div>
            <dt>Score</dt>
            <dd>{Math.round(Number(certificate.score))}%</dd>
          </div>
        ) : null}
        {certificate.reviewerName ? (
          <div>
            <dt>Confirmed by</dt>
            <dd>{certificate.reviewerName}</dd>
          </div>
        ) : null}
      </dl>
      {verifyUrl ? (
        <div className="certificate-verify">
          <canvas ref={canvas} aria-label="QR code to check this practice record" />
          <small>Scan or visit the link to check this practice record is genuine.</small>
        </div>
      ) : null}
    </article>
  );
}

export function CertificatePage() {
  const attemptId = Number(useParams().attemptId);
  const certificate = useQuery({
    queryKey: ["learning", "certificate", attemptId],
    queryFn: () => getCertificate(attemptId),
    retry: false,
  });
  const [copied, setCopied] = useState(false);

  if (certificate.isPending) return <p className="panel-status">Preparing your practice record…</p>;
  if (certificate.isError || !certificate.data) {
    return (
      <section className="result-page">
        <div className="result-card">
          <h1>No practice record for this attempt</h1>
          <p>
            {describeApiError(
              certificate.error,
              "Practice records are given for completed attempts.",
            )}
          </p>
          <Link to={`/learn/attempts/${attemptId}`}>Back to the result</Link>
        </div>
      </section>
    );
  }
  const { verifyUrl, ...details } = certificate.data;
  return (
    <section className="certificate-page">
      <div className="certificate-tools marker-no-print">
        <Link to={`/learn/attempts/${attemptId}`}>← Back to the result</Link>
        <button className="button button-primary" type="button" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={async () => {
            try {
              if (navigator.share) {
                await navigator.share({ title: details.lessonTitle, url: verifyUrl });
              } else {
                await navigator.clipboard.writeText(verifyUrl);
                setCopied(true);
              }
            } catch {
              // The person closed the share sheet.
            }
          }}
        >
          {copied ? "Link copied" : "Share the check link"}
        </button>
      </div>
      <CertificateSheet certificate={details} verifyUrl={verifyUrl} />
    </section>
  );
}

/** Public: an employer or a school checks a practice record someone shows them. */
export function VerifyCertificatePage() {
  const code = useParams().code ?? "";
  const check = useQuery({
    queryKey: ["open", "verify", code],
    queryFn: () => verifyCertificate(code),
    retry: false,
  });
  if (check.isPending) return <p className="panel-status">Checking…</p>;
  return (
    <section className="certificate-page">
      {check.data?.valid ? (
        <>
          <p className="verify-banner is-valid" role="status">
            ✓ Genuine. This practice record was produced by OPedu and still stands. It is a record
            of virtual practice, not a certificate or qualification.
          </p>
          <CertificateSheet certificate={check.data} />
        </>
      ) : (
        <p className="verify-banner is-invalid" role="alert">
          This practice record could not be confirmed. The link may be wrong, or the result was
          later changed by an instructor.
        </p>
      )}
    </section>
  );
}
