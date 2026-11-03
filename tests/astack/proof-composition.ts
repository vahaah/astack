import {
	type AdmissionFacts,
	type Admitted,
	admitChangeProof,
} from "../../src/astack/change-proof/admission.ts";
import {
	parseChangeProof,
	type Rejection,
} from "../../src/astack/change-proof/contract.ts";
import type { Result } from "../../src/astack/result.ts";

export type ProofText = string;

export function proofForSnapshot(
	facts: AdmissionFacts,
): (text: ProofText) => Result<Admitted, Rejection> {
	return (text) => {
		const parsed = parseChangeProof(text);
		if (!parsed.ok) return parsed;
		return admitChangeProof(parsed.value, facts);
	};
}
