import {
	type AdmissionFacts,
	type Admitted,
	admitChangeProof,
} from "../../src/astack/change-proof/admission.ts";
import {
	parseChangeProof,
	type Rejection,
} from "../../src/astack/change-proof/contract.ts";
import { andThen, type Result } from "../../src/astack/result.ts";

export type ProofText = string;

export function proofForSnapshot(
	facts: AdmissionFacts,
): (text: ProofText) => Result<Admitted, Rejection> {
	return (text) =>
		andThen(parseChangeProof(text), (proof) => admitChangeProof(proof, facts));
}
