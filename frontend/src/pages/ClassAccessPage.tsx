import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { describeApiError } from "../api/client";
import {
  createClassLearners,
  getClassAccess,
  resetLearnerPin,
  setClassJoinCode,
  type ClassAccess,
  type SignInSlip,
} from "../api/open";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import "../styles/engagement.css";

const KEY = ["learning", "instructor", "class-access"] as const;

function Slips({ slips, onClose }: { slips: SignInSlip[]; onClose(): void }) {
  return (
    <div className="slips" role="region" aria-label="Sign-in slips">
      <div className="slips-tools marker-no-print">
        <p>
          <strong>Print these now.</strong> PINs are shown only once. Cut along the lines and give
          each learner their own slip.
        </p>
        <button className="button button-primary" type="button" onClick={() => window.print()}>
          Print slips
        </button>
        <button className="button button-secondary" type="button" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="slips-grid">
        {slips.map((slip) => (
          <div className="slip" key={slip.signInName}>
            <span>{slip.name}</span>
            <span>Sign in at {window.location.host}</span>
            <span>Sign-in name</span>
            <strong>{slip.signInName}</strong>
            <span>PIN</span>
            <strong className="slip-pin">{slip.pin}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassPanel({ item, onSlips }: { item: ClassAccess; onSlips(slips: SignInSlip[]): void }) {
  const queryClient = useQueryClient();
  const [names, setNames] = useState("");
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
  const code = useMutation({
    mutationFn: (enabled: boolean) => setClassJoinCode(item.id, enabled),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: () =>
      createClassLearners(
        item.id,
        names
          .split(/\n|,/)
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    onSuccess: (result) => {
      setNames("");
      onSlips(result.slips);
      refresh();
    },
  });
  const reset = useMutation({
    mutationFn: resetLearnerPin,
    onSuccess: (slip) => onSlips([slip]),
  });

  return (
    <article className="class-panel">
      <header>
        <div>
          <h2>{item.name}</h2>
          <small>
            {item.schoolName} · {item.learners.length}{" "}
            {item.learners.length === 1 ? "learner" : "learners"}
          </small>
        </div>
        <Link className="table-link" to={`/teach/live?class=${item.id}`}>
          Run a live challenge
        </Link>
      </header>

      <section>
        <h3>Join with a code</h3>
        {item.joinCode ? (
          <div className="join-code">
            <strong aria-label={`Class code ${item.joinCode.split("").join(" ")}`}>
              {item.joinCode}
            </strong>
            <p>
              Learners open <b>{window.location.host}/class</b> and type this code. They choose
              their own PIN; no email needed.
            </p>
            <div className="button-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => code.mutate(true)}
              >
                New code
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => code.mutate(false)}
              >
                Stop joining
              </button>
            </div>
          </div>
        ) : (
          <button
            className="button button-primary"
            type="button"
            disabled={!item.isActive}
            onClick={() => code.mutate(true)}
          >
            Show a join code
          </button>
        )}
        {code.isError ? (
          <p className="form-error">{describeApiError(code.error, "Try again.")}</p>
        ) : null}
      </section>

      <section>
        <h3>Or create sign-in slips</h3>
        <label htmlFor={`names-${item.id}`}>
          One learner per line, first name then family name
        </label>
        <textarea
          id={`names-${item.id}`}
          rows={4}
          value={names}
          placeholder={"Aline Uwase\nEric Mugisha"}
          onChange={(event) => setNames(event.target.value)}
        />
        <button
          className="button button-primary"
          type="button"
          disabled={!names.trim() || create.isPending || !item.isActive}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Creating…" : "Create slips"}
        </button>
        {create.isError ? (
          <p className="form-error" role="alert">
            {describeApiError(create.error, "The slips could not be created.")}
          </p>
        ) : null}
      </section>

      {item.learners.length ? (
        <details>
          <summary>Learners and PINs</summary>
          <ul className="class-learners">
            {item.learners.map((learner) => (
              <li key={learner.id}>
                <span>
                  <strong>{learner.name}</strong>
                  <small>{learner.signInName}</small>
                </span>
                {learner.usesPin ? (
                  <button
                    className="button-link"
                    type="button"
                    disabled={reset.isPending}
                    onClick={() => reset.mutate(learner.id)}
                  >
                    New PIN
                  </button>
                ) : (
                  <small>Uses a password</small>
                )}
              </li>
            ))}
          </ul>
          {reset.isError ? (
            <p className="form-error">{describeApiError(reset.error, "Try again.")}</p>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

/** Getting a class signed in without email: join codes and printable sign-in slips. */
export function ClassAccessPage() {
  const classes = useQuery({ queryKey: KEY, queryFn: getClassAccess });
  const [slips, setSlips] = useState<SignInSlip[] | null>(null);
  if (slips) return <Slips slips={slips} onClose={() => setSlips(null)} />;
  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">Teaching</div>
          <h1>Get your class signed in.</h1>
          <p>
            Learners without email can join with a code you show them, or with a slip you print.
            Classes are created by your school administrator.
          </p>
        </div>
      </div>
      <QueryBoundary
        query={classes}
        loading="Loading classes…"
        error="Classes could not be loaded."
        empty={{
          title: "No classes yet",
          description: "Ask your school administrator to create a class first.",
          symbol: "⚙",
        }}
      >
        {(items) => (
          <div className="class-panels">
            {items.map((item) => (
              <ClassPanel key={item.id} item={item} onSlips={setSlips} />
            ))}
          </div>
        )}
      </QueryBoundary>
    </section>
  );
}
