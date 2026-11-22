export type Result<T, E> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

export function map<T, U, E>(
	result: Result<T, E>,
	transform: (value: T) => U,
): Result<U, E> {
	return result.ok ? ok(transform(result.value)) : result;
}

export function andThen<T, U, E>(
	result: Result<T, E>,
	next: (value: T) => Result<U, E>,
): Result<U, E> {
	return result.ok ? next(result.value) : result;
}

export function all<T, E>(
	results: readonly Result<T, E>[],
): Result<readonly T[], E> {
	const values: T[] = [];
	for (const result of results) {
		if (!result.ok) return result;
		values.push(result.value);
	}
	return ok(values);
}
