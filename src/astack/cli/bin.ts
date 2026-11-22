import { floorStop } from "./floor.ts";
import { main } from "./main.ts";

const args = process.argv.slice(2);
const stop = floorStop(process.versions, args);
if (stop === undefined) process.exitCode = await main(args);
else {
	process.stderr.write(stop.message);
	process.exitCode = stop.code;
}
