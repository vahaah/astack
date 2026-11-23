export interface Effect<out A, out E = never, out R = never> {
	readonly success: A;
	readonly error: E;
	readonly context: R;
}

export declare namespace Effect {
	type Success<T extends Effect<unknown, unknown, unknown>> = [T] extends [
		Effect<infer A, infer _E, infer _R>,
	]
		? A
		: never;
	type Error<T extends Effect<unknown, unknown, unknown>> = [T] extends [
		Effect<infer _A, infer E, infer _R>,
	]
		? E
		: never;
	type Context<T extends Effect<unknown, unknown, unknown>> = [T] extends [
		Effect<infer _A, infer _E, infer R>,
	]
		? R
		: never;
}
