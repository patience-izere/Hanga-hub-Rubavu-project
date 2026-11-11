import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { getDemoLesson } from "../api/open";
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
              With an account you get a different fault every time, a score, your best result and a
              certificate.
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
