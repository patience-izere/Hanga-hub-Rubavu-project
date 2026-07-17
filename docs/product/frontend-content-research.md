# OPedu frontend content research

## Goal

Make the public experience answer five visitor questions quickly:

1. What is OPedu?
2. Who is it for?
3. How does learning work?
4. What makes the experience trustworthy and safe?
5. How do I access it?

The previous homepage answered the first question in one sentence and described a three-step
simulation flow. It did not explain the instructor or school experience, the current module,
evidence captured, access model, limitations, or readiness status.

## Research signals

- Rwanda's TVET Competency-Based Training and Assessment framework is intended to standardize
  competency-based training and assessment across formal TVET institutions. OPedu's public copy
  should therefore describe observable procedure evidence and instructor review, not generic
  “online learning.” Source: [Rwanda TVET Board CBT/CBA implementation framework](https://www.rtb.gov.rw/fileadmin/user_upload/RTB/Publications/CBT_CBA_Frameworks/2._TVET_CBTA_Implementation_Framework_FINAL.pdf).
- Rwanda TVET Board teacher material explicitly covers competence-based planning, delivery,
  assessment, and portfolio management. The website should make the instructor's role and the
  evidence loop visible alongside the learner simulation. Source: [RTB TVET teacher pedagogical training](https://www.elearning.rtb.gov.rw/course/view.php?id=850).
- UNESCO-UNEVOC describes digital transformation as affecting both teaching and the organization
  of TVET delivery, while recognizing the role of hubs, fab labs, and local ecosystems. OPedu's
  story should connect digital practice to the physical workshop and local institution instead of
  presenting technology as an end in itself. Source: [UNESCO-UNEVOC Digital Transformation in TVET](https://connect.unevoc.unesco.org/home/Digital%2BTransformation%2Bin%2BTVET).
- Hanga Hubs operates in Rubavu as part of a national initiative supporting early-stage,
  tech-enabled innovation through infrastructure, startup support, and ecosystem building. This is
  useful local context, but the website must not imply a formal partnership or endorsement unless
  one is documented. Source: [RISA Hanga Hubs project](https://www.risa.gov.rw/projects/hanga-hubs).
- W3C guidance recommends simple language, short sections, meaningful headings, whitespace, and
  predictable navigation. These practices help visitors scan a long page and benefit people with
  cognitive and learning disabilities. Sources: [W3C clear and understandable content](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o3-clear-content/) and [W3C writing for web accessibility](https://www.w3.org/WAI/tips/writing/).

## Content decisions implemented

- Lead with the learner outcome and explain the platform in plain language immediately below it.
- Identify learners, instructors, and schools as distinct audiences with a concrete benefit for
  each.
- Replace a generic three-step explanation with the actual OPedu loop: brief, practise, respond,
  reflect.
- Show a realistic, text-based preview of the current battery inspection experience without
  claiming unbuilt features.
- Explain what evidence an instructor can review: ordered steps, incorrect actions, safety flags,
  duration, and result.
- Add the current MVP module and label it honestly as an active MVP.
- State the safety and validation boundary: digital guidance does not replace qualified workshop
  supervision, and procedures and scoring require instructor validation before rollout.
- Explain school-controlled invitations and role-based access in the main story and FAQ.
- Add clear anchor navigation, a skip link, concise FAQs, richer footer navigation, and useful
  search/social metadata.

## Next content priorities

1. Validate terminology and the battery procedure with at least two qualified automotive
   instructors.
2. Add verified pilot-school or instructor stories only after consent and evidence are available.
3. Publish a module catalogue when more than one validated learning experience exists.
4. Add Kinyarwanda content after a native-language review; do not machine-translate safety-critical
   instructions without human validation.
5. Add measured impact indicators only after a pilot defines a baseline, sample, and reporting
   method. Avoid placeholder counters or unsupported claims.
6. Create a school information pack covering devices, connectivity, onboarding, safeguarding,
   data handling, instructor preparation, and support ownership.

## Editorial guardrails

- Prefer specific verbs such as “review,” “practise,” and “record” over vague claims such as
  “transform” or “revolutionize.”
- Separate implemented capability, active MVP scope, and future roadmap.
- Never imply that a simulation certifies physical competence by itself.
- Never publish learner data, partner logos, testimonials, adoption figures, or outcome statistics
  without authorization and a verifiable source.
- Keep safety-critical instructions close to the action they govern and available through both the
  3D and accessible control paths.
