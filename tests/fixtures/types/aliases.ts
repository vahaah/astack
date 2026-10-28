import { a as b } from "m";
import * as ns from "n";
export { c as d };
export * as e from "o";
export type Getters<T> = { [K in keyof T as `get${string & K}`]: () => T[K] };
