// ACT network logs (Network_*.log): ranges of lines to replay.
import fs from 'node:fs';
import readline from 'node:readline';

// Lines `from` to `to` (1-based, inclusive) of a log file.
export const readLines = async (file, from = 1, to = Infinity) => {
  const lines = [];
  let n = 0;
  const input = fs.createReadStream(file, 'utf8');
  for await (const line of readline.createInterface({ input })) {
    n++;
    if (n < from)
      continue;
    if (n > to)
      break;
    if (line !== '')
      lines.push(line);
  }
  input.destroy();
  return lines;
};

// --name value pairs of the command line, after the positional arguments.
export const parseArgs = (argv = process.argv.slice(2)) => {
  const positional = [];
  const named = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--')) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        named[arg.slice(2)] = true;
      } else {
        named[arg.slice(2)] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, named };
};

// The log segment a replay uses: --log (or CACTBOT_LOG), --from, --to (line numbers), --zone.
export const replaySegment = (named) => {
  const file = named.log ?? process.env.CACTBOT_LOG;
  if (file === undefined)
    throw new Error('A log is needed: --log <Network_*.log> or CACTBOT_LOG');
  const from = parseInt(named.from ?? '1');
  return {
    file,
    from,
    to: named.to !== undefined ? parseInt(named.to) : Infinity,
    zone: named.zone !== undefined ? parseInt(named.zone) : undefined,
  };
};
