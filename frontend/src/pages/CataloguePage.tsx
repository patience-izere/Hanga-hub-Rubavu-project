import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { describeApiError } from "../api/client";
import { enrollInLesson, getCatalogue } from "../api/open";
import { QueryBoundary } from "../components/ui/QueryBoundary";
import { assignmentsQueryKey } from "../learning/useAssignments";
import "../styles/engagement.css";

/** Lessons anyone can add to their own learning, grouped by trade. */
export function CataloguePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalogue = useQuery({ queryKey: ["open", "catalogue"], queryFn: getCatalogue });
  const [filter, setFilter] = useState("all");
  const enroll = useMutation({
    mutationFn: enrollInLesson,
    onSuccess: (assignmentId) => {
      void queryClient.invalidateQueries({ queryKey: assignmentsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["open", "catalogue"] });
      navigate(`/assignments/${assignmentId}`);
    },
  });

  return (
    <section className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">Find lessons</div>
          <h1>Practise something new.</h1>
          <p>
            Add any lesson to your learning. Lessons from your instructor stay in My lessons as
            well.
          </p>
        </div>
      </div>
      <QueryBoundary
        query={catalogue}
        loading="Loading lessons…"
        error="Lessons could not be loaded."
        empty={{ title: "No open lessons yet", description: "Check back soon.", symbol: "⚙" }}
      >
        {(lessons) => {
          const trades = [...new Set(lessons.map((lesson) => lesson.trade))];
          const shown =
            filter === "all" ? lessons : lessons.filter((item) => item.trade === filter);
          return (
            <>
              {trades.length > 1 ? (
                <div className="filter-chips" role="group" aria-label="Trade">
                  {["all", ...trades].map((trade) => (
                    <button
                      key={trade}
                      type="button"
                      aria-pressed={filter === trade}
                      onClick={() => setFilter(trade)}
                    >
                      {trade === "all" ? "All trades" : trade}
                    </button>
                  ))}
                </div>
              ) : null}
              {enroll.isError ? (
                <p className="form-error" role="alert">
                  {describeApiError(enroll.error, "The lesson could not be added.")}
                </p>
              ) : null}
              <div className="assignment-grid">
                {shown.map((lesson) => (
                  <article className="assignment-card" key={lesson.lessonId}>
                    <div className="assignment-meta">
                      <span>{lesson.trade}</span>
                      {lesson.assignmentId ? (
                        <span className="status-pill">In my lessons</span>
                      ) : null}
                    </div>
                    <h3>{lesson.title}</h3>
                    <p>{lesson.summary}</p>
                    <dl>
                      <div>
                        <dt>Time</dt>
                        <dd>{lesson.estimatedMinutes} min</dd>
                      </div>
                      <div>
                        <dt>Steps</dt>
                        <dd>{lesson.stepCount}</dd>
                      </div>
                      <div>
                        <dt>From</dt>
                        <dd>{lesson.provider}</dd>
                      </div>
                    </dl>
                    {lesson.assignmentId ? (
                      <Link
                        className="button button-secondary"
                        to={`/assignments/${lesson.assignmentId}`}
                      >
                        Open lesson
                      </Link>
                    ) : (
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={enroll.isPending}
                        onClick={() => enroll.mutate(lesson.lessonId)}
                      >
                        Add to my lessons
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
