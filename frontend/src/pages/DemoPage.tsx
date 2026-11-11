import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { getDemoLesson, getPublicLessonPractice } from "../api/open";
import { LocalPractice } from "../components/simulation/LocalPractice";
import { useLocale } from "../i18n/LocaleProvider";

/**
 * A lesson anyone can try without an account.
 *
 * Every rule runs on the device and nothing is sent to the server, so a visitor's clicks never
 * become anyone's evidence. The lesson is whichever one the platform publishes as its demo.
 */
export function DemoPage() {
  const { t } = useLocale();
  const demo = useQuery({ queryKey: ["open", "demo"], queryFn: getDemoLesson, retry: false });

  if (demo.isPending) return <p className="panel-status">Setting up the workshop…</p>;
  if (demo.isError || !demo.data) {
    return (
      <section className="information-page">
        <h1>The demonstration is not available right now.</h1>
        <p>
          <Link to="/">Back to the home page</Link>
        </p>
      </section>
    );
  }

  const { lesson, scenario } = demo.data;
  return (
    <div className="demo-page">
      <p className="demo-banner">{t("demo.banner")}</p>
      <LocalPractice
        title={lesson.title}
        kicker="Try it · demonstration"
        back={{ to: "/", label: "Home" }}
        steps={lesson.procedure_steps}
        sequence={scenario.sequence ?? "ordered"}
        scene={scenario.scene}
        distractors={scenario.distractors}
        finish={
          <>
            <p>
              With a free account you get a different fault every time, a score, and your best
              result saved in your practice record.
            </p>
            <Link className="button button-primary" to="/register">
              Create a free account
            </Link>
            <Link className="button button-secondary" to="/class">
              I have a class code
            </Link>
          </>
        }
      />
    </div>
  );
}

/** A lesson from a public course, tried without an account. Nothing is recorded. */
export function PublicLessonPage() {
  const { slug = "", lessonId = "" } = useParams();
  const practice = useQuery({
    queryKey: ["open", "practice", slug, lessonId],
    queryFn: () => getPublicLessonPractice(slug, Number(lessonId)),
    retry: false,
  });

  if (practice.isPending) return <p className="panel-status">Setting up the workshop…</p>;
  if (practice.isError || !practice.data) {
    return (
      <section className="information-page">
        <h1>This lesson cannot be tried without an account.</h1>
        <p>
          <Link to={`/courses/${slug}`}>Back to the course</Link>
        </p>
      </section>
    );
  }

  const { lesson, scenario, course } = practice.data;
  return (
    <div className="demo-page">
      <p className="demo-banner">
        You are practising without an account: nothing is saved. Create a free account to keep your
        progress.
      </p>
      <LocalPractice
        title={lesson.title}
        kicker={`Try it · ${course.title}`}
        back={{ to: `/courses/${course.slug}`, label: course.title }}
        steps={lesson.procedure_steps}
        sequence={scenario.sequence ?? "ordered"}
        scene={scenario.scene}
        distractors={scenario.distractors}
        finish={
          <>
            <p>Well done. Create a free account to save your progress and track your best score.</p>
            <Link className="button button-primary" to="/register">
              Create a free account
            </Link>
            <Link className="button button-secondary" to={`/courses/${course.slug}`}>
              Back to the course
            </Link>
          </>
        }
      />
    </div>
  );
}
