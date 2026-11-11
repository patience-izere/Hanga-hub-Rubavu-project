"""Demonstration lessons seeded by ``manage.py seed_demo``.

DRAFT TECHNICAL CONTENT. These procedures follow widely taught workshop practice so the platform
can be demonstrated end to end, but the wording, readings, tolerances and fault cases have not
been validated by a qualified instructor against the Rwanda TVET Board curriculum. Have them
reviewed before any learner is assessed with them.

Each lesson is plain data: steps, the options and consequences around them, equivalent fault
cases, a pre-lesson check, and a scene built from the shared prop library. Adding a lesson that
reuses existing props needs no new code.
"""

from __future__ import annotations

PPE_BEFORE_BATTERY = {
    "effect": "hazard",
    "message": (
        "Stop. Battery acid and sparks can injure unprotected eyes. Put on eye protection "
        "before you go near the battery."
    ),
}


def _same(actions, mistake):
    return dict.fromkeys(actions, mistake)


PROBE_ACTIONS = [
    "connect_black_negative",
    "connect_black_positive",
    "connect_red_positive",
    "connect_red_negative",
]
METER_MODE_CHOICES = [
    {"action_code": "set_meter_dc", "label": "DC volts (V with a straight line)"},
    {"action_code": "set_meter_ac", "label": "AC volts (V with a wave)"},
    {"action_code": "set_meter_ohms", "label": "Resistance (Ω)"},
    {"action_code": "set_meter_amps", "label": "Current (A)"},
]
METER_MODE_MISTAKES = {
    "set_meter_amps": {
        "effect": "blown_fuse",
        "message": (
            "On the current (A) setting the meter is almost a direct short across the battery. "
            "On a real meter this blows its fuse or burns the leads."
        ),
    },
    "set_meter_ohms": {
        "effect": "damage",
        "message": (
            "Resistance (Ω) must never be used on a live circuit. It can damage the meter and "
            "cannot show voltage."
        ),
    },
    "set_meter_ac": {
        "effect": "wrong_reading",
        "message": "A battery supplies direct current. AC volts will not read it correctly.",
    },
}
BLACK_LEAD_CHOICES = [
    {"action_code": "connect_black_negative", "label": "Black probe to the negative (−) terminal"},
    {"action_code": "connect_black_positive", "label": "Black probe to the positive (+) terminal"},
]
RED_LEAD_CHOICES = [
    {"action_code": "connect_red_positive", "label": "Red probe to the positive (+) terminal"},
    {"action_code": "connect_red_negative", "label": "Red probe to the negative (−) terminal"},
]
BLACK_LEAD_MISTAKES = {
    "connect_black_positive": {
        "effect": "wrong_reading",
        "message": (
            "Black on positive reverses the polarity, so the meter would show a negative "
            "voltage. The black (COM) probe goes to the negative (−) terminal."
        ),
    },
    **_same(
        ["connect_red_positive", "connect_red_negative"],
        {
            "effect": "none",
            "message": "Connect the black (COM) probe first, then the red probe.",
        },
    ),
}
RED_LEAD_MISTAKES = {
    "connect_red_negative": {
        "effect": "wrong_reading",
        "message": (
            "Both probes on the negative terminal read 0 V. The red probe goes to the "
            "positive (+) terminal."
        ),
    },
}


def _voltage_case(code, label, reading, low, high, answer, feedback, wrong):
    """One equivalent fault case for a lesson that ends in reading a voltage and deciding."""

    tolerance = {
        "code": "battery-voltage",
        "measurement": "Battery voltage",
        "minimum_value": f"{low:.4f}",
        "maximum_value": f"{high:.4f}",
        "unit": "V",
    }
    return {
        "code": code,
        "label": label,
        "steps": {
            "read-voltage": {
                "metadata": {"reading": reading, "unit": "V"},
                "tolerances": [tolerance],
                "acceptable_actions": [
                    {
                        "action_code": "read_voltage",
                        "label": "Read the voltage",
                        "is_primary": True,
                        "tolerance": tolerance,
                    }
                ],
                "feedback": f"The meter is steady at {reading} V.",
                "feedback_rules": {"correct": f"The meter is steady at {reading} V."},
            },
            "diagnosis": {
                "instruction": f"The meter reads {reading} V. Decide what that means.",
                "action_code": answer,
                "acceptable_actions": [
                    {
                        "action_code": answer,
                        "label": "Diagnosis",
                        "is_primary": True,
                        "tolerance": None,
                    }
                ],
                "feedback": feedback,
                "feedback_rules": {"correct": feedback},
                "mistakes": wrong,
            },
        },
    }


BATTERY_DIAGNOSIS_CHOICES = [
    {"action_code": "choose_serviceable", "label": "Charged: the battery is serviceable"},
    {"action_code": "choose_recharge", "label": "Low charge: recharge it, then test again"},
    {
        "action_code": "choose_faulty",
        "label": "Faulty: likely a dead cell, report it for a load test or replacement",
    },
]

BATTERY_LESSON = {
    "slug": "battery-inspection-and-diagnosis",
    "scenario_version": 2,
    "scenario_title": "Battery Inspection and Diagnosis: fault cases",
    "choices": {
        "meter-mode": METER_MODE_CHOICES,
        "negative-lead": BLACK_LEAD_CHOICES,
        "positive-lead": RED_LEAD_CHOICES,
        "diagnosis": BATTERY_DIAGNOSIS_CHOICES,
    },
    "mistakes": {
        "ppe": _same(PROBE_ACTIONS, PPE_BEFORE_BATTERY),
        "ignition": _same(
            PROBE_ACTIONS,
            {
                "effect": "spark",
                "message": (
                    "The ignition is still on, so circuits are live. Switch it off before you "
                    "connect test equipment."
                ),
            },
        ),
        "meter-mode": {
            **METER_MODE_MISTAKES,
            **_same(
                PROBE_ACTIONS,
                {
                    "effect": "wrong_reading",
                    "message": "Set the meter first. With the dial off it cannot show a reading.",
                },
            ),
        },
        "negative-lead": BLACK_LEAD_MISTAKES,
        "positive-lead": RED_LEAD_MISTAKES,
    },
    "variants": [
        _voltage_case(
            "charged",
            "Charged battery",
            12.6,
            12.4,
            12.9,
            "choose_serviceable",
            "Correct. About 12.6 V at rest is a fully charged, serviceable battery.",
            {
                "choose_recharge": {
                    "effect": "none",
                    "message": "12.6 V at rest is already fully charged. It does not need charging.",
                },
                "choose_faulty": {
                    "effect": "none",
                    "message": "12.6 V at rest is healthy. Nothing here points to a failed cell.",
                },
            },
        ),
        _voltage_case(
            "low-charge",
            "Low state of charge",
            12.1,
            11.9,
            12.3,
            "choose_recharge",
            "Correct. About 12.1 V at rest is less than half charged: recharge it, then test again.",
            {
                "choose_serviceable": {
                    "effect": "none",
                    "message": (
                        "12.1 V is well below the 12.6 V of a charged battery. Returned to "
                        "service like this, it may not start the engine."
                    ),
                },
                "choose_faulty": {
                    "effect": "none",
                    "message": (
                        "Not yet. A low reading alone does not prove a fault. Recharge the "
                        "battery and test it again first."
                    ),
                },
            },
        ),
        _voltage_case(
            "dead-cell",
            "Failed cell",
            10.5,
            10.3,
            10.7,
            "choose_faulty",
            (
                "Correct. About 10.5 V at rest suggests one of the six cells has failed. Report "
                "it for a load test or replacement."
            ),
            {
                "choose_serviceable": {
                    "effect": "none",
                    "message": "10.5 V is far too low. This battery will not start an engine.",
                },
                "choose_recharge": {
                    "effect": "none",
                    "message": (
                        "Each good cell gives about 2.1 V, so 10.5 V looks like five working "
                        "cells out of six. Charging will not bring a dead cell back."
                    ),
                },
            },
        ),
    ],
    "knowledge_check": {
        "questions": [
            {
                "code": "eye-protection",
                "prompt": "Why do you put on eye protection before going near a battery?",
                "options": [
                    {"code": "acid", "label": "Battery acid and sparks can injure your eyes"},
                    {"code": "display", "label": "To read the meter display more easily"},
                    {"code": "charging", "label": "It is only needed while charging"},
                ],
                "answer": "acid",
                "explanation": (
                    "A battery holds acid and can give off gas that a spark ignites. Eyes are "
                    "protected first, every time."
                ),
            },
            {
                "code": "meter-setting",
                "prompt": "Which meter setting measures a car battery?",
                "options": [
                    {"code": "ac", "label": "AC volts (V with a wave)"},
                    {"code": "dc", "label": "DC volts (V with a straight line)"},
                    {"code": "amps", "label": "Current (A)"},
                ],
                "answer": "dc",
                "explanation": (
                    "A battery supplies direct current. The current (A) setting across a "
                    "battery is a short circuit."
                ),
            },
            {
                "code": "ignition",
                "prompt": "Before you connect the meter, the ignition should be:",
                "options": [
                    {"code": "on", "label": "On"},
                    {"code": "off", "label": "Off"},
                    {"code": "either", "label": "It does not matter"},
                ],
                "answer": "off",
                "explanation": "With the ignition off the circuits are not live while you connect.",
            },
        ]
    },
    "scene": {
        "version": 1,
        "props": [
            {
                "id": "glasses",
                "kind": "glasses",
                "position": [-2.7, 1.0],
                "label": "Safety glasses",
            },
            {"id": "key", "kind": "key", "position": [-2.6, -0.9], "label": "Ignition"},
            {"id": "battery", "kind": "battery", "position": [-0.5, 0.0], "label": "12 V battery"},
            {
                "id": "meter",
                "kind": "multimeter",
                "position": [2.2, 0.1],
                "label": "Multimeter",
                "reading_step": "read-voltage",
            },
        ],
        "bindings": {
            "glasses.body": {"action": "confirm_ppe"},
            "key.body": {"action": "turn_ignition_off"},
            "meter.mode_dcv": {"action": "set_meter_dc"},
            "meter.mode_acv": {"action": "set_meter_ac"},
            "meter.mode_ohm": {"action": "set_meter_ohms"},
            "meter.mode_amp": {"action": "set_meter_amps"},
            "meter.probe_black": {"tool": "probe_black", "label": "Black probe"},
            "meter.probe_red": {"tool": "probe_red", "label": "Red probe"},
            "battery.terminal_neg": {
                "accepts": {
                    "probe_black": "connect_black_negative",
                    "probe_red": "connect_red_negative",
                }
            },
            "battery.terminal_pos": {
                "accepts": {
                    "probe_red": "connect_red_positive",
                    "probe_black": "connect_black_positive",
                }
            },
            "meter.display": {"action": "read_voltage"},
        },
        "effects": [
            {"when": "confirm_ppe", "set": {"glasses": {"worn": True}}},
            {"when": "turn_ignition_off", "set": {"key": {"position": "off"}}},
            {"when": "set_meter_dc", "set": {"meter": {"mode": "dcv"}}},
            {"when": "connect_black_negative", "set": {"meter": {"black": "battery.terminal_neg"}}},
            {"when": "connect_red_positive", "set": {"meter": {"red": "battery.terminal_pos"}}},
        ],
    },
}


def _step(order, code, title, instruction, action_code, feedback, *, safety=False, **extra):
    return {
        "order": order,
        "code": code,
        "title": title,
        "instruction": instruction,
        "action_code": action_code,
        "feedback": feedback,
        "safety_critical": safety,
        **extra,
    }


RED_ON_NEGATIVE = {
    "effect": "spark",
    "message": (
        "A red (positive) clamp on a negative post or on bare metal makes a short circuit "
        "the moment the other end is live. Red clamps only ever go on positive (+) posts."
    ),
}
CLAMP_ACTIONS = [
    "clamp_red_dead_pos",
    "clamp_red_donor_pos",
    "clamp_black_donor_neg",
    "clamp_black_dead_ground",
    "clamp_black_dead_neg",
]

JUMP_START_LESSON = {
    "slug": "jump-starting-safely",
    "title": "Jump-Starting a Flat Battery Safely",
    "summary": "Connect, start and disconnect jump leads in the order that keeps sparks away from the battery.",
    "objectives": [
        "Connect jump leads in the safe order.",
        "Explain why the last clamp goes on bare metal, not on the flat battery.",
        "Disconnect in reverse order.",
    ],
    "safety_notes": [
        "Wear eye protection. A charging battery gives off gas that a spark can ignite.",
        "Never let a red clamp touch a black clamp or bare metal.",
        "Keep hands, leads and clothing away from fans and belts once an engine runs.",
    ],
    "estimated_minutes": 15,
    "competencies": ["AUTO-SAFE-01", "AUTO-JUMP-01"],
    "scenario_version": 1,
    "scenario_title": "Jump-starting: safe connection order",
    "steps": [
        _step(
            1,
            "ppe",
            "Put on eye protection",
            "Put on the safety glasses before you go near either battery.",
            "confirm_ppe",
            "Eye protection is on.",
            safety=True,
            competency_codes=["AUTO-SAFE-01"],
            mistakes=_same(CLAMP_ACTIONS, PPE_BEFORE_BATTERY),
        ),
        _step(
            2,
            "ignitions-off",
            "Switch both ignitions off",
            "Make sure the ignition is off in both vehicles before you connect anything.",
            "switch_both_off",
            "Both ignitions are off.",
            safety=True,
            competency_codes=["AUTO-SAFE-01"],
            mistakes=_same(
                CLAMP_ACTIONS,
                {
                    "effect": "spark",
                    "message": "Switch both ignitions off before you connect the leads.",
                },
            ),
        ),
        _step(
            3,
            "red-flat",
            "Red clamp to the flat battery",
            "Connect a red clamp to the positive (+) post of the flat battery.",
            "clamp_red_dead_pos",
            "Red clamp is on the flat battery's positive post.",
            competency_codes=["AUTO-JUMP-01"],
            mistakes={
                "clamp_red_dead_neg": RED_ON_NEGATIVE,
                "clamp_red_donor_neg": RED_ON_NEGATIVE,
                "clamp_red_ground": RED_ON_NEGATIVE,
            },
        ),
        _step(
            4,
            "red-donor",
            "Red clamp to the good battery",
            "Connect the other red clamp to the positive (+) post of the good battery.",
            "clamp_red_donor_pos",
            "Both red clamps are on positive posts.",
            competency_codes=["AUTO-JUMP-01"],
            mistakes={
                "clamp_red_dead_neg": RED_ON_NEGATIVE,
                "clamp_red_donor_neg": RED_ON_NEGATIVE,
                "clamp_red_ground": RED_ON_NEGATIVE,
            },
        ),
        _step(
            5,
            "black-donor",
            "Black clamp to the good battery",
            "Connect a black clamp to the negative (−) post of the good battery.",
            "clamp_black_donor_neg",
            "Black clamp is on the good battery's negative post.",
            competency_codes=["AUTO-JUMP-01"],
            mistakes={
                "clamp_black_dead_pos": {
                    "effect": "spark",
                    "message": "A black clamp on a positive post shorts the good battery.",
                },
                "clamp_black_donor_pos": {
                    "effect": "spark",
                    "message": "A black clamp on a positive post shorts the good battery.",
                },
            },
        ),
        _step(
            6,
            "black-earth",
            "Last black clamp to bare metal",
            (
                "Connect the last black clamp to bare metal on the engine of the vehicle with "
                "the flat battery, away from the battery itself."
            ),
            "clamp_black_dead_ground",
            "The last clamp is on a metal earth point, away from the battery.",
            safety=True,
            competency_codes=["AUTO-SAFE-01", "AUTO-JUMP-01"],
            mistakes={
                "clamp_black_dead_neg": {
                    "effect": "spark",
                    "message": (
                        "The last connection can spark. At the flat battery's negative post "
                        "that spark is right beside the gas the battery gives off. Use bare "
                        "metal away from the battery."
                    ),
                },
            },
            hints=[
                {
                    "code": "earth-point",
                    "text": "Look for the unpainted metal bracket on the engine block.",
                    "points_penalty": 2,
                }
            ],
        ),
        _step(
            7,
            "start-donor",
            "Start the good vehicle",
            "Start the vehicle with the good battery and let it run for a few minutes.",
            "start_donor",
            "The good vehicle is running and charging the flat battery.",
            competency_codes=["AUTO-JUMP-01"],
        ),
        _step(
            8,
            "start-flat",
            "Start the vehicle with the flat battery",
            "Now start the vehicle that had the flat battery.",
            "start_dead",
            "The engine starts.",
            competency_codes=["AUTO-JUMP-01"],
        ),
        _step(
            9,
            "disconnect",
            "Disconnect the leads",
            "Both engines are running. Choose the order to take the leads off.",
            "remove_reverse_order",
            "Correct. Reverse order: the black clamp on bare metal comes off first, the red clamp on the restarted vehicle last.",
            safety=True,
            competency_codes=["AUTO-SAFE-01", "AUTO-JUMP-01"],
            choices=[
                {
                    "action_code": "remove_reverse_order",
                    "label": "Reverse order: black clamp on bare metal first",
                },
                {"action_code": "remove_red_first", "label": "Red clamps first"},
                {"action_code": "remove_any_order", "label": "Any order, the engine is running"},
            ],
            mistakes={
                "remove_red_first": {
                    "effect": "spark",
                    "message": (
                        "A loose live red clamp that touches metal shorts the battery. Take "
                        "the earth clamp off first so the circuit is broken away from the battery."
                    ),
                },
                "remove_any_order": {
                    "effect": "spark",
                    "message": "Order still matters with engines running. Reverse the connection order.",
                },
            },
        ),
    ],
    "knowledge_check": {
        "questions": [
            {
                "code": "last-clamp",
                "prompt": "Where does the last black clamp go?",
                "options": [
                    {"code": "flat-neg", "label": "The flat battery's negative post"},
                    {"code": "earth", "label": "Bare metal on the engine, away from the battery"},
                    {"code": "donor-pos", "label": "The good battery's positive post"},
                ],
                "answer": "earth",
                "explanation": (
                    "The last connection can spark. Making it on bare metal keeps the spark "
                    "away from battery gas."
                ),
            },
            {
                "code": "red-clamp",
                "prompt": "A red clamp may touch:",
                "options": [
                    {"code": "pos", "label": "Only a positive (+) post"},
                    {"code": "any", "label": "Any metal part"},
                    {"code": "black", "label": "The black clamp, to test the leads"},
                ],
                "answer": "pos",
                "explanation": "Red on anything except a positive post is a short circuit.",
            },
        ]
    },
    "scene": {
        "version": 1,
        "props": [
            {
                "id": "glasses",
                "kind": "glasses",
                "position": [-3.0, 1.3],
                "label": "Safety glasses",
            },
            {"id": "dead", "kind": "battery", "position": [-1.6, -0.3], "label": "Flat battery"},
            {
                "id": "earth",
                "kind": "earth_point",
                "position": [-3.0, -1.0],
                "label": "Engine block",
            },
            {"id": "dead_key", "kind": "key", "position": [-1.6, 1.4], "label": "Ignition (flat)"},
            {"id": "donor", "kind": "battery", "position": [1.7, -0.3], "label": "Good battery"},
            {"id": "donor_key", "kind": "key", "position": [1.7, 1.4], "label": "Ignition (good)"},
            {"id": "leads", "kind": "jump_leads", "position": [0.1, 1.3], "label": "Jump leads"},
        ],
        "bindings": {
            "glasses.body": {"action": "confirm_ppe"},
            "dead_key.body": {"action": ["switch_both_off", "start_dead"]},
            "donor_key.body": {"action": ["switch_both_off", "start_donor"]},
            "leads.clamp_red": {"tool": "red_clamp", "label": "Red clamp"},
            "leads.clamp_black": {"tool": "black_clamp", "label": "Black clamp"},
            "dead.terminal_pos": {
                "accepts": {
                    "red_clamp": "clamp_red_dead_pos",
                    "black_clamp": "clamp_black_dead_pos",
                }
            },
            "dead.terminal_neg": {
                "accepts": {
                    "red_clamp": "clamp_red_dead_neg",
                    "black_clamp": "clamp_black_dead_neg",
                }
            },
            "donor.terminal_pos": {
                "accepts": {
                    "red_clamp": "clamp_red_donor_pos",
                    "black_clamp": "clamp_black_donor_pos",
                }
            },
            "donor.terminal_neg": {
                "accepts": {
                    "red_clamp": "clamp_red_donor_neg",
                    "black_clamp": "clamp_black_donor_neg",
                }
            },
            "earth.body": {
                "accepts": {
                    "black_clamp": "clamp_black_dead_ground",
                    "red_clamp": "clamp_red_ground",
                }
            },
        },
        "effects": [
            {"when": "confirm_ppe", "set": {"glasses": {"worn": True}}},
            {
                "when": "switch_both_off",
                "set": {"dead_key": {"position": "off"}, "donor_key": {"position": "off"}},
            },
            {"when": "clamp_red_dead_pos", "set": {"leads": {"red_a": "dead.terminal_pos"}}},
            {"when": "clamp_red_donor_pos", "set": {"leads": {"red_b": "donor.terminal_pos"}}},
            {"when": "clamp_black_donor_neg", "set": {"leads": {"black_a": "donor.terminal_neg"}}},
            {"when": "clamp_black_dead_ground", "set": {"leads": {"black_b": "earth.body"}}},
            {"when": "start_donor", "set": {"donor_key": {"position": "run"}}},
            {"when": "start_dead", "set": {"dead_key": {"position": "run"}}},
            {
                "when": "remove_reverse_order",
                "set": {"leads": {"red_a": None, "red_b": None, "black_a": None, "black_b": None}},
            },
        ],
    },
}


def _fuse_case(code, label, circuit, fuse, rating):
    ratings = {"10": "fit_fuse_10a", "15": "fit_fuse_15a", "20": "fit_fuse_20a"}
    select = f"select_fuse_{fuse}"
    fit = ratings[str(rating)]
    wrong_fit = {}
    for value, action in ratings.items():
        if action == fit:
            continue
        wrong_fit[action] = (
            {
                "effect": "hazard",
                "message": (
                    f"A {value} A fuse in a {rating} A circuit lets the wiring overheat before "
                    "the fuse blows. That is a fire risk. Fit the same rating."
                ),
            }
            if int(value) > rating
            else {
                "effect": "blown_fuse",
                "message": (
                    f"A {value} A fuse is too small for this {rating} A circuit and will blow "
                    "again in normal use. Fit the same rating."
                ),
            }
        )
    wrong_fit["fit_wire"] = {
        "effect": "hazard",
        "message": "Wire or foil in place of a fuse removes the protection completely. Never do it.",
    }
    return {
        "code": code,
        "label": label,
        "steps": {
            "find-fuse": {
                "instruction": (
                    f"The {circuit} do not work. The cover diagram shows fuse "
                    f"{fuse.upper()} protects the {circuit} ({rating} A). Select that fuse."
                ),
                "action_code": select,
                "acceptable_actions": [
                    {"action_code": select, "label": "Fuse", "is_primary": True, "tolerance": None}
                ],
                "feedback": f"Fuse {fuse.upper()} is the one for the {circuit}.",
                "feedback_rules": {
                    "correct": f"Fuse {fuse.upper()} is the one for the {circuit}.",
                    "incorrect": (
                        f"That fuse protects a different circuit. The diagram shows "
                        f"{fuse.upper()} for the {circuit}."
                    ),
                },
                "metadata": {"fuse": fuse, "rating": rating, "circuit": circuit},
            },
            "fit-fuse": {
                "instruction": f"Fit a new fuse. The blown fuse was rated {rating} A.",
                "action_code": fit,
                "acceptable_actions": [
                    {"action_code": fit, "label": "Fuse", "is_primary": True, "tolerance": None}
                ],
                "feedback": f"A new {rating} A fuse is fitted: the same rating as the old one.",
                "feedback_rules": {
                    "correct": f"A new {rating} A fuse is fitted: the same rating as the old one."
                },
                "mistakes": wrong_fit,
            },
            "test": {
                "feedback": f"The {circuit} work again.",
                "feedback_rules": {"correct": f"The {circuit} work again."},
            },
        },
    }


FUSE_CHOICES = [
    {"action_code": "select_fuse_f1", "label": "Fuse F1"},
    {"action_code": "select_fuse_f2", "label": "Fuse F2"},
    {"action_code": "select_fuse_f3", "label": "Fuse F3"},
    {"action_code": "select_fuse_f4", "label": "Fuse F4"},
]

FUSE_LESSON = {
    "slug": "blown-fuse-check-and-replace",
    "title": "Find and Replace a Blown Fuse",
    "summary": "Use the fuse diagram to find the right fuse, remove it safely, and fit the correct rating.",
    "objectives": [
        "Read a fuse diagram to find the fuse for a circuit.",
        "Remove and inspect a blade fuse without damaging the holder.",
        "Explain why a fuse is replaced only with the same rating.",
    ],
    "safety_notes": [
        "Switch the ignition off before you remove a fuse.",
        "Never fit a higher-rated fuse, wire or foil.",
    ],
    "estimated_minutes": 12,
    "competencies": ["AUTO-SAFE-01", "AUTO-FUSE-01"],
    "scenario_version": 1,
    "scenario_title": "Blown fuse: find, remove, replace",
    "steps": [
        _step(
            1,
            "ignition",
            "Switch the ignition off",
            "Turn the ignition off before you touch the fuse box.",
            "turn_ignition_off",
            "Ignition is off. The circuits are no longer live.",
            safety=True,
            competency_codes=["AUTO-SAFE-01"],
            mistakes=_same(
                ["pull_fuse_with_puller", "pull_fuse_with_screwdriver"],
                {
                    "effect": "spark",
                    "message": "The circuit is live. Switch the ignition off before removing a fuse.",
                },
            ),
        ),
        _step(
            2,
            "find-fuse",
            "Find the right fuse",
            "Use the diagram on the cover to find the fuse for the circuit that stopped working.",
            "select_fuse_f3",
            "That is the right fuse.",
            competency_codes=["AUTO-FUSE-01"],
            choices=FUSE_CHOICES,
        ),
        _step(
            3,
            "pull-fuse",
            "Remove the fuse",
            "Choose a tool and pull the fuse straight out of its holder.",
            "pull_fuse_with_puller",
            "The fuse puller grips the plastic body, so the fuse comes out cleanly.",
            competency_codes=["AUTO-FUSE-01"],
            choices=[
                {"action_code": "pull_fuse_with_puller", "label": "Use the plastic fuse puller"},
                {
                    "action_code": "pull_fuse_with_screwdriver",
                    "label": "Lever it out with a screwdriver",
                },
            ],
            mistakes={
                "pull_fuse_with_screwdriver": {
                    "effect": "damage",
                    "message": (
                        "A metal screwdriver can bridge two terminals or bend the holder. Use "
                        "the plastic fuse puller."
                    ),
                }
            },
        ),
        _step(
            4,
            "inspect",
            "Inspect the fuse",
            "Hold the fuse to the light and look at the metal strip inside.",
            "inspect_fuse",
            "The metal strip inside is broken. This fuse has blown.",
            competency_codes=["AUTO-FUSE-01"],
        ),
        _step(
            5,
            "fit-fuse",
            "Fit the correct fuse",
            "Choose the replacement fuse.",
            "fit_fuse_10a",
            "The new fuse has the same rating as the old one.",
            safety=True,
            competency_codes=["AUTO-SAFE-01", "AUTO-FUSE-01"],
            choices=[
                {"action_code": "fit_fuse_10a", "label": "10 A fuse (red)"},
                {"action_code": "fit_fuse_15a", "label": "15 A fuse (blue)"},
                {"action_code": "fit_fuse_20a", "label": "20 A fuse (yellow)"},
                {"action_code": "fit_wire", "label": "A piece of wire, it is quicker"},
            ],
            hints=[
                {
                    "code": "same-rating",
                    "text": "The rating is printed on top of the fuse you removed.",
                    "points_penalty": 2,
                }
            ],
        ),
        _step(
            6,
            "test",
            "Test the circuit",
            "Switch the ignition on and check that the circuit works again.",
            "test_circuit",
            "The circuit works again.",
            competency_codes=["AUTO-FUSE-01"],
        ),
    ],
    "variants": [
        _fuse_case("tail-lamps", "Tail lamps", "tail lamps", "f3", 10),
        _fuse_case("horn", "Horn", "horn", "f1", 15),
        _fuse_case("wipers", "Wipers", "wipers", "f4", 20),
    ],
    "knowledge_check": {
        "questions": [
            {
                "code": "rating",
                "prompt": "A 10 A fuse has blown. What do you fit?",
                "options": [
                    {"code": "same", "label": "Another 10 A fuse"},
                    {"code": "bigger", "label": "A 20 A fuse so it does not blow again"},
                    {"code": "wire", "label": "A piece of wire until a fuse is found"},
                ],
                "answer": "same",
                "explanation": (
                    "The fuse is the weakest point on purpose. A bigger fuse or wire lets the "
                    "cable overheat instead."
                ),
            },
            {
                "code": "again",
                "prompt": "The new fuse blows again straight away. What does that mean?",
                "options": [
                    {"code": "fault", "label": "There is a fault in the circuit to find"},
                    {"code": "bad", "label": "The new fuse was a bad one, keep trying"},
                    {"code": "bigger", "label": "The circuit needs a bigger fuse"},
                ],
                "answer": "fault",
                "explanation": "A fuse that blows again is doing its job. Find the short or overload.",
            },
        ]
    },
    "scene": {
        "version": 1,
        "props": [
            {"id": "key", "kind": "key", "position": [-2.8, -0.8], "label": "Ignition"},
            {"id": "box", "kind": "fusebox", "position": [-0.4, -0.2], "label": "Fuse box"},
            {"id": "tools", "kind": "fuse_tools", "position": [-2.6, 1.2], "label": "Tools"},
            {"id": "spares", "kind": "spare_fuses", "position": [2.3, 0.9], "label": "Spare fuses"},
        ],
        "bindings": {
            "key.body": {"action": ["turn_ignition_off", "test_circuit"]},
            "box.fuse_f1": {"action": ["select_fuse_f1", "inspect_fuse"]},
            "box.fuse_f2": {"action": ["select_fuse_f2", "inspect_fuse"]},
            "box.fuse_f3": {"action": ["select_fuse_f3", "inspect_fuse"]},
            "box.fuse_f4": {"action": ["select_fuse_f4", "inspect_fuse"]},
            "tools.puller": {"tool": "puller", "label": "Fuse puller"},
            "tools.screwdriver": {"tool": "screwdriver", "label": "Screwdriver"},
            "box.body": {
                "accepts": {
                    "puller": "pull_fuse_with_puller",
                    "screwdriver": "pull_fuse_with_screwdriver",
                }
            },
            "spares.fuse_10": {"action": "fit_fuse_10a"},
            "spares.fuse_15": {"action": "fit_fuse_15a"},
            "spares.fuse_20": {"action": "fit_fuse_20a"},
            "spares.wire": {"action": "fit_wire"},
        },
        "effects": [
            {"when": "turn_ignition_off", "set": {"key": {"position": "off"}}},
            {"when": "select_fuse_f1", "set": {"box": {"selected": "f1"}}},
            {"when": "select_fuse_f3", "set": {"box": {"selected": "f3"}}},
            {"when": "select_fuse_f4", "set": {"box": {"selected": "f4"}}},
            {"when": "pull_fuse_with_puller", "set": {"box": {"pulled": True}}},
            {"when": "inspect_fuse", "set": {"box": {"inspected": True}}},
            {"when": "fit_fuse_10a", "set": {"box": {"pulled": False, "fitted": True}}},
            {"when": "fit_fuse_15a", "set": {"box": {"pulled": False, "fitted": True}}},
            {"when": "fit_fuse_20a", "set": {"box": {"pulled": False, "fitted": True}}},
            {"when": "test_circuit", "set": {"key": {"position": "on"}, "box": {"working": True}}},
        ],
    },
}


def _charging_case(code, label, reading, low, high, answer, feedback, wrong):
    case = _voltage_case(code, label, reading, low, high, answer, feedback, wrong)
    case["steps"]["read-voltage"]["feedback"] = (
        f"With the engine running the meter reads {reading} V."
    )
    case["steps"]["read-voltage"]["feedback_rules"] = {
        "correct": f"With the engine running the meter reads {reading} V."
    }
    case["steps"]["diagnosis"]["instruction"] = (
        f"With the engine running the meter reads {reading} V. Decide what that means."
    )
    return case


CHARGING_CHOICES = [
    {"action_code": "choose_charging_ok", "label": "Charging normally"},
    {
        "action_code": "choose_undercharging",
        "label": "Not charging: check the drive belt, connections and alternator",
    },
    {
        "action_code": "choose_overcharging",
        "label": "Overcharging: the voltage regulator is suspect",
    },
]

CHARGING_LESSON = {
    "slug": "charging-system-voltage-check",
    "title": "Check the Charging System Voltage",
    "summary": "Measure battery voltage with the engine running and decide whether the alternator is charging.",
    "objectives": [
        "Measure charging voltage safely with the engine running.",
        "Recognise normal, low and high charging voltage.",
    ],
    "safety_notes": [
        "Keep hands, leads, hair and loose clothing away from the fan and drive belt.",
        "Wear eye protection near the battery.",
    ],
    "estimated_minutes": 15,
    "competencies": ["AUTO-SAFE-01", "AUTO-DIAG-01"],
    "scenario_version": 1,
    "scenario_title": "Charging voltage: fault cases",
    "steps": [
        _step(
            1,
            "ppe",
            "Put on eye protection",
            "Put on the safety glasses before you go near the battery.",
            "confirm_ppe",
            "Eye protection is on.",
            safety=True,
            competency_codes=["AUTO-SAFE-01"],
            mistakes=_same(PROBE_ACTIONS, PPE_BEFORE_BATTERY),
        ),
        _step(
            2,
            "meter-mode",
            "Set the multimeter",
            "Set the multimeter to measure the voltage of a 12 V system.",
            "set_meter_dc",
            "DC volts is selected.",
            competency_codes=["AUTO-DIAG-01"],
            choices=METER_MODE_CHOICES,
            mistakes=METER_MODE_MISTAKES,
        ),
        _step(
            3,
            "negative-lead",
            "Connect the black probe",
            "With the engine still off, connect the black probe.",
            "connect_black_negative",
            "Black probe is on the negative terminal.",
            competency_codes=["AUTO-DIAG-01"],
            choices=BLACK_LEAD_CHOICES,
            mistakes=BLACK_LEAD_MISTAKES,
        ),
        _step(
            4,
            "positive-lead",
            "Connect the red probe",
            "Connect the red probe.",
            "connect_red_positive",
            "Both probes are connected with the correct polarity.",
            competency_codes=["AUTO-DIAG-01"],
            choices=RED_LEAD_CHOICES,
            mistakes=RED_LEAD_MISTAKES,
        ),
        _step(
            5,
            "clear-of-belt",
            "Check the leads are clear of the belt",
            "Before starting, check that the meter leads and your clothing are clear of the fan and drive belt.",
            "confirm_clear_of_belt",
            "Leads and clothing are clear of moving parts.",
            safety=True,
            competency_codes=["AUTO-SAFE-01"],
            mistakes={
                "start_engine": {
                    "effect": "hazard",
                    "message": (
                        "Stop. A lead or sleeve caught by the drive belt is pulled in before "
                        "you can react. Check everything is clear before starting."
                    ),
                }
            },
        ),
        _step(
            6,
            "start-engine",
            "Start the engine",
            "Start the engine and let it settle at a fast idle.",
            "start_engine",
            "The engine is running at a fast idle.",
            competency_codes=["AUTO-DIAG-01"],
        ),
        _step(
            7,
            "read-voltage",
            "Read the charging voltage",
            "Read the voltage with the engine running.",
            "read_voltage",
            "The meter shows the charging voltage.",
            competency_codes=["AUTO-DIAG-01"],
            metadata={"reading": 14.2, "unit": "V"},
        ),
        _step(
            8,
            "diagnosis",
            "Choose the diagnosis",
            "Use the reading to decide whether the system is charging.",
            "choose_charging_ok",
            "Diagnosis recorded.",
            competency_codes=["AUTO-DIAG-01"],
            choices=CHARGING_CHOICES,
            hints=[
                {
                    "code": "normal-range",
                    "text": "A healthy system holds roughly 13.8 V to 14.5 V with the engine running.",
                    "points_penalty": 2,
                }
            ],
        ),
    ],
    "variants": [
        _charging_case(
            "normal",
            "Charging normally",
            14.2,
            13.8,
            14.5,
            "choose_charging_ok",
            "Correct. About 14.2 V with the engine running is normal charging.",
            {
                "choose_undercharging": {
                    "effect": "none",
                    "message": "14.2 V is well above battery voltage, so the alternator is charging.",
                },
                "choose_overcharging": {
                    "effect": "none",
                    "message": "14.2 V is inside the normal range. Overcharging shows as about 15 V or more.",
                },
            },
        ),
        _charging_case(
            "not-charging",
            "Not charging",
            12.3,
            12.0,
            12.6,
            "choose_undercharging",
            "Correct. 12.3 V with the engine running is only battery voltage: nothing is charging it.",
            {
                "choose_charging_ok": {
                    "effect": "none",
                    "message": (
                        "12.3 V is what a battery gives on its own. A charging system lifts "
                        "it to about 14 V."
                    ),
                },
                "choose_overcharging": {
                    "effect": "none",
                    "message": "Overcharging shows as a high reading, about 15 V or more. This one is low.",
                },
            },
        ),
        _charging_case(
            "overcharging",
            "Overcharging",
            15.4,
            15.0,
            15.9,
            "choose_overcharging",
            "Correct. 15.4 V is too high and will boil the battery: the regulator is suspect.",
            {
                "choose_charging_ok": {
                    "effect": "none",
                    "message": "15.4 V is above the normal range and damages the battery over time.",
                },
                "choose_undercharging": {
                    "effect": "none",
                    "message": "The reading is high, not low. The alternator is charging too hard.",
                },
            },
        ),
    ],
    "knowledge_check": {
        "questions": [
            {
                "code": "moving-parts",
                "prompt": "What do you check just before starting the engine?",
                "options": [
                    {"code": "clear", "label": "Leads and clothing are clear of the fan and belt"},
                    {"code": "radio", "label": "The radio is off"},
                    {"code": "fuel", "label": "The fuel tank is full"},
                ],
                "answer": "clear",
                "explanation": "A running belt pulls in anything loose faster than you can react.",
            },
            {
                "code": "normal",
                "prompt": "Roughly what should a healthy charging system read with the engine running?",
                "options": [
                    {"code": "12", "label": "About 12 V"},
                    {"code": "14", "label": "About 14 V"},
                    {"code": "16", "label": "About 16 V"},
                ],
                "answer": "14",
                "explanation": "Around 13.8 V to 14.5 V. About 12 V means no charge; about 15 V or more is too much.",
            },
        ]
    },
    "scene": {
        "version": 1,
        "props": [
            {
                "id": "glasses",
                "kind": "glasses",
                "position": [-3.0, 1.3],
                "label": "Safety glasses",
            },
            {"id": "engine", "kind": "engine", "position": [-2.6, -0.8], "label": "Engine"},
            {
                "id": "key",
                "kind": "key",
                "position": [-1.0, 1.4],
                "label": "Ignition",
                "state": {"position": "off"},
            },
            {"id": "battery", "kind": "battery", "position": [-0.2, -0.3], "label": "12 V battery"},
            {
                "id": "meter",
                "kind": "multimeter",
                "position": [2.3, 0.1],
                "label": "Multimeter",
                "reading_step": "read-voltage",
                # Before the engine runs the meter shows the battery at rest.
                "state": {"resting": 12.5, "live": False},
            },
        ],
        "bindings": {
            "glasses.body": {"action": "confirm_ppe"},
            "engine.belt": {"action": "confirm_clear_of_belt"},
            "key.body": {"action": "start_engine"},
            "meter.mode_dcv": {"action": "set_meter_dc"},
            "meter.mode_acv": {"action": "set_meter_ac"},
            "meter.mode_ohm": {"action": "set_meter_ohms"},
            "meter.mode_amp": {"action": "set_meter_amps"},
            "meter.probe_black": {"tool": "probe_black", "label": "Black probe"},
            "meter.probe_red": {"tool": "probe_red", "label": "Red probe"},
            "battery.terminal_neg": {
                "accepts": {
                    "probe_black": "connect_black_negative",
                    "probe_red": "connect_red_negative",
                }
            },
            "battery.terminal_pos": {
                "accepts": {
                    "probe_red": "connect_red_positive",
                    "probe_black": "connect_black_positive",
                }
            },
            "meter.display": {"action": "read_voltage"},
        },
        "effects": [
            {"when": "confirm_ppe", "set": {"glasses": {"worn": True}}},
            {"when": "set_meter_dc", "set": {"meter": {"mode": "dcv"}}},
            {"when": "connect_black_negative", "set": {"meter": {"black": "battery.terminal_neg"}}},
            {"when": "connect_red_positive", "set": {"meter": {"red": "battery.terminal_pos"}}},
            {"when": "confirm_clear_of_belt", "set": {"engine": {"checked": True}}},
            {
                "when": "start_engine",
                "set": {
                    "key": {"position": "run"},
                    "engine": {"running": True},
                    "meter": {"live": True},
                },
            },
        ],
    },
}


SAFE_ITEM = "That one is safe."

HAZARD_LESSON = {
    "slug": "workshop-hazard-hunt",
    "title": "Workshop Hazard Hunt",
    "summary": "Walk into the workshop and find everything that could hurt someone before work starts.",
    "objectives": [
        "Spot slip, trip, fire and electrical hazards in a workshop.",
        "Say what makes each one dangerous and how to put it right.",
    ],
    "safety_notes": [
        "Look before you start work, every time.",
        "Report or fix a hazard before anyone works near it.",
    ],
    "estimated_minutes": 8,
    "competencies": ["SAFE-HAZ-01"],
    "scenario_version": 1,
    "scenario_title": "Hazard hunt: five things wrong",
    "sequence": "free",
    "steps": [
        _step(
            1,
            "oil-spill",
            "Oil on the floor",
            "Find everything in this workshop that could hurt someone. There are five hazards.",
            "spot_oil_spill",
            "Oil on the floor is a slip hazard. Cover it with absorbent, sweep it up and report it.",
            competency_codes=["SAFE-HAZ-01"],
        ),
        _step(
            2,
            "frayed-cable",
            "Damaged power cable",
            "Find everything in this workshop that could hurt someone. There are five hazards.",
            "spot_frayed_cable",
            "A cable with damaged insulation can shock or start a fire. Unplug it, tag it and take it out of use.",
            safety=True,
            competency_codes=["SAFE-HAZ-01"],
        ),
        _step(
            3,
            "blocked-extinguisher",
            "Blocked fire extinguisher",
            "Find everything in this workshop that could hurt someone. There are five hazards.",
            "spot_blocked_extinguisher",
            "Nobody can reach a blocked extinguisher in a fire. Keep the space in front of it clear.",
            safety=True,
            competency_codes=["SAFE-HAZ-01"],
        ),
        _step(
            4,
            "open-fuel",
            "Open fuel container",
            "Find everything in this workshop that could hurt someone. There are five hazards.",
            "spot_open_fuel",
            "Fuel vapour from an open container can be lit by a spark far away. Seal it and store it in the fuel store.",
            safety=True,
            competency_codes=["SAFE-HAZ-01"],
        ),
        _step(
            5,
            "tools-on-floor",
            "Tools left on the floor",
            "Find everything in this workshop that could hurt someone. There are five hazards.",
            "spot_tools_on_floor",
            "Tools on the floor are a trip hazard. Put them back in the toolbox or on the bench.",
            competency_codes=["SAFE-HAZ-01"],
        ),
    ],
    "definition_mistakes": {
        "spot_first_aid": {
            "effect": "none",
            "message": "The first-aid box is where it should be: on the wall, easy to see and reach.",
        },
        "spot_tidy_bench": {
            "effect": "none",
            "message": "The bench is tidy and the tools are stored. Nothing wrong there.",
        },
        "spot_clear_extinguisher": {
            "effect": "none",
            "message": "This extinguisher is on its bracket with clear space in front of it. That is correct.",
        },
        "spot_good_cable": {
            "effect": "none",
            "message": "This cable is undamaged and coiled out of the way. It is fine.",
        },
    },
    "knowledge_check": {
        "questions": [
            {
                "code": "first",
                "prompt": "You find a hazard before starting work. What comes first?",
                "options": [
                    {
                        "code": "fix",
                        "label": "Make it safe or report it before anyone works nearby",
                    },
                    {"code": "later", "label": "Finish the job, then mention it"},
                    {"code": "ignore", "label": "Leave it, someone else will notice"},
                ],
                "answer": "fix",
                "explanation": "A hazard you have seen is yours to deal with or report straight away.",
            }
        ]
    },
    "scene": {
        "version": 1,
        "layout": "floor",
        "props": [
            {"id": "spill", "kind": "spill", "position": [-0.6, 0.9], "label": "Floor"},
            {
                "id": "bad_cable",
                "kind": "cable",
                "position": [-2.6, 0.2],
                "label": "Extension cable",
                "state": {"frayed": True},
            },
            {
                "id": "good_cable",
                "kind": "cable",
                "position": [2.7, 1.4],
                "label": "Extension cable",
            },
            {
                "id": "ext_blocked",
                "kind": "extinguisher",
                "position": [-3.0, -1.5],
                "label": "Extinguisher",
                "state": {"blocked": True},
            },
            {
                "id": "ext_clear",
                "kind": "extinguisher",
                "position": [3.1, -1.5],
                "label": "Extinguisher",
            },
            {
                "id": "fuel",
                "kind": "fuel_can",
                "position": [1.2, -0.4],
                "label": "Fuel can",
                "state": {"open": True},
            },
            {"id": "loose_tools", "kind": "loose_tools", "position": [0.9, 1.5], "label": "Tools"},
            {"id": "bench", "kind": "workbench", "position": [-0.9, -1.5], "label": "Workbench"},
            {"id": "first_aid", "kind": "first_aid", "position": [1.3, -1.7], "label": "First aid"},
        ],
        "bindings": {
            "spill.body": {"action": "spot_oil_spill"},
            "bad_cable.body": {"action": "spot_frayed_cable"},
            "good_cable.body": {"action": "spot_good_cable"},
            "ext_blocked.body": {"action": "spot_blocked_extinguisher"},
            "ext_clear.body": {"action": "spot_clear_extinguisher"},
            "fuel.body": {"action": "spot_open_fuel"},
            "loose_tools.body": {"action": "spot_tools_on_floor"},
            "bench.body": {"action": "spot_tidy_bench"},
            "first_aid.body": {"action": "spot_first_aid"},
        },
        "effects": [
            {"when": "spot_oil_spill", "set": {"spill": {"found": True}}},
            {"when": "spot_frayed_cable", "set": {"bad_cable": {"found": True}}},
            {"when": "spot_blocked_extinguisher", "set": {"ext_blocked": {"found": True}}},
            {"when": "spot_open_fuel", "set": {"fuel": {"found": True}}},
            {"when": "spot_tools_on_floor", "set": {"loose_tools": {"found": True}}},
        ],
        "extra_actions": [
            {"action_code": "spot_first_aid", "label": "First-aid box on the wall"},
            {"action_code": "spot_tidy_bench", "label": "Workbench with tools stored"},
            {"action_code": "spot_clear_extinguisher", "label": "Extinguisher with clear access"},
            {"action_code": "spot_good_cable", "label": "Coiled extension cable"},
        ],
    },
}


AUTO_COMPETENCIES = {
    "AUTO-JUMP-01": {
        "title": "Jump-start a vehicle safely",
        "description": "Connect and disconnect jump leads in the order that prevents sparks at the battery.",
        "mastery_threshold": 80,
    },
    "AUTO-FUSE-01": {
        "title": "Find and replace a blown fuse",
        "description": "Identify the fuse for a circuit and replace it with the correct rating.",
        "mastery_threshold": 80,
    },
}

SAFETY_COURSE = {
    "slug": "workshop-safety-essentials",
    "title": "Workshop Safety Essentials",
    "trade": "All trades",
    "description": "Safety habits every workshop learner needs, whatever the trade.",
    "module": {"code": "hazard-awareness", "title": "Hazard Awareness"},
    "competencies": {
        "SAFE-HAZ-01": {
            "title": "Recognise workshop hazards",
            "description": "Spot slip, trip, fire and electrical hazards before work starts.",
            "mastery_threshold": 80,
        }
    },
}

# New lessons added to the automotive electrical course, in teaching order.
AUTO_LESSONS = [JUMP_START_LESSON, FUSE_LESSON, CHARGING_LESSON]


def apply_overlays(definition, spec):
    """Add the parts of a lesson the normalized authoring tables do not hold."""

    definition = dict(definition)
    by_code = {step["code"]: dict(step) for step in definition.get("steps", [])}
    for code, choices in (spec.get("choices") or {}).items():
        by_code[code]["choices"] = choices
    for code, mistakes in (spec.get("mistakes") or {}).items():
        by_code[code]["mistakes"] = mistakes
    for authored in spec.get("steps") or []:
        step = by_code.get(authored["code"])
        if step is None:
            continue
        for key in ("choices", "mistakes"):
            if key in authored:
                step[key] = authored[key]
    definition["steps"] = [by_code[step["code"]] for step in definition.get("steps", [])]
    for key in ("variants", "knowledge_check", "scene", "sequence"):
        if key in spec:
            definition[key] = spec[key]
    if "definition_mistakes" in spec:
        definition["mistakes"] = spec["definition_mistakes"]
    return definition


# =============================================================================================
# Second trade: Electrical Installation
#
# DRAFT TECHNICAL CONTENT, like everything above. Safe isolation follows the widely taught
# "isolate, lock off, prove the tester, test, prove the tester again" routine; continuity values
# are illustrative. Validate against the RTB Electrical Installation curriculum before use.
# =============================================================================================

UNPROVEN_TESTER = {
    "effect": "hazard",
    "message": (
        "Stop. A tester you have not just checked on the proving unit could be faulty and show "
        "'dead' on a live circuit. Prove it first."
    ),
}
BREAKERS = {
    "b1": "Lighting",
    "b2": "Sockets: living room",
    "b3": "Sockets: kitchen",
    "b4": "Cooker",
    "b5": "Water heater",
    "b6": "Outside lights",
}
BREAKER_CHOICES = [
    {"action_code": f"select_breaker_{code}", "label": f"{code.upper()}: {label}"}
    for code, label in BREAKERS.items()
]
SAFE_DECISION_CHOICES = [
    {"action_code": "declare_dead", "label": "Dead: safe to start work"},
    {
        "action_code": "declare_live_stop",
        "label": "Still live: stop, lock nothing else, and report the wrong label",
    },
]


def _isolation_case(code, label, circuit, breaker, reading, answer, feedback, wrong):
    select = f"select_breaker_{breaker}"
    return {
        "code": code,
        "label": label,
        "steps": {
            "select-breaker": {
                "instruction": (
                    f"You need to work on the {circuit} socket. Use the chart on the board to "
                    "find its breaker."
                ),
                "action_code": select,
                "acceptable_actions": [
                    {
                        "action_code": select,
                        "label": "Breaker",
                        "is_primary": True,
                        "tolerance": None,
                    }
                ],
                "feedback": f"{breaker.upper()} is marked for the {circuit} sockets.",
                "feedback_rules": {
                    "correct": f"{breaker.upper()} is marked for the {circuit} sockets.",
                    "incorrect": (
                        f"That breaker feeds another circuit, so the {circuit} socket would stay "
                        "live. Read the chart again."
                    ),
                },
            },
            "test-socket": {
                "metadata": {"reading": reading, "unit": "V"},
                "feedback": f"The tester shows {reading} V between the terminals.",
                "feedback_rules": {
                    "correct": f"The tester shows {reading} V between the terminals."
                },
            },
            "decide": {
                "instruction": f"The tester showed {reading} V. Is the socket safe to work on?",
                "action_code": answer,
                "acceptable_actions": [
                    {
                        "action_code": answer,
                        "label": "Decision",
                        "is_primary": True,
                        "tolerance": None,
                    }
                ],
                "feedback": feedback,
                "feedback_rules": {"correct": feedback},
                "mistakes": wrong,
            },
        },
    }


SAFE_ISOLATION_LESSON = {
    "slug": "safe-isolation-prove-dead",
    "title": "Safe Isolation: Prove a Circuit Dead",
    "summary": (
        "Switch off the right circuit, lock it off, and prove it dead with a tester you have "
        "checked before and after."
    ),
    "objectives": [
        "Identify the breaker for a circuit from the distribution board chart.",
        "Lock off and tag the breaker so nobody can switch it back on.",
        "Prove the tester, test the circuit, and prove the tester again.",
    ],
    "safety_notes": [
        "Never assume a circuit is dead because a breaker is off. Test it.",
        "Prove the voltage tester on a known source before and after testing.",
        "If the circuit is still live, stop and report it.",
    ],
    "estimated_minutes": 15,
    "competencies": ["ELEC-ISO-01"],
    "scenario_version": 1,
    "scenario_title": "Safe isolation: fault cases",
    "steps": [
        _step(
            1,
            "select-breaker",
            "Find the right breaker",
            "Use the chart on the board to find the breaker for the circuit.",
            "select_breaker_b3",
            "That is the breaker for this circuit.",
            competency_codes=["ELEC-ISO-01"],
            choices=BREAKER_CHOICES,
        ),
        _step(
            2,
            "switch-off",
            "Switch the breaker off",
            "Switch the breaker you found to OFF.",
            "switch_breaker_off",
            "The breaker is off.",
            competency_codes=["ELEC-ISO-01"],
        ),
        _step(
            3,
            "lock-off",
            "Lock off and tag",
            "Fit the lock-off device and your padlock to the breaker, and attach the warning tag.",
            "apply_lock",
            "Locked and tagged. Only you hold the key.",
            safety=True,
            competency_codes=["ELEC-ISO-01"],
            mistakes=_same(
                ["prove_tester_before", "test_socket"],
                {
                    "effect": "hazard",
                    "message": (
                        "Lock it off first. Someone could switch the breaker back on while you "
                        "work."
                    ),
                },
            ),
        ),
        _step(
            4,
            "prove-before",
            "Prove the tester",
            "Check the voltage tester on the proving unit to show it works.",
            "prove_tester_before",
            "The tester lights up on the proving unit: it works.",
            safety=True,
            competency_codes=["ELEC-ISO-01"],
            mistakes={"test_socket": UNPROVEN_TESTER},
        ),
        _step(
            5,
            "test-socket",
            "Test the socket",
            "Test between live and neutral, live and earth, and neutral and earth.",
            "test_socket",
            "Reading taken.",
            competency_codes=["ELEC-ISO-01"],
            metadata={"reading": 0, "unit": "V"},
        ),
        _step(
            6,
            "prove-after",
            "Prove the tester again",
            "Check the tester on the proving unit once more, to show it did not fail during the test.",
            "prove_tester_after",
            "The tester still works, so the reading can be trusted.",
            safety=True,
            competency_codes=["ELEC-ISO-01"],
            mistakes=_same(
                ["declare_dead", "declare_live_stop"],
                {
                    "effect": "hazard",
                    "message": (
                        "Not yet. If the tester failed during the test, a 0 V reading means "
                        "nothing. Prove it again first."
                    ),
                },
            ),
        ),
        _step(
            7,
            "decide",
            "Decide if it is safe",
            "Use the reading to decide.",
            "declare_dead",
            "Decision recorded.",
            safety=True,
            competency_codes=["ELEC-ISO-01"],
            choices=SAFE_DECISION_CHOICES,
        ),
    ],
    "variants": [
        _isolation_case(
            "kitchen",
            "Kitchen sockets",
            "kitchen",
            "b3",
            0,
            "declare_dead",
            "Correct. 0 V on every test with a proven tester: the socket is dead and safe to work on.",
            {
                "declare_live_stop": {
                    "effect": "none",
                    "message": "Every test read 0 V with a proven tester. The socket is dead.",
                }
            },
        ),
        _isolation_case(
            "living-room",
            "Living room sockets",
            "living room",
            "b2",
            0,
            "declare_dead",
            "Correct. 0 V on every test with a proven tester: safe to work on.",
            {
                "declare_live_stop": {
                    "effect": "none",
                    "message": "Every test read 0 V with a proven tester. The socket is dead.",
                }
            },
        ),
        _isolation_case(
            "mislabelled",
            "Mislabelled board",
            "kitchen",
            "b3",
            230,
            "declare_live_stop",
            (
                "Correct. 230 V means the chart is wrong and the socket is fed from elsewhere. "
                "Stop, keep the lock on, and report it."
            ),
            {
                "declare_dead": {
                    "effect": "spark",
                    "message": (
                        "The tester showed 230 V. Working on this socket now would give a "
                        "deadly shock. The board chart is wrong."
                    ),
                }
            },
        ),
    ],
    "knowledge_check": {
        "questions": [
            {
                "code": "why-prove",
                "prompt": "Why do you check the tester on a proving unit before testing?",
                "options": [
                    {
                        "code": "faulty",
                        "label": "A faulty tester could show 'dead' on a live circuit",
                    },
                    {"code": "battery", "label": "To charge the tester's battery"},
                    {"code": "rule", "label": "Only for the paperwork"},
                ],
                "answer": "faulty",
                "explanation": "A broken tester and a dead circuit look the same. Proving tells them apart.",
            },
            {
                "code": "lock",
                "prompt": "What does the padlock on the breaker stop?",
                "options": [
                    {
                        "code": "switch-on",
                        "label": "Anyone switching the circuit back on while you work",
                    },
                    {"code": "theft", "label": "Theft of the breaker"},
                    {"code": "trip", "label": "The breaker tripping"},
                ],
                "answer": "switch-on",
                "explanation": "Only the person working holds the key, so only they can restore power.",
            },
        ]
    },
    "scene": {
        "version": 1,
        "props": [
            {
                "id": "board",
                "kind": "consumer_unit",
                "position": [-1.6, -0.6],
                "label": "Distribution board",
            },
            {"id": "lock", "kind": "lock_kit", "position": [-3.0, 1.2], "label": "Lock-off kit"},
            {
                "id": "tester",
                "kind": "voltage_tester",
                "position": [0.4, 1.4],
                "label": "Voltage tester",
            },
            {
                "id": "prover",
                "kind": "proving_unit",
                "position": [2.6, 1.2],
                "label": "Proving unit",
            },
            {
                "id": "socket",
                "kind": "socket",
                "position": [2.2, -0.8],
                "label": "Socket to work on",
                "reading_step": "test-socket",
            },
        ],
        "bindings": {
            **{
                f"board.breaker_{code}": {
                    "action": [f"select_breaker_{code}", "switch_breaker_off"]
                }
                for code in BREAKERS
            },
            "lock.body": {"tool": "lock", "label": "Lock-off kit"},
            "board.body": {"accepts": {"lock": "apply_lock"}},
            "tester.body": {"tool": "tester", "label": "Voltage tester"},
            "prover.body": {"accepts": {"tester": ["prove_tester_before", "prove_tester_after"]}},
            "socket.body": {"accepts": {"tester": "test_socket"}},
        },
        "effects": [
            *[
                {"when": f"select_breaker_{code}", "set": {"board": {"selected": code}}}
                for code in BREAKERS
            ],
            {"when": "switch_breaker_off", "set": {"board": {"off": True}}},
            {"when": "apply_lock", "set": {"board": {"locked": True}}},
            {"when": "prove_tester_before", "set": {"prover": {"proved": 1}}},
            {"when": "test_socket", "set": {"socket": {"tested": True}}},
            {"when": "prove_tester_after", "set": {"prover": {"proved": 2}}},
        ],
    },
}


def _continuity_case(code, label, reading, display, answer, feedback, wrong):
    return {
        "code": code,
        "label": label,
        "steps": {
            "read-resistance": {
                "metadata": {"reading": reading, "unit": "Ω", "display": display},
                "feedback": f"The meter reads {display}.",
                "feedback_rules": {"correct": f"The meter reads {display}."},
            },
            "diagnosis": {
                "instruction": f"The meter reads {display}. What does it tell you?",
                "action_code": answer,
                "acceptable_actions": [
                    {
                        "action_code": answer,
                        "label": "Diagnosis",
                        "is_primary": True,
                        "tolerance": None,
                    }
                ],
                "feedback": feedback,
                "feedback_rules": {"correct": feedback},
                "mistakes": wrong,
            },
        },
    }


CONTINUITY_LESSON = {
    "slug": "continuity-test-lighting-circuit",
    "title": "Continuity Test on a Lighting Circuit",
    "summary": "Check a de-energised conductor end to end and tell a sound conductor from a break or a loose joint.",
    "objectives": [
        "Confirm the circuit is isolated before any resistance test.",
        "Use the resistance setting and connect across the conductor.",
        "Interpret a low reading, an open circuit and a high resistance.",
    ],
    "safety_notes": [
        "Resistance tests are only ever done on a dead, locked-off circuit.",
        "Never use the resistance setting on a live circuit.",
    ],
    "estimated_minutes": 12,
    "competencies": ["ELEC-ISO-01", "ELEC-TEST-01"],
    "scenario_version": 1,
    "scenario_title": "Continuity: fault cases",
    "steps": [
        _step(
            1,
            "confirm-isolated",
            "Confirm the circuit is dead",
            "Check that the lighting circuit is locked off and has been proved dead.",
            "confirm_isolated",
            "Locked off and proved dead. Safe to test.",
            safety=True,
            competency_codes=["ELEC-ISO-01"],
            mistakes=_same(
                ["set_meter_ohms", "connect_black_end_a", "connect_red_end_b"],
                {
                    "effect": "damage",
                    "message": (
                        "Confirm the circuit is dead first. A resistance test on a live circuit "
                        "damages the meter and can injure you."
                    ),
                },
            ),
        ),
        _step(
            2,
            "meter-mode",
            "Set the meter to resistance",
            "Choose the setting that measures resistance.",
            "set_meter_ohms",
            "Resistance (Ω) selected.",
            competency_codes=["ELEC-TEST-01"],
            choices=[
                {"action_code": "set_meter_ohms", "label": "Resistance (Ω)"},
                {"action_code": "set_meter_dc", "label": "DC volts (V with a straight line)"},
                {"action_code": "set_meter_ac", "label": "AC volts (V with a wave)"},
                {"action_code": "set_meter_amps", "label": "Current (A)"},
            ],
            mistakes={
                "set_meter_dc": {
                    "effect": "wrong_reading",
                    "message": "Volts cannot measure a dead conductor. Choose resistance (Ω).",
                },
                "set_meter_ac": {
                    "effect": "wrong_reading",
                    "message": "Volts cannot measure a dead conductor. Choose resistance (Ω).",
                },
                "set_meter_amps": {
                    "effect": "wrong_reading",
                    "message": "Current needs a working circuit. On a dead conductor, measure resistance (Ω).",
                },
            },
        ),
        _step(
            3,
            "black-end",
            "Connect one end",
            "Connect the black probe to one end of the conductor.",
            "connect_black_end_a",
            "Black probe on end A.",
            competency_codes=["ELEC-TEST-01"],
        ),
        _step(
            4,
            "red-end",
            "Connect the other end",
            "Connect the red probe to the other end of the same conductor.",
            "connect_red_end_b",
            "Red probe on end B. The meter is now across the whole conductor.",
            competency_codes=["ELEC-TEST-01"],
        ),
        _step(
            5,
            "read-resistance",
            "Read the resistance",
            "Read the meter.",
            "read_resistance",
            "Reading taken.",
            competency_codes=["ELEC-TEST-01"],
            metadata={"reading": 0.45, "unit": "Ω", "display": "0.45 Ω"},
        ),
        _step(
            6,
            "diagnosis",
            "Choose the diagnosis",
            "Use the reading to decide.",
            "choose_continuous",
            "Diagnosis recorded.",
            competency_codes=["ELEC-TEST-01"],
            choices=[
                {"action_code": "choose_continuous", "label": "Continuous: the conductor is sound"},
                {"action_code": "choose_open", "label": "Open circuit: the conductor is broken"},
                {
                    "action_code": "choose_high",
                    "label": "High resistance: look for a loose or burnt joint",
                },
            ],
            hints=[
                {
                    "code": "ol-meaning",
                    "text": "OL on a meter means 'over limit': no path at all between the probes.",
                    "points_penalty": 2,
                }
            ],
        ),
    ],
    "variants": [
        _continuity_case(
            "sound",
            "Sound conductor",
            0.45,
            "0.45 Ω",
            "choose_continuous",
            "Correct. Well under 1 Ω for a short lighting run: the conductor is continuous.",
            {
                "choose_open": {
                    "effect": "none",
                    "message": "An open circuit reads OL. This reads 0.45 Ω, so current has a path.",
                },
                "choose_high": {
                    "effect": "none",
                    "message": "0.45 Ω is normal for a short run. Nothing points to a bad joint.",
                },
            },
        ),
        _continuity_case(
            "open",
            "Broken conductor",
            None,
            "OL",
            "choose_open",
            "Correct. OL means no path at all: the conductor is broken somewhere along the run.",
            {
                "choose_continuous": {
                    "effect": "none",
                    "message": "OL means no connection between the probes, so it is not continuous.",
                },
                "choose_high": {
                    "effect": "none",
                    "message": "A high resistance still shows a number. OL means no path at all.",
                },
            },
        ),
        _continuity_case(
            "loose-joint",
            "Loose joint",
            18.0,
            "18.0 Ω",
            "choose_high",
            "Correct. 18 Ω is far too high for copper this short: look for a loose or burnt joint.",
            {
                "choose_continuous": {
                    "effect": "none",
                    "message": "There is a path, but 18 Ω is far too high for a short copper run.",
                },
                "choose_open": {
                    "effect": "none",
                    "message": "An open circuit reads OL. A number means there is still a path.",
                },
            },
        ),
    ],
    "knowledge_check": {
        "questions": [
            {
                "code": "dead-first",
                "prompt": "When can you do a resistance test?",
                "options": [
                    {"code": "dead", "label": "Only on a dead, locked-off circuit"},
                    {"code": "any", "label": "Any time, the meter protects itself"},
                    {"code": "live", "label": "Only while the lights are on"},
                ],
                "answer": "dead",
                "explanation": "The resistance setting puts its own small voltage into the circuit. Mains on top of it damages the meter.",
            },
            {
                "code": "ol",
                "prompt": "The meter shows OL. What does that mean?",
                "options": [
                    {"code": "open", "label": "No path between the probes: an open circuit"},
                    {"code": "ok", "label": "The conductor is perfect"},
                    {"code": "battery", "label": "The meter battery is low"},
                ],
                "answer": "open",
                "explanation": "OL is 'over limit': the resistance is too high to measure, so there is no path.",
            },
        ]
    },
    "scene": {
        "version": 1,
        "props": [
            {
                "id": "board",
                "kind": "consumer_unit",
                "position": [-2.6, -0.8],
                "label": "Board",
                "state": {"off": True, "locked": True, "selected": "b1"},
            },
            {
                "id": "run",
                "kind": "cable_run",
                "position": [0.3, -0.6],
                "label": "Lighting conductor",
            },
            {
                "id": "meter",
                "kind": "multimeter",
                "position": [2.4, 0.6],
                "label": "Multimeter",
                "reading_step": "read-resistance",
                "reading_mode": "ohm",
            },
        ],
        "bindings": {
            "board.body": {"action": "confirm_isolated"},
            "meter.mode_dcv": {"action": "set_meter_dc"},
            "meter.mode_acv": {"action": "set_meter_ac"},
            "meter.mode_ohm": {"action": "set_meter_ohms"},
            "meter.mode_amp": {"action": "set_meter_amps"},
            "meter.probe_black": {"tool": "probe_black", "label": "Black probe"},
            "meter.probe_red": {"tool": "probe_red", "label": "Red probe"},
            "run.end_a": {"accepts": {"probe_black": "connect_black_end_a"}},
            "run.end_b": {"accepts": {"probe_red": "connect_red_end_b"}},
            "meter.display": {"action": "read_resistance"},
        },
        "effects": [
            {"when": "confirm_isolated", "set": {"board": {"checked": True}}},
            {"when": "set_meter_ohms", "set": {"meter": {"mode": "ohm"}}},
            {"when": "connect_black_end_a", "set": {"meter": {"black": "run.end_a"}}},
            {"when": "connect_red_end_b", "set": {"meter": {"red": "run.end_b"}}},
        ],
    },
}

ELECTRICAL_COURSE = {
    "slug": "electrical-installation-foundations",
    "title": "Electrical Installation Foundations",
    "trade": "Electrical Installation",
    "description": "Safe isolation and testing for domestic electrical installation.",
    "program": {"code": "electrical-installation", "name": "Electrical Installation"},
    "module": {"code": "isolation-and-testing", "title": "Isolation and Testing"},
    "competencies": {
        "ELEC-ISO-01": {
            "title": "Isolate a circuit and prove it dead",
            "description": "Switch off, lock off, and prove dead with a tester proved before and after.",
            "mastery_threshold": 100,
        },
        "ELEC-TEST-01": {
            "title": "Test conductor continuity",
            "description": "Measure resistance on a dead conductor and interpret the reading.",
            "mastery_threshold": 80,
        },
    },
    "lessons": [SAFE_ISOLATION_LESSON, CONTINUITY_LESSON],
}
