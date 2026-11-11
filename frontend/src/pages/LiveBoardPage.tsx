import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getLiveBoard } from "../api/open";
import { useInstructorAssignmentOptions } from "../learning/useInstructor";
import { formatDuration } from "../procedure/engine";
import "../styles/engagement.css";

/**
 * A class working through one lesson together, shown on a projector.
 *
 * Teams are ranked by safety first, then progress, then care, and time only breaks ties, so the
 * board rewards working the way the workshop needs. Learners appear by first name and initial.
 */
export function LiveBoardPage() {
  const [params, setParams] = useSearchParams();
  const options = useInstructorAssignmentOptions();
  const cohort = Number(params.get("class") ?? 0);
  const lesson = Number(params.get("lesson") ?? 0);
  const teams = Number(params.get("teams") ?? 2);
  const since = params.get("since") ?? "";
  const [fullScreen, setFullScreen] = useState(false);
  const running = cohort > 0 && lesson > 0;
  const board = useQuery({
    queryKey: ["learning", "instructor", "live", cohort, lesson, teams, since],
    queryFn: () => getLiveBoard({ cohort, lesson, teams, since: since || undefined }),
    enabled: running,
    refetchInterval: 4000,
  });
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

  if (!running) {
    return (
      <section className="dashboard">
        <div className="dashboard-heading">
          <div>
            <div className="eyebrow">Live challenge</div>
            <h1>Run a class challenge.</h1>
            <p>
              Put this on the projector. Learners open the lesson on their own devices; teams climb
              the board by working safely, then by finishing.
            </p>
          </div>
        </div>
        <form
          className="live-setup"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            update({
              class: String(data.get("class")),
              lesson: String(data.get("lesson")),
              teams: String(data.get("teams")),
              since: new Date().toISOString(),
            });
          }}
        >
          <label>
            Class
            <select name="class" defaultValue={cohort || ""} required>
              <option value="" disabled>
                Choose a class
              </option>
              {(options.data?.cohorts ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.learnerCount})
                </option>
              ))}
            </select>
          </label>
          <label>
            Lesson
            <select name="lesson" defaultValue="" required>
              <option value="" disabled>
                Choose a lesson
              </option>
              {(options.data?.scenarios ?? []).map((item) => (
                <option key={item.lessonId} value={item.lessonId}>
                  {item.lessonTitle}
                </option>
              ))}
            </select>
          </label>
          <label>
            Teams
            <select name="teams" defaultValue="2">
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count === 1 ? "Everyone together" : `${count} teams`}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-primary">Start the board</button>
          <p className="field-note">
            Make sure the lesson is assigned to the class. Only attempts started after you press
            Start count.
          </p>
        </form>
      </section>
    );
  }

  const data = board.data;
  return (
    <section className={`live-board${fullScreen ? " is-full" : ""}`}>
      <header>
        <div>
          <span className="eyebrow">{data?.className}</span>
          <h1>{data?.lessonTitle ?? "Loading…"}</h1>
        </div>
        <div className="live-summary">
          <strong>
            {data?.finished ?? 0}/{data?.learners ?? 0}
          </strong>
          <span>finished</span>
          {data?.joinCode ? (
            <span className="live-code">
              Class code <b>{data.joinCode}</b>
            </span>
          ) : null}
        </div>
        <div className="button-row marker-no-print">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setFullScreen(!fullScreen)}
          >
            {fullScreen ? "Exit full screen" : "Full screen"}
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => update({ since: new Date().toISOString() })}
          >
            New round
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => update({ class: "", lesson: "", since: "" })}
          >
            Stop
          </button>
        </div>
      </header>
      <ol className="live-teams">
        {(data?.teams ?? []).map((team) => (
          <li
            key={team.number}
            className={team.rank === 1 && team.progressPercent > 0 ? "is-leading" : undefined}
          >
            <div className="live-team-head">
              <span className="live-rank">{team.rank}</span>
              <h2>{teams === 1 ? "Class" : `Team ${team.number}`}</h2>
              <span className={team.safetyErrors ? "live-safety is-bad" : "live-safety"}>
                {team.safetyErrors ? `${team.safetyErrors} safety` : "Safe so far"}
              </span>
            </div>
            <div className="live-progress" aria-label={`${team.progressPercent}% done`}>
              <span style={{ width: `${team.progressPercent}%` }} />
            </div>
            <p>
              {team.finished}/{team.size} finished · {team.mistakes} mistakes
              {team.averageSeconds !== null
                ? ` · ${formatDuration(team.averageSeconds)} average`
                : ""}
            </p>
            <ul>
              {team.members.map((member) => (
                <li
                  key={member.id}
                  className={member.finished ? "is-done" : member.started ? "is-going" : undefined}
                >
                  <span>{member.name}</span>
                  <small>
                    {member.finished
                      ? "✓"
                      : member.started
                        ? `${member.stepsCompleted}/${member.totalSteps}`
                        : "—"}
                  </small>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {board.isError ? <p className="form-error">The board could not be updated.</p> : null}
    </section>
  );
}
